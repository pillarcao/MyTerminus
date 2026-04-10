import { useState, useEffect } from 'react';
import { Group } from '@shared/types';

interface Props {
  group: Group | null;
  onSave: (group: Group) => void;
  onClose: () => void;
}

export default function GroupModal({ group, onSave, onClose }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#0e639c');

  useEffect(() => {
    if (group) {
      setName(group.name);
      setColor(group.color || '#0e639c');
    }
  }, [group]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: group?.id || '',
      name,
      color,
    });
  };

  const colors = [
    '#0e639c', '#4ec9b0', '#f14c4c', '#ce9178', '#dcdcaa',
    '#c586c0', '#9cdcfe', '#6a9955', '#d7ba7d', '#808080',
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{group ? 'Edit Group' : 'New Group'}</h3>
          <button className="btn-icon" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Group Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Production Servers"
                required
              />
            </div>
            <div className="form-group">
              <label>Color</label>
              <div className="color-picker">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-option ${color === c ? 'selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}