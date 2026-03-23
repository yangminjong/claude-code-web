import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCliSessionStore } from '../../stores/cliSessionStore.js';
import { useSessionStore } from '../../stores/sessionStore.js';
import { api } from '../../api/client.js';
import toast from 'react-hot-toast';
import './Session.css';

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

export default function CliSessionDetail({ onSwitchTab }) {
  const { selectedSession } = useCliSessionStore();
  const { fetchSessions, setActiveSession } = useSessionStore();
  const navigate = useNavigate();
  const [adopting, setAdopting] = useState(false);

  if (!selectedSession) {
    return (
      <div className="cli-detail-empty">
        <p>CLI 세션을 선택하세요</p>
      </div>
    );
  }

  const s = selectedSession;

  const handleAdopt = async () => {
    setAdopting(true);
    try {
      const { session } = await api.adoptCliSession({
        sessionId: s.session_id,
        sessionName: s.session_name,
        project: s.project
      });
      await fetchSessions();
      setActiveSession(session.id);
      toast.success('CLI 세션이 연결되었습니다');
      // Switch sidebar to "내 세션" tab
      if (onSwitchTab) onSwitchTab('mine');
      navigate('/');
    } catch (err) {
      toast.error(err.message || '세션 연결에 실패했습니다');
    } finally {
      setAdopting(false);
    }
  };

  return (
    <div className="cli-detail">
      <div className="cli-detail-header">
        <h3>CLI 세션 상세</h3>
      </div>

      <div className="cli-detail-body">
        <div className="cli-detail-name">{s.session_name}</div>

        <div className="cli-detail-stats">
          <div className="cli-detail-stat">
            <span className="cli-detail-stat-value">{formatSize(s.size_bytes)}</span>
            <span className="cli-detail-stat-label">크기</span>
          </div>
          <div className="cli-detail-stat">
            <span className="cli-detail-stat-value">{s.message_count}</span>
            <span className="cli-detail-stat-label">메시지</span>
          </div>
          <div className="cli-detail-stat">
            <span className="cli-detail-stat-value">{timeAgo(s.timestamp)}</span>
            <span className="cli-detail-stat-label">최근활동</span>
          </div>
          <div className="cli-detail-stat">
            <span className="cli-detail-stat-value">{s.project ? s.project.split('/').pop() : '-'}</span>
            <span className="cli-detail-stat-label">프로젝트</span>
          </div>
        </div>

        <div className="cli-detail-info">
          <div className="cli-detail-row">
            <span className="cli-detail-label">세션 ID</span>
            <span className="cli-detail-value">{s.session_id}</span>
          </div>
          <div className="cli-detail-row">
            <span className="cli-detail-label">프로젝트</span>
            <span className="cli-detail-value">{s.project || '-'}</span>
          </div>
          {s.git_info && (
            <div className="cli-detail-row">
              <span className="cli-detail-label">Git</span>
              <span className="cli-detail-value">
                {s.git_info.remote} : {s.git_info.branch}
              </span>
            </div>
          )}
          <div className="cli-detail-row">
            <span className="cli-detail-label">생성일</span>
            <span className="cli-detail-value">{s.date || '-'}</span>
          </div>
        </div>

        <div className="cli-detail-adopt">
          <button
            className="btn btn-primary btn-adopt"
            onClick={handleAdopt}
            disabled={adopting}
          >
            {adopting ? '연결 중...' : '이어서 대화하기'}
          </button>
          <p className="cli-detail-adopt-hint">
            이 CLI 세션을 웹 세션으로 연결합니다<br />
            (--resume으로 대화 컨텍스트가 복원됩니다)
          </p>
        </div>
      </div>
    </div>
  );
}
