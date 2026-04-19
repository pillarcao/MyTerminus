import { app, BrowserWindow, ipcMain, dialog, Menu, MenuItemConstructorOptions, clipboard } from 'electron';
import * as path from 'path';
import * as os from 'os';
import Store from 'electron-store';
import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import * as fs from 'fs';

const store = new Store();

// Global exception handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

let mainWindow: BrowserWindow | null = null;

// Store active SSH connections
const connections: Map<string, Client> = new Map();
const sftpClients: Map<string, SFTPWrapper> = new Map();
const shellStreams: Map<string, any> = new Map();

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: isMac ? false : {
      color: 'rgba(0, 0, 0, 0)',
      symbolColor: '#74b1be',
      height: 32
    },
    trafficLightPosition: { x: 12, y: 16 },
    resizable: true,
    maximizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // Create application menu
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Import Config...',
          accelerator: 'CmdOrCtrl+I',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow!, {
              title: 'Import Connections',
              filters: [{ name: 'JSON', extensions: ['json'] }],
              properties: ['openFile'],
            });
            if (!result.filePaths[0]) return;
            try {
              const content = fs.readFileSync(result.filePaths[0], 'utf-8');
              const config = JSON.parse(content);
              if (!config.connections || !Array.isArray(config.connections)) {
                dialog.showErrorBox('Import Error', 'Invalid config file: missing connections');
                return;
              }
              // Import groups first
              if (config.groups && Array.isArray(config.groups)) {
                const existingGroups = store.get('groups', []) as any[];
                const groupIdMap = new Map<string, string>();
                for (const group of config.groups) {
                  const oldId = group.id;
                  group.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                  groupIdMap.set(oldId, group.id);
                  existingGroups.push(group);
                }
                store.set('groups', existingGroups);
                for (const conn of config.connections) {
                  if (conn.groupId && groupIdMap.has(conn.groupId)) {
                    conn.groupId = groupIdMap.get(conn.groupId);
                  }
                }
              }
              // Import connections
              const existingConnections = store.get('connections', []) as any[];
              for (const conn of config.connections) {
                conn.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                existingConnections.push(conn);
              }
              store.set('connections', existingConnections);
              dialog.showMessageBox(mainWindow!, {
                type: 'info',
                message: `Imported ${config.connections.length} connections`,
              });
            } catch (err: any) {
              dialog.showErrorBox('Import Error', err.message);
            }
          },
        },
        {
          label: 'Export Config...',
          accelerator: 'CmdOrCtrl+E',
          click: async () => {
            const result = await dialog.showSaveDialog(mainWindow!, {
              title: 'Export Connections',
              defaultPath: 'myterm-config.json',
              filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (!result.filePath) return;
            try {
              const connections = store.get('connections', []) as any[];
              const groups = store.get('groups', []) as any[];
              const config = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                connections,
                groups,
              };
              fs.writeFileSync(result.filePath, JSON.stringify(config, null, 2), 'utf-8');
              dialog.showMessageBox(mainWindow!, {
                type: 'info',
                message: `Exported ${connections.length} connections and ${groups.length} groups`,
              });
            } catch (err: any) {
              dialog.showErrorBox('Export Error', err.message);
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('clipboard:read', () => {
  try {
    const text = clipboard.readText();
    console.log('[Main] Clipboard read successful, text length:', text.length);
    return text;
  } catch (error) {
    console.error('[Main] Error reading clipboard:', error);
    throw error;
  }
});

ipcMain.handle('clipboard:write', (_event, text: string) => {
  try {
    clipboard.writeText(text);
    console.log('[Main] Clipboard write successful, text length:', text.length);
    return true;
  } catch (error) {
    console.error('[Main] Error writing to clipboard:', error);
    throw error;
  }
});

// Connection management
ipcMain.handle('connections:list', () => {
  return store.get('connections', []) as any[];
});

ipcMain.handle('connections:save', (_event, connection: any) => {
  console.log('[Main] Saving connection:', connection);
  const connections = store.get('connections', []) as any[];
  const index = connections.findIndex((c: any) => c.id === connection.id);
  if (index >= 0) {
    connections[index] = connection;
    console.log('[Main] Updating existing connection at index:', index);
  } else {
    connection.id = Date.now().toString();
    connections.push(connection);
    console.log('[Main] Creating new connection with id:', connection.id);
  }
  store.set('connections', connections);
  console.log('[Main] Saved connections:', connections.length);
  return connection;
});

ipcMain.handle('connections:delete', (_event, id: string) => {
  const connections = store.get('connections', []) as any[];
  store.set('connections', connections.filter((c: any) => c.id !== id));
  return true;
});

ipcMain.handle('connections:get', (_event, id: string) => {
  const connections = store.get('connections', []) as any[];
  return connections.find((c: any) => c.id === id);
});

// Group management
ipcMain.handle('groups:list', () => {
  return store.get('groups', []) as any[];
});

ipcMain.handle('groups:save', (_event, group: any) => {
  const groups = store.get('groups', []) as any[];
  const index = groups.findIndex((g: any) => g.id === group.id);
  if (index >= 0) {
    groups[index] = group;
  } else {
    group.id = Date.now().toString();
    groups.push(group);
  }
  store.set('groups', groups);
  return group;
});

ipcMain.handle('groups:delete', (_event, id: string) => {
  const groups = store.get('groups', []) as any[];
  store.set('groups', groups.filter((g: any) => g.id !== id));
  // Also clear groupId from connections in this group
  const connections = store.get('connections', []) as any[];
  const updatedConnections = connections.map((c: any) => {
    if (c.groupId === id) {
      return { ...c, groupId: undefined };
    }
    return c;
  });
  store.set('connections', updatedConnections);
  return true;
});

// Theme
ipcMain.handle('theme:get', () => {
  return store.get('theme', 'dark') as string;
});

ipcMain.handle('theme:set', (_event, themeId: string) => {
  store.set('theme', themeId);
});

// SSH connection
ipcMain.handle('ssh:connect', async (_event, connectionId: string, config: any) => {
  return new Promise((resolve, reject) => {
    const client = new Client();

    // Handle private key
    const connectConfig: ConnectConfig = {
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      readyTimeout: 10000,
      keepaliveInterval: 30000,
      keepaliveCountMax: 3,
    };

    if (config.privateKeyPath) {
      try {
        connectConfig.privateKey = fs.readFileSync(config.privateKeyPath);
      } catch (err: any) {
        reject(`Failed to read private key: ${err.message}`);
        return;
      }
    }

    client.on('ready', () => {
      connections.set(connectionId, client);
      resolve({ success: true });
    });

    client.on('error', (err) => {
      console.error('SSH connection error:', err);
      reject(err.message);
    });

    try {
      client.connect(connectConfig);
    } catch (err: any) {
      reject(err.message);
    }
  });
});

ipcMain.handle('ssh:disconnect', (_event, connectionId: string) => {
  const stream = shellStreams.get(connectionId);
  if (stream) {
    stream.close();
    shellStreams.delete(connectionId);
  }
  const sftp = sftpClients.get(connectionId);
  if (sftp) {
    sftp.end();
    sftpClients.delete(connectionId);
  }
  const client = connections.get(connectionId);
  if (client) {
    client.end();
    connections.delete(connectionId);
  }
  return true;
});

// SSH shell/terminal
ipcMain.handle('ssh:shell', async (_event, tabId: string, connectionId: string) => {
  const client = connections.get(connectionId);
  if (!client) {
    throw new Error('Connection not found');
  }

  // Each tab gets its own shell session (keyed by tabId)
  if (shellStreams.has(tabId)) {
    console.log('[Main] Shell already exists for tab:', tabId);
    return { success: true, reused: true };
  }

  return new Promise((resolve, reject) => {
    // Open shell with proper terminal dimensions
    client.shell({ term: 'xterm-256color', rows: 24, cols: 80 }, (err: any, stream: any) => {
      if (err) {
        reject(err.message);
        return;
      }

      // Store stream keyed by tabId for independent sessions
      shellStreams.set(tabId, stream);

      stream.on('data', (data: Buffer) => {
        mainWindow?.webContents.send(`ssh:data:${tabId}`, data.toString());
      });

      stream.on('close', () => {
        shellStreams.delete(tabId);
        mainWindow?.webContents.send(`ssh:close:${tabId}`);
      });

      resolve({ success: true });
    });
  });
});

ipcMain.on('ssh:input', (_event, tabId: string, data: string) => {
  const stream = shellStreams.get(tabId);
  if (stream) {
    stream.write(data);
  }
});

ipcMain.on('ssh:resize', (_event, tabId: string, cols: number, rows: number) => {
  const stream = shellStreams.get(tabId);
  if (stream) {
    stream.setWindow(rows, cols, 0, 0);
  }
});

// SFTP operations
ipcMain.handle('sftp:connect', async (_event, connectionId: string) => {
  // Check if already connected
  if (sftpClients.has(connectionId)) {
    console.log('[SFTP] Already connected, returning');
    return { success: true };
  }

  const client = connections.get(connectionId);
  if (!client) {
    console.log('[SFTP] No SSH client found for:', connectionId);
    throw new Error('SSH connection not found');
  }

  console.log('[SFTP] Creating new SFTP connection');
  return new Promise((resolve, reject) => {
    client.sftp((err: any, sftp: any) => {
      if (err) {
        console.log('[SFTP] SFTP connect error:', err.message);
        reject(err.message);
        return;
      }
      console.log('[SFTP] SFTP connected successfully');
      sftpClients.set(connectionId, sftp);
      resolve({ success: true });
    });
  });
});

// Get remote user home directory (~)
ipcMain.handle('sftp:home', async (_event, connectionId: string) => {
  const client = connections.get(connectionId);
  if (!client) {
    throw new Error('SSH connection not found');
  }

  return new Promise((resolve, reject) => {
    // First try using SFTP realpath
    client.sftp((err: any, sftp: any) => {
      if (err || !sftp) {
        // Fallback to exec
        client.exec('echo $HOME', (err2: any, stream: any) => {
          if (err2) {
            resolve('/');
            return;
          }
          let home = '';
          stream.on('data', (data: Buffer) => { home += data.toString(); });
          stream.on('close', () => {
            const result = (home.trim() || '/').replace(/\/$/, '') || '/';
            console.log('[SFTP] $HOME result:', result);
            resolve(result);
          });
        });
        return;
      }

      sftp.realpath('.', (err2: any, currPath: string) => {
        if (err2 || !currPath) {
          // Fallback
          client.exec('pwd', (err3: any, stream: any) => {
            if (err3) {
              resolve('/');
              return;
            }
            let pwd = '';
            stream.on('data', (data: Buffer) => { pwd += data.toString(); });
            stream.on('close', () => {
              const result = (pwd.trim() || '/').replace(/\/$/, '') || '/';
              console.log('[SFTP] pwd result:', result);
              resolve(result);
            });
          });
          return;
        }
        // Remove trailing slash
        const result = currPath.replace(/\/$/, '') || '/';
        console.log('[SFTP] realpath . result:', result);
        resolve(result);
      });
    });
  });
});

ipcMain.handle('sftp:list', async (_event, connectionId: string, remotePath: string) => {
  let sftp = sftpClients.get(connectionId);
  if (!sftp) {
    // Auto-connect if not connected
    const client = connections.get(connectionId);
    if (!client) {
      throw new Error('SSH connection not found');
    }

    sftp = await new Promise((resolve, reject) => {
      client.sftp((err: any, sftpObj: any) => {
        if (err) {
          reject(err);
          return;
        }
        sftpClients.set(connectionId, sftpObj);
        resolve(sftpObj);
      });
    });
  }

  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) {
        reject(err.message);
        return;
      }
      const files = list.map((item) => ({
        name: item.filename,
        isDirectory: item.attrs.isDirectory(),
        size: item.attrs.size,
        modified: new Date(item.attrs.mtime * 1000).toISOString(),
      }));
      resolve(files);
    });
  });
});

