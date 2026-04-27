import { useEffect, useState, useRef } from 'react';
import { LocalFile } from '@shared/types';

interface Props {
  tabId?: string;
  localPath?: string;
  onPathChange?: (path: string) => void;
  onFileSelect: (file: LocalFile) => void;
  onDragStart: (file: LocalFile) => void;
  selectedFile: string | null;
  showHidden?: boolean;
}

export default function LocalBrowser({ localPath, onPathChange, onFileSelect, onDragStart, selectedFile, showHidden = false }: Props) {
  const [currentPath, setCurrentPath] = useState<string>(localPath || '');
  const [inputPath, setInputPath] = useState<string>(localPath || '');
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBlurringLocal = useRef(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    if (localPath) {
      setCurrentPath(localPath);
      setHistory([localPath]);
      setHistoryIndex(0);
      loadFiles(localPath);
    } else {
      init();
    }
  }, []);

  // Watch for external path changes
  useEffect(() => {
    if (localPath && localPath !== currentPath) {
      setCurrentPath(localPath);
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(localPath);
        return newHistory;
      });
      setHistoryIndex(prev => prev + 1);
      loadFiles(localPath);
    }
  }, [localPath]);

  const init = async () => {
    try {
      const home = await window.electronAPI.getLocalHome();
      setCurrentPath(home);
      onPathChange?.(home);
      setHistory([home]);
      setHistoryIndex(0);
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

  const navigateTo = (dirPath: string, pushHistory = true) => {
    setCurrentPath(dirPath);
    onPathChange?.(dirPath);
    loadFiles(dirPath);
    if (pushHistory) {
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(dirPath);
        return newHistory;
      });
      setHistoryIndex(prev => prev + 1);
    }
  };

  useEffect(() => {
    setInputPath(currentPath);
  }, [currentPath]);

  const handlePathSubmit = () => {
    isBlurringLocal.current = true;
    setIsEditingPath(false);
    if (inputPath !== currentPath) {
      navigateTo(inputPath || '/');
    }
    setTimeout(() => {
      isBlurringLocal.current = false;
    }, 200);
  };

  const navigateBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      navigateTo(history[newIndex], false);
    }
  };

  const navigateForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      navigateTo(history[newIndex], false);
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

  const pathParts = currentPath.split(/[/\\]/).filter(Boolean);

  return (
    <div className="file-browser">
      <div className="panel-header">
        <span className="panel-title">📱 Local</span>
        <div className="panel-nav">
          <button className="btn-icon btn-sm" onClick={navigateBack} disabled={historyIndex <= 0}>&lt;</button>
          <button className="btn-icon btn-sm" onClick={navigateForward} disabled={historyIndex >= history.length - 1}>&gt;</button>
          <button className="btn-icon btn-sm" onClick={() => loadFiles(currentPath)} title="Refresh">↻</button>
        </div>
      <div 
        className="browser-path" 
        onClick={() => {
          if (!isEditingPath && !isBlurringLocal.current) {
            setIsEditingPath(true);
          }
        }}
      >
        {isEditingPath ? (
          <input 
            type="text" 
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePathSubmit()}
            onBlur={handlePathSubmit}
            className="path-input"
            spellCheck={false}
            autoFocus
          />
        ) : (
          <>
            <span onClick={(e) => { e.stopPropagation(); navigateTo('/'); }}>Root</span>
            {pathParts.map((part, index) => (
              <span key={index} onClick={(e) => { 
                e.stopPropagation(); 
                const parts = pathParts.slice(0, index + 1);
                let newPath = parts.join('/');
                if (/^[a-zA-Z]:/.test(newPath)) {
                  newPath = parts.length === 1 ? `${newPath}/` : newPath;
                } else {
                  newPath = `/${newPath}`;
                }
                navigateTo(newPath); 
              }}>
                {part}
              </span>
            ))}
          </>
        )}
      </div>
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
              {files
                .filter((file) => showHidden || !file.name.startsWith('.'))
                .map((file) => (
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