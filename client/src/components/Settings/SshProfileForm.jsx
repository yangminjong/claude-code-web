import React, { useState } from 'react';
import { useSshProfileStore } from '../../stores/sshProfileStore.js';
import toast from 'react-hot-toast';

export default function SshProfileForm({ profile, onClose }) {
  const { createProfile, updateProfile, testProfile } = useSshProfileStore();
  const isEdit = !!profile;

  const [form, setForm] = useState({
    name: profile?.name || '',
    host: profile?.host || '',
    port: profile?.port || 22,
    username: profile?.username || '',
    authMethod: profile?.auth_method || 'key',
    remoteOs: profile?.remote_os || 'linux',
    credential: '',
    allowedPaths: profile?.allowed_paths ? JSON.parse(profile.allowed_paths).join('\n') : ''
  });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleChange = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = {
        name: form.name,
        host: form.host,
        port: parseInt(form.port, 10),
        username: form.username,
        authMethod: form.authMethod,
        remoteOs: form.remoteOs,
        allowedPaths: form.allowedPaths.split('\n').map(p => p.trim()).filter(Boolean)
      };
      if (form.credential) data.credential = form.credential;

      if (isEdit) {
        await updateProfile(profile.id, data);
        toast.success('SSH 프로필이 수정되었습니다');
      } else {
        if (!form.credential) {
          toast.error('인증 정보를 입력해주세요');
          setLoading(false);
          return;
        }
        await createProfile(data);
        toast.success('SSH 프로필이 생성되었습니다');
      }
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!isEdit) {
      toast.error('먼저 프로필을 저장한 후 테스트하세요');
      return;
    }
    setTesting(true);
    try {
      const result = await testProfile(profile.id);
      toast.success(result.message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'SSH 프로필 수정' : '새 SSH 프로필'}</h3>
          <button className="btn-icon" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label>프로필 이름</label>
              <input type="text" value={form.name} onChange={handleChange('name')} placeholder="예: Production Server" required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>호스트</label>
              <input type="text" value={form.host} onChange={handleChange('host')} placeholder="192.168.1.100 또는 example.com" required />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>포트</label>
              <input type="number" value={form.port} onChange={handleChange('port')} min="1" max="65535" />
            </div>
          </div>
          <div className="form-group">
            <label>사용자명</label>
            <input type="text" value={form.username} onChange={handleChange('username')} placeholder="ubuntu" required />
          </div>
          <div className="form-group">
            <label>원격 OS</label>
            <div className="radio-group">
              <label className="radio-label">
                <input type="radio" value="linux" checked={form.remoteOs === 'linux'} onChange={handleChange('remoteOs')} />
                Linux / macOS
              </label>
              <label className="radio-label">
                <input type="radio" value="windows" checked={form.remoteOs === 'windows'} onChange={handleChange('remoteOs')} />
                Windows
              </label>
            </div>
          </div>
          <div className="form-group">
            <label>인증 방식</label>
            <div className="radio-group">
              <label className="radio-label">
                <input type="radio" value="key" checked={form.authMethod === 'key'} onChange={handleChange('authMethod')} />
                SSH 키
              </label>
              <label className="radio-label">
                <input type="radio" value="password" checked={form.authMethod === 'password'} onChange={handleChange('authMethod')} />
                비밀번호
              </label>
            </div>
          </div>
          <div className="form-group">
            <label>{form.authMethod === 'key' ? '개인 키 (PEM)' : '비밀번호'}</label>
            {form.authMethod === 'key' ? (
              <textarea
                value={form.credential}
                onChange={handleChange('credential')}
                placeholder={isEdit ? '변경하려면 새 키를 입력하세요' : '-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
                rows={6}
                style={{ fontFamily: 'monospace', fontSize: '12px' }}
              />
            ) : (
              <input
                type="password"
                value={form.credential}
                onChange={handleChange('credential')}
                placeholder={isEdit ? '변경하려면 새 비밀번호를 입력하세요' : '비밀번호'}
              />
            )}
            {isEdit && <span className="form-hint">비워두면 기존 인증 정보가 유지됩니다</span>}
          </div>
          <div className="form-group">
            <label>허용 경로 (줄바꿈 구분, 비우면 제한 없음)</label>
            <textarea
              value={form.allowedPaths}
              onChange={handleChange('allowedPaths')}
              placeholder="/home/ubuntu/projects&#10;/var/www"
              rows={3}
            />
          </div>
          <div className="modal-actions">
            {isEdit && (
              <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={testing}>
                {testing ? '테스트 중...' : '연결 테스트'}
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-secondary" onClick={onClose}>취소</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
