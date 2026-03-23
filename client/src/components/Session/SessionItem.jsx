import React from 'react';
import { useSessionStore } from '../../stores/sessionStore.js';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  active: 'var(--success)',
  idle: 'var(--warning)',
  ended: 'var(--text-muted)',
  error: 'var(--danger)'
};

export default function SessionItem({ session, active, onClick }) {
  const { deleteSession, deleteSessionPermanently } = useSessionStore();

  const handleEnd = async (e) => {
    e.stopPropagation();
    try {
      await deleteSession(session.id);
      toast.success('세션이 종료되었습니다');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm('이 세션을 영구 삭제하시겠습니까?')) return;
    try {
      await deleteSessionPermanently(session.id);
      toast.success('세션이 삭제되었습니다');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const isActive = session.status === 'active' || session.status === 'idle';
  const isEnded = session.status === 'ended' || session.status === 'error';

  return (
    <div className={`session-item ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="session-item-info">
        <span
          className="session-status-dot"
          style={{ background: STATUS_COLORS[session.status] }}
        />
        <span className="session-item-name">
          {session.work_mode === 'ssh' && <span className="ssh-badge" title="SSH 원격">SSH</span>}
          {session.name}
        </span>
      </div>
      <div className="session-item-actions">
        {isActive && (
          <button className="session-item-close" onClick={handleEnd} title="세션 종료">
            &times;
          </button>
        )}
        {isEnded && (
          <button className="session-item-delete" onClick={handleDelete} title="세션 삭제">
            &times;
          </button>
        )}
      </div>
    </div>
  );
}
