import { useState } from 'react';

interface Props {
  onSendCommand: (command: string, target: 'current' | 'all') => void;
  onClose: () => void;
}

export default function CommandBar({ onSendCommand, onClose }: Props) {
  const [command, setCommand] = useState('');
  const [target, setTarget] = useState<'current' | 'all'>('current');

  const handleSend = () => {
    if (!command.trim()) return;
    onSendCommand(command, target);
    setCommand('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="command-bar">
      <div className="command-bar-container">
        <div className="command-bar-header">
          <div className="command-bar-title-group">
            <span className="command-bar-label">Batch Command</span>
            <select
              className="command-bar-select"
              value={target}
              onChange={(e) => setTarget(e.target.value as 'current' | 'all')}
            >
              <option value="current">Current Tab</option>
              <option value="all">All SSH Tabs</option>
            </select>
          </div>
          <button className="btn-icon btn-sm" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="command-bar-body">
          <textarea
            className="command-bar-input"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type command here... (Shift+Enter for newline, Enter to send)"
            rows={3}
          />
        </div>
      </div>
    </div>
  );
}
