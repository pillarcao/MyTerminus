import { useState, useEffect } from 'react';
import { Connection, Group } from '@shared/types';

interface Props {
  connection: Connection | null;
  groups: Group[];
  onSave: (connection: Connection) => void;
  onClose: () => void;
}

export default function ConnectionModal({ connection, groups, onSave, onClose }: Props) {
  const [form, setForm] = useState<Connection>({
    id: '',
    name: '',
    host: '',
    port: 22,
    username: '',
    authType: 'password',
    password: '',
    privateKeyPath: '',
    groupId: '',
    terminalTheme: 'default',
  });

  useEffect(() => {
    if (connection) {
      console.log('[ConnectionModal] Editing connection:', connection);
      setForm({
        ...connection,
        terminalTheme: connection.terminalTheme || 'default',
      });
    }
  }, [connection]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[ConnectionModal] Submitting form:', form);
    onSave(form);
  };

  const handleSelectKeyFile = async () => {
    const path = await window.electronAPI.openFileDialog();
    if (path) {
      setForm({ ...form, privateKeyPath: path });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{connection ? 'Edit Connection' : 'New Connection'}</h3>
          <button className="btn-icon" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Connection Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My Server"
                autoFocus
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Host</label>
                <input
                  type="text"
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  placeholder="192.168.1.100"
                  required
                />
              </div>
              <div className="form-group" style={{ maxWidth: '100px' }}>
                <label>Port</label>
                <input
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 22 })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="root"
                required
              />
            </div>

            <div className="form-group">
              <label>Group</label>
              <select
                value={form.groupId || ''}
                onChange={(e) => setForm({ ...form, groupId: e.target.value || undefined })}
              >
                <option value="">No Group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Terminal Theme</label>
              <select
                value={form.terminalTheme || 'default'}
                onChange={(e) => setForm({ ...form, terminalTheme: e.target.value as any })}
              >
                <option value="default">Default (Black)</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="monokai">Monokai</option>
                <option value="green">Green (Hacker)</option>
                <option value="blue">Blue (Ocean)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Authentication</label>
              <select
                value={form.authType}
                onChange={(e) => setForm({ ...form, authType: e.target.value as 'password' | 'privateKey' })}
              >
                <option value="password">Password</option>
                <option value="privateKey">Private Key</option>
              </select>
            </div>

            {form.authType === 'password' ? (
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={form.password || ''}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                />
              </div>
            ) : (
              <div className="form-group">
                <label>Private Key File</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={form.privateKeyPath || ''}
                    onChange={(e) => setForm({ ...form, privateKeyPath: e.target.value })}
                    placeholder="~/.ssh/id_rsa"
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn btn-secondary" onClick={handleSelectKeyFile}>
                    Browse
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {connection ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}