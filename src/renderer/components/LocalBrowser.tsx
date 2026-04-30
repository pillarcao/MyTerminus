import { useEffect, useState, useRef, useMemo, useReducer, useCallback } from 'react';
import { LocalFile } from '@shared/types';
import { formatSize, formatDate, getFileType } from '../utils';

interface Props {
  tabId?: string;
  localPath?: string;
  onPathChange?: (path: string) => void;
  onFileSelect: (file: LocalFile) => void;
  onDragStart: (file: LocalFile) => void;
  selectedFile: string | null;
  showHidden?: boolean;
}

// Batched state to avoid multiple re-renders on each load
interface FileState {
  files: LocalFile[];
  loading: boolean;
  error: string | null;
}

type FileAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; files: LocalFile[] }
  | { type: 'LOAD_ERROR'; error: string };

function fileReducer(state: FileState, action: FileAction): FileState {
  switch (action.type) {
    case 'LOAD_START': return { files: state.files, loading: true, error: null };
    case 'LOAD_SUCCESS': return { files: action.files, loading: false, error: null };
    case 'LOAD_ERROR': return { files: state.files, loading: false, error: action.error };
  }
}

export default function LocalBrowser({ localPath, onPathChange, onFileSelect, onDragStart, selectedFile, showHidden = false }: Props) {
  const [currentPath, setCurrentPath] = useState<string>(localPath || '');
  const [inputPath, setInputPath] = useState<string>(localPath || '');
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [{ files, loading, error }, dispatch] = useReducer(fileReducer, { files: [], loading: false, error: null });
  const isBlurringLocal = useRef(false);
  const [history, setHistory] = useState<string[]>([]);
  const historyIndexRef = useRef(-1);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [sortField, setSortField] = useState<'name' | 'modified' | null>('modified');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (localPath) {
      setCurrentPath(localPath);
      setHistory([localPath]);
      historyIndexRef.current = 0;
      setHistoryIndex(0);
      loadFiles(localPath);
    } else {
      init();
    }
  }, []);

  // Watch for external path changes — use ref for historyIndex to avoid stale closure
  useEffect(() => {
    if (localPath && localPath !== currentPath) {
      setCurrentPath(localPath);
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndexRef.current + 1);
        newHistory.push(localPath);
        historyIndexRef.current = newHistory.length - 1;
        return newHistory;
      });
      setHistoryIndex(historyIndexRef.current);
      loadFiles(localPath);
    }
  }, [localPath]);

  const init = async () => {
    try {
      const home = await window.electronAPI.getLocalHome();
      setCurrentPath(home);
      onPathChange?.(home);
      setHistory([home]);
      historyIndexRef.current = 0;
      setHistoryIndex(0);
      await loadFiles(home);
    } catch (err) {
      console.error('Failed to init:', err);
    }
  };

  const loadFiles = async (dirPath: string) => {
    dispatch({ type: 'LOAD_START' });
    try {
      const list = await window.electronAPI.listLocalDir(dirPath);
      dispatch({ type: 'LOAD_SUCCESS', files: list });
    } catch (err: any) {
      dispatch({ type: 'LOAD_ERROR', error: err.toString() });
    }
  };

  const navigateTo = useCallback((dirPath: string, pushHistory = true) => {
    setCurrentPath(dirPath);
    onPathChange?.(dirPath);
    loadFiles(dirPath);
    if (pushHistory) {
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndexRef.current + 1);
        newHistory.push(dirPath);
        historyIndexRef.current = newHistory.length - 1;
        return newHistory;
      });
      setHistoryIndex(historyIndexRef.current);
    }
  }, [onPathChange]);

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

  const navigateBack = useCallback(() => {
    if (historyIndexRef.current > 0) {
      const newIndex = historyIndexRef.current - 1;
      historyIndexRef.current = newIndex;
      setHistoryIndex(newIndex);
      setHistory(prev => {
        navigateTo(prev[newIndex], false);
        return prev;
      });
    }
  }, [navigateTo]);

  const navigateForward = useCallback(() => {
    setHistory(prev => {
      if (historyIndexRef.current < prev.length - 1) {
        const newIndex = historyIndexRef.current + 1;
        historyIndexRef.current = newIndex;
        setHistoryIndex(newIndex);
        navigateTo(prev[newIndex], false);
      }
      return prev;
    });
  }, [navigateTo]);

  const handleFileClick = useCallback((file: LocalFile) => {
    if (file.isDirectory) {
      navigateTo(file.path);
    } else {
      onFileSelect(file);
    }
  }, [navigateTo, onFileSelect]);

  const handleDragStart = useCallback((e: React.DragEvent, file: LocalFile) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'local', file }));
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart(file);
  }, [onDragStart]);

  const handleSort = useCallback((field: 'name' | 'modified') => {
    setSortField(prev => {
      if (prev === field) {
        setSortOrder(o => {
          if (o === 'asc') return 'desc';
          setSortField(null);
          return 'asc';
        });
        return field;
      }
      setSortOrder('asc');
      return field;
    });
  }, []);

  // 🚀 useMemo: only re-sort when files/sort/showHidden actually change
  const sortedFiles = useMemo(() => {
    const filtered = files.filter(file => showHidden || !file.name.startsWith('.'));
    return [...filtered].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      if (!sortField) return a.name.localeCompare(b.name);
      const multiplier = sortOrder === 'asc' ? 1 : -1;
      if (sortField === 'name') return a.name.localeCompare(b.name) * multiplier;
      const da = new Date(a.modified).getTime();
      const db = new Date(b.modified).getTime();
      if (isNaN(da) && isNaN(db)) return 0;
      if (isNaN(da)) return multiplier;
      if (isNaN(db)) return -multiplier;
      return (da - db) * multiplier;
    });
  }, [files, sortField, sortOrder, showHidden]);

  const pathParts = useMemo(() => currentPath.split(/[/\\]/).filter(Boolean), [currentPath]);

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
                <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                  Name {sortField === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => handleSort('modified')} style={{ cursor: 'pointer' }}>
                  Modified {sortField === 'modified' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th>Size</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {sortedFiles.map((file) => (
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
                  <td className="file-date">{formatDate(file.modified)}</td>
                  <td className="file-size">{file.isDirectory ? '--' : formatSize(file.size)}</td>
                  <td className="file-type">{getFileType(file.name, file.isDirectory)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}