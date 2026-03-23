import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useExplorerStore } from '../../stores/explorerStore.js';
import { api } from '../../api/client.js';
import toast from 'react-hot-toast';

const FILE_ICONS = {
  folder: { icon: '', color: '#dcb67a' },
  folderOpen: { icon: '', color: '#dcb67a' },
  js: { icon: 'JS', color: '#f1e05a' },
  jsx: { icon: 'JSX', color: '#61dafb' },
  ts: { icon: 'TS', color: '#3178c6' },
  tsx: { icon: 'TSX', color: '#3178c6' },
  json: { icon: '{ }', color: '#f1e05a' },
  html: { icon: '<>', color: '#e34c26' },
  css: { icon: '#', color: '#563d7c' },
  scss: { icon: '#', color: '#c6538c' },
  md: { icon: 'M', color: '#083fa1' },
  py: { icon: 'PY', color: '#3572a5' },
  sh: { icon: '$', color: '#89e051' },
  sql: { icon: 'SQL', color: '#e38c00' },
  env: { icon: '', color: '#ecd53f' },
  yml: { icon: '', color: '#cb171e' },
  yaml: { icon: '', color: '#cb171e' },
  db: { icon: '', color: '#9a9a9a' },
  sqlite: { icon: '', color: '#9a9a9a' },
  png: { icon: '', color: '#a074c4' },
  jpg: { icon: '', color: '#a074c4' },
  jpeg: { icon: '', color: '#a074c4' },
  gif: { icon: '', color: '#a074c4' },
  svg: { icon: '', color: '#ffb13b' },
  webp: { icon: '', color: '#a074c4' },
  default: { icon: '', color: '#9a9a9a' },
};

function getFileIcon(name, isDirectory, isExpanded) {
  if (isDirectory) {
    return isExpanded ? FILE_ICONS.folderOpen : FILE_ICONS.folder;
  }
  const ext = name.split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── 인라인 이름 입력 ──
function InlineInput({ depth, isDirectory, onSubmit, onCancel }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const icon = getFileIcon(isDirectory ? '' : value, isDirectory, false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (value.trim()) onSubmit(value.trim());
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="tree-node tree-inline-input" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
      <span className="tree-chevron" style={{ visibility: isDirectory ? 'visible' : 'hidden' }}>
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="tree-icon" style={{ color: icon.color }}>
        {isDirectory ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.5 13h13a.5.5 0 00.5-.5V5.5a.5.5 0 00-.5-.5H7L6 4H1.5a.5.5 0 00-.5.5v8a.5.5 0 00.5.5z" />
          </svg>
        ) : icon.icon ? (
          <span className="tree-icon-label">{icon.icon}</span>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.5 2A1.5 1.5 0 002 3.5v9A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5V5.621a1.5 1.5 0 00-.44-1.06l-2.12-2.122A1.5 1.5 0 0010.378 2H3.5z" />
          </svg>
        )}
      </span>
      <input
        ref={inputRef}
        className="tree-name-input"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (value.trim()) onSubmit(value.trim());
          else onCancel();
        }}
        placeholder={isDirectory ? 'Folder name' : 'File name'}
      />
    </div>
  );
}

// ── 이름 변경 인라인 입력 ──
function RenameInput({ node, depth, onSubmit, onCancel }) {
  const [value, setValue] = useState(node.name);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    // 확장자 전까지만 선택
    const dotIdx = node.name.lastIndexOf('.');
    if (dotIdx > 0 && !node.isDirectory) {
      inputRef.current?.setSelectionRange(0, dotIdx);
    } else {
      inputRef.current?.select();
    }
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (value.trim() && value.trim() !== node.name) onSubmit(value.trim());
      else onCancel();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      className="tree-name-input"
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        if (value.trim() && value.trim() !== node.name) onSubmit(value.trim());
        else onCancel();
      }}
    />
  );
}

