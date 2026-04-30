import { useEffect, useState } from 'react';
import { useAppStore } from './stores/appStore';
import { Connection, Group } from '@shared/types';
import ConnectionModal from './components/ConnectionModal';
import GroupModal from './components/GroupModal';
import Sidebar from './components/Sidebar';
import HostDetail from './components/HostDetail';
import TabBar from './components/TabBar';
import Terminal from './components/Terminal';
import SFTPBrowser from './components/SFTPBrowser';
import CommandBar from './components/CommandBar';

export default function App() {
  const {
    connections,
    setConnections,
    groups,
    setGroups,
    tabs,
    activeTabId,
    setConnecting,
    setError,
    error,
    setSftpPath,
    addTab,
    showCommandBar,
    setShowCommandBar,
    glassOpacity,
    setGlassOpacity,
  } = useAppStore();

  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

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

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-primary', `hsla(240, 10%, 98%, ${glassOpacity})`);
    root.style.setProperty('--bg-secondary', `hsla(0, 0%, 100%, ${Math.max(0, glassOpacity - 0.1)})`);
    root.style.setProperty('--bg-tertiary', `hsla(240, 5%, 96%, ${Math.max(0, glassOpacity - 0.15)})`);
    root.style.setProperty('--glass-bg', `hsla(0, 0%, 100%, ${Math.max(0, glassOpacity - 0.1)})`);
  }, [glassOpacity]);

  const loadData = async () => {
    try {
      const [connectionsList, groupsList] = await Promise.all([
        window.electronAPI.listConnections(),
        window.electronAPI.listGroups(),
      ]);
      setConnections(connectionsList);
      setGroups(groupsList);
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
      setConnecting(true);
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
        setConnecting(false);
        return;
      }
      setConnecting(false);
    }

    // Open SSH or SFTP based on type
    if (openType === 'sftp') {
      handleOpenSFTP(connection);
    } else {
      handleOpenTerminal(connection);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    try {
      await window.electronAPI.sshDisconnect(connectionId);
      setConnectedIds((prev) => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
      // Close any tabs for this connection
      const state = useAppStore.getState();
      const tabsToRemove = state.tabs.filter(t => t.connectionId === connectionId);
      tabsToRemove.forEach(t => state.removeTab(t.id));
    } catch (err) {
      console.error('Disconnect error:', err);
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
        window.electronAPI.sshInput(activeTabId, cmd);
      }
    } else {
      // Send to all open terminal tabs
      tabs.filter(t => t.type === 'terminal').forEach(tab => {
        window.electronAPI.sshInput(tab.id, cmd);
      });
    }
  };


  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className={`app platform-${window.electronAPI.platform}`}>
      <div className="header">
        <TabBar onTabClose={handleTabClose} />
        <div className="header-right">
          <div className="opacity-slider" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '16px' }}>
            <span style={{ fontSize: '11px', opacity: 0.7, fontFamily: 'monospace' }}>Glass</span>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05"
              value={glassOpacity}
              onChange={(e) => setGlassOpacity(parseFloat(e.target.value))}
              style={{ width: '60px', opacity: 0.8 }}
              title="Adjust Glassmorphism Transparency"
            />
          </div>
          <button
            className={`btn-icon ${showCommandBar ? 'active' : ''}`}
            onClick={() => setShowCommandBar(!showCommandBar)}
            title="Toggle Command Bar (Batch Send)"
          >
            ⌨️
          </button>
        </div>
      </div>
      <div className="main-content">
        {/* HOST tab - always rendered, toggled via display */}
        <div className="split-view-container" style={{ display: activeTab?.type === 'host' ? 'flex' : 'none' }}>
          <Sidebar
            connections={connections}
            connectedIds={connectedIds}
            selectedGroup={selectedGroup}
            onSelectGroup={setSelectedGroup}
            onAddConnection={handleAddConnection}
            onEditConnection={handleEditConnection}
            onDeleteConnection={handleDeleteConnection}
            groups={groups}
            onAddGroup={handleAddGroup}
            onEditGroup={handleEditGroup}
            onDeleteGroup={handleDeleteGroup}
            onOpenTerminal={handleOpenTerminal}
            onOpenSFTP={handleOpenSFTP}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
          <HostDetail
            connections={connections}
            selectedGroup={selectedGroup}
            connectedIds={connectedIds}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
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
            <button className="btn-icon" onClick={() => setError(null)}>✕</button>
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