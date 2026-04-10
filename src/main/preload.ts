import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Connection management
  listConnections: () => ipcRenderer.invoke('connections:list'),
  saveConnection: (connection: any) => ipcRenderer.invoke('connections:save', connection),
  deleteConnection: (id: string) => ipcRenderer.invoke('connections:delete', id),
  getConnection: (id: string) => ipcRenderer.invoke('connections:get', id),

  // Group management
  listGroups: () => ipcRenderer.invoke('groups:list'),
  saveGroup: (group: any) => ipcRenderer.invoke('groups:save', group),
  deleteGroup: (id: string) => ipcRenderer.invoke('groups:delete', id),

  // Theme
  getTheme: () => ipcRenderer.invoke('theme:get'),
  setTheme: (themeId: string) => ipcRenderer.invoke('theme:set', themeId),

  // SSH operations
  sshConnect: (connectionId: string, config: any) =>
    ipcRenderer.invoke('ssh:connect', connectionId, config),
  sshDisconnect: (connectionId: string) => ipcRenderer.invoke('ssh:disconnect', connectionId),
  sshShell: (connectionId: string) => ipcRenderer.invoke('ssh:shell', connectionId),
  sshInput: (connectionId: string, data: string) =>
    ipcRenderer.send('ssh:input', connectionId, data),
  sshResize: (connectionId: string, cols: number, rows: number) =>
    ipcRenderer.send('ssh:resize', connectionId, cols, rows),
  onSshData: (connectionId: string, callback: (data: string) => void) => {
    const listener = (_event: any, data: string) => callback(data);
    ipcRenderer.on(`ssh:data:${connectionId}`, listener);
    return () => ipcRenderer.removeListener(`ssh:data:${connectionId}`, listener);
  },
  onSshClose: (connectionId: string, callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(`ssh:close:${connectionId}`, listener);
    return () => ipcRenderer.removeListener(`ssh:close:${connectionId}`, listener);
  },

  // SFTP operations
  sftpConnect: (connectionId: string) => ipcRenderer.invoke('sftp:connect', connectionId),
  sftpHome: (connectionId: string) => ipcRenderer.invoke('sftp:home', connectionId),
  sftpList: (connectionId: string, remotePath: string) =>
    ipcRenderer.invoke('sftp:list', connectionId, remotePath),
  sftpMkdir: (connectionId: string, remotePath: string) =>
    ipcRenderer.invoke('sftp:mkdir', connectionId, remotePath),
  sftpRmdir: (connectionId: string, remotePath: string) =>
    ipcRenderer.invoke('sftp:rmdir', connectionId, remotePath),
  sftpDelete: (connectionId: string, remotePath: string) =>
    ipcRenderer.invoke('sftp:delete', connectionId, remotePath),
  sftpRename: (connectionId: string, oldPath: string, newPath: string) =>
    ipcRenderer.invoke('sftp:rename', connectionId, oldPath, newPath),
  sftpUpload: (connectionId: string, localPath: string, remotePath: string) =>
    ipcRenderer.invoke('sftp:upload', connectionId, localPath, remotePath),
  sftpDownload: (connectionId: string, remotePath: string, localPath: string) =>
    ipcRenderer.invoke('sftp:download', connectionId, remotePath, localPath),

  // Dialogs
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (defaultPath: string) => ipcRenderer.invoke('dialog:saveFile', defaultPath),

  // Config import/export
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import'),

  // Local file system
  getLocalHome: () => ipcRenderer.invoke('local:home'),
  listLocalDir: (dirPath: string) => ipcRenderer.invoke('local:list', dirPath),
  uploadToRemote: (localPath: string, remotePath: string, connectionId: string) =>
    ipcRenderer.invoke('local:upload', localPath, remotePath, connectionId),
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;