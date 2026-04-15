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
                        className="btn-action-premium"
                        onClick={() => onConnect(conn, 'ssh')}
                        title="SSH Terminal"
                      >
                        SSH
                        <svg viewBox="0 0 24 24" className="icon-blue">
                          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                        </svg>
                      </button>
                      <button
                        className="btn-action-premium"
                        onClick={() => onConnect(conn, 'sftp')}
                        title="SFTP Browser"
                      >
                        SFTP
                        <svg viewBox="0 0 24 24" className="icon-green">
                          <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8 7h-1v-1h1v1zm-3-2V8h1v3H9zm6 3h-1v-1h1v1zm-3-2v-3h1v3h-1z" opacity=".3"/>
                          <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>
                        </svg>
                      </button>
                      <button
                        className="btn-action-premium btn-danger-premium"
                        onClick={() => onDisconnect(conn.id)}
                        title="Disconnect"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn-action-premium"
                        onClick={() => onConnect(conn, 'ssh')}
                        title="SSH Terminal"
                      >
                        SSH
                        <svg viewBox="0 0 24 24" className="icon-blue">
                          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                        </svg>
                      </button>
                      <button
                        className="btn-action-premium"
                        onClick={() => onConnect(conn, 'sftp')}
                        title="SFTP Browser"
                      >
                        SFTP
                        <svg viewBox="0 0 24 24" className="icon-green">
                          <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8 7h-1v-1h1v1zm-3-2V8h1v3H9zm6 3h-1v-1h1v1zm-3-2v-3h1v3h-1z" opacity=".3"/>
                          <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>
                        </svg>
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
                    ✎
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