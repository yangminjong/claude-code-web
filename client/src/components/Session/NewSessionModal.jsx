import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../stores/sessionStore.js';
import toast from 'react-hot-toast';

export default function NewSessionModal({ onClose }) {
  const { createSession, setActiveSession } = useSessionStore();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [projectPath, setProjectPath] = useState('default');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const session = await createSession(name, 'server', projectPath);
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
            <label htmlFor="projectPath">프로젝트 경로</label>
            <input
              id="projectPath"
              type="text"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="default"
            />
            <span className="form-hint">workspace/{'{username}'}/{projectPath} 에 생성됩니다</span>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>취소</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '생성 중...' : '세션 생성'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
