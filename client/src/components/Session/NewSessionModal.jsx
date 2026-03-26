import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useEditorStore } from '../../stores/editorStore.js';
import { useSshProfileStore } from '../../stores/sshProfileStore.js';
import { api } from '../../api/client.js';
import RemoteFolderBrowser from '../Settings/RemoteFolderBrowser.jsx';
import toast from 'react-hot-toast';

export default function NewSessionModal({ onClose }) {
  const { createSession, setActiveSession } = useSessionStore();
  const { profiles, fetchProfiles } = useSshProfileStore();
  const navigate = useNavigate();
  const [workMode, setWorkMode] = useState('server');
  const [projectPath, setProjectPath] = useState('default');
  const [sshProfileId, setSshProfileId] = useState('');
  const [loading, setLoading] = useState(false);
  const [folders, setFolders] = useState([]);
  const [showBrowser, setShowBrowser] = useState(false);

  useEffect(() => {
    fetchProfiles();
    // Load workspace folders
    api.listFiles('.').then(({ items }) => {
      setFolders(items.filter(i => i.isDirectory).map(i => i.name));
    }).catch(() => {});
  }, []);

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
        '새 작업',
        workMode,
        projectPath || 'default',
        workMode === 'ssh' ? parseInt(sshProfileId, 10) : null
      );
      setActiveSession(session.id);
      useEditorStore.getState().showChat();
      navigate('/');
      onClose();
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
          <h3>새 작업</h3>
          <button className="btn-icon" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
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
            <label>
              {workMode === 'ssh' ? '원격 프로젝트 경로' : '프로젝트 폴더'}
            </label>

            {workMode === 'server' ? (
              <>
                <div className="folder-grid">
                  {folders.map(f => (
                    <button
                      key={f}
                      type="button"
                      className={`folder-btn ${projectPath === f ? 'active' : ''}`}
                      onClick={() => setProjectPath(f)}
                    >
                      {f}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`folder-btn new ${!folders.includes(projectPath) && projectPath !== 'default' ? 'active' : ''}`}
                    onClick={() => setProjectPath('')}
                  >
                    + 새 폴더
                  </button>
                </div>
                {(!folders.includes(projectPath) && projectPath !== 'default') || projectPath === '' ? (
                  <input
                    type="text"
                    value={projectPath}
                    onChange={(e) => setProjectPath(e.target.value)}
                    placeholder="폴더 이름 입력"
                    autoFocus
                    style={{ marginTop: '8px' }}
                  />
                ) : null}
                <span className="form-hint">workspaces/{projectPath || '...'} 에서 작업합니다</span>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={projectPath}
                    onChange={(e) => setProjectPath(e.target.value)}
                    placeholder={selectedProfile?.remote_os === 'windows' ? 'C:\\Users\\user\\project' : '/home/ubuntu/project'}
                    required
                    style={{ flex: 1 }}
                  />
                  {sshProfileId && (
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
                <span className="form-hint">원격 서버의 절대 경로를 입력하세요</span>
              </>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>취소</button>
            <button type="submit" className="btn btn-primary" disabled={loading || (workMode === 'ssh' && profiles.length === 0)}>
              {loading ? '생성 중...' : '대화 시작'}
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
