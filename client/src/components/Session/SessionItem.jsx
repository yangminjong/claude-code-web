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
  const { deleteSession } = useSessionStore();

  const handleDelete = async (e) => {
    e.stopPropagation();
    try {
      await deleteSession(session.id);
      toast.success('세션이 종료되었습니다');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className={`session-item ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="session-item-info">
        <span
          className="session-status-dot"
          style={{ background: STATUS_COLORS[session.status] }}
        />
        <span className="session-item-name">{session.name}</span>
      </div>
      {(session.status === 'active' || session.status === 'idle') && (
        <button className="session-item-close" onClick={handleDelete} title="세션 종료">
          &times;
        </button>
      )}
    </div>
  );
}
