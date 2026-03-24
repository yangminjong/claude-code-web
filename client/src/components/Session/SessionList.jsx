import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useEditorStore } from '../../stores/editorStore.js';
import SessionItem from './SessionItem.jsx';
import './Session.css';

export default function SessionList() {
  const { sessions, activeSessionId, setActiveSession, fetchSessions } = useSessionStore();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchSessions(),
      new Promise(r => setTimeout(r, 600))
    ]);
    setRefreshing(false);
  }, [fetchSessions]);

  const handleSelect = (id) => {
    setActiveSession(id);
    useEditorStore.getState().showChat();
    navigate('/');
  };

  const activeSessions = sessions.filter(s => s.status === 'active' || s.status === 'idle');
  const endedSessions = sessions.filter(s => s.status === 'ended' || s.status === 'error');

  return (
    <div className="session-list">
      <div className="session-list-header">
        <button className={`cli-refresh-btn ${refreshing ? 'spinning' : ''}`} onClick={handleRefresh} disabled={refreshing} title="새로고침">&#x21bb;</button>
      </div>
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
