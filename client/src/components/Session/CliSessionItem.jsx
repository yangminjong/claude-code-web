import React from 'react';

function formatSize(bytes) {
  if (!bytes) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function timeAgo(tsMs) {
  if (!tsMs) return '';
  const diff = (Date.now() - tsMs) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export default function CliSessionItem({ session, onClick }) {
  const shortId = session.session_id.slice(0, 8);
  const size = formatSize(session.size_bytes);
  const ago = timeAgo(session.timestamp);

  return (
    <div className="cli-session-item" onClick={onClick}>
      <div className="cli-session-item-top">
        <span className="cli-session-id">{shortId}</span>
        <span className="cli-session-time">{ago}</span>
        <span className="cli-session-size">{size}</span>
      </div>
      <div className="cli-session-item-name">{session.session_name}</div>
    </div>
  );
}
