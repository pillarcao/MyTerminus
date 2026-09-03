import { create } from 'zustand';
import { Connection, SFTPFile, Group, TerminalThemeConfig, AppearanceConfig, DEFAULT_APPEARANCE } from '@shared/types';

interface Tab {
  id: string;
  connectionId: string;
  type: 'terminal' | 'sftp' | 'host';
  title: string;
}

interface AppState {
  connections: Connection[];
  groups: Group[];
  tabs: Tab[];
  activeTabId: string | null;
  error: string | null;
  showCommandBar: boolean;

  // Configuration
  terminalThemes: TerminalThemeConfig[];
  appearanceConfig: AppearanceConfig;

  // SFTP state per connection
  sftpPath: Record<string, string>;
  sftpFiles: Record<string, SFTPFile[]>;

  // Local file browser state per tab
  localPath: Record<string, string>;

  // Actions
  setConnections: (connections: Connection[]) => void;
  setGroups: (groups: Group[]) => void;
  addTab: (tab: Tab) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string | null) => void;
  setError: (error: string | null) => void;
  setSftpPath: (connectionId: string, path: string) => void;
  setSftpFiles: (connectionId: string, files: SFTPFile[]) => void;
  setLocalPath: (tabId: string, path: string) => void;
  setShowCommandBar: (show: boolean) => void;

  // Config actions
  setTerminalThemes: (themes: TerminalThemeConfig[]) => void;
  setAppearanceConfig: (config: AppearanceConfig) => void;
}


export const useAppStore = create<AppState>((set) => ({
  connections: [],
  groups: [],
  tabs: [],
  activeTabId: null,
  error: null,
  sftpPath: {},
  sftpFiles: {},
  localPath: {},
  showCommandBar: false,

  terminalThemes: [],
  appearanceConfig: DEFAULT_APPEARANCE,

  setConnections: (connections) => set({ connections }),
  setGroups: (groups) => set({ groups }),
  addTab: (tab) => set((state) => {
    if (state.tabs.find(t => t.id === tab.id)) {
      return { activeTabId: tab.id };
    }
    return { tabs: [...state.tabs, tab], activeTabId: tab.id };
  }),
  removeTab: (tabId) => set((state) => {
    const newTabs = state.tabs.filter((t) => t.id !== tabId);
    return {
      tabs: newTabs,
      activeTabId: state.activeTabId === tabId ? (newTabs[0]?.id || null) : state.activeTabId,
    };
  }),
  setActiveTab: (tabId) => set({ activeTabId: tabId }),
  setError: (error) => set({ error }),
  setSftpPath: (connectionId, path) => set((state) => ({
    sftpPath: { ...state.sftpPath, [connectionId]: path },
  })),
  setSftpFiles: (connectionId, files) => set((state) => ({
    sftpFiles: { ...state.sftpFiles, [connectionId]: files },
  })),
  setLocalPath: (tabId, path) => set((state) => ({
    localPath: { ...state.localPath, [tabId]: path },
  })),
  setShowCommandBar: (show) => set({ showCommandBar: show }),

  setTerminalThemes: (themes) => set({ terminalThemes: themes }),
  setAppearanceConfig: (config) => set({ appearanceConfig: config }),
}));