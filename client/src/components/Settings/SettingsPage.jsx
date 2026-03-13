import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { api } from '../../api/client.js';
import toast from 'react-hot-toast';
import './Settings.css';

export default function SettingsPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('새 비밀번호는 8자 이상이어야 합니다');
      return;
    }
    setLoading(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      toast.success('비밀번호가 변경되었습니다');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-page">
      <h2>설정</h2>

      <section className="settings-section">
        <h3>프로필</h3>
        <div className="settings-info">
          <div className="settings-row">
            <span className="settings-label">이름</span>
            <span>{user?.displayName}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">이메일</span>
            <span>{user?.email}</span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>비밀번호 변경</h3>
        <form onSubmit={handlePasswordChange} className="settings-form">
          <div className="form-group">
            <label>현재 비밀번호</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>새 비밀번호</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '변경 중...' : '비밀번호 변경'}
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h3>세션 설정</h3>
        <div className="settings-info">
          <div className="settings-row">
            <span className="settings-label">최대 동시 세션</span>
            <span>3개</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Idle Timeout</span>
            <span>30분</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">최대 업로드 크기</span>
            <span>50 MB</span>
          </div>
        </div>
      </section>

      <section className="settings-section disabled">
        <h3>SSH 모드 <span className="badge">2차 개발</span></h3>
        <p className="settings-desc">SSH 접속을 통한 원격 서버 작업을 지원할 예정입니다.</p>
      </section>
    </div>
  );
}
