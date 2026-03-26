import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useExplorerStore } from '../../stores/explorerStore.js';
import { useEditorStore } from '../../stores/editorStore.js';
import SessionList from '../Session/SessionList.jsx';
import NewSessionModal from '../Session/NewSessionModal.jsx';
import UserAvatar from '../Chat/UserAvatar.jsx';

export default function Sidebar({ open, onToggle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { setActiveSession } = useSessionStore();
  const { open: explorerOpen, toggleOpen: toggleExplorer } = useExplorerStore();
  const [showNewSession, setShowNewSession] = useState(false);

  const handleNewChat = () => {
    setShowNewSession(true);
  };

  return (
    <>
      <aside className={`sidebar ${open ? 'open' : 'collapsed'}`}>
        <div className="sidebar-header">
          <h2>Claude Code Web</h2>
          <button className="btn-icon" onClick={onToggle} title="사이드바 토글">
            {open ? '\u2190' : '\u2192'}
          </button>
        </div>

        {open && (
          <>
            <div className="sidebar-actions">
              <button className="btn btn-primary btn-sm btn-full" onClick={handleNewChat}>
                + 새 작업
              </button>
            </div>

            <SessionList />

            <nav className="sidebar-nav">
              <button
                className={`nav-item ${explorerOpen ? 'active' : ''}`}
                onClick={toggleExplorer}
              >
                파일 탐색기
              </button>
              <button
                className={`nav-item ${location.pathname === '/settings' ? 'active' : ''}`}
                onClick={() => navigate('/settings')}
              >
                설정
              </button>
            </nav>

            <div className="sidebar-footer">
              <UserAvatar size={28} />
              <div className="user-info">
                <span className="user-name">{user?.displayName}</span>
                <span className="user-email">{user?.email}</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={logout}>
                로그아웃
              </button>
            </div>
          </>
        )}
      </aside>

      {showNewSession && <NewSessionModal onClose={() => setShowNewSession(false)} />}
    </>
  );
}
