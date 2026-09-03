import { useEffect, useState } from 'react';
import Icon from './Icon';
import { Connection, Group } from '@shared/types';

interface Props {
  connections: Connection[];
  connectedIds: Set<string>;
  selectedGroup: Group | null;
  onSelectGroup: (group: Group | null) => void;
  groups: Group[];
  onConnect: (connection: Connection, type: 'ssh' | 'sftp') => void;
  onAddConnection: () => void;
  onEditConnection: (connection: Connection) => void;
  onDeleteConnection: (id: string) => void;
  onAddGroup: () => void;
  onEditGroup: (group: Group) => void;
  onDeleteGroup: (id: string) => void;
}

type Menu = { x: number; y: number; group?: Group; conn?: Connection };

/** Pure tree: groups expand to host leaves. Every action is on right-click, no buttons. */
export default function Sidebar({
  connections,
  connectedIds,
  selectedGroup,
  onSelectGroup,
  groups,
  onConnect,
  onAddConnection,
  onEditConnection,
  onDeleteConnection,
  onAddGroup,
  onEditGroup,
  onDeleteGroup,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<Menu | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  const openMenu = (e: React.MouseEvent, target: Omit<Menu, 'x' | 'y'>) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, ...target });
  };

  const toggle = (groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  return (
    <div className="sidebar" onContextMenu={(e) => openMenu(e, {})}>
      <div className="sidebar-header">
        <h2>HOSTS</h2>
      </div>
      <div className="connection-list">
        <div
          className={`group-header ${selectedGroup === null ? 'active' : ''}`}
          onClick={() => onSelectGroup(null)}
        >
          {/* Empty chevron + dot slots keep the label aligned with the group rows below. */}
          <span className="group-toggle" />
          <span className="group-color" style={{ background: 'transparent' }} />
          <span className="group-name">All Hosts</span>
          <span className="group-count">{connections.length}</span>
        </div>

        {groups.map((group) => {
          const children = connections.filter(c => c.groupId === group.id);
          const isExpanded = expanded.has(group.id);

          return (
            <div key={group.id}>
              <div
                className={`group-header ${selectedGroup?.id === group.id ? 'active' : ''} ${isExpanded ? 'expanded' : ''}`}
                onClick={() => {
                  onSelectGroup(group);
                  toggle(group.id);
                }}
                onContextMenu={(e) => openMenu(e, { group })}
              >
                <span className="group-toggle"><Icon name="chevronRight" size={12} /></span>
                <span className="group-color" style={{ backgroundColor: group.color || '#0078d4' }} />
                <span className="group-name">{group.name}</span>
                <span className="group-count">{children.length}</span>
              </div>
              {isExpanded && (
                <div className="tree-leaves">
                  {children.length === 0 && <div className="tree-leaf-empty">No hosts</div>}
                  {children.map((conn) => (
                    <div
                      key={conn.id}
                      className="tree-leaf"
                      title={`${conn.username}@${conn.host}:${conn.port}`}
                      onDoubleClick={() => onConnect(conn, 'ssh')}
                      onContextMenu={(e) => openMenu(e, { conn })}
                    >
                      <span className={`tree-leaf-dot ${connectedIds.has(conn.id) ? 'connected' : ''}`} />
                      <span className="tree-leaf-name">{conn.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {menu && (
        <div className="context-menu" style={{ position: 'fixed', left: menu.x, top: menu.y }}>
          {menu.conn ? (
            <>
              <div className="context-menu-item" onClick={() => onConnect(menu.conn!, 'ssh')}>Open SSH</div>
              <div className="context-menu-item" onClick={() => onConnect(menu.conn!, 'sftp')}>Open SFTP</div>
              <div className="context-menu-item" onClick={() => onEditConnection(menu.conn!)}>Edit…</div>
              <div
                className="context-menu-item"
                onClick={() => {
                  if (confirm(`Delete connection "${menu.conn!.name}"?`)) onDeleteConnection(menu.conn!.id);
                }}
              >
                Delete
              </div>
            </>
          ) : menu.group ? (
            <>
              <div className="context-menu-item" onClick={onAddConnection}>New Host</div>
              <div className="context-menu-item" onClick={() => onEditGroup(menu.group!)}>Rename…</div>
              <div
                className="context-menu-item"
                onClick={() => {
                  if (confirm(`Delete group "${menu.group!.name}"?`)) onDeleteGroup(menu.group!.id);
                }}
              >
                Delete
              </div>
            </>
          ) : (
            <>
              <div className="context-menu-item" onClick={onAddGroup}>New Group</div>
              <div className="context-menu-item" onClick={onAddConnection}>New Host</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