ipcMain.handle('sftp:mkdir', async (_event, connectionId: string, remotePath: string) => {
  const sftp = sftpClients.get(connectionId);
  if (!sftp) {
    throw new Error('SFTP not connected');
  }

  return new Promise((resolve, reject) => {
    sftp.mkdir(remotePath, (err) => {
      if (err) reject(err.message);
      else resolve({ success: true });
    });
  });
});

ipcMain.handle('sftp:rmdir', async (_event, connectionId: string, remotePath: string) => {
  const sftp = sftpClients.get(connectionId);
  if (!sftp) {
    throw new Error('SFTP not connected');
  }

  return new Promise((resolve, reject) => {
    sftp.rmdir(remotePath, (err) => {
      if (err) reject(err.message);
      else resolve({ success: true });
    });
  });
});

ipcMain.handle('sftp:delete', async (_event, connectionId: string, remotePath: string) => {
  const sftp = sftpClients.get(connectionId);
  if (!sftp) {
    throw new Error('SFTP not connected');
  }

  return new Promise((resolve, reject) => {
    sftp.unlink(remotePath, (err) => {
      if (err) reject(err.message);
      else resolve({ success: true });
    });
  });
});

ipcMain.handle('sftp:rename', async (_event, connectionId: string, oldPath: string, newPath: string) => {
  const sftp = sftpClients.get(connectionId);
  if (!sftp) {
    throw new Error('SFTP not connected');
  }

  return new Promise((resolve, reject) => {
    sftp.rename(oldPath, newPath, (err) => {
      if (err) reject(err.message);
      else resolve({ success: true });
    });
  });
});

