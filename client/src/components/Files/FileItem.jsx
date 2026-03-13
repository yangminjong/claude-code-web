import React from 'react';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function FileItem({ item, onNavigate, onDownload }) {
  const handleClick = () => {
    if (item.isDirectory) onNavigate();
  };

  return (
    <div className={`file-item ${item.isDirectory ? 'directory' : ''}`} onClick={handleClick}>
      <span className="file-icon">{item.isDirectory ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}</span>
      <span className="file-name">{item.name}</span>
      <span className="file-size">{item.isDirectory ? '' : formatSize(item.size)}</span>
      <span className="file-date">{new Date(item.modifiedAt).toLocaleDateString()}</span>
      {!item.isDirectory && (
        <button
          className="btn btn-secondary btn-sm"
          onClick={(e) => { e.stopPropagation(); onDownload(); }}
        >
          다운로드
        </button>
      )}
    </div>
  );
}
