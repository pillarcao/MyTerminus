import { Connection, Group } from '@shared/types';

interface Props {
  connections: Connection[];
  selectedGroup: Group | null;
  connectedIds: Set<string>;
  onConnect: (connection: Connection, type: 'ssh' | 'sftp') => void;
  onDisconnect: (connectionId: string) => void;
  onEditConnection: (connection: Connection) => void;
}

export default function HostDetail({
  connections,
  selectedGroup,
  connectedIds,
  onConnect,
  onDisconnect,
  onEditConnection,
}: Props) {
  // Filter connections based on selected group
  const displayConnections = selectedGroup
    ? connections.filter(c => c.groupId === selectedGroup.id)
    : connections;

  const title = selectedGroup ? selectedGroup.name : 'All Hosts';

  if (displayConnections.length === 0) {
    return (
      <div className="host-list-empty">
        <div className="empty-icon">📋</div>
        <div className="empty-text">No hosts found</div>
      </div>
    );
  }

  return (
    <div className="host-list">
      <div className="host-list-header">
        <h3>{title}</h3>
        <span className="host-count">{displayConnections.length} hosts</span>
      </div>
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
                  {isConnected ? (
                    <>
                      <button
                        className="btn btn-sm btn-table-action"
                        onClick={() => onConnect(conn, 'ssh')}
                      >
                        SSH
                      </button>
                      <button
                        className="btn btn-sm btn-table-action"
                        onClick={() => onConnect(conn, 'sftp')}
                      >
                        SFTP
                      </button>
                      <button
                        className="btn btn-sm btn-table-danger"
                        onClick={() => onDisconnect(conn.id)}
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn-sm btn-table-action"
                        onClick={() => onConnect(conn, 'ssh')}
                      >
                        SSH
                      </button>
                      <button
                        className="btn btn-sm btn-table-action"
                        onClick={() => onConnect(conn, 'sftp')}
                      >
                        SFTP
                      </button>
                    </>
                  )}
                </div>
                <div className="col-edit">
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => onEditConnection(conn)}
                    title="Edit"
                  >
                    ⚙
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