ipcMain.handle('sftp:upload', async (_event, tabId: string, connectionId: string, localPath: string, remotePath: string) => {
  const sftp: any = sftpClients.get(connectionId);
  if (!sftp) {
    throw new Error('SFTP not connected');
  }

  // Get file size for progress calculation
  const fs = require('fs');
  const stats = fs.statSync(localPath);
  const totalSize = stats.size;

  // Send initial progress
  mainWindow?.webContents.send(`sftp:progress:${tabId}`, { type: 'upload', progress: 0, transferred: 0, total: totalSize });

  return new Promise((resolve, reject) => {
    // Use fastPut for reliable transfer
    sftp.fastPut(localPath, remotePath, (err: any) => {
      if (err) {
        reject(err.message);
      } else {
        mainWindow?.webContents.send(`sftp:progress:${tabId}`, { type: 'upload', progress: 100, transferred: totalSize, total: totalSize });
        resolve({ success: true });
      }
    });
  });
});

ipcMain.handle('sftp:download', async (_event, tabId: string, connectionId: string, remotePath: string, localPath: string) => {
  const sftp: any = sftpClients.get(connectionId);
  if (!sftp) {
    throw new Error('SFTP not connected');
  }

  // First get the file size
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (err: any, stats: any) => {
      const totalSize = stats?.size || 0;

      // Send initial progress
      mainWindow?.webContents.send(`sftp:progress:${tabId}`, { type: 'download', progress: 0, transferred: 0, total: totalSize });

      // Use fastGet for reliable download
      sftp.fastGet(remotePath, localPath, (err2: any) => {
        if (err2) {
          reject(err2.message);
        } else {
          mainWindow?.webContents.send(`sftp:progress:${tabId}`, { type: 'download', progress: 100, transferred: totalSize, total: totalSize });
          resolve({ success: true });
        }
      });
    });
  });
});

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('dialog:saveFile', async (_event, defaultPath: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath,
  });
  return result.filePath || null;
});