// ── 컨텍스트 메뉴 ──
function ContextMenu({ x, y, node, onClose }) {
  const menuRef = useRef(null);
  const { refresh } = useExplorerStore();

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // 메뉴 위치 보정 (화면 밖으로 나가지 않도록)
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
  }, [x, y]);

  const dirPath = node.isDirectory ? node.path : getParentPath(node.path);

  const handleNewFile = () => {
    onClose();
    useExplorerStore.getState().startCreating(dirPath, 'file');
  };

  const handleNewFolder = () => {
    onClose();
    useExplorerStore.getState().startCreating(dirPath, 'directory');
  };

  const handleRename = () => {
    onClose();
    useExplorerStore.getState().setRenamingPath(node.path);
  };

  const handleDelete = async () => {
    onClose();
    const confirmMsg = node.isDirectory
      ? `"${node.name}" 폴더와 하위 파일을 삭제하시겠습니까?`
      : `"${node.name}" 파일을 삭제하시겠습니까?`;
    if (!confirm(confirmMsg)) return;

    try {
      await api.deleteFile(node.path);
      toast.success(`${node.name} 삭제됨`);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDownload = async () => {
    onClose();
    try {
      const blob = await api.downloadFile(node.path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = node.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="context-menu" ref={menuRef} style={{ top: y, left: x }}>
      <button className="context-menu-item" onClick={handleNewFile}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 1.1L3.5 1A1.5 1.5 0 002 2.5v11A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5V5.1L9.5 1.1zM9 2l4 4H9.5a.5.5 0 01-.5-.5V2z"/></svg>
        새 파일
      </button>
      <button className="context-menu-item" onClick={handleNewFolder}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14.5 3H7.71l-.85-.85A.5.5 0 006.5 2h-5a.5.5 0 00-.5.5v11a.5.5 0 00.5.5h13a.5.5 0 00.5-.5v-10a.5.5 0 00-.5-.5zm-.5 10H2V3h4.29l.85.85a.5.5 0 00.36.15H14v9z"/></svg>
        새 폴더
      </button>
      <div className="context-menu-sep" />
      <button className="context-menu-item" onClick={handleRename}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 14.01 5.52 11.8l.22-.16L14 3.41V1.95L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zM6 9.98L3.87 7.85 11.37 2H13v.63L6 9.98z"/></svg>
        이름 변경
      </button>
      {!node.isDirectory && (
        <button className="context-menu-item" onClick={handleDownload}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 12l-4-4h2.5V2h3v6H12L8 12zM14 14H2v-1h12v1z"/></svg>
          다운로드
        </button>
      )}
      <div className="context-menu-sep" />
      <button className="context-menu-item danger" onClick={handleDelete}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M10 3h3v1h-1v9.5a.5.5 0 01-.5.5h-7a.5.5 0 01-.5-.5V4H3V3h3V1.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V3zM7 2v1h2V2H7zM5 5v7h1V5H5zm2 0v7h1V5H7zm2 0v7h1V5H9z"/></svg>
        삭제
      </button>
    </div>
  );
}

function getParentPath(path) {
  const parts = path.split('/');
  parts.pop();
  return parts.length === 0 ? '.' : parts.join('/');
}

// ── TreeNode ──
function TreeNode({ node, depth = 0 }) {
  const { expandedPaths, loadingPaths, selectedPath, renamingPath, toggleExpand, setSelectedPath, setRenamingPath, refresh } = useExplorerStore();
  const isExpanded = expandedPaths.has(node.path);
  const isLoading = loadingPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isRenaming = renamingPath === node.path;
  const icon = getFileIcon(node.name, node.isDirectory, isExpanded);

  const handleClick = (e) => {
    e.stopPropagation();
    setSelectedPath(node.path);
    if (node.isDirectory) {
      toggleExpand(node.path);
    }
  };

  // 파일 드래그 시작 → 외부로 드래그하면 다운로드
  const handleDragStart = (e) => {
    if (node.isDirectory) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'copy';
    const token = localStorage.getItem('token');
    const downloadUrl = `${window.location.origin}/api/files/download?path=${encodeURIComponent(node.path)}&token=${token}`;
    // Chrome: DownloadURL 프로토콜
    try { e.dataTransfer.setData('DownloadURL', `application/octet-stream:${node.name}:${downloadUrl}`); } catch {}
    e.dataTransfer.setData('text/uri-list', downloadUrl);
    e.dataTransfer.setData('text/plain', node.name);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPath(node.path);
    useExplorerStore.getState().showContextMenu(e.clientX, e.clientY, node);
  };

  const handleRenameSubmit = async (newName) => {
    setRenamingPath(null);
    const parentPath = getParentPath(node.path);
    const newPath = parentPath === '.' ? newName : `${parentPath}/${newName}`;
    try {
      await api.renameFile(node.path, newPath);
      toast.success(`"${newName}" 으로 변경됨`);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <div
        className={`tree-node ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        draggable={!node.isDirectory}
        onDragStart={handleDragStart}
        title={node.isDirectory ? node.path : `${node.path} (${formatSize(node.size)})`}
      >
        <span className={`tree-chevron ${node.isDirectory ? 'visible' : ''}`}>
          {node.isDirectory && (
            isLoading
              ? <span className="tree-spinner" />
              : <svg width="16" height="16" viewBox="0 0 16 16" className={isExpanded ? 'expanded' : ''}>
                  <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
          )}
        </span>

        <span className="tree-icon" style={{ color: icon.color }}>
          {node.isDirectory ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              {isExpanded
                ? <path d="M1.5 14h11l2-6H4.5l-2 6zM2 4v2.5h12.5l-1 1H4l-2.5 6.5H1.5a.5.5 0 01-.5-.5V4.5A.5.5 0 011.5 4H6l1 1h5.5a.5.5 0 01.5.5V7" />
                : <path d="M1.5 13h13a.5.5 0 00.5-.5V5.5a.5.5 0 00-.5-.5H7L6 4H1.5a.5.5 0 00-.5.5v8a.5.5 0 00.5.5z" />
              }
            </svg>
          ) : icon.icon ? (
            <span className="tree-icon-label">{icon.icon}</span>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.5 2A1.5 1.5 0 002 3.5v9A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5V5.621a1.5 1.5 0 00-.44-1.06l-2.12-2.122A1.5 1.5 0 0010.378 2H3.5z" />
            </svg>
          )}
        </span>

        {isRenaming ? (
          <RenameInput
            node={node}
            depth={depth}
            onSubmit={handleRenameSubmit}
            onCancel={() => setRenamingPath(null)}
          />
        ) : (
          <span className="tree-name">{node.name}</span>
        )}
      </div>

      {node.isDirectory && isExpanded && node.children && (
        <div className="tree-children">
          <CreatingInput parentPath={node.path} depth={depth + 1} />
          {node.children.map(child => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
          {node.children.length === 0 && node.isLoaded && !useExplorerStore.getState().isCreatingIn(node.path) && (
            <div className="tree-empty" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
              (empty)
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── 생성 중 인라인 입력 (특정 폴더 안) ──
function CreatingInput({ parentPath, depth }) {
  const { creatingIn, creatingType, refresh } = useExplorerStore();

  if (creatingIn !== parentPath) return null;

  const handleSubmit = async (name) => {
    const fullPath = parentPath === '.' ? name : `${parentPath}/${name}`;
    try {
      if (creatingType === 'directory') {
        await api.createDir(fullPath);
      } else {
        await api.createFile(fullPath);
      }
      toast.success(`${name} 생성됨`);
      useExplorerStore.getState().stopCreating();
      refresh();
    } catch (err) {
      toast.error(err.message);
      useExplorerStore.getState().stopCreating();
    }
  };

  const handleCancel = () => {
    useExplorerStore.getState().stopCreating();
  };

  return (
    <InlineInput
      depth={depth}
      isDirectory={creatingType === 'directory'}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}

export default function ExplorerTree() {
  const { tree, contextMenu, hideContextMenu } = useExplorerStore();

  if (!tree) {
    return <div className="tree-loading">Loading...</div>;
  }

  return (
    <div className="explorer-tree" onContextMenu={(e) => {
      e.preventDefault();
      useExplorerStore.getState().showContextMenu(e.clientX, e.clientY, { path: '.', isDirectory: true, name: 'workspace' });
    }}>
      <CreatingInput parentPath="." depth={0} />
      {tree.children && tree.children.map(node => (
        <TreeNode key={node.path} node={node} depth={0} />
      ))}
      {tree.children && tree.children.length === 0 && !useExplorerStore.getState().isCreatingIn('.') && (
        <div className="tree-empty-root">
          마우스 우클릭으로 파일/폴더를 생성하세요
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onClose={hideContextMenu}
        />
      )}
    </div>
  );
}
