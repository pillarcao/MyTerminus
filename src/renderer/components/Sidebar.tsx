import { useState } from 'react';
import { Connection, Group } from '@shared/types';

interface Props {
  connections: Connection[];
  connectedIds: Set<string>;
  selectedGroup: Group | null;
  onSelectGroup: (group: Group | null) => void;
  onAddConnection: () => void;
  onEditConnection: (connection: Connection) => void;
  onDeleteConnection: (id: string) => void;
  groups: Group[];
  onAddGroup: () => void;
  onEditGroup: (group: Group) => void;
  onDeleteGroup: (id: string) => void;
  onOpenTerminal: (connection: Connection) => void;
  onOpenSFTP: (connection: Connection) => void;
  onConnect: (connection: Connection) => void;
  onDisconnect: (connectionId: string) => void;
}

export default function Sidebar({
  connections,
  connectedIds,
  selectedGroup,
  onSelectGroup,
  onAddConnection,
  onEditConnection,
  onDeleteConnection,
  groups,
  onAddGroup,
  onEditGroup,
  onDeleteGroup,
  onOpenTerminal,
  onOpenSFTP,
  onConnect,
  onDisconnect,
}: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const getConnectionsByGroup = (groupId: string) => {
    return connections.filter(c => c.groupId === groupId);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>HOSTS</h2>
        <div className="sidebar-actions">
          <button className="btn-icon" onClick={onAddGroup} title="New Group">
            📂
          </button>
          <button className="btn-icon" onClick={onAddConnection} title="New Host">
            ➕
          </button>
        </div>
      </div>
      <div className="connection-list">
        {/* All Hosts option */}
        <div
          className={`group-header ${selectedGroup === null ? 'active' : ''}`}
          onClick={() => onSelectGroup(null)}
        >
          <span className="group-toggle">▶</span>
          <span className="group-name">All Hosts</span>
          <span className="group-count">{connections.length}</span>
        </div>

        {groups.map((group) => {
          const groupConns = getConnectionsByGroup(group.id);
          const isExpanded = expandedGroups.has(group.id);

          return (
            <div key={group.id} className="group">
              <div
                className={`group-header ${selectedGroup?.id === group.id ? 'active' : ''} ${isExpanded ? 'expanded' : ''}`}
                onClick={() => {
                  onSelectGroup(group);
                  toggleGroup(group.id);
                }}
              >
                <span className="group-toggle">▶</span>
                <span className="group-color" style={{ backgroundColor: group.color || '#0078d4' }} />
                <span className="group-name">{group.name}</span>
                <span className="group-count">{groupConns.length}</span>
                <div className="group-actions">
                  <button
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditGroup(group);
                    }}
                    title="Edit"
                  >
                    ✏
                  </button>
                  <button
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete group "${group.name}"?`)) {
                        onDeleteGroup(group.id);
                      }
                    }}
                    title="Delete"
                  >
                    🗑
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="group-connections">
                  {groupConns.length > 0 ? (
                    groupConns.map((conn) => renderConnectionItem(conn))
                  ) : (
                    <div className="group-empty">No hosts</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  function renderConnectionItem(conn: Connection) {
    const isConnected = connectedIds.has(conn.id);

    return (
      <div key={conn.id} className="host-item-compact">
        <div className={`host-status-dot ${isConnected ? 'connected' : ''}`} />
        <div className="host-item-info">
          <div className="host-item-name">{conn.name}</div>
        </div>
        <div className="host-item-actions">
          {isConnected ? (
            <>
              <button
                className="btn-icon btn-sm"
                onClick={() => onOpenTerminal(conn)}
                title="SSH"
              >
                ⌨
              </button>
              <button
                className="btn-icon btn-sm"
                onClick={() => onOpenSFTP(conn)}
                title="SFTP"
              >
                📁
              </button>
              <button
                className="btn-icon btn-sm"
                onClick={() => onDisconnect(conn.id)}
                title="Disconnect"
              >
                ⏹
              </button>
            </>
          ) : (
            <button
              className="btn-icon btn-sm"
              onClick={() => onConnect(conn)}
              title="Connect"
            >
              ▶
            </button>
          )}
          <button
            className="btn-icon btn-sm"
            onClick={() => onEditConnection(conn)}
            title="Edit"
          >
            ⚙
          </button>
          <button
            className="btn-icon btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete connection "${conn.name}"?`)) {
                onDeleteConnection(conn.id);
              }
            }}
            title="Delete"
          >
            🗑
          </button>
        </div>
      </div>
    );
  }
}