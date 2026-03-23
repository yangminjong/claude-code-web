import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useExplorerStore } from '../../stores/explorerStore.js';
import ExplorerTree from './ExplorerTree.jsx';
import UploadButton from '../Files/UploadButton.jsx';
import { api } from '../../api/client.js';
import toast from 'react-hot-toast';
import './Explorer.css';

export default function ExplorerPanel() {
  const { open, collapsed, width, tree, selectedPath, setWidth, loadRoot, refresh, collapseAll, toggleCollapsed } = useExplorerStore();
  const panelRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    if (open && !tree) {
      loadRoot();
    }
  }, [open, tree, loadRoot]);

  // 리사이즈 핸들 드래그
  const handleMouseDown = useCallback((e) => {
    if (collapsed) return;
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = width;

    const handleMouseMove = (e) => {
      const delta = startXRef.current - e.clientX;
      setWidth(startWidthRef.current + delta);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width, setWidth, collapsed]);

  // ── 드래그 앤 드롭 (외부 → 익스플로러 업로드) ──
  const getDropTargetPath = useCallback(() => {
    if (!selectedPath || selectedPath === '.') return '.';
    const node = useExplorerStore.getState()._findNode(selectedPath);
    if (node?.isDirectory) return selectedPath;
    const parts = selectedPath.split('/');
    parts.pop();
    return parts.length === 0 ? '.' : parts.join('/');
  }, [selectedPath]);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const targetPath = getDropTargetPath();
    let success = 0;
    let fail = 0;

    for (const file of files) {
      try {
        await api.uploadFile(file, targetPath);
        success++;
      } catch (err) {
        fail++;
        console.error(`Upload failed: ${file.name}`, err);
      }
    }

    if (success > 0) {
      toast.success(`${success}개 파일 업로드 완료${fail > 0 ? ` (${fail}개 실패)` : ''}`);
      refresh();
    } else {
      toast.error('파일 업로드에 실패했습니다');
    }
  }, [getDropTargetPath, refresh]);

  // 업로드 후 새로고침
  const handleUploaded = useCallback(() => {
    refresh();
  }, [refresh]);

  // 현재 선택된 경로의 디렉토리 경로 계산
  const getUploadPath = () => {
    if (!selectedPath || selectedPath === '.') return '.';
    const node = useExplorerStore.getState()._findNode(selectedPath);
    if (node?.isDirectory) return selectedPath;
    const parts = selectedPath.split('/');
    parts.pop();
    return parts.length === 0 ? '.' : parts.join('/');
  };

  if (!open) return null;

  // 접힌 상태: 세로 바만 표시
  if (collapsed) {
    return (
      <div className="explorer-panel explorer-collapsed" ref={panelRef}>
        <button className="explorer-collapsed-btn" onClick={toggleCollapsed} title="Explorer 펼치기">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.5 13h13a.5.5 0 00.5-.5V5.5a.5.5 0 00-.5-.5H7L6 4H1.5a.5.5 0 00-.5.5v8a.5.5 0 00.5.5z" />
          </svg>
          <span className="explorer-collapsed-label">EXPLORER</span>
        </button>
      </div>
    );
  }

  return (
    <div className="explorer-panel" ref={panelRef} style={{ width: `${width}px` }}>
      {/* 리사이즈 핸들 */}
      <div className="explorer-resize-handle" onMouseDown={handleMouseDown} />

      {/* 헤더 */}
      <div className="explorer-header">
        <span className="explorer-title">EXPLORER</span>
        <div className="explorer-actions">
          <UploadButton currentPath={getUploadPath()} onUploaded={handleUploaded} />
          <button className="explorer-action-btn" onClick={refresh} title="Refresh">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.451 5.609l-.579-.939-1.068.812-.076.094c.335.57.527 1.226.527 1.924a4.255 4.255 0 11-4.255-4.255c.372 0 .733.048 1.077.138l.272-.962A5.248 5.248 0 008 2.255 5.255 5.255 0 1013.451 5.61z" />
              <path d="M10.5 1L13 3.5 10.5 6V1z" />
            </svg>
          </button>
          <button className="explorer-action-btn" onClick={collapseAll} title="Collapse All">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M9 9H4v1h5V9zM9 4H4v1h5V4zM1 2.5l3 3 3-3H1zM12 14V2h1v12h-1z" />
            </svg>
          </button>
          <button className="explorer-action-btn" onClick={toggleCollapsed} title="Explorer 접기">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* 섹션 헤더 */}
      <div className="explorer-section-header">
        <svg width="12" height="12" viewBox="0 0 16 16" className="expanded">
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>WORKSPACE</span>
      </div>

      {/* 트리 영역 */}
      <div
        className="explorer-tree-container"
        onContextMenu={(e) => {
          e.preventDefault();
          useExplorerStore.getState().showContextMenu(e.clientX, e.clientY, { path: '.', isDirectory: true, name: 'workspace' });
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <ExplorerTree />
        {dragOver && (
          <div className="explorer-drop-overlay">
            <div className="explorer-drop-message">
              <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 12l-4-4h2.5V2h3v6H12L8 12zM14 14H2v-1h12v1z"/>
              </svg>
              <span>파일을 여기에 놓아서 업로드</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
