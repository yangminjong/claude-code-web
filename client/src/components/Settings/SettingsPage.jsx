import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { useSshProfileStore } from '../../stores/sshProfileStore.js';
import { api } from '../../api/client.js';
import SshProfileForm from './SshProfileForm.jsx';
import toast from 'react-hot-toast';
import './Settings.css';

export default function SettingsPage() {
  const { user } = useAuth();
  const { profiles, fetchProfiles, deleteProfile } = useSshProfileStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSshForm, setShowSshForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

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

  const handleDeleteProfile = async (id, name) => {
    if (!confirm(`"${name}" 프로필을 삭제하시겠습니까?`)) return;
    try {
      await deleteProfile(id);
      toast.success('SSH 프로필이 삭제되었습니다');
    } catch (err) {
      toast.error(err.message);
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

      <section className="settings-section">
        <div className="settings-section-header">
          <h3>SSH 프로필</h3>
          <button className="btn btn-sm btn-primary" onClick={() => { setEditingProfile(null); setShowSshForm(true); }}>
            + 추가
          </button>
        </div>
        {profiles.length === 0 ? (
          <p className="settings-desc">등록된 SSH 프로필이 없습니다. 원격 서버에서 Claude Code를 사용하려면 프로필을 추가하세요.</p>
        ) : (
          <div className="ssh-profile-list">
            {profiles.map(p => (
              <div key={p.id} className="ssh-profile-item">
                <div className="ssh-profile-info">
                  <span className="ssh-profile-name">{p.name}</span>
                  <span className="ssh-profile-detail">{p.username}@{p.host}:{p.port}</span>
                  {p.last_connected_at && (
                    <span className="ssh-profile-meta">마지막 연결: {new Date(p.last_connected_at).toLocaleDateString()}</span>
                  )}
                </div>
                <div className="ssh-profile-actions">
                  <button className="btn btn-sm btn-secondary" onClick={() => { setEditingProfile(p); setShowSshForm(true); }}>수정</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteProfile(p.id, p.name)}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showSshForm && (
        <SshProfileForm
          profile={editingProfile}
          onClose={() => { setShowSshForm(false); setEditingProfile(null); }}
        />
      )}
    </div>
  );
}
