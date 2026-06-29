export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec < 1) return '0 B/s';
  return formatSize(bytesPerSec) + '/s';
}

export function formatETA(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--';
  if (seconds < 1) return '<1s';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function getFileType(name: string, isDirectory: boolean): string {
  if (isDirectory) return 'Folder';
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex > 0 && dotIndex < name.length - 1) {
    return name.substring(dotIndex + 1).toUpperCase();
  }
  return 'File';
}
