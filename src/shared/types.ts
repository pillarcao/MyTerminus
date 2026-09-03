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
  terminalTheme?: string; // theme file id (e.g. 'nord', 'dracula', or custom)
  // Overrides the alpha of the theme's background colour. Undefined = whatever the theme
  // file declares, so existing connections keep looking exactly as they did.
  terminalOpacity?: number; // 0.0–1.0
  cursorStyle?: 'block' | 'underline' | 'bar';
  cursorBlink?: boolean;
  // What the Backspace/Delete key sends. 'del' = ^? (\x7f, standard Linux default);
  // 'bs' = ^H (\x08, for SysV/Solaris-style hosts where `stty erase = ^H`).
  backspaceMode?: 'del' | 'bs';
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

// ── Terminal Theme Config ──────────────────────────────────────────────────
// Maps to a single .conf file in the themes/ directory.
// Keys correspond to xterm.js ITheme interface.
export interface TerminalThemeConfig {
  id: string;                        // filename without .conf extension
  name: string;                      // from: name = ...
  description?: string;
  // Core colors
  background: string;                // supports rgba(r,g,b,a) for transparency
  foreground: string;
  cursor: string;
  cursorAccent?: string;
  // Selection
  selectionBackground?: string;
  selectionForeground?: string;
  selectionInactiveBackground?: string;
  // ANSI 16 colors
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

// ── App Appearance Config ──────────────────────────────────────────────────
// Maps to appearance.conf in the config directory.
/**
 * Every knob here provably changes something. There used to be blur-sidebar, blur-header
 * and glass-saturate as well; they were dropped because `backdrop-filter` cannot reach the
 * macOS vibrancy layer through a transparent window — verified with an isolated two-pane
 * test where blur(30px) saturate(300%) rendered pixel-identical to plain rgba. Blurring the
 * desktop is the system's job. Only panels floating above the app's OWN content have a
 * backdrop worth filtering, hence the single blur-overlay.
 */
export interface AppearanceConfig {
  glassOpacity: number;    // 0.0–1.0, drives all three frosted layers proportionally
  blurOverlay: number;     // px, blur behind floating panels (modal / menu / command bar)
  uiTintHue: number;       // 0–360, tint of every frosted surface
  uiTintSat: number;       // 0–100
  uiTintLight: number;     // 0–100
}

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  glassOpacity: 0.55,
  blurOverlay: 20,
  uiTintHue: 240,
  uiTintSat: 10,
  uiTintLight: 98,
};

// ── Default fallback terminal theme (used when theme file is missing) ──────
export const FALLBACK_TERMINAL_THEME: TerminalThemeConfig = {
  id: 'default',
  name: 'Default',
  background: 'rgba(18, 20, 26, 0.90)',
  foreground: '#d6dae0',
  cursor: '#7aa2f7',
  selectionBackground: 'rgba(122, 162, 247, 0.25)',
};

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
      /** Raw contents of the remote shell history files (empty string if unavailable) */
      sshHistory: (connectionId: string) => Promise<string>;
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
      onSftpProgress: (tabId: string, callback: (data: { type: string; progress: number; transferred: number; total: number; speed: number }) => void) => () => void;

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

      // ── Theme & Appearance config ────────────────────────────────────────
      /** List all terminal themes from the themes/ directory */
      listTerminalThemes: () => Promise<TerminalThemeConfig[]>;
      /** Open the themes directory in Finder / Explorer */
      openThemesDir: () => Promise<void>;
      /** Get current appearance config (parsed from appearance.conf) */
      getAppearanceConfig: () => Promise<AppearanceConfig>;
      /** Save appearance config back to appearance.conf */
      saveAppearanceConfig: (config: AppearanceConfig) => Promise<{ success: boolean }>;
      /** Open appearance.conf in the default text editor */
      openAppearanceConfig: () => Promise<void>;
      /** Get the config directory path (for display) */
      getConfigDir: () => Promise<string>;
    };
  }
}