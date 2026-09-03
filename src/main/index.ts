import { app, BrowserWindow, ipcMain, dialog, Menu, MenuItemConstructorOptions, clipboard, shell } from 'electron';
import * as path from 'path';
import * as os from 'os';
import Store from 'electron-store';
import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import * as fs from 'fs';
import { exec } from 'child_process';

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
  const isWin = process.platform === 'win32';
  const isWin11 = isWin && parseInt((os.release().split('.')[2] || '0'), 10) >= 22000;

  const platformGlassOpts: Partial<Electron.BrowserWindowConstructorOptions> = isMac
    ? {
        transparent: true,
        vibrancy: 'under-window',
        visualEffectState: 'active',
        backgroundColor: '#00000000',
      }
    : isWin11
    ? {
        backgroundMaterial: 'mica' as any,
        backgroundColor: '#00000000',
      }
    : isWin
    ? {
        backgroundMaterial: 'acrylic' as any,
        backgroundColor: '#00000000',
      }
    : {
        transparent: true,
        backgroundColor: '#00000000',
      };

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    ...platformGlassOpts,
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
  initConfigDir();
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

// Remote shell history — seeds the terminal's inline command suggestions.
// Best-effort: any failure just means no seeds, so it never blocks a connection.
ipcMain.handle('ssh:history', async (_event, connectionId: string) => {
  const client = connections.get(connectionId);
  if (!client) return '';
  const cmd = 'cat ~/.bash_history ~/.zsh_history "$HISTFILE" 2>/dev/null | tail -n 2000';
  return new Promise<string>((resolve) => {
    const done = setTimeout(() => resolve(''), 5000);
    client.exec(cmd, (err: any, stream: any) => {
      if (err) {
        clearTimeout(done);
        resolve('');
        return;
      }
      let out = '';
      stream.on('data', (d: Buffer) => { out += d.toString('utf8'); });
      stream.on('close', () => {
        clearTimeout(done);
        resolve(out);
      });
    });
  });
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

ipcMain.handle('sftp:chmod', async (_event, connectionId: string, remotePath: string, mode: number) => {
  const sftp = sftpClients.get(connectionId);
  if (!sftp) {
    throw new Error('SFTP not connected');
  }

  return new Promise((resolve, reject) => {
    sftp.chmod(remotePath, mode, (err) => {
      if (err) reject(err.message);
      else resolve({ success: true });
    });
  });
});

// Throttled progress + speed reporter for SFTP transfers.
// fastPut/fastGet's step callback fires per-chunk (very frequently); we coalesce
// to ~one IPC message per 120ms and compute a smoothed transfer speed (bytes/sec).
function makeProgressTracker(tabId: string, type: 'upload' | 'download', total: number) {
  const startedAt = Date.now();
  let lastEmit = startedAt;
  let lastTransferred = 0;
  let smoothedSpeed = 0;

  const emit = (transferred: number, speed: number) => {
    const progress = total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 100;
    mainWindow?.webContents.send(`sftp:progress:${tabId}`, { type, progress, transferred, total, speed });
  };

  return {
    step(transferred: number, totalFromLib: number) {
      const now = Date.now();
      const dt = (now - lastEmit) / 1000;
      if (dt < 0.12) return; // throttle
      const instSpeed = dt > 0 ? (transferred - lastTransferred) / dt : 0;
      // Exponential smoothing to keep the displayed speed steady.
      smoothedSpeed = smoothedSpeed === 0 ? instSpeed : smoothedSpeed * 0.6 + instSpeed * 0.4;
      lastEmit = now;
      lastTransferred = transferred;
      emit(transferred, Math.max(0, smoothedSpeed));
    },
    done() {
      const elapsed = (Date.now() - startedAt) / 1000;
      const avg = elapsed > 0 ? total / elapsed : 0;
      emit(total, avg);
    },
  };
}

ipcMain.handle('sftp:upload', async (_event, tabId: string, connectionId: string, localPath: string, remotePath: string) => {
  const sftp: any = sftpClients.get(connectionId);
  if (!sftp) {
    throw new Error('SFTP not connected');
  }

  const fs = require('fs');
  const path = require('path');
  const rootStats = fs.statSync(localPath);

  // Promisified fastPut for a single file
  const putFile = (lp: string, rp: string, onStep: (t: number) => void) =>
    new Promise<void>((resolve, reject) => {
      sftp.fastPut(lp, rp, {
        step: (transferred: number) => onStep(transferred),
      }, (err: any) => (err ? reject(err.message || err) : resolve()));
    });

  // Best-effort remote mkdir (ignore "already exists"); real permission errors surface on file put
  const ensureDir = (rp: string) =>
    new Promise<void>((resolve) => sftp.mkdir(rp, () => resolve()));

  // ── Single file: unchanged behavior ──
  if (!rootStats.isDirectory()) {
    const totalSize = rootStats.size;
    mainWindow?.webContents.send(`sftp:progress:${tabId}`, { type: 'upload', progress: 0, transferred: 0, total: totalSize, speed: 0 });
    const tracker = makeProgressTracker(tabId, 'upload', totalSize);
    await putFile(localPath, remotePath, (t) => tracker.step(t, totalSize));
    tracker.done();
    return { success: true };
  }

  // ── Directory: walk the tree, then create dirs and upload files with aggregate progress ──
  const dirs: string[] = [];              // remote dirs, parents before children
  const files: Array<{ local: string; remote: string; size: number }> = [];
  let grandTotal = 0;
  const walk = (localDir: string, remoteDir: string) => {
    dirs.push(remoteDir);
    for (const entry of fs.readdirSync(localDir, { withFileTypes: true })) {
      const lp = path.join(localDir, entry.name);
      const rp = `${remoteDir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(lp, rp);
      } else if (entry.isFile()) {
        const size = fs.statSync(lp).size;
        files.push({ local: lp, remote: rp, size });
        grandTotal += size;
      }
      // symlinks / special files are skipped
    }
  };
  walk(localPath, remotePath);

  // Create the remote directory structure (parents first)
  for (const d of dirs) {
    await ensureDir(d);
  }

  // Upload files, feeding cumulative bytes to one tracker so progress/speed span the whole folder
  mainWindow?.webContents.send(`sftp:progress:${tabId}`, { type: 'upload', progress: 0, transferred: 0, total: grandTotal, speed: 0 });
  const tracker = makeProgressTracker(tabId, 'upload', grandTotal);
  let base = 0;
  for (const f of files) {
    await putFile(f.local, f.remote, (t) => tracker.step(base + t, grandTotal));
    base += f.size;
  }
  tracker.done();
  return { success: true };
});

ipcMain.handle('sftp:download', async (_event, tabId: string, connectionId: string, remotePath: string, localPath: string) => {
  const sftp: any = sftpClients.get(connectionId);
  if (!sftp) {
    throw new Error('SFTP not connected');
  }

  const fs = require('fs');
  const path = require('path');

  // Promisified sftp ops
  const statP = (rp: string) =>
    new Promise<any>((resolve, reject) => sftp.stat(rp, (e: any, s: any) => (e ? reject(e.message || e) : resolve(s))));
  const readdirP = (rp: string) =>
    new Promise<any[]>((resolve, reject) => sftp.readdir(rp, (e: any, l: any[]) => (e ? reject(e.message || e) : resolve(l))));
  const getFile = (rp: string, lp: string, onStep: (t: number) => void) =>
    new Promise<void>((resolve, reject) => {
      sftp.fastGet(rp, lp, {
        step: (transferred: number) => onStep(transferred),
      }, (err: any) => (err ? reject(err.message || err) : resolve()));
    });

  const rootStats = await statP(remotePath);

  // ── Single file: unchanged behavior ──
  if (!rootStats.isDirectory()) {
    const totalSize = rootStats.size || 0;
    mainWindow?.webContents.send(`sftp:progress:${tabId}`, { type: 'download', progress: 0, transferred: 0, total: totalSize, speed: 0 });
    const tracker = makeProgressTracker(tabId, 'download', totalSize);
    await getFile(remotePath, localPath, (t) => tracker.step(t, totalSize));
    tracker.done();
    return { success: true };
  }

  // ── Directory: walk the remote tree, create local dirs, download files with aggregate progress ──
  const dirs: string[] = [];              // local dirs, parents before children
  const files: Array<{ remote: string; local: string; size: number }> = [];
  let grandTotal = 0;
  const walk = async (remoteDir: string, localDir: string) => {
    dirs.push(localDir);
    const list = await readdirP(remoteDir);
    for (const item of list) {
      const rp = `${remoteDir}/${item.filename}`;
      const lp = path.join(localDir, item.filename);
      if (item.attrs.isDirectory()) {
        await walk(rp, lp);
      } else if (item.attrs.isFile()) {
        const size = item.attrs.size || 0;
        files.push({ remote: rp, local: lp, size });
        grandTotal += size;
      }
      // symlinks / special files are skipped
    }
  };
  await walk(remotePath, localPath);

  // Create the local directory structure (parents first)
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }

  // Download files, feeding cumulative bytes to one tracker so progress/speed span the whole folder
  mainWindow?.webContents.send(`sftp:progress:${tabId}`, { type: 'download', progress: 0, transferred: 0, total: grandTotal, speed: 0 });
  const tracker = makeProgressTracker(tabId, 'download', grandTotal);
  let base = 0;
  for (const f of files) {
    await getFile(f.remote, f.local, (t) => tracker.step(base + t, grandTotal));
    base += f.size;
  }
  tracker.done();
  return { success: true };
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

// ══════════════════════════════════════════════════════════════════════════════
// Theme & Appearance Config System
// ══════════════════════════════════════════════════════════════════════════════

function getConfigDir(): string {
  return path.join(app.getPath('userData'), 'config');
}

function getThemesDir(): string {
  return path.join(getConfigDir(), 'themes');
}

function getAppearancePath(): string {
  return path.join(getConfigDir(), 'appearance.conf');
}

/** Parse a simple key = value .conf file. Lines starting with # are comments. */
function parseConf(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (key) result[key] = val;
  }
  return result;
}

/** Serialise a conf object back to string (preserves comment header). */
function serializeConf(header: string, data: Record<string, string>): string {
  const lines = [header, ''];
  for (const [k, v] of Object.entries(data)) {
    lines.push(`${k.padEnd(20)} = ${v}`);
  }
  return lines.join('\n') + '\n';
}

// ── Built-in theme definitions ───────────────────────────────────────────────
const BUILT_IN_THEMES: Array<Record<string, string>> = [
  { _id: 'default', name: 'Default', description: 'Refined blue-charcoal glass, soft daylight text', background: 'rgba(18, 20, 26, 0.90)', foreground: '#d6dae0', cursor: '#7aa2f7', 'cursor-accent': '#12141a', selection: 'rgba(122, 162, 247, 0.25)', black: '#1b1e26', red: '#e86671', green: '#8fc88a', yellow: '#e6c384', blue: '#82aaff', magenta: '#c099ff', cyan: '#6fd0d6', white: '#c8ccd4', 'bright-black': '#3b4048', 'bright-red': '#f07178', 'bright-green': '#a5d6a0', 'bright-yellow': '#f0d399', 'bright-blue': '#9cc0ff', 'bright-magenta': '#d4b3ff', 'bright-cyan': '#8be0e6', 'bright-white': '#e8ebf0' },
  // Ghostty's own defaults: background #282c34, white foreground, Tomorrow Night palette.
  { _id: 'ghostty', name: 'Ghostty', description: "Ghostty's default palette — Tomorrow Night on slate", background: 'rgba(40, 44, 52, 0.78)', foreground: '#ffffff', cursor: '#ffffff', 'cursor-accent': '#282c34', selection: 'rgba(255,255,255,0.25)', 'selection-inactive': 'rgba(255,255,255,0.10)', black: '#1d1f21', red: '#cc6666', green: '#b5bd68', yellow: '#f0c674', blue: '#81a2be', magenta: '#b294bb', cyan: '#8abeb7', white: '#c5c8c6', 'bright-black': '#666666', 'bright-red': '#d54e53', 'bright-green': '#b9ca4a', 'bright-yellow': '#e7c547', 'bright-blue': '#7aa6da', 'bright-magenta': '#c397d8', 'bright-cyan': '#70c0b1', 'bright-white': '#eaeaea' },
  { _id: 'dark', name: 'Deep Dark', description: 'Near-black, crisp white', background: 'rgba(1, 1, 20, 0.94)', foreground: '#f0f0f0', cursor: '#f0f0f0', 'cursor-accent': '#0a0a14', selection: 'rgba(255,255,255,0.22)', black: '#0a0a0f', red: '#ff4d4d', green: '#4dff91', yellow: '#ffd700', blue: '#4d9eff', magenta: '#c56eff', cyan: '#4dd9ff', white: '#f0f0f0', 'bright-black': '#3c3c50', 'bright-red': '#ff7070', 'bright-green': '#70ffaa', 'bright-yellow': '#ffe54d', 'bright-blue': '#70b8ff', 'bright-magenta': '#d88fff', 'bright-cyan': '#70e8ff', 'bright-white': '#ffffff' },
  { _id: 'light', name: 'Light Glass', description: 'Frosted white, dark ink', background: 'rgba(245, 245, 250, 0.82)', foreground: '#1a1a2e', cursor: '#1a1a2e', 'cursor-accent': '#f5f5fa', selection: 'rgba(0,80,200,0.18)', black: '#1a1a2e', red: '#c0392b', green: '#27ae60', yellow: '#d4a017', blue: '#2980b9', magenta: '#8e44ad', cyan: '#16a085', white: '#ecf0f1', 'bright-black': '#555577', 'bright-red': '#e74c3c', 'bright-green': '#2ecc71', 'bright-yellow': '#f1c40f', 'bright-blue': '#3498db', 'bright-magenta': '#9b59b6', 'bright-cyan': '#1abc9c', 'bright-white': '#ffffff' },
  { _id: 'liquid-glass', name: 'Liquid Glass', description: 'Cool aqua glass with crisp white text', background: 'rgba(8, 18, 28, 0.82)', foreground: '#e8f7ff', cursor: '#7ad8ff', 'cursor-accent': '#091824', selection: 'rgba(122, 216, 255, 0.28)', black: '#07101a', red: '#ff7fa8', green: '#7ff4d5', yellow: '#ffe68b', blue: '#7ad8ff', magenta: '#bf8fff', cyan: '#8ae7ff', white: '#ddefff', 'bright-black': '#3b5265', 'bright-red': '#ff9cb8', 'bright-green': '#9dffd8', 'bright-yellow': '#fff3a6', 'bright-blue': '#abe8ff', 'bright-magenta': '#d5b1ff', 'bright-cyan': '#bff3ff', 'bright-white': '#f5fbff' },
  { _id: 'monokai', name: 'Monokai Pro', description: 'Warm dark amber, gold text', background: 'rgba(18, 17, 15, 0.90)', foreground: '#f8f8f2', cursor: '#f92672', 'cursor-accent': '#272822', selection: 'rgba(249,230,79,0.28)', black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75', blue: '#66d9e8', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2', 'bright-black': '#90897c', 'bright-red': '#fb4d8a', 'bright-green': '#c1f54f', 'bright-yellow': '#f7d695', 'bright-blue': '#88e4f0', 'bright-magenta': '#c9a4ff', 'bright-cyan': '#bbf5ed', 'bright-white': '#f9f8f5' },
  { _id: 'green', name: 'Matrix Green', description: 'Deep green-tinted glass, neon green text', background: 'rgba(0, 20, 0, 0.90)', foreground: '#7aff5e', cursor: '#39ff14', 'cursor-accent': '#001400', selection: 'rgba(57,255,20,0.25)', black: '#001400', red: '#ff2020', green: '#39ff14', yellow: '#ccff00', blue: '#00ccff', magenta: '#cc00ff', cyan: '#00ffcc', white: '#b8ffb0', 'bright-black': '#006600', 'bright-red': '#ff6666', 'bright-green': '#66ff57', 'bright-yellow': '#ddff44', 'bright-blue': '#44ddff', 'bright-magenta': '#dd44ff', 'bright-cyan': '#44ffdd', 'bright-white': '#d4ffd0' },
  { _id: 'blue', name: 'Ocean Blue', description: 'Midnight blue glass, cyan text', background: 'rgba(5, 20, 60, 0.88)', foreground: '#cce7ff', cursor: '#56cbf9', 'cursor-accent': '#051428', selection: 'rgba(56,189,248,0.30)', black: '#051428', red: '#ff4d6d', green: '#06d6a0', yellow: '#ffd166', blue: '#118ab2', magenta: '#9b5de5', cyan: '#56cbf9', white: '#cce7ff', 'bright-black': '#1a3a6b', 'bright-red': '#ff7096', 'bright-green': '#40e0c0', 'bright-yellow': '#ffe099', 'bright-blue': '#38bdf8', 'bright-magenta': '#b57bee', 'bright-cyan': '#88dcfa', 'bright-white': '#e8f4ff' },
  { _id: 'nord', name: 'Nord', description: 'Arctic, clean, elegant', background: 'rgba(46, 52, 64, 0.88)', foreground: '#eceff4', cursor: '#88c0d0', 'cursor-accent': '#2e3440', selection: 'rgba(136,192,208,0.28)', 'selection-inactive': 'rgba(136,192,208,0.12)', black: '#2e3440', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b', blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0', 'bright-black': '#616e88', 'bright-red': '#d08770', 'bright-green': '#b5d19c', 'bright-yellow': '#f0d8a8', 'bright-blue': '#9bb5d4', 'bright-magenta': '#c8a4c0', 'bright-cyan': '#a3d4d0', 'bright-white': '#eceff4' },
  { _id: 'dracula', name: 'Dracula', description: 'Deep purple glass, lavender text', background: 'rgba(40, 42, 54, 0.90)', foreground: '#f8f8f2', cursor: '#ff79c6', 'cursor-accent': '#282a36', selection: 'rgba(255,121,198,0.28)', black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2', 'bright-black': '#6272a4', 'bright-red': '#ff6e6e', 'bright-green': '#69ff94', 'bright-yellow': '#ffffa5', 'bright-blue': '#d6acff', 'bright-magenta': '#ff92df', 'bright-cyan': '#a4ffff', 'bright-white': '#ffffff' },
  { _id: 'solarized', name: 'Solarized Dark', description: 'Dark teal glass, base1 text', background: 'rgba(0, 43, 54, 0.90)', foreground: '#93a1a1', cursor: '#268bd2', 'cursor-accent': '#002b36', selection: 'rgba(38,139,210,0.30)', black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5', 'bright-black': '#002b36', 'bright-red': '#cb4b16', 'bright-green': '#586e75', 'bright-yellow': '#657b83', 'bright-blue': '#839496', 'bright-magenta': '#6c71c4', 'bright-cyan': '#93a1a1', 'bright-white': '#fdf6e3' },
  { _id: 'synthwave', name: 'Synthwave', description: 'Deep purple neon, hot pink glow', background: 'rgba(26, 8, 52, 0.90)', foreground: '#f0c5ff', cursor: '#f97fff', 'cursor-accent': '#1a0834', selection: 'rgba(249,127,255,0.30)', black: '#1a0834', red: '#fe4450', green: '#72f1b8', yellow: '#fede5d', blue: '#2de2e6', magenta: '#f97fff', cyan: '#03edf9', white: '#f0c5ff', 'bright-black': '#4d2a6b', 'bright-red': '#ff7b89', 'bright-green': '#a5ffdb', 'bright-yellow': '#ffe78a', 'bright-blue': '#6ef5f5', 'bright-magenta': '#fcb3ff', 'bright-cyan': '#59f5fe', 'bright-white': '#ffffff' },
  { _id: 'one-dark', name: 'One Dark', description: 'Cool grey, classic Atom palette', background: 'rgba(30, 33, 40, 0.90)', foreground: '#abb2bf', cursor: '#61afef', 'cursor-accent': '#1e2128', selection: 'rgba(97,175,239,0.28)', black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b', blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf', 'bright-black': '#7f848e', 'bright-red': '#f0838a', 'bright-green': '#b2d89b', 'bright-yellow': '#edd4a0', 'bright-blue': '#82c4f8', 'bright-magenta': '#d9a0e8', 'bright-cyan': '#79cdd7', 'bright-white': '#ffffff' },
  { _id: 'catppuccin', name: 'Catppuccin Mocha', description: 'Mauve and lavender, popular modern theme', background: 'rgba(30, 30, 46, 0.90)', foreground: '#cdd6f4', cursor: '#cba6f7', 'cursor-accent': '#1e1e2e', selection: 'rgba(203,166,247,0.28)', black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af', blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de', 'bright-black': '#6c7086', 'bright-red': '#f7a8bd', 'bright-green': '#bcedb8', 'bright-yellow': '#fbecc6', 'bright-blue': '#a6c9fc', 'bright-magenta': '#f8d5ed', 'bright-cyan': '#b0eee3', 'bright-white': '#cdd6f4' },
  { _id: 'tokyo-night', name: 'Tokyo Night', description: 'Deep navy blue, whisky gold accents', background: 'rgba(26, 27, 38, 0.90)', foreground: '#a9b1d6', cursor: '#7aa2f7', 'cursor-accent': '#1a1b26', selection: 'rgba(122,162,247,0.28)', black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6', 'bright-black': '#565f89', 'bright-red': '#ff9aab', 'bright-green': '#b9e87f', 'bright-yellow': '#e8c583', 'bright-blue': '#a1c0fa', 'bright-magenta': '#d0b4fa', 'bright-cyan': '#a0dfff', 'bright-white': '#c0caf5' },
  { _id: 'github-dark', name: 'GitHub Dark', description: 'Neutral dark, max readability', background: 'rgba(13, 17, 23, 0.92)', foreground: '#e6edf3', cursor: '#58a6ff', 'cursor-accent': '#0d1117', selection: 'rgba(88,166,255,0.28)', black: '#0d1117', red: '#ff7b72', green: '#3fb950', yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4', 'bright-black': '#30363d', 'bright-red': '#ffa198', 'bright-green': '#56d364', 'bright-yellow': '#e3b341', 'bright-blue': '#79c0ff', 'bright-magenta': '#d2a8ff', 'bright-cyan': '#56d4dd', 'bright-white': '#cdd9e5' },
  { _id: 'gruvbox', name: 'Gruvbox Dark', description: 'Warm retro amber, high contrast', background: 'rgba(40, 40, 40, 0.90)', foreground: '#ebdbb2', cursor: '#d79921', 'cursor-accent': '#282828', selection: 'rgba(215,153,33,0.30)', black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921', blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984', 'bright-black': '#928374', 'bright-red': '#fb4934', 'bright-green': '#b8bb26', 'bright-yellow': '#fabd2f', 'bright-blue': '#83a598', 'bright-magenta': '#d3869b', 'bright-cyan': '#8ec07c', 'bright-white': '#ebdbb2' },
  { _id: 'material-palenight', name: 'Material Palenight', description: 'Material Design purple night, vibrant accents', background: 'rgba(41, 45, 62, 0.90)', foreground: '#a6accd', cursor: '#ffcc00', 'cursor-accent': '#292d3e', selection: 'rgba(113,124,180,0.30)', black: '#292d3e', red: '#f07178', green: '#c3e88d', yellow: '#ffcb6b', blue: '#82aaff', magenta: '#c792ea', cyan: '#89ddff', white: '#d0d0d0', 'bright-black': '#434758', 'bright-red': '#ff8b92', 'bright-green': '#ddffa7', 'bright-yellow': '#ffe585', 'bright-blue': '#9cc4ff', 'bright-magenta': '#e1acff', 'bright-cyan': '#a3f7ff', 'bright-white': '#ffffff' },
  { _id: 'rose-pine', name: 'Rosé Pine', description: 'Elegant muted rose, gold and mist', background: 'rgba(25, 23, 36, 0.90)', foreground: '#e0def4', cursor: '#ebbcba', 'cursor-accent': '#191724', selection: 'rgba(235,188,186,0.25)', black: '#26233a', red: '#eb6f92', green: '#9ccfd8', yellow: '#f6c177', blue: '#31748f', magenta: '#c4a7e7', cyan: '#ebbcba', white: '#e0def4', 'bright-black': '#6e6a86', 'bright-red': '#f08da9', 'bright-green': '#b4e1e8', 'bright-yellow': '#f8d49b', 'bright-blue': '#4d9ab5', 'bright-magenta': '#d4bfef', 'bright-cyan': '#f0d0cc', 'bright-white': '#e8e6f0' },
  { _id: 'rose-pine-dawn', name: 'Rosé Pine Dawn', description: 'Soft petal light, warm ink text', background: 'rgba(250, 244, 237, 0.85)', foreground: '#575279', cursor: '#d7827e', 'cursor-accent': '#faf4ed', selection: 'rgba(215,130,126,0.20)', black: '#575279', red: '#b4637a', green: '#286983', yellow: '#ea9d34', blue: '#56949f', magenta: '#907aa9', cyan: '#d7827e', white: '#f2e9e1', 'bright-black': '#9893a5', 'bright-red': '#c97d91', 'bright-green': '#3d8296', 'bright-yellow': '#edb05c', 'bright-blue': '#6fa7b0', 'bright-magenta': '#a694bd', 'bright-cyan': '#e09d99', 'bright-white': '#faf4ed' },
];

// Mirrors DEFAULT_APPEARANCE in src/shared/types.ts. Not imported because this tsconfig
// sets rootDir to src/main — pulling in src/shared would shift the whole dist/main layout.
const DEFAULT_APPEARANCE = {
  glassOpacity: 0.55, blurOverlay: 20, uiTintHue: 240, uiTintSat: 10, uiTintLight: 98,
};

const APPEARANCE_CONF_HEADER = `# MyTerminus Appearance Configuration
# Save the file and switch back to the app — the glass updates on window focus.
#
# glass-opacity : 0.0 – 1.0. Transparency of every frosted surface. One knob drives all
#                 three layers proportionally: backdrop < header/sidebar < tables/modals.
#                 0.55 = current default. Lower = more see-through.
# blur-overlay  : px. Blur behind floating panels (modal, right-click menu, command bar).
#                 Only these have a backdrop to blur — the desktop blur behind the whole
#                 window comes from macOS vibrancy and is not adjustable from here.
# ui-tint-*     : HSL of every frosted surface. 240 / 10 / 98 = near-white, faintly cool.
#                 Try hue 30 sat 25 for warm, or lightness 20 for a dark UI.`;

const THEME_CONF_HEADER = (name: string, desc: string) =>
  `# MyTerminus Terminal Theme — ${name}\n# ${desc}\n#\n# Colour values: #rrggbb  or  rgba(r, g, b, alpha)\n# alpha controls terminal transparency (0.0 = fully transparent, 1.0 = opaque)`;

/** Generate the text content for a built-in theme .conf file */
function generateThemeConfContent(t: Record<string, string>): string {
  const lines: string[] = [THEME_CONF_HEADER(t.name, t.description || ''), ''];
  const meta = ['name', 'description'];
  const core = ['background', 'foreground', 'cursor', 'cursor-accent'];
  const sel  = ['selection', 'selection-fg', 'selection-inactive'];
  const ansi = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
  const brt  = ['bright-black', 'bright-red', 'bright-green', 'bright-yellow', 'bright-blue', 'bright-magenta', 'bright-cyan', 'bright-white'];

  const section = (title: string, keys: string[]) => {
    lines.push(`# ── ${title} ──`);
    for (const k of keys) {
      if (t[k]) lines.push(`${k.padEnd(20)} = ${t[k]}`);
    }
    lines.push('');
  };
  section('Meta', meta);
  section('Core Colors', core);
  section('Selection', sel);
  section('ANSI Colors', ansi);
  section('Bright ANSI Colors', brt);
  return lines.join('\n');
}

/** Parse a theme .conf file into a TerminalThemeConfig object */
function parseThemeConf(id: string, content: string): any {
  const d = parseConf(content);
  return {
    id,
    name: d['name'] || id,
    description: d['description'],
    background: d['background'] || 'rgba(20,20,22,0.35)',
    foreground: d['foreground'] || '#e0e0e0',
    cursor: d['cursor'] || '#e0e0e0',
    cursorAccent: d['cursor-accent'],
    selectionBackground: d['selection'],
    selectionForeground: d['selection-fg'],
    selectionInactiveBackground: d['selection-inactive'],
    black: d['black'], red: d['red'], green: d['green'], yellow: d['yellow'],
    blue: d['blue'], magenta: d['magenta'], cyan: d['cyan'], white: d['white'],
    brightBlack: d['bright-black'], brightRed: d['bright-red'],
    brightGreen: d['bright-green'], brightYellow: d['bright-yellow'],
    brightBlue: d['bright-blue'], brightMagenta: d['bright-magenta'],
    brightCyan: d['bright-cyan'], brightWhite: d['bright-white'],
  };
}

/** Parse appearance.conf into an AppearanceConfig object */
function parseAppearanceConf(content: string): any {
  const d = parseConf(content);
  return {
    glassOpacity: parseFloat(d['glass-opacity'] ?? '0.55'),
    blurOverlay:  parseInt  (d['blur-overlay']  ?? '20', 10),
    uiTintHue:    parseInt  (d['ui-tint-hue']   ?? '240', 10),
    uiTintSat:    parseInt  (d['ui-tint-sat']   ?? '10', 10),
    uiTintLight:  parseInt  (d['ui-tint-light'] ?? '98', 10),
  };
}

/** Serialize AppearanceConfig back to .conf format */
function serializeAppearanceConf(cfg: any): string {
  return [
    APPEARANCE_CONF_HEADER, '',
    `${'glass-opacity'.padEnd(16)} = ${cfg.glassOpacity}`,
    `${'blur-overlay'.padEnd(16)} = ${cfg.blurOverlay}`,
    '',
    `${'ui-tint-hue'.padEnd(16)} = ${cfg.uiTintHue}`,
    `${'ui-tint-sat'.padEnd(16)} = ${cfg.uiTintSat}`,
    `${'ui-tint-light'.padEnd(16)} = ${cfg.uiTintLight}`,
    '',
  ].join('\n');
}

/** Initialise config directory: create dirs and write default files if absent */
function initConfigDir() {
  const themesDir = getThemesDir();
  const appearancePath = getAppearancePath();

  if (!fs.existsSync(themesDir)) {
    fs.mkdirSync(themesDir, { recursive: true });
    console.log('[Config] Created themes directory:', themesDir);
  }

  // Write built-in theme files only if they don't exist yet
  for (const t of BUILT_IN_THEMES) {
    const filePath = path.join(themesDir, `${t._id}.conf`);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, generateThemeConfContent(t), 'utf-8');
      console.log('[Config] Wrote theme:', t._id);
    }
  }

  // Write appearance.conf if absent, or rewrite it if it still lists the old knobs
  // (blur-sidebar / blur-header / glass-saturate) that could never take effect —
  // leaving them in the file just invites the user to tune something inert.
  if (!fs.existsSync(appearancePath)) {
    fs.writeFileSync(appearancePath, serializeAppearanceConf(DEFAULT_APPEARANCE), 'utf-8');
    console.log('[Config] Wrote default appearance.conf');
  } else if (fs.readFileSync(appearancePath, 'utf-8').includes('blur-sidebar')) {
    const kept = parseAppearanceConf(fs.readFileSync(appearancePath, 'utf-8'));
    fs.writeFileSync(appearancePath, serializeAppearanceConf(kept), 'utf-8');
    console.log('[Config] Migrated appearance.conf to the current knobs');
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('themes:list', (): any[] => {
  const themesDir = getThemesDir();
  console.log('[themes:list] themesDir:', themesDir, 'exists:', fs.existsSync(themesDir));
  if (!fs.existsSync(themesDir)) return [];
  const themes: any[] = [];
  for (const file of fs.readdirSync(themesDir)) {
    if (!file.endsWith('.conf')) continue;
    const id = file.replace(/\.conf$/, '');
    try {
      const content = fs.readFileSync(path.join(themesDir, file), 'utf-8');
      themes.push(parseThemeConf(id, content));
    } catch (err) {
      console.error('[Config] Failed to parse theme:', file, err);
    }
  }
  // Sort: built-in order first, then alphabetical for custom
  const builtInOrder = BUILT_IN_THEMES.map(t => t._id);
  themes.sort((a, b) => {
    const ai = builtInOrder.indexOf(a.id);
    const bi = builtInOrder.indexOf(b.id);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.name.localeCompare(b.name);
  });
  console.log('[themes:list] Returning', themes.length, 'themes:', themes.map(t => t.id).join(', '));
  return themes;
});

ipcMain.handle('themes:openDir', () => {
  shell.showItemInFolder(getThemesDir());
});

ipcMain.handle('appearance:get', (): any => {
  const p = getAppearancePath();
  if (!fs.existsSync(p)) return DEFAULT_APPEARANCE;
  return parseAppearanceConf(fs.readFileSync(p, 'utf-8'));
});

ipcMain.handle('appearance:save', (_event, cfg: any) => {
  try {
    fs.writeFileSync(getAppearancePath(), serializeAppearanceConf(cfg), 'utf-8');
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('appearance:openFile', () => {
  const p = getAppearancePath();
  if (process.platform === 'win32') {
    exec(`notepad "${p}"`);
  } else if (process.platform === 'darwin') {
    exec(`open -t "${p}"`);
  } else {
    exec(`xdg-open "${p}"`);
  }
});

ipcMain.handle('config:getDir', () => getConfigDir());