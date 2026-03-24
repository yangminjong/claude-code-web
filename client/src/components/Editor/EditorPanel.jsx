import React, { useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useEditorStore } from '../../stores/editorStore.js';
import { useThemeStore, themes } from '../../stores/themeStore.js';
import toast from 'react-hot-toast';
import './Editor.css';

const LIGHT_THEMES = ['light', 'solarized'];

function EditorTab({ tab, isActive, onSelect, onClose }) {
  const isDirty = tab.content !== tab.originalContent;

  return (
    <div
      className={`editor-tab ${isActive ? 'active' : ''}`}
      onClick={() => onSelect(tab.path)}
      title={tab.path}
    >
      <span className="editor-tab-name">
        {isDirty && <span className="editor-tab-dot" />}
        {tab.name}
      </span>
      <button
        className="editor-tab-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.path);
        }}
        title="닫기"
      >
        &times;
      </button>
    </div>
  );
}

export default function EditorPanel() {
  const { tabs, activeTabPath, setActiveTab, closeTab, updateContent, saveFile, showChat } = useEditorStore();
  const themeId = useThemeStore(s => s.theme);
  const editorRef = useRef(null);

  const activeTab = tabs.find(t => t.path === activeTabPath);
  const isLight = LIGHT_THEMES.includes(themeId);

  const handleEditorMount = useCallback((editor) => {
    editorRef.current = editor;

    // Ctrl+S / Cmd+S 저장
    editor.addCommand(
      // Monaco KeyMod.CtrlCmd | Monaco KeyCode.KeyS
      2048 | 49, // CtrlCmd + KeyS
      async () => {
        const path = useEditorStore.getState().activeTabPath;
        if (!path) return;
        try {
          await saveFile(path);
          toast.success('저장됨');
        } catch (err) {
          toast.error(err.message);
        }
      }
    );
  }, [saveFile]);

  const handleCloseTab = useCallback((path) => {
    const store = useEditorStore.getState();
    const tab = store.tabs.find(t => t.path === path);
    if (tab && tab.content !== tab.originalContent) {
      if (!confirm(`"${tab.name}" 파일에 저장하지 않은 변경사항이 있습니다. 닫으시겠습니까?`)) {
        return;
      }
    }
    closeTab(path);
  }, [closeTab]);

  if (!activeTab) return null;

  return (
    <div className="editor-container">
      {/* Tab bar */}
      <div className="editor-tab-bar">
        <div className="editor-tabs">
          {tabs.map(tab => (
            <EditorTab
              key={tab.path}
              tab={tab}
              isActive={tab.path === activeTabPath}
              onSelect={setActiveTab}
              onClose={handleCloseTab}
            />
          ))}
        </div>
        <div className="editor-tab-actions">
          <button
            className="editor-action-btn"
            onClick={async () => {
              if (!activeTabPath) return;
              try {
                await saveFile(activeTabPath);
                toast.success('저장됨');
              } catch (err) {
                toast.error(err.message);
              }
            }}
            title="저장 (Ctrl+S)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.354 4.354l-3.708-3.708A.5.5 0 009.293.5H2.5A1.5 1.5 0 001 2v12a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0015 14V4.707a.5.5 0 00-.146-.353zM12 14.5H4v-4h8v4zm1 0V10a.5.5 0 00-.5-.5h-9a.5.5 0 00-.5.5v4.5H2.5a.5.5 0 01-.5-.5V2a.5.5 0 01.5-.5h6.793L13.5 5.707V14.5H13z"/>
            </svg>
          </button>
          <button
            className="editor-action-btn"
            onClick={showChat}
            title="채팅으로 돌아가기"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1C4.134 1 1 3.582 1 6.75c0 1.754.934 3.326 2.395 4.371L3 14.5l3.395-1.703C6.91 12.928 7.445 13 8 13c3.866 0 7-2.582 7-5.75S11.866 1 8 1z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Editor body */}
      <div className="editor-body">
        {activeTab.loading ? (
          <div className="editor-loading">파일 로딩 중...</div>
        ) : activeTab.error ? (
          <div className="editor-error">
            <p>파일을 읽을 수 없습니다</p>
            <p className="editor-error-detail">{activeTab.error}</p>
          </div>
        ) : (
          <Editor
            key={activeTabPath}
            defaultValue={activeTab.content}
            language={activeTab.language}
            theme={isLight ? 'light' : 'vs-dark'}
            onChange={(value) => updateContent(activeTabPath, value || '')}
            onMount={handleEditorMount}
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              minimap: { enabled: true },
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
            }}
          />
        )}
      </div>
    </div>
  );
}
