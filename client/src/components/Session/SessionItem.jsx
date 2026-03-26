import React from 'react';
import { useSessionStore } from '../../stores/sessionStore.js';
import toast from 'react-hot-toast';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const ts = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간`;
  const days = Math.floor(hours / 24);
  return `${days}일`;
}

export default function SessionItem({ session, active, onClick }) {
  const { deleteSessionPermanently } = useSessionStore();

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm('이 세션을 삭제하시겠습니까?')) return;
    try {
      await deleteSessionPermanently(session.id);
      toast.success('세션이 삭제되었습니다');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className={`session-item ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="session-item-info">
        <span className="session-item-name">
          {session.work_mode === 'ssh' && <span className="ssh-badge" title="SSH 원격">SSH</span>}
          {session.name}
        </span>
        <span className="session-item-time">
          {timeAgo(session.last_activity_at || session.created_at)}
        </span>
      </div>
      <div className="session-item-actions">
        <button className="session-item-delete" onClick={handleDelete} title="세션 삭제">
          &times;
        </button>
      </div>
    </div>
  );
}
