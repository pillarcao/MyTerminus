import { useEffect, useState } from 'react';
import { useAppStore } from './stores/appStore';
import { Connection, Group, DEFAULT_APPEARANCE } from '@shared/types';
import ConnectionModal from './components/ConnectionModal';
import GroupModal from './components/GroupModal';
import Sidebar from './components/Sidebar';
import HostDetail from './components/HostDetail';
import TabBar from './components/TabBar';
import Terminal, { sendInput } from './components/Terminal';
import Icon from './components/Icon';
import SFTPBrowser from './components/SFTPBrowser';
import CommandBar from './components/CommandBar';
import AppearancePanel from './components/AppearancePanel';

export default function App() {
  const {
    connections,
    setConnections,
    groups,
    setGroups,
    tabs,
    activeTabId,
    setError,
    error,
    setSftpPath,
    addTab,
    showCommandBar,
    setShowCommandBar,
    setTerminalThemes,
    appearanceConfig,
    setAppearanceConfig,
  } = useAppStore();

  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showAppearance, setShowAppearance] = useState(false);

  // VS Code's ⌘B. NOT plain Ctrl+B off macOS — that's tmux's prefix key, and a global
  // listener here would swallow it before the terminal ever sees it.
  useEffect(() => {
    const isMac = window.electronAPI.platform === 'darwin';
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'b') return;
      if (isMac ? !(e.metaKey && !e.ctrlKey) : !(e.ctrlKey && e.shiftKey)) return;
      e.preventDefault();
      setShowSidebar(s => !s);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // appearance.conf → CSS custom properties. index.css derives --glass / --surface /
  // --canvas from these, so one knob moves all three frosted layers together.
  // The conf is hand-edited, so every value is coerced: a typo yields NaN, and
  // `calc(NaN * 0.58)` makes the surface colour invalid — i.e. the whole UI loses its fill.
  useEffect(() => {
    const a = appearanceConfig;
    const d = DEFAULT_APPEARANCE;
    const num = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
    const root = document.documentElement.style;
    root.setProperty('--tint', `${num(a.uiTintHue, d.uiTintHue)} ${num(a.uiTintSat, d.uiTintSat)}% ${num(a.uiTintLight, d.uiTintLight)}%`);
    root.setProperty('--glass-opacity', String(num(a.glassOpacity, d.glassOpacity)));
    root.setProperty('--blur-overlay', `${num(a.blurOverlay, d.blurOverlay)}px`);
  }, [appearanceConfig]);

  // Re-read on focus: edit the file, switch back, see it. Cheaper than a Reload button.
  useEffect(() => {
    const reload = () => window.electronAPI.getAppearanceConfig().then(setAppearanceConfig);
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, []);

  useEffect(() => {
    loadData();
    // Add default HOST tab on first load
    addTab({
      id: 'host-tab',
      connectionId: '',
      type: 'host',
      title: 'HOST',
    });
  }, []);

  const loadData = async () => {
    try {
      const [connectionsList, groupsList, themesList, appearanceCfg] = await Promise.all([
        window.electronAPI.listConnections(),
        window.electronAPI.listGroups(),
        window.electronAPI.listTerminalThemes(),
        window.electronAPI.getAppearanceConfig(),
      ]);
      setConnections(connectionsList);
      setGroups(groupsList);
      setTerminalThemes(themesList);
      setAppearanceConfig(appearanceCfg);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const handleAddConnection = () => {
    setEditingConnection(null);
    setShowConnectionModal(true);
  };

  const handleEditConnection = (connection: Connection) => {
    setEditingConnection(connection);
    setShowConnectionModal(true);
  };

  const handleSaveConnection = async (connection: Connection) => {
    console.log('[App] handleSaveConnection:', connection);
    try {
      await window.electronAPI.saveConnection(connection);
      await loadData();
      setShowConnectionModal(false);
    } catch (err) {
      setError('Failed to save connection');
    }
  };

  const handleDeleteConnection = async (id: string) => {
    try {
      await window.electronAPI.deleteConnection(id);
      await loadData();
    } catch (err) {
      setError('Failed to delete connection');
    }
  };

  const handleAddGroup = () => {
    setEditingGroup(null);
    setShowGroupModal(true);
  };

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    setShowGroupModal(true);
  };

  const handleSaveGroup = async (group: Group) => {
    try {
      await window.electronAPI.saveGroup(group);
      await loadData();
      setShowGroupModal(false);
    } catch (err) {
      setError('Failed to save group');
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await window.electronAPI.deleteGroup(id);
      await loadData();
      if (selectedGroup?.id === id) {
        setSelectedGroup(null);
      }
    } catch (err) {
      setError('Failed to delete group');
    }
  };

  const handleConnect = async (connection: Connection, openType: 'ssh' | 'sftp' = 'ssh') => {
    const isAlreadyConnected = connectedIds.has(connection.id);

    if (!isAlreadyConnected) {
      setError(null);
      try {
        const config: any = {
          host: connection.host,
          port: connection.port,
          username: connection.username,
        };

        if (connection.authType === 'password') {
          config.password = connection.password;
        } else if (connection.authType === 'privateKey') {
          config.privateKeyPath = connection.privateKeyPath;
        }

        await window.electronAPI.sshConnect(connection.id, config);
        setConnectedIds((prev) => new Set([...prev, connection.id]));
      } catch (err: any) {
        setError(err.toString());
        return;
      }
    }

    // Open SSH or SFTP based on type
    if (openType === 'sftp') {
      handleOpenSFTP(connection);
    } else {
      handleOpenTerminal(connection);
    }
  };

  const handleOpenTerminal = (connection: Connection) => {
    const id = `${connection.id}-terminal-${Date.now()}`;
    addTab({
      id,
      connectionId: connection.id,
      type: 'terminal',
      title: `${connection.name} - SSH`,
    });
  };

  const handleOpenSFTP = (connection: Connection) => {
    const id = `${connection.id}-sftp-${Date.now()}`;
    addTab({
      id,
      connectionId: connection.id,
      type: 'sftp',
      title: `${connection.name} - SFTP`,
    });
    setSftpPath(connection.id, '/');
  };

  const handleTabClose = async (tabId: string, connectionId: string) => {
    // Check if other tabs use this connection
    const otherTabs = tabs.filter(t => t.id !== tabId && t.connectionId === connectionId);
    if (otherTabs.length === 0 && connectionId) {
      // No other tabs using this connection, disconnect
      try {
        await window.electronAPI.sshDisconnect(connectionId);
        setConnectedIds((prev) => {
          const next = new Set(prev);
          next.delete(connectionId);
          return next;
        });
      } catch (err) {
        console.error('Disconnect error:', err);
      }
    }
  };

  const handleSendCommand = (command: string, target: 'current' | 'all') => {
    // Append newline if not present
    const cmd = command.endsWith('\n') ? command : command + '\n';
    
    if (target === 'current') {
      if (activeTabId && tabs.find(t => t.id === activeTabId)?.type === 'terminal') {
        sendInput(activeTabId, cmd);
      }
    } else {
      // Send to all open terminal tabs
      tabs.filter(t => t.type === 'terminal').forEach(tab => {
        sendInput(tab.id, cmd);
      });
    }
  };


  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className={`app platform-${window.electronAPI.platform}`}>
      <div className="header">
        <TabBar onTabClose={handleTabClose} />
        <div className="header-right">
          <button
            className={`btn-icon ${showSidebar ? 'active' : ''}`}
            onClick={() => setShowSidebar(!showSidebar)}
            title={`Toggle Sidebar (${window.electronAPI.platform === 'darwin' ? '⌘B' : 'Ctrl+Shift+B'})`}
            aria-label="Toggle Sidebar"
          >
            <Icon name="sidebar" />
          </button>
          <button
            className={`btn-icon ${showCommandBar ? 'active' : ''}`}
            onClick={() => setShowCommandBar(!showCommandBar)}
            title="Toggle Command Bar (Batch Send)"
            aria-label="Toggle Command Bar"
          >
            <Icon name="command" />
          </button>
          <button
            className={`btn-icon ${showAppearance ? 'active' : ''}`}
            onClick={() => setShowAppearance(!showAppearance)}
            title="Appearance"
            aria-label="Appearance"
          >
            <Icon name="sliders" />
          </button>
        </div>
      </div>
      <div className="main-content">
        {/* HOST tab - always rendered, toggled via display */}
        <div className="split-view-container" style={{ display: activeTab?.type === 'host' ? 'flex' : 'none' }}>
          {showSidebar && <Sidebar
            connections={connections}
            connectedIds={connectedIds}
            selectedGroup={selectedGroup}
            onSelectGroup={setSelectedGroup}
            groups={groups}
            onConnect={handleConnect}
            onAddConnection={handleAddConnection}
            onEditConnection={handleEditConnection}
            onDeleteConnection={handleDeleteConnection}
            onAddGroup={handleAddGroup}
            onEditGroup={handleEditGroup}
            onDeleteGroup={handleDeleteGroup}
          />}
          <HostDetail
            connections={connections}
            selectedGroup={selectedGroup}
            connectedIds={connectedIds}
            onConnect={handleConnect}
            onAddConnection={handleAddConnection}
            onEditConnection={handleEditConnection}
            onDeleteConnection={handleDeleteConnection}
          />
        </div>
        {/* Non-host tabs - always rendered, toggled via visibility */}
        <div className="full-tab-content" style={{ position: 'relative', display: activeTab?.type !== 'host' ? 'flex' : 'none' }}>
          {tabs.filter(t => t.type !== 'host').map(tab => {
            const isActive = tab.id === activeTabId;
            // Terminals use visibility:hidden (not display:none) so xterm stays mounted
            // SFTP/other panels use display:none to fully remove from paint tree → no flash
            const panelStyle: React.CSSProperties = tab.type === 'terminal'
              ? { visibility: isActive ? 'visible' : 'hidden', position: 'absolute', inset: 0 }
              : { display: isActive ? 'flex' : 'none', position: 'absolute', inset: 0, flexDirection: 'column' };
            return (
              <div key={tab.id} className="tab-panel" style={panelStyle}>
                {tab.type === 'terminal' ? (
                  <Terminal
                    connectionId={tab.connectionId}
                    tabId={tab.id}
                    terminalTheme={connections.find(c => c.id === tab.connectionId)?.terminalTheme || 'default'}
                    cursorStyle={connections.find(c => c.id === tab.connectionId)?.cursorStyle || 'block'}
                    cursorBlink={connections.find(c => c.id === tab.connectionId)?.cursorBlink !== false}
                    backspaceMode={connections.find(c => c.id === tab.connectionId)?.backspaceMode || 'del'}
                    terminalOpacity={connections.find(c => c.id === tab.connectionId)?.terminalOpacity}
                  />
                ) : (
                  <SFTPBrowser connectionId={tab.connectionId} tabId={tab.id} />
                )}
              </div>
            );
          })}
        </div>
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button className="btn-icon" onClick={() => setError(null)} title="Dismiss" aria-label="Dismiss error">
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
        {showCommandBar && (
          <CommandBar 
            onSendCommand={handleSendCommand} 
            onClose={() => setShowCommandBar(false)} 
          />
        )}
      </div>
      {showConnectionModal && (
        <ConnectionModal
          connection={editingConnection}
          groups={groups}
          onSave={handleSaveConnection}
          onClose={() => setShowConnectionModal(false)}
        />
      )}
      {showAppearance && (
        <AppearancePanel
          config={appearanceConfig}
          onChange={setAppearanceConfig}
          onClose={() => setShowAppearance(false)}
        />
      )}
      {showGroupModal && (
        <GroupModal
          group={editingGroup}
          onSave={handleSaveGroup}
          onClose={() => setShowGroupModal(false)}
        />
      )}
    </div>
  );
}