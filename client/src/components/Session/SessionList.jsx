import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useEditorStore } from '../../stores/editorStore.js';
import SessionItem from './SessionItem.jsx';
import './Session.css';

export default function SessionList() {
  const { sessions, activeSessionId, setActiveSession, fetchSessions, syncCliSessions } = useSessionStore();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});

  // Sync CLI sessions on mount
  useEffect(() => {
    syncCliSessions();
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      syncCliSessions(),
      new Promise(r => setTimeout(r, 600))
    ]);
    setRefreshing(false);
  }, [syncCliSessions]);

  const handleSelect = (id) => {
    setActiveSession(id);
    useEditorStore.getState().showChat();
    navigate('/');
  };

  const toggleGroup = (key) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Filter by search
  const filtered = useMemo(() => {
    if (!search) return sessions;
    const keyword = search.toLowerCase();
    return sessions.filter(s =>
      (s.name || '').toLowerCase().includes(keyword) ||
      (s.project_path || '').toLowerCase().includes(keyword)
    );
  }, [sessions, search]);

  // Group by project_path
  const groups = useMemo(() => {
    const map = {};
    for (const s of filtered) {
      const key = s.project_path || 'default';
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    // Sort groups by most recent activity
    const entries = Object.entries(map);
    entries.sort((a, b) => {
      const aTime = Math.max(...a[1].map(s => new Date(s.last_activity_at || s.created_at).getTime()));
      const bTime = Math.max(...b[1].map(s => new Date(s.last_activity_at || s.created_at).getTime()));
      return bTime - aTime;
    });
    // Sort sessions within each group by most recent
    for (const [, list] of entries) {
      list.sort((a, b) =>
        new Date(b.last_activity_at || b.created_at).getTime() -
        new Date(a.last_activity_at || a.created_at).getTime()
      );
    }
    return entries;
  }, [filtered]);

  // Extract folder name from path
  const folderName = (path) => {
    if (!path || path === 'default') return 'default';
    const parts = path.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || path;
  };

  return (
    <div className="session-list">
      <div className="session-list-header">
        <button
          className={`cli-refresh-btn ${refreshing ? 'spinning' : ''}`}
          onClick={handleRefresh}
          disabled={refreshing}
          title="새로고침"
        >&#x21bb;</button>
      </div>

      {sessions.length > 5 && (
        <div className="cli-search">
          <input
            className="cli-search-input"
            type="text"
            placeholder="검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {groups.map(([projectPath, list]) => (
        <div className="cli-project-group" key={projectPath}>
          <div
            className="cli-project-header"
            onClick={() => toggleGroup(projectPath)}
          >
            <span className="cli-project-arrow">
              {collapsed[projectPath] ? '\u25B6' : '\u25BC'}
            </span>
            <span className="cli-project-name" title={projectPath}>
              {folderName(projectPath)}
            </span>
            <span className="cli-project-count">({list.length})</span>
          </div>

          {!collapsed[projectPath] && list.map(s => (
            <SessionItem
              key={s.id}
              session={s}
              active={s.id === activeSessionId}
              onClick={() => handleSelect(s.id)}
            />
          ))}
        </div>
      ))}

      {sessions.length === 0 && (
        <div className="session-empty">세션이 없습니다</div>
      )}
      {sessions.length > 0 && filtered.length === 0 && (
        <div className="session-empty">검색 결과가 없습니다</div>
      )}
    </div>
  );
}
