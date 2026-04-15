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
  terminalTheme?: 'default' | 'dark' | 'light' | 'monokai' | 'green' | 'blue';
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
      textPrimary: '#1d1d1f',
      textSecondary: '#6e6e73',
      textMuted: '#a1a1a6',
      accent: '#007aff',
      accentHover: '#0056cc',
      border: 'rgba(0, 0, 0, 0.1)',
      success: '#34c759',
      error: '#ff3b30',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    colors: {
      bgPrimary: 'rgba(30, 30, 30, 0.85)',
      bgSecondary: 'rgba(37, 37, 38, 0.85)',
      bgTertiary: 'rgba(45, 45, 48, 0.85)',
      textPrimary: '#f5f5f7',
      textSecondary: '#98989d',
      textMuted: '#6e6e73',
      accent: '#0a84ff',
      accentHover: '#409cff',
      border: 'rgba(255, 255, 255, 0.1)',
      success: '#30d158',
      error: '#ff453a',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    colors: {
      bgPrimary: '#272822',
      bgSecondary: '#3e3d32',
      bgTertiary: '#49483e',
      textPrimary: '#f8f8f2',
      textSecondary: '#a59f85',
      accent: '#ae81ff',
      accentHover: '#cc78ff',
      border: '#5b595c',
      success: '#a6e22e',
      error: '#f92672',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    colors: {
      bgPrimary: '#002b36',
      bgSecondary: '#073642',
      bgTertiary: '#094050',
      textPrimary: '#839496',
      textSecondary: '#657b83',
      accent: '#268bd2',
      accentHover: '#2aa198',
      border: '#073642',
      success: '#859900',
      error: '#dc322f',
    },
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    colors: {
      bgPrimary: '#282c34',
      bgSecondary: '#21252b',
      bgTertiary: '#2c313a',
      textPrimary: '#abb2bf',
      textSecondary: '#5c6370',
      accent: '#61afef',
      accentHover: '#98c379',
      border: '#181a1f',
      success: '#98c379',
      error: '#e06c75',
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

      getTheme: () => Promise<string>;
      setTheme: (themeId: string) => Promise<void>;

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
      platform: string;
    };
  }
}