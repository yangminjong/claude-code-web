import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useSessionStore } from '../../stores/sessionStore.js';
import SessionList from '../Session/SessionList.jsx';
import CliSessionList from '../Session/CliSessionList.jsx';
import NewSessionModal from '../Session/NewSessionModal.jsx';
import UserAvatar from '../Chat/UserAvatar.jsx';

export default function Sidebar({ open, onToggle, sidebarTab, onSidebarTabChange }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { fetchSessions } = useSessionStore();
  const [showNewSession, setShowNewSession] = useState(false);
  const [tab, setTab] = useState(sidebarTab || 'mine');

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (sidebarTab && sidebarTab !== tab) {
      setTab(sidebarTab);
    }
  }, [sidebarTab]);

  const handleTabChange = useCallback((newTab) => {
    setTab(newTab);
    if (onSidebarTabChange) onSidebarTabChange(newTab);
  }, [onSidebarTabChange]);

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
              <button className="btn btn-primary btn-sm btn-full" onClick={() => setShowNewSession(true)}>
                + 새 세션
              </button>
            </div>

            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab-btn ${tab === 'mine' ? 'active' : ''}`}
                onClick={() => handleTabChange('mine')}
              >
                내 세션
              </button>
              <button
                className={`sidebar-tab-btn ${tab === 'cli' ? 'active' : ''}`}
                onClick={() => handleTabChange('cli')}
              >
                CLI 히스토리
              </button>
            </div>

            {tab === 'mine' && <SessionList />}
            {tab === 'cli' && <CliSessionList />}

            <nav className="sidebar-nav">
              <button
                className={`nav-item ${location.pathname === '/files' ? 'active' : ''}`}
                onClick={() => navigate('/files')}
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
