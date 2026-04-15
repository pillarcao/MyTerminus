import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { SFTPFile, LocalFile } from '@shared/types';
import LocalBrowser from './LocalBrowser';

interface Props {
  connectionId: string;
  tabId: string;
}

export default function SFTPBrowser({ connectionId, tabId }: Props) {
  const { sftpPath, sftpFiles, setSftpPath, setSftpFiles } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLocalFile, setSelectedLocalFile] = useState<LocalFile | null>(null);
  const [selectedRemoteFile, setSelectedRemoteFile] = useState<SFTPFile | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const currentPath = sftpPath[connectionId] || '/';
  const files = sftpFiles[connectionId] || [];
  const initialized = useRef(false);

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
      // Try to list home path, fallback to root if fails
      try {
        const list = await window.electronAPI.sftpList(connectionId, homePath);
        setSftpFiles(connectionId, list);
      } catch (listErr) {
        console.log('[SFTP] Home path not accessible, trying root:', listErr);
        setSftpPath(connectionId, '/');
        const rootList = await window.electronAPI.sftpList(connectionId, '/');
        setSftpFiles(connectionId, rootList);
      }
    } catch (err: any) {
      setError(err.toString());
      console.log('[SFTP] Init error:', err);
      // Fallback to root
      setSftpPath(connectionId, '/');
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

  const navigateTo = (path: string) => {
    setSftpPath(connectionId, path);
  };

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const newPath = '/' + parts.join('/');
    navigateTo(newPath || '/');
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
    const localPath = await window.electronAPI.saveFileDialog(fileToDownload.name);
    if (!localPath) return;

    setProgress(null);
    setTransferStatus(`Downloading ${fileToDownload.name}...`);
    try {
      await window.electronAPI.sftpDownload(tabId, connectionId, remotePath, localPath);
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
          <div className="panel-header">
            <span className="panel-title">📱 Local</span>
          </div>
          <LocalBrowser
            onFileSelect={(file) => setSelectedLocalFile(file)}
            onDragStart={(file) => setSelectedLocalFile(file)}
            selectedFile={selectedLocalFile?.path || null}
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
            <div className="panel-path">
              <span onClick={() => navigateTo('/')}>Root</span>
              {pathParts.map((part, index) => (
                <span key={index} onClick={() => navigateTo('/' + pathParts.slice(0, index + 1).join('/'))}>
                  {part}
                </span>
              ))}
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
            <div className="panel-list">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Modified</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr
                      key={file.name}
                      className={selectedRemoteFile?.name === file.name ? 'selected' : ''}
                      onClick={() => handleRemoteFileClick(file, false)}
                      onDoubleClick={() => handleRemoteFileClick(file, true)}
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
                      <td className="file-size">{file.isDirectory ? '-' : formatSize(file.size)}</td>
                      <td className="file-date">{file.modified ? new Date(file.modified).toLocaleDateString() : '-'}</td>
                      <td>
                        <button
                          className="btn-icon btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(file);
                          }}
                          title="Delete"
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}