import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCliSessionStore } from '../../stores/cliSessionStore.js';
import CliSessionItem from './CliSessionItem.jsx';
import './Session.css';

function formatSize(bytes) {
  if (!bytes) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function CliSessionList() {
  const { sessions, stats, loading, searchQuery, fetchSessions, fetchStats, setSearchQuery, setSelectedSession } = useCliSessionStore();
  const navigate = useNavigate();
  const [expandedProjects, setExpandedProjects] = useState({});

  useEffect(() => {
    fetchSessions();
    fetchStats();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSessions();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Group sessions by project
  const grouped = useMemo(() => {
    const groups = {};
    for (const s of sessions) {
      const proj = s.project || '(unknown)';
      if (!groups[proj]) groups[proj] = [];
      groups[proj].push(s);
    }
    // Sort groups by most recent session
    return Object.entries(groups).sort((a, b) => {
      const aMax = Math.max(...a[1].map(s => s.timestamp || 0));
      const bMax = Math.max(...b[1].map(s => s.timestamp || 0));
      return bMax - aMax;
    });
  }, [sessions]);

  const toggleProject = (proj) => {
    setExpandedProjects(prev => ({ ...prev, [proj]: !prev[proj] }));
  };

  const handleSelect = (session) => {
    setSelectedSession(session);
    navigate('/cli-session');
  };

  // Default: all expanded
  const isExpanded = (proj) => expandedProjects[proj] !== false;

  return (
    <div className="cli-session-list">
      <div className="cli-search">
        <input
          type="text"
          placeholder="세션 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="cli-search-input"
        />
      </div>

      <div className="cli-stats">
        <span>
          {stats
            ? `${stats.totalSessions}개 · ${formatSize(stats.totalSizeBytes)} · ${stats.projectCount} 프로젝트`
            : '\u00A0'}
        </span>
        <button
          className={`cli-refresh-btn ${loading ? 'spinning' : ''}`}
          onClick={() => { fetchSessions({ refresh: 1 }); fetchStats(true); }}
          disabled={loading}
          title="새로고침"
        >
          &#x21bb;
        </button>
      </div>

      {loading && sessions.length === 0 && (
        <div className="session-empty">로딩 중...</div>
      )}

      {!loading && sessions.length === 0 && !stats && (
        <div className="session-empty">로드 실패 — 다시 로그인해보세요</div>
      )}

      {!loading && sessions.length === 0 && stats && (
        <div className="session-empty">CLI 세션이 없습니다</div>
      )}

      {grouped.map(([proj, projSessions]) => {
        const projName = proj.split('/').pop() || proj;
        return (
          <div key={proj} className="cli-project-group">
            <div className="cli-project-header" onClick={() => toggleProject(proj)}>
              <span className="cli-project-arrow">{isExpanded(proj) ? '\u25BC' : '\u25B6'}</span>
              <span className="cli-project-name">{projName}</span>
              <span className="cli-project-count">({projSessions.length})</span>
            </div>
            {isExpanded(proj) && projSessions.map(s => (
              <CliSessionItem
                key={s.session_id}
                session={s}
                onClick={() => handleSelect(s)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
