import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Icon from './Icon';
import { useAppStore } from '../stores/appStore';
import { SFTPFile, LocalFile } from '@shared/types';
import LocalBrowser from './LocalBrowser';
import { formatSize, formatSpeed, formatETA, formatDate, getFileType } from '../utils';

interface Props {
  connectionId: string;
  tabId: string;
}

export default function SFTPBrowser({ connectionId, tabId }: Props) {
  // 🚀 Fine-grained selectors — only re-render when THIS connection's data changes
  const currentPath = useAppStore(s => s.sftpPath[connectionId] || '/');
  const files = useAppStore(s => s.sftpFiles[connectionId] || []);
  const localPath = useAppStore(s => s.localPath);
  const setSftpPath = useAppStore(s => s.setSftpPath);
  const setSftpFiles = useAppStore(s => s.setSftpFiles);
  const setLocalPath = useAppStore(s => s.setLocalPath);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLocalFiles, setSelectedLocalFiles] = useState<LocalFile[]>([]);
  const [selectedRemoteFiles, setSelectedRemoteFiles] = useState<SFTPFile[]>([]);
  const [lastClickedRemote, setLastClickedRemote] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Transfer queue: each entry tracks one file's progress
  interface TransferJob {
    id: string;
    name: string;
    type: 'upload' | 'download';
    progress: number;    // 0-100
    transferred: number; // bytes done
    total: number;       // bytes total
    speed: number;       // bytes/sec
    done: boolean;
    error?: string;
  }
  const [transferJobs, setTransferJobs] = useState<TransferJob[]>([]);
  // Which job the incoming progress events belong to (transfers run sequentially).
  const activeJobId = useRef<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [remoteInputPath, setRemoteInputPath] = useState('');
  const [isEditingRemotePath, setIsEditingRemotePath] = useState(false);
  const [remoteHistory, setRemoteHistory] = useState<string[]>([]);
  const [remoteHistoryIndex, setRemoteHistoryIndex] = useState(-1);
  const [sortField, setSortField] = useState<'name' | 'modified' | null>('modified');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: SFTPFile | null } | null>(null);
  const [renameModal, setRenameModal] = useState<{ file: SFTPFile } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ file: SFTPFile } | null>(null);
  const [chmodModal, setChmodModal] = useState<{ file: SFTPFile } | null>(null);
  const [chmodValue, setChmodValue] = useState('644');

  const initialized = useRef(false);
  const isBlurring = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initHomePath();
    }
    // Listen for SFTP progress and apply it to the currently-active job
    // (transfers run sequentially, so activeJobId points at the right one).
    const removeProgressListener = window.electronAPI.onSftpProgress(tabId, (data) => {
      const id = activeJobId.current;
      if (!id) return;
      setTransferJobs(prev => prev.map(j =>
        j.id === id && !j.done
          ? { ...j, progress: data.progress, transferred: data.transferred, total: data.total, speed: data.speed }
          : j
      ));
    });

    return () => {
      removeProgressListener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, tabId]);

  // Watch for path changes to reload files
  useEffect(() => {
    if (initialized.current && currentPath) {
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

  const navigateTo = useCallback((path: string, pushHistory = true) => {
    setSftpPath(connectionId, path);
    if (pushHistory) {
      setRemoteHistory(prev => {
        const newHistory = prev.slice(0, remoteHistoryIndex + 1);
        newHistory.push(path);
        return newHistory;
      });
      setRemoteHistoryIndex(prev => prev + 1);
    }
  }, [connectionId, setSftpPath, remoteHistoryIndex]);

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



  const handleRemoteFileClick = (file: SFTPFile, e: React.MouseEvent, isDoubleClick: boolean = false) => {
    if (file.isDirectory && isDoubleClick) {
      const basePath = currentPath === '/' ? '' : currentPath;
      const newPath = `${basePath}/${file.name}`.replace(/\/+/g, '/');
      navigateTo(newPath);
      setSelectedRemoteFiles([]);
      setLastClickedRemote(null);
    } else {
      if (e.metaKey || e.ctrlKey) {
        // Toggle selection
        setSelectedRemoteFiles(prev =>
          prev.some(f => f.name === file.name)
            ? prev.filter(f => f.name !== file.name)
            : [...prev, file]
        );
        setLastClickedRemote(file.name);
      } else if (e.shiftKey && lastClickedRemote) {
        // Range selection
        const sorted = sortedFiles;
        const lastIdx = sorted.findIndex(f => f.name === lastClickedRemote);
        const currIdx = sorted.findIndex(f => f.name === file.name);
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        const range = sorted.slice(start, end + 1);
        
        setSelectedRemoteFiles(prev => {
          const newSelection = new Map(prev.map(f => [f.name, f]));
          range.forEach(f => newSelection.set(f.name, f));
          return Array.from(newSelection.values());
        });
      } else {
        // Single selection
        setSelectedRemoteFiles([file]);
        setLastClickedRemote(file.name);
      }
    }
  };

  // Upload: from local to remote
  const handleUpload = useCallback(async (localFilesOverride?: LocalFile[]) => {
    const filesToUpload = localFilesOverride?.length ? localFilesOverride : selectedLocalFiles;
    if (!filesToUpload.length) return;

    for (const file of filesToUpload) {
      const jobId = `up-${Date.now()}-${file.name}`;
      activeJobId.current = jobId;
      setTransferJobs(prev => [...prev, { id: jobId, name: file.name, type: 'upload', progress: 0, transferred: 0, total: file.size || 0, speed: 0, done: false }]);

      try {
        const remotePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
        await window.electronAPI.sftpUpload(tabId, connectionId, file.path, remotePath);
        setTransferJobs(prev => prev.map(j => j.id === jobId ? { ...j, progress: 100, transferred: j.total, speed: 0, done: true } : j));
      } catch (err: any) {
        setTransferJobs(prev => prev.map(j => j.id === jobId ? { ...j, error: err.toString(), done: true } : j));
      }
    }
    activeJobId.current = null;

    await loadFiles();
    
    // Clear completed jobs after a short delay
    setTimeout(() => {
      setTransferJobs(prev => prev.filter(j => !j.done || !!j.error));
    }, 3000);
  }, [selectedLocalFiles, currentPath, tabId, connectionId]);

  // Download: from remote to local
  const handleDownload = useCallback(async (remoteFilesOverride?: SFTPFile[]) => {
    const filesToDownload = remoteFilesOverride?.length ? remoteFilesOverride : selectedRemoteFiles;
    if (!filesToDownload.length) return;

    const currentLocalPath = localPath[tabId] || '/';

    for (const file of filesToDownload) {
      const jobId = `dn-${Date.now()}-${file.name}`;
      activeJobId.current = jobId;
      setTransferJobs(prev => [...prev, { id: jobId, name: file.name, type: 'download', progress: 0, transferred: 0, total: file.size || 0, speed: 0, done: false }]);

      try {
        const remotePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
        const localFilePath = currentLocalPath === '/' ? `/${file.name}` : `${currentLocalPath}/${file.name}`;
        await window.electronAPI.sftpDownload(tabId, connectionId, remotePath, localFilePath);
        setTransferJobs(prev => prev.map(j => j.id === jobId ? { ...j, progress: 100, transferred: j.total, speed: 0, done: true } : j));
      } catch (err: any) {
         setTransferJobs(prev => prev.map(j => j.id === jobId ? { ...j, error: err.toString(), done: true } : j));
      }
    }
    activeJobId.current = null;

    // Clear completed jobs after a short delay
    setTimeout(() => {
      setTransferJobs(prev => prev.filter(j => !j.done || !!j.error));
    }, 3000);
  }, [selectedRemoteFiles, currentPath, localPath, tabId, connectionId]);

  // Drag and drop: local file dropped on remote panel -> upload
  const handleRemoteDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const data = e.dataTransfer.getData('application/json');
    if (!data) return;

    try {
      const { type, file, files } = JSON.parse(data);
      if (type === 'local') {
        const filesToUpload = files || [file]; // Support single file or array
        await handleUpload(filesToUpload);
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  }, [connectionId, currentPath]);

  // Drag and drop: remote file dropped on local panel -> download
  const handleLocalDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (selectedRemoteFiles.length > 0) {
      await handleDownload(selectedRemoteFiles);
    }
  }, [selectedRemoteFiles, handleDownload]);

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

  const handleRename = async () => {
    if (!renameModal) return;
    const oldName = renameModal.file.name;
    if (!renameValue || renameValue === oldName) { setRenameModal(null); return; }
    const dirPath = currentPath === '/' ? '' : currentPath;
    try {
      await window.electronAPI.sftpRename(connectionId, `${dirPath}/${oldName}`, `${dirPath}/${renameValue}`);
      loadFiles();
    } catch (err: any) { setError(err.toString()); }
    setRenameModal(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal) return;
    const file = deleteModal.file;
    const remotePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
    try {
      if (file.isDirectory) {
        await window.electronAPI.sftpRmdir(connectionId, remotePath);
      } else {
        await window.electronAPI.sftpDelete(connectionId, remotePath);
      }
      loadFiles();
    } catch (err: any) { setError(err.toString()); }
    setDeleteModal(null);
  };

  const handleChmod = async () => {
    if (!chmodModal) return;
    const modeInt = parseInt(chmodValue, 8);
    if (isNaN(modeInt)) { setError('Invalid permission format. Use octal like 755.'); return; }
    const remotePath = currentPath === '/' ? `/${chmodModal.file.name}` : `${currentPath}/${chmodModal.file.name}`;
    try {
      await window.electronAPI.sftpChmod(connectionId, remotePath, modeInt);
      loadFiles();
    } catch (err: any) { setError(err.toString()); }
    setChmodModal(null);
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

  // 🚀 useMemo: only re-sort when files/sort/showHidden change
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
      if (isNaN(da)) return 1 * multiplier;
      if (isNaN(db)) return -1 * multiplier;
      return (da - db) * multiplier;
    });
  }, [files, sortField, sortOrder, showHidden]);

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div className="dual-pane">
      {/* Toolbar */}
      <div className="dual-toolbar">
        <button className="btn btn-sm btn-secondary" onClick={loadFiles} title="Refresh">
          <Icon name="refresh" size={14} />
        </button>
        <button className="btn btn-sm btn-secondary" onClick={() => handleUpload()} disabled={selectedLocalFiles.length === 0}>
          <Icon name="upload" size={14} />
          Upload
        </button>
        <button className="btn btn-sm btn-secondary" onClick={() => handleDownload()} disabled={selectedRemoteFiles.length === 0}>
          <Icon name="download" size={14} />
          Download
        </button>
        <button className="btn btn-sm btn-secondary" onClick={() => setShowNewFolder(true)}>
          <Icon name="folderPlus" size={14} />
          Folder
        </button>
        <button 
          className={`btn btn-sm ${showHidden ? 'btn-primary' : 'btn-secondary'}`} 
          onClick={() => setShowHidden(!showHidden)}
          title={showHidden ? 'Hide Hidden Files' : 'Show Hidden Files'}
        >
          <Icon name={showHidden ? "eye" : "eyeOff"} size={14} />
        </button>
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
            onFileSelect={(file, e) => {
              if (e?.metaKey || e?.ctrlKey) {
                setSelectedLocalFiles(prev => 
                  prev.some(f => f.name === file.name) ? prev.filter(f => f.name !== file.name) : [...prev, file]
                );
              } else {
                setSelectedLocalFiles([file])
              }
            }}
            onDragStart={(file) => {
              if (!selectedLocalFiles.some(f => f.name === file.name)) setSelectedLocalFiles([file]);
            }}
            selectedFiles={selectedLocalFiles.map(f => f.path)}
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
            <span className="panel-title"><Icon name="server" size={14} />Remote</span>
            <div className="panel-nav">
              <button className="btn-icon btn-sm" onClick={navigateRemoteBack} disabled={remoteHistoryIndex <= 0} title="Back"><Icon name="chevronLeft" size={14} /></button>
              <button className="btn-icon btn-sm" onClick={navigateRemoteForward} disabled={remoteHistoryIndex >= remoteHistory.length - 1} title="Forward"><Icon name="chevronRight" size={14} /></button>
              <button className="btn-icon btn-sm" onClick={loadFiles} title="Refresh"><Icon name="refresh" size={14} /></button>
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
                  {sortedFiles.map((file) => (
                    <tr
                      key={file.name}
                      className={selectedRemoteFiles.some(f => f.name === file.name) ? 'selected' : ''}
                      onClick={(e) => handleRemoteFileClick(file, e, false)}
                      onDoubleClick={(e) => handleRemoteFileClick(file, e, true)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY, file });
                        if (!selectedRemoteFiles.some(f => f.name === file.name)) {
                          setSelectedRemoteFiles([file]);
                        }
                      }}
                      draggable
                      onDragStart={(e) => {
                        if (!selectedRemoteFiles.some(f => f.name === file.name)) {
                          setSelectedRemoteFiles([file]);
                        }
                        const files = selectedRemoteFiles.some(f => f.name === file.name)
                          ? selectedRemoteFiles
                          : [file];
                        
                        e.dataTransfer.setData('application/json', JSON.stringify({
                          type: 'remote',
                          file,
                          files
                        }));
                        e.dataTransfer.effectAllowed = 'copy';
                        setIsDragging(true);
                      }}
                      onDragEnd={() => setIsDragging(false)}
                    >
                      <td>
                        <span className="file-name">
                          <span className="file-icon"><Icon name={file.isDirectory ? "folder" : "file"} size={14} /></span>
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

      {/* Premium transfer panel — floating glass card, bottom-right */}
      {transferJobs.length > 0 && (
        <div className="transfer-panel">
          <div className="transfer-panel-header">
            <span className="transfer-panel-title">
              Transfers
              <span className="transfer-panel-count">{transferJobs.filter(j => !j.done).length || transferJobs.length}</span>
            </span>
            <button
              className="transfer-panel-clear"
              title="Clear finished"
              onClick={() => setTransferJobs(prev => prev.filter(j => !j.done && !j.error))}
            >
              Clear
            </button>
          </div>
          <div className="transfer-panel-body">
            {transferJobs.map(job => {
              const eta = job.speed > 0 && job.total > 0 ? (job.total - job.transferred) / job.speed : Infinity;
              const state = job.error ? 'error' : job.done ? 'done' : 'active';
              return (
                <div key={job.id} className={`transfer-row ${state}`}>
                  <div className="transfer-row-top">
                    <span className="transfer-row-icon"><Icon name={job.type === 'upload' ? "upload" : "download"} size={12} /></span>
                    <span className="transfer-row-name" title={job.name}>{job.name}</span>
                    <span className="transfer-row-status">
                      {job.error ? 'Failed' : job.done ? '✓ Done' : `${job.progress}%`}
                    </span>
                  </div>
                  <div className="transfer-bar-track">
                    <div className={`transfer-bar-fill ${state}`} style={{ width: `${job.progress}%` }} />
                  </div>
                  <div className="transfer-row-meta">
                    {job.error ? (
                      <span className="transfer-row-err">{job.error}</span>
                    ) : (
                      <>
                        <span>{formatSize(job.transferred)} / {formatSize(job.total)}</span>
                        {!job.done && (
                          <span className="transfer-row-speed">
                            {formatSpeed(job.speed)}{isFinite(eta) ? ` · ${formatETA(eta)} left` : ''}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                  setRenameValue(contextMenu.file!.name);
                  setRenameModal({ file: contextMenu.file! });
                  setContextMenu(null);
                }}>Rename</button>
                <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: '13px', color: '#ff453a' }} onClick={() => {
                  setDeleteModal({ file: contextMenu.file! });
                  setContextMenu(null);
                }}>Delete</button>
                <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: '13px' }} onClick={() => {
                  setChmodValue('644');
                  setChmodModal({ file: contextMenu.file! });
                  setContextMenu(null);
                }}>Edit Permission</button>
                <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }}></div>
              </>
            )}
            <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: '13px' }} onClick={() => { setShowNewFolder(true); setContextMenu(null); }}>New Folder</button>
          </div>
        </>
      )}

      {/* Rename Modal */}
      {renameModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', minWidth: '320px', backdropFilter: 'blur(30px)', boxShadow: 'var(--shadow-large)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600 }}>Rename</h3>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>{renameModal.file.name}</p>
            <input
              type="text"
              className="path-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              autoFocus
              style={{ width: '100%', marginBottom: '16px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setRenameModal(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleRename}>Rename</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', minWidth: '320px', backdropFilter: 'blur(30px)', boxShadow: 'var(--shadow-large)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600 }}>Confirm Delete</h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Delete {deleteModal.file.isDirectory ? 'folder' : 'file'} <strong>"{deleteModal.file.name}"</strong>? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setDeleteModal(null)}>Cancel</button>
              <button className="btn btn-sm" style={{ background: '#ff453a', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer' }} onClick={handleDeleteConfirm}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Permission Modal */}
      {chmodModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', minWidth: '340px', backdropFilter: 'blur(30px)', boxShadow: 'var(--shadow-large)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 600 }}>Edit Permission</h3>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>{chmodModal.file.name}</p>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Octal Permission (e.g. 755, 644, 777)
            </label>
            <input
              type="text"
              className="path-input"
              value={chmodValue}
              onChange={(e) => setChmodValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChmod()}
              placeholder="644"
              autoFocus
              style={{ width: '100%', marginBottom: '8px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginBottom: '16px' }}>
              {[['755', 'rwxr-xr-x'], ['644', 'rw-r--r--'], ['777', 'rwxrwxrwx'], ['600', 'rw-------'], ['755', 'Dir std'], ['444', 'r--r--r--']].map(([val, label]) => (
                <button key={val+label} className="btn btn-ghost" style={{ fontSize: '11px', padding: '4px 6px' }} onClick={() => setChmodValue(val)}>
                  {val} <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setChmodModal(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleChmod}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}