import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../stores/sessionStore.js';
import SessionItem from './SessionItem.jsx';
import './Session.css';

export default function SessionList() {
  const { sessions, activeSessionId, setActiveSession } = useSessionStore();
  const navigate = useNavigate();

  const handleSelect = (id) => {
    setActiveSession(id);
    navigate('/');
  };

  const activeSessions = sessions.filter(s => s.status === 'active' || s.status === 'idle');
  const endedSessions = sessions.filter(s => s.status === 'ended' || s.status === 'error');

  return (
    <div className="session-list">
      {activeSessions.length > 0 && (
        <div className="session-group">
          <div className="session-group-label">활성 세션</div>
          {activeSessions.map(s => (
            <SessionItem
              key={s.id}
              session={s}
              active={s.id === activeSessionId}
              onClick={() => handleSelect(s.id)}
            />
          ))}
        </div>
      )}
      {endedSessions.length > 0 && (
        <div className="session-group">
          <div className="session-group-label">종료된 세션</div>
          {endedSessions.map(s => (
            <SessionItem
              key={s.id}
              session={s}
              active={s.id === activeSessionId}
              onClick={() => handleSelect(s.id)}
            />
          ))}
        </div>
      )}
      {sessions.length === 0 && (
        <div className="session-empty">세션이 없습니다</div>
      )}
    </div>
  );
}
