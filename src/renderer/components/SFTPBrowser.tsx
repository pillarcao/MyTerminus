import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { SFTPFile, LocalFile } from '@shared/types';
import LocalBrowser from './LocalBrowser';
import { formatSize, formatDate, getFileType } from '../utils';

interface Props {
  connectionId: string;
  tabId: string;
}

export default function SFTPBrowser({ connectionId, tabId }: Props) {
  const { sftpPath, sftpFiles, localPath, setSftpPath, setSftpFiles, setLocalPath } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLocalFile, setSelectedLocalFile] = useState<LocalFile | null>(null);
  const [selectedRemoteFile, setSelectedRemoteFile] = useState<SFTPFile | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [remoteInputPath, setRemoteInputPath] = useState('');
  const [isEditingRemotePath, setIsEditingRemotePath] = useState(false);
  const [remoteHistory, setRemoteHistory] = useState<string[]>([]);
  const [remoteHistoryIndex, setRemoteHistoryIndex] = useState(-1);
  const [sortField, setSortField] = useState<'name' | 'modified' | null>('modified');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: SFTPFile | null } | null>(null);

  const currentPath = sftpPath[connectionId] || '/';
  const files = sftpFiles[connectionId] || [];
  const initialized = useRef(false);
  const isBlurring = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initHomePath();
    }
    // Listen for SFTP progress
    const removeProgressListener = window.electronAPI.onSftpProgress(tabId, (data) => {
      setProgress({ current: data.transferred, total: data.total });
      setTransferStatus(`${data.type === 'upload' ? 'Uploading' : 'Downloading'}: ${data.progress}%`);
    });

    return () => {
      removeProgressListener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, tabId]);

  // Watch for path changes to reload files
  useEffect(() => {
    if (initialized.current && sftpPath[connectionId]) {
      loadFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const initHomePath = async () => {
    setLoading(true);
    setError(null);
    try {
      await window.electronAPI.sftpConnect(connectionId);
      const homePath = await window.electronAPI.sftpHome(connectionId);
      setSftpPath(connectionId, homePath);
      setRemoteHistory([homePath]);
      setRemoteHistoryIndex(0);
      // Try to list home path, fallback to root if fails
      try {
        const list = await window.electronAPI.sftpList(connectionId, homePath);
        setSftpFiles(connectionId, list);
      } catch (listErr) {
        console.log('[SFTP] Home path not accessible, trying root:', listErr);
        setSftpPath(connectionId, '/');
        setRemoteHistory(['/']);
        setRemoteHistoryIndex(0);
        const rootList = await window.electronAPI.sftpList(connectionId, '/');
        setSftpFiles(connectionId, rootList);
      }
    } catch (err: any) {
      setError(err.toString());
      console.log('[SFTP] Init error:', err);
      // Fallback to root
      setSftpPath(connectionId, '/');
      setRemoteHistory(['/']);
      setRemoteHistoryIndex(0);
      try {
        const list = await window.electronAPI.sftpList(connectionId, '/');
        setSftpFiles(connectionId, list);
      } catch (rootErr) {
        setError('Cannot connect to remote: ' + rootErr);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async () => {
    if (!currentPath) return;
    setLoading(true);
    setError(null);
    try {
      await window.electronAPI.sftpConnect(connectionId);
      const list = await window.electronAPI.sftpList(connectionId, currentPath);
      setSftpFiles(connectionId, list);
    } catch (err: any) {
      console.log('[SFTP] Load files error:', err);
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const navigateTo = (path: string, pushHistory = true) => {
    setSftpPath(connectionId, path);
    if (pushHistory) {
      setRemoteHistory(prev => {
        const newHistory = prev.slice(0, remoteHistoryIndex + 1);
        newHistory.push(path);
        return newHistory;
      });
      setRemoteHistoryIndex(prev => prev + 1);
    }
  };

  const navigateRemoteBack = () => {
    if (remoteHistoryIndex > 0) {
      const prevPath = remoteHistory[remoteHistoryIndex - 1];
      setRemoteHistoryIndex(remoteHistoryIndex - 1);
      navigateTo(prevPath, false);
    }
  };

  const navigateRemoteForward = () => {
    if (remoteHistoryIndex < remoteHistory.length - 1) {
      const nextPath = remoteHistory[remoteHistoryIndex + 1];
      setRemoteHistoryIndex(remoteHistoryIndex + 1);
      navigateTo(nextPath, false);
    }
  };

  useEffect(() => {
    setRemoteInputPath(currentPath);
  }, [currentPath]);

  const handleRemotePathSubmit = () => {
    isBlurring.current = true;
    setIsEditingRemotePath(false);
    if (remoteInputPath !== currentPath) {
      navigateTo(remoteInputPath || '/');
    }
    setTimeout(() => {
      isBlurring.current = false;
    }, 200);
  };



  const handleRemoteFileClick = (file: SFTPFile, isDoubleClick: boolean = false) => {
    if (file.isDirectory && isDoubleClick) {
      // Normalize path to prevent duplicate slashes
      const basePath = currentPath === '/' ? '' : currentPath;
      const newPath = `${basePath}/${file.name}`.replace(/\/+/g, '/');
      navigateTo(newPath);
      setSelectedRemoteFile(null);
    } else if (!file.isDirectory) {
      setSelectedRemoteFile(file);
    }
  };

  // Upload: from local to remote
  const handleUpload = async (localFile?: LocalFile) => {
    const fileToUpload = localFile || selectedLocalFile;
    if (!fileToUpload) return;

    setProgress(null);
    setTransferStatus(`Uploading ${fileToUpload.name}...`);
    try {
      const remotePath = currentPath === '/' ? `/${fileToUpload.name}` : `${currentPath}/${fileToUpload.name}`;
      await window.electronAPI.sftpUpload(tabId, connectionId, fileToUpload.path, remotePath);
      await loadFiles();
      setTransferStatus(null);
      setProgress(null);
    } catch (err: any) {
      setTransferStatus(null);
      setProgress(null);
      setError(err.toString());
    }
  };

  // Download: from remote to local
  const handleDownload = async (remoteFile?: SFTPFile) => {
    const fileToDownload = remoteFile || selectedRemoteFile;
    if (!fileToDownload) return;

    const remotePath = currentPath === '/' ? `/${fileToDownload.name}` : `${currentPath}/${fileToDownload.name}`;
    // Use local browser's current path as download destination
    const currentLocalPath = localPath[tabId] || '/';
    const localFilePath = currentLocalPath === '/' ? `/${fileToDownload.name}` : `${currentLocalPath}/${fileToDownload.name}`;

    setProgress(null);
    setTransferStatus(`Downloading ${fileToDownload.name}...`);
    try {
      await window.electronAPI.sftpDownload(tabId, connectionId, remotePath, localFilePath);
      setTransferStatus(null);
      setProgress(null);
    } catch (err: any) {
      setTransferStatus(null);
      setProgress(null);
      setError(err.toString());
    }
  };

  // Drag and drop: local file dropped on remote panel -> upload
  const handleRemoteDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const data = e.dataTransfer.getData('application/json');
    if (!data) return;

    try {
      const { type, file } = JSON.parse(data);
      if (type === 'local') {
        await handleUpload(file as LocalFile);
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  }, [connectionId, currentPath]);

  // Drag and drop: remote file dropped on local panel -> download
  const handleLocalDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    // For remote to local, we need to store the selected file info
    // Since we're using dual pane, we can use the selectedRemoteFile
    if (selectedRemoteFile) {
      await handleDownload(selectedRemoteFile);
    }
  }, [selectedRemoteFile, connectionId, currentPath]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    const remotePath = currentPath === '/' ? `/${newFolderName}` : `${currentPath}/${newFolderName}`;

    try {
      await window.electronAPI.sftpMkdir(connectionId, remotePath);
      setShowNewFolder(false);
      setNewFolderName('');
      loadFiles();
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleDelete = async (file: SFTPFile) => {
    const remotePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
    const confirmMsg = file.isDirectory ? `Delete folder "${file.name}"?` : `Delete file "${file.name}"?`;

    if (!confirm(confirmMsg)) return;

    try {
      if (file.isDirectory) {
        await window.electronAPI.sftpRmdir(connectionId, remotePath);
      } else {
        await window.electronAPI.sftpDelete(connectionId, remotePath);
      }
      loadFiles();
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleSort = (field: 'name' | 'modified') => {
    if (sortField === field) {
      if (sortOrder === 'asc') setSortOrder('desc');
      else {
        setSortField(null);
        setSortOrder('asc');
      }
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSortedFiles = (filesToSort: SFTPFile[]) => {
    const filtered = filesToSort.filter(file => showHidden || !file.name.startsWith('.'));
    return filtered.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      if (!sortField) return a.name.localeCompare(b.name);

      const multiplier = sortOrder === 'asc' ? 1 : -1;
      if (sortField === 'name') return a.name.localeCompare(b.name) * multiplier;
      
      const da = new Date(a.modified).getTime();
      const db = new Date(b.modified).getTime();
      if (isNaN(da) && isNaN(db)) return 0;
      if (isNaN(da)) return 1 * multiplier;
      if (isNaN(db)) return -1 * multiplier;
      return (da - db) * multiplier;
    });
  };

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div className="dual-pane">
      {/* Toolbar */}
      <div className="dual-toolbar">
        <button className="btn btn-sm btn-secondary" onClick={loadFiles}>
          ↻
        </button>
        <button className="btn btn-sm btn-secondary" onClick={() => handleUpload()} disabled={!selectedLocalFile}>
          ↑ Upload
        </button>
        <button className="btn btn-sm btn-secondary" onClick={() => handleDownload()} disabled={!selectedRemoteFile}>
          ↓ Download
        </button>
        <button className="btn btn-sm btn-secondary" onClick={() => setShowNewFolder(true)}>
          + Folder
        </button>
        <button 
          className={`btn btn-sm ${showHidden ? 'btn-primary' : 'btn-secondary'}`} 
          onClick={() => setShowHidden(!showHidden)}
          title={showHidden ? 'Hide Hidden Files' : 'Show Hidden Files'}
        >
          {showHidden ? '👁' : '👁‍🗨'}
        </button>
        <span className="transfer-status">
          {transferStatus}
          {progress && (
            <span className="progress-bar">
              {Math.round((progress.current / progress.total) * 100)}%
            </span>
          )}
        </span>
      </div>

      {/* Dual panels */}
      <div className="panels">
        {/* Local panel */}
        <div
          className={`panel ${isDragging ? 'drag-over' : ''}`}
          onDrop={handleLocalDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <LocalBrowser
            tabId={tabId}
            localPath={localPath[tabId]}
            onFileSelect={(file) => setSelectedLocalFile(file)}
            onDragStart={(file) => setSelectedLocalFile(file)}
            selectedFile={selectedLocalFile?.path || null}
            onPathChange={(path) => setLocalPath(tabId, path)}
            showHidden={showHidden}
          />
        </div>

        <div className="panel-divider" />

        {/* Remote panel */}
        <div
          className={`panel ${isDragging ? 'drag-over' : ''}`}
          onDrop={handleRemoteDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className="panel-header">
            <span className="panel-title">🖥 Remote</span>
            <div className="panel-nav">
              <button className="btn-icon btn-sm" onClick={navigateRemoteBack} disabled={remoteHistoryIndex <= 0}>&lt;</button>
              <button className="btn-icon btn-sm" onClick={navigateRemoteForward} disabled={remoteHistoryIndex >= remoteHistory.length - 1}>&gt;</button>
              <button className="btn-icon btn-sm" onClick={loadFiles} title="Refresh">↻</button>
            </div>
            <div 
              className="panel-path" 
              onClick={() => {
                if (!isEditingRemotePath && !isBlurring.current) {
                  setIsEditingRemotePath(true);
                }
              }}
            >
              {isEditingRemotePath ? (
                <input 
                  type="text" 
                  value={remoteInputPath}
                  onChange={(e) => setRemoteInputPath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRemotePathSubmit()}
                  onBlur={handleRemotePathSubmit}
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

          {showNewFolder && (
            <div className="new-folder-bar">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
              <button className="btn btn-sm btn-primary" onClick={handleCreateFolder}>
                Create
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowNewFolder(false)}>
                Cancel
              </button>
            </div>
          )}

          {loading ? (
            <div className="panel-loading">Loading...</div>
          ) : error ? (
            <div className="panel-error">Error: {error}</div>
          ) : (
            <div 
              className="panel-list"
              onContextMenu={(e) => {
                if ((e.target as HTMLElement).closest('tr') && (e.target as HTMLElement).closest('tbody')) return;
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, file: null });
              }}
            >
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
                  {getSortedFiles(files).map((file) => (
                    <tr
                      key={file.name}
                      className={selectedRemoteFile?.name === file.name ? 'selected' : ''}
                      onClick={() => handleRemoteFileClick(file, false)}
                      onDoubleClick={() => handleRemoteFileClick(file, true)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY, file });
                        setSelectedRemoteFile(file);
                      }}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({
                          type: 'remote',
                          file: { name: file.name, path: currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}` }
                        }));
                        setSelectedRemoteFile(file);
                      }}
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
      </div>
      
      {contextMenu && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onClick={(e) => { e.stopPropagation(); setContextMenu(null); }}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          ></div>
          <div 
            className="context-menu" 
            style={{ 
              position: 'fixed', 
              top: contextMenu.y, 
              left: contextMenu.x, 
              zIndex: 1000,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '4px',
              boxShadow: 'var(--shadow-medium)',
              backdropFilter: 'blur(20px)',
              minWidth: '160px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {contextMenu.file && (
              <>
                <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: '13px' }} onClick={() => { alert('Open via remote is not supported yet.'); setContextMenu(null); }}>Open</button>
                <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: '13px' }} onClick={() => { 
                  const newName = prompt('Enter new name for ' + contextMenu.file!.name + ':', contextMenu.file!.name);
                  if (newName && newName !== contextMenu.file!.name) {
                    const dirPath = currentPath === '/' ? '' : currentPath;
                    window.electronAPI.sftpRename(connectionId, `${dirPath}/${contextMenu.file!.name}`, `${dirPath}/${newName}`)
                      .then(() => loadFiles())
                      .catch((err: any) => setError(err.toString()));
                  }
                  setContextMenu(null); 
                }}>Rename</button>
                <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: '13px', color: '#ff453a' }} onClick={() => { handleDelete(contextMenu.file!); setContextMenu(null); }}>Delete</button>
                <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: '13px' }} onClick={() => { alert('Permission logic is not supported yet.'); setContextMenu(null); }}>Edit Permission</button>
                <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }}></div>
              </>
            )}
            <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: '13px' }} onClick={() => { setShowNewFolder(true); setContextMenu(null); }}>New Folder</button>
          </div>
        </>
      )}
    </div>
  );
}