import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client.js';
import toast from 'react-hot-toast';

export default function RemoteFolderBrowser({ profileId, remoteOs, onSelect, onClose }) {
  const isWindows = remoteOs === 'windows';

  const [currentPath, setCurrentPath] = useState(null);
  const [directories, setDirectories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null); // 'ssh' | 'chooser'

  // SSH/SFTP browse
  const browse = useCallback(async (path) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.browseSshProfile(profileId, path || null);
      setCurrentPath(result.currentPath);
      setDirectories(result.directories);
      setMode('ssh');
    } catch (err) {
      setError(err.message);
      if (isWindows && !mode) {
        setMode('chooser');
      }
    } finally {
      setLoading(false);
    }
  }, [profileId, isWindows, mode]);

  useEffect(() => {
    if (isWindows) {
      browse(null);
    } else {
      browse('/');
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const goUp = () => {
    if (!currentPath || currentPath === '/') return;

    if (isWindows) {
      if (/^[A-Za-z]:$/.test(currentPath)) {
        browse(null);
        return;
      }
      const parts = currentPath.replace(/\\+$/, '').split('\\');
      parts.pop();
      const parent = parts.join('\\') || parts[0];
      browse(parent);
    } else {
      const parts = currentPath.replace(/\/+$/, '').split('/');
      parts.pop();
      browse(parts.join('/') || '/');
    }
  };

  const breadcrumbs = () => {
    if (!currentPath) return [];

    if (isWindows) {
      if (currentPath === '/') {
        return [{ name: 'Drives', path: null }];
      }
      const parts = currentPath.replace(/\\+$/, '').split('\\');
      const crumbs = [{ name: 'Drives', path: null }];
      parts.forEach((part, i) => {
        crumbs.push({
          name: part,
          path: parts.slice(0, i + 1).join('\\')
        });
      });
      return crumbs;
    } else {
      if (currentPath === '/') return [{ name: '/', path: '/' }];
      const parts = currentPath.replace(/\/+$/, '').split('/').filter(Boolean);
      return [
        { name: '/', path: '/' },
        ...parts.map((part, i) => ({
          name: part,
          path: '/' + parts.slice(0, i + 1).join('/')
        }))
      ];
    }
  };

  const handleSelect = () => {
    if (currentPath && currentPath !== '/') {
      onSelect(currentPath);
      onClose();
    }
  };

  // Native folder picker using showDirectoryPicker (requires HTTPS)
  const handleNativePick = async () => {
    if (!window.showDirectoryPicker) {
      toast.error('이 브라우저는 폴더 선택을 지원하지 않습니다. Chrome/Edge를 사용해주세요.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      const folderName = handle.name;

      // showDirectoryPicker doesn't expose the full absolute path for security.
      // Ask user to confirm the full path.
      const fullPath = window.prompt(
        `선택한 폴더: "${folderName}"\n\n전체 경로를 입력(확인)해주세요:`,
        isWindows ? `C:\\Users\\${folderName}` : `/${folderName}`
      );
      if (fullPath) {
        onSelect(fullPath.trim());
        onClose();
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        toast.error('폴더 선택 실패: ' + err.message);
      }
    }
  };

  const sep = isWindows ? '\\' : '/';
  const isRoot = !currentPath || currentPath === '/';
  const canSelect = currentPath && currentPath !== '/' && !/^[A-Za-z]:$/.test(currentPath);

  // Chooser screen: SSH failed, show options
  if (mode === 'chooser') {
    return (
      <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
          <div className="modal-header">
            <h3>폴더 선택 방법</h3>
            <button className="btn-icon" onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
              SSH 원격 탐색에 실패했습니다. 다른 방법을 선택해주세요.
            </p>
            <button
              className="btn btn-primary"
              onClick={handleNativePick}
              style={{ padding: '12px', fontSize: '14px' }}
            >
              Windows 탐색기로 폴더 선택
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => { setMode('ssh'); setError(null); browse(null); }}
              style={{ padding: '12px', fontSize: '14px' }}
            >
              SSH 원격 탐색 재시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3>원격 폴더 선택</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isWindows && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleNativePick}
                title="Windows 탐색기"
              >
                탐색기
              </button>
            )}
            <button className="btn-icon" onClick={onClose}>&times;</button>
          </div>
        </div>

        {/* Breadcrumbs */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', minHeight: '36px' }}>
          {breadcrumbs().map((bc, i) => (
            <React.Fragment key={bc.path ?? '__root'}>
              {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{sep}</span>}
              <span
                onClick={() => browse(bc.path)}
                style={{
                  cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px 6px',
                  borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace',
                  transition: 'background 0.15s'
                }}
                onMouseOver={(e) => { e.target.style.color = 'var(--accent)'; e.target.style.background = 'var(--bg-hover)'; }}
                onMouseOut={(e) => { e.target.style.color = 'var(--text-secondary)'; e.target.style.background = 'transparent'; }}
              >
                {bc.name}
              </span>
            </React.Fragment>
          ))}
        </div>

        {/* Current path bar */}
        <div style={{ padding: '4px 16px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {currentPath || (isWindows ? 'Drives' : '/')}
        </div>

        {/* Directory list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px', minHeight: '200px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              불러오는 중...
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
              <p style={{ color: 'var(--danger)', marginBottom: '12px', fontSize: '14px' }}>{error}</p>
              {isWindows && (
                <button className="btn btn-primary" onClick={handleNativePick} style={{ marginBottom: '8px' }}>
                  Windows 탐색기로 선택
                </button>
              )}
              <br />
              <button className="btn btn-secondary btn-sm" onClick={() => { setError(null); browse(currentPath); }}>
                재시도
              </button>
            </div>
          ) : (
            <>
              {!isRoot && (
                <div
                  onClick={goUp}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '14px', color: 'var(--text-secondary)' }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: '16px', width: '24px', textAlign: 'center' }}>&#x1F4C2;</span>
                  ..
                </div>
              )}
              {directories.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  {isRoot && isWindows ? '드라이브를 찾을 수 없습니다' : '하위 폴더가 없습니다'}
                </div>
              )}
              {directories.map(dir => (
                <div
                  key={dir.path}
                  onClick={() => browse(dir.path)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                    cursor: 'pointer', borderRadius: '6px', fontSize: '14px',
                    transition: 'background 0.15s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: '16px', width: '24px', textAlign: 'center' }}>
                    {isRoot && isWindows ? '\uD83D\uDCBE' : '\uD83D\uDCC1'}
                  </span>
                  <span style={{ flex: 1 }}>{dir.name}</span>
                  {isWindows && isRoot && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{dir.path}</span>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-actions" style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {canSelect ? currentPath : '폴더를 선택하세요'}
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>취소</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSelect}
            disabled={!canSelect}
          >
            이 폴더 선택
          </button>
        </div>
      </div>
    </div>
  );
}
