import { useEffect, useState } from 'react';
import { LocalFile } from '@shared/types';

interface Props {
  onFileSelect: (file: LocalFile) => void;
  onDragStart: (file: LocalFile) => void;
  selectedFile: string | null;
}

export default function LocalBrowser({ onFileSelect, onDragStart, selectedFile }: Props) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const home = await window.electronAPI.getLocalHome();
      setCurrentPath(home);
      await loadFiles(home);
    } catch (err) {
      console.error('Failed to init:', err);
    }
  };

  const loadFiles = async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await window.electronAPI.listLocalDir(dirPath);
      setFiles(list);
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const navigateTo = (dirPath: string) => {
    setCurrentPath(dirPath);
    loadFiles(dirPath);
  };

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length <= 1) {
      // Root on Unix
      navigateTo('/');
    } else {
      parts.pop();
      const newPath = '/' + parts.join('/');
      navigateTo(newPath);
    }
  };

  const handleFileClick = (file: LocalFile) => {
    if (file.isDirectory) {
      navigateTo(file.path);
    } else {
      onFileSelect(file);
    }
  };

  const handleDragStart = (e: React.DragEvent, file: LocalFile) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'local',
      file
    }));
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart(file);
  };

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div className="file-browser">
      <div className="browser-toolbar">
        <button className="btn btn-sm btn-secondary" onClick={() => loadFiles(currentPath)}>
          ↻
        </button>
        <button className="btn btn-sm btn-secondary" onClick={navigateUp} disabled={currentPath === '/'}>
          ↑
        </button>
      </div>

      <div className="browser-path">
        <span onClick={() => navigateTo('/')}>Root</span>
        {pathParts.map((part, index) => (
          <span key={index} onClick={() => navigateTo('/' + pathParts.slice(0, index + 1).join('/'))}>
            {part}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="browser-loading">Loading...</div>
      ) : error ? (
        <div className="browser-error">Error: {error}</div>
      ) : (
        <div className="browser-list">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Modified</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr
                  key={file.path}
                  className={selectedFile === file.path ? 'selected' : ''}
                  onClick={() => handleFileClick(file)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, file)}
                >
                  <td>
                    <span className="file-name">
                      <span className="file-icon">{file.isDirectory ? '📁' : '📄'}</span>
                      {file.name}
                    </span>
                  </td>
                  <td className="file-size">{file.isDirectory ? '-' : formatSize(file.size)}</td>
                  <td className="file-date">{file.modified ? new Date(file.modified).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}