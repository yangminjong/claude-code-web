import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useSshProfileStore } from '../../stores/sshProfileStore.js';
import RemoteFolderBrowser from '../Settings/RemoteFolderBrowser.jsx';
import toast from 'react-hot-toast';

export default function NewSessionModal({ onClose }) {
  const { createSession, setActiveSession } = useSessionStore();
  const { profiles, fetchProfiles } = useSshProfileStore();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [workMode, setWorkMode] = useState('server');
  const [projectPath, setProjectPath] = useState('default');
  const [sshProfileId, setSshProfileId] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const selectedProfile = profiles.find(p => String(p.id) === sshProfileId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (workMode === 'ssh' && !sshProfileId) {
      toast.error('SSH 프로필을 선택해주세요');
      return;
    }
    setLoading(true);
    try {
      const session = await createSession(
        name,
        workMode,
        projectPath,
        workMode === 'ssh' ? parseInt(sshProfileId, 10) : null
      );
      setActiveSession(session.id);
      navigate('/');
      onClose();
      toast.success('세션이 생성되었습니다');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>새 세션</h3>
          <button className="btn-icon" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="sessionName">세션 이름</label>
            <input
              id="sessionName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 프로젝트 리팩토링"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>작업 모드</label>
            <div className="mode-toggle">
              <button
                type="button"
                className={`mode-btn ${workMode === 'server' ? 'active' : ''}`}
                onClick={() => { setWorkMode('server'); setProjectPath('default'); }}
              >
                로컬 서버
              </button>
              <button
                type="button"
                className={`mode-btn ${workMode === 'ssh' ? 'active' : ''}`}
                onClick={() => { setWorkMode('ssh'); setProjectPath(''); }}
              >
                SSH 원격
              </button>
            </div>
          </div>

          {workMode === 'ssh' && (
            <div className="form-group">
              <label>SSH 프로필</label>
              {profiles.length === 0 ? (
                <p className="form-hint">등록된 SSH 프로필이 없습니다. 설정에서 먼저 추가하세요.</p>
              ) : (
                <select
                  value={sshProfileId}
                  onChange={(e) => setSshProfileId(e.target.value)}
                  required
                >
                  <option value="">선택하세요</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.username}@{p.host})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="projectPath">
              {workMode === 'ssh' ? '원격 프로젝트 경로' : '프로젝트 경로'}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="projectPath"
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder={workMode === 'ssh'
                  ? (selectedProfile?.remote_os === 'windows' ? 'C:\\Users\\user\\project' : '/home/ubuntu/project')
                  : 'default'
                }
                required={workMode === 'ssh'}
                style={{ flex: 1 }}
              />
              {workMode === 'ssh' && sshProfileId && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowBrowser(true)}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  찾아보기
                </button>
              )}
            </div>
            {workMode === 'server' && (
              <span className="form-hint">workspace/{'{username}'}/{projectPath} 에 생성됩니다</span>
            )}
            {workMode === 'ssh' && (
              <span className="form-hint">
                원격 서버의 절대 경로를 입력하거나 찾아보기로 선택하세요
                {selectedProfile?.remote_os === 'windows' && ' (Windows 경로)'}
              </span>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>취소</button>
            <button type="submit" className="btn btn-primary" disabled={loading || (workMode === 'ssh' && profiles.length === 0)}>
              {loading ? '생성 중...' : '세션 생성'}
            </button>
          </div>
        </form>
      </div>

      {showBrowser && sshProfileId && (
        <RemoteFolderBrowser
          profileId={parseInt(sshProfileId, 10)}
          remoteOs={selectedProfile?.remote_os || 'linux'}
          onSelect={(path) => setProjectPath(path)}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </div>
  );
}
