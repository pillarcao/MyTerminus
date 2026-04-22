export interface Group {
  id: string;
  name: string;
  color?: string;
}

export interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'privateKey';
  password?: string;
  privateKeyPath?: string;
  groupId?: string;
  terminalTheme?: 'default' | 'dark' | 'light' | 'monokai' | 'green' | 'blue' | 'nord' | 'dracula' | 'solarized' | 'synthwave' | 'one-dark';
  cursorStyle?: 'block' | 'underline' | 'bar';
  cursorBlink?: boolean;
}

export interface SFTPFile {
  name: string;
  path?: string;
  isDirectory: boolean;
  size: number;
  modified: string;
}

export interface LocalFile {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string;
}

export interface Theme {
  id: string;
  name: string;
  colors: {
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    textPrimary: string;
    textSecondary: string;
    textMuted?: string;
    accent: string;
    accentHover: string;
    border: string;
    success: string;
    error: string;
  };
}

export const THEMES: Theme[] = [
  {
    id: 'light',
    name: 'Light',
    colors: {
      bgPrimary: 'rgba(246, 246, 246, 0.85)',
      bgSecondary: 'rgba(255, 255, 255, 0.85)',
      bgTertiary: 'rgba(242, 242, 242, 0.85)',
      textPrimary: '#000000',
      textSecondary: '#4a4a4f',
      textMuted: '#6e6e73',
      accent: '#007aff',
      accentHover: '#0056cc',
      border: 'rgba(0, 0, 0, 0.15)',
      success: '#34c759',
      error: '#ff3b30',
    },
  },
];

declare global {
  interface Window {
    electronAPI: {
      listConnections: () => Promise<Connection[]>;
      saveConnection: (connection: Connection) => Promise<Connection>;
      deleteConnection: (id: string) => Promise<boolean>;
      getConnection: (id: string) => Promise<Connection | undefined>;

      listGroups: () => Promise<Group[]>;
      saveGroup: (group: Group) => Promise<Group>;
      deleteGroup: (id: string) => Promise<boolean>;

      sshConnect: (connectionId: string, config: any) => Promise<{ success: boolean }>;
      sshDisconnect: (connectionId: string) => Promise<boolean>;
      sshShell: (connectionId: string) => Promise<{ success: boolean }>;
      sshInput: (connectionId: string, data: string) => void;
      sshResize: (connectionId: string, cols: number, rows: number) => void;
      onSshData: (connectionId: string, callback: (data: string) => void) => () => void;
      onSshClose: (connectionId: string, callback: () => void) => () => void;

      sftpConnect: (connectionId: string) => Promise<{ success: boolean }>;
      sftpHome: (connectionId: string) => Promise<string>;
      sftpList: (connectionId: string, remotePath: string) => Promise<SFTPFile[]>;
      sftpMkdir: (connectionId: string, remotePath: string) => Promise<{ success: boolean }>;
      sftpRmdir: (connectionId: string, remotePath: string) => Promise<{ success: boolean }>;
      sftpDelete: (connectionId: string, remotePath: string) => Promise<{ success: boolean }>;
      sftpRename: (connectionId: string, oldPath: string, newPath: string) => Promise<{ success: boolean }>;
      sftpUpload: (tabId: string, connectionId: string, localPath: string, remotePath: string) => Promise<{ success: boolean }>;
      sftpDownload: (tabId: string, connectionId: string, remotePath: string, localPath: string) => Promise<{ success: boolean }>;
      onSftpProgress: (tabId: string, callback: (data: { type: string; progress: number; transferred: number; total: number }) => void) => () => void;

      openFileDialog: () => Promise<string | null>;
      saveFileDialog: (defaultPath: string) => Promise<string | null>;

      getLocalHome: () => Promise<string>;
      listLocalDir: (dirPath: string) => Promise<LocalFile[]>;
      uploadToRemote: (localPath: string, remotePath: string, connectionId: string) => Promise<{ success: boolean }>;

      exportConfig: () => Promise<{ success: boolean; message: string }>;
      importConfig: () => Promise<{ success: boolean; message: string }>;
      clipboardRead: () => Promise<string>;
      clipboardWrite: (text: string) => Promise<boolean>;
      platform: string;
    };
  }
}