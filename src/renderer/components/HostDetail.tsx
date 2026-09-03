import { Connection, Group } from '@shared/types';
import Icon from './Icon';

interface Props {
  connections: Connection[];
  selectedGroup: Group | null;
  connectedIds: Set<string>;
  onConnect: (connection: Connection, type: 'ssh' | 'sftp') => void;
  onAddConnection: () => void;
  onEditConnection: (connection: Connection) => void;
  onDeleteConnection: (id: string) => void;
}

export default function HostDetail({
  connections,
  selectedGroup,
  connectedIds,
  onConnect,
  onAddConnection,
  onEditConnection,
  onDeleteConnection,
}: Props) {
  // Filter connections based on selected group
  const displayConnections = selectedGroup
    ? connections.filter(c => c.groupId === selectedGroup.id)
    : connections;

  const title = selectedGroup ? selectedGroup.name : 'All Hosts';

  // Header stays mounted when the list is empty — that's exactly when "New Host" is needed.
  const header = (
    <div className="host-list-header">
      <h3>{title}</h3>
      <span className="host-count">{displayConnections.length} hosts</span>
      <button className="btn-icon" style={{ marginLeft: 'auto' }} onClick={onAddConnection} title="New Host">
        <Icon name="plus" />
      </button>
    </div>
  );

  if (displayConnections.length === 0) {
    return (
      <div className="host-list">
        {header}
        <div className="host-list-empty">
          <div className="empty-icon"><Icon name="list" size={20} /></div>
          <div className="empty-text">No hosts found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="host-list">
      {header}
      <div className="host-table">
        <div className="host-table-header">
          <div className="col-name">Host Name</div>
          <div className="col-address">IP:PORT</div>
          <div className="col-user">User</div>
          <div className="col-actions">SSH / SFTP</div>
          <div className="col-edit"></div>
        </div>
        <div className="host-table-body">
          {displayConnections.map((conn) => {
            const isConnected = connectedIds.has(conn.id);

            return (
              <div
                key={conn.id}
                className={`host-table-row ${isConnected ? 'connected' : ''}`}
                onDoubleClick={() => {
                  // Double click to connect and open SSH
                  onConnect(conn, 'ssh');
                }}
              >
                <div className="col-name">
                  <span className={`status-indicator ${isConnected ? 'connected' : ''}`} />
                  {conn.name}
                </div>
                <div className="col-address">{conn.host}:{conn.port}</div>
                <div className="col-user">{conn.username}</div>
                <div className="col-actions">
                  <button
                    className="btn-action-premium"
                    onClick={() => onConnect(conn, 'ssh')}
                    title="SSH Terminal"
                  >
                    <Icon name="terminal" size={14} />
                    SSH
                  </button>
                  <button
                    className="btn-action-premium"
                    onClick={() => onConnect(conn, 'sftp')}
                    title="SFTP Browser"
                  >
                    <Icon name="folder" size={14} />
                    SFTP
                  </button>
                </div>
                <div className="col-edit">
                  <button
                    className="btn-icon btn-sm"
                    onClick={() => onEditConnection(conn)}
                    title="Edit"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    className="btn-icon btn-sm"
                    onClick={() => {
                      if (confirm(`Delete connection "${conn.name}"?`)) {
                        onDeleteConnection(conn.id);
                      }
                    }}
                    title="Delete"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}