// Config export/import
ipcMain.handle('config:export', async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export Connections',
    defaultPath: 'myterm-config.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (!result.filePath) return { success: false, message: 'Cancelled' };

  try {
    const connections = store.get('connections', []) as any[];
    const groups = store.get('groups', []) as any[];
    const config = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      connections,
      groups,
    };
    fs.writeFileSync(result.filePath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true, message: `Exported ${connections.length} connections and ${groups.length} groups` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('config:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Import Connections',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });

  if (!result.filePaths[0]) return { success: false, message: 'Cancelled' };

  try {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    const config = JSON.parse(content);

    if (!config.connections || !Array.isArray(config.connections)) {
      return { success: false, message: 'Invalid config file: missing connections' };
    }

    // Import groups first
    if (config.groups && Array.isArray(config.groups)) {
      const existingGroups = store.get('groups', []) as any[];
      const groupIdMap = new Map<string, string>();

      for (const group of config.groups) {
        const oldId = group.id;
        group.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        groupIdMap.set(oldId, group.id);
        existingGroups.push(group);
      }
      store.set('groups', existingGroups);

      // Update connection groupIds
      for (const conn of config.connections) {
        if (conn.groupId && groupIdMap.has(conn.groupId)) {
          conn.groupId = groupIdMap.get(conn.groupId);
        }
      }
    }

    // Import connections with new IDs
    const existingConnections = store.get('connections', []) as any[];
    for (const conn of config.connections) {
      conn.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      existingConnections.push(conn);
    }
    store.set('connections', existingConnections);

    return { success: true, message: `Imported ${config.connections.length} connections` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

// Local file system
ipcMain.handle('local:home', () => {
  return app.getPath('home');
});

ipcMain.handle('local:list', async (_event, dirPath: string) => {
  return new Promise((resolve, reject) => {
    fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
      if (err) {
        reject(err.message);
        return;
      }

      const files = entries.map((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        let stats;
        try {
          stats = fs.statSync(fullPath);
        } catch {
          stats = { size: 0, mtime: new Date() };
        }

        return {
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size: stats.size,
          modified: stats.mtime.toISOString(),
        };
      });

      // Sort: directories first, then by name
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      resolve(files);
    });
  });
});

ipcMain.handle('local:upload', async (_event, localPath: string, remotePath: string, connectionId: string) => {
  const sftp = sftpClients.get(connectionId);
  if (!sftp) {
    throw new Error('SFTP not connected');
  }

  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) reject(err.message);
      else resolve({ success: true });
    });
  });
});