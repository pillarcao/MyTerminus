import { create } from 'zustand';
import { Connection, SFTPFile, Group, Theme, THEMES } from '@shared/types';

interface Tab {
  id: string;
  connectionId: string;
  type: 'terminal' | 'sftp' | 'host';
  title: string;
}

interface AppState {
  connections: Connection[];
  groups: Group[];
  activeConnectionId: string | null;
  tabs: Tab[];
  activeTabId: string | null;
  isConnecting: boolean;
  error: string | null;
  currentTheme: Theme;
  expandedGroups: Set<string>;
  showCommandBar: boolean;
  glassOpacity: number;

  // SFTP state per connection
  sftpPath: Record<string, string>;
  sftpFiles: Record<string, SFTPFile[]>;

  // Local file browser state per tab
  localPath: Record<string, string>;

  // Actions
  setConnections: (connections: Connection[]) => void;
  setGroups: (groups: Group[]) => void;
  setActiveConnectionId: (id: string | null) => void;
  addTab: (tab: Tab) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string | null) => void;
  setConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  setSftpPath: (connectionId: string, path: string) => void;
  setSftpFiles: (connectionId: string, files: SFTPFile[]) => void;
  setLocalPath: (tabId: string, path: string) => void;
  setTheme: (themeId: string) => void;
  toggleGroup: (groupId: string) => void;
  setShowCommandBar: (show: boolean) => void;
  setGlassOpacity: (opacity: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  connections: [],
  groups: [],
  activeConnectionId: null,
  tabs: [],
  activeTabId: null,
  isConnecting: false,
  error: null,
  currentTheme: THEMES[0], // Default to light theme (first in array)
  expandedGroups: new Set(),
  sftpPath: {},
  sftpFiles: {},
  localPath: {},
  showCommandBar: false,
  glassOpacity: 0.35,

  setConnections: (connections) => set({ connections }),
  setGroups: (groups) => set({ groups }),
  setActiveConnectionId: (id) => set({ activeConnectionId: id }),
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
  setConnecting: (connecting) => set({ isConnecting: connecting }),
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
  setTheme: (themeId) => {
    const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
    set({ currentTheme: theme });
    // Apply theme CSS variables
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      const cssKey = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
      root.style.setProperty(cssKey, value);
    });
  },
  toggleGroup: (groupId) => set((state) => {
    const newExpanded = new Set(state.expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    return { expandedGroups: newExpanded };
  }),
  setShowCommandBar: (show) => set({ showCommandBar: show }),
  setGlassOpacity: (opacity) => set({ glassOpacity: opacity }),
}));