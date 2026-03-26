import React, { useState, useRef, useEffect } from 'react';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import { useWebSocket, WS_STATE } from '../../hooks/useWebSocket.js';
import { api } from '../../api/client.js';
import MessageBubble from './MessageBubble.jsx';
import ClaudeAvatar from './ClaudeAvatar.jsx';
import toast from 'react-hot-toast';
import './Chat.css';

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const ts = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatWindow() {
  const { activeSessionId, messages, addMessage, sessions, createSession, activateSession, deleteSessionPermanently, reloadMessages, switchBranch } = useSessionStore();
  const token = useAuthStore((s) => s.token);
  const [input, setInput] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [creating, setCreating] = useState(false);
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const pendingMessageRef = useRef(null);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  // Fetch metadata when session changes
  useEffect(() => {
    setMetadata(null);
    if (!activeSessionId) return;
    api.getSessionMetadata(activeSessionId).then(setMetadata).catch(() => {});
  }, [activeSessionId]);

  const {
    connected, connState, retryCount, thinking, streamingText,
    sendMessage, regenerate, cancelResponse, onComplete, reconnect
  } = useWebSocket(activeSessionId, token);

  // When assistant response completes, add it to message list
  useEffect(() => {
    onComplete((result, meta = {}) => {
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (result) {
        if (meta.isRegenerate) {
          // Regenerate completed — reload the full tree and active path
          reloadMessages();
        } else {
          addMessage({
            id: meta.dbMessageId,
            role: 'assistant',
            content: result,
            created_at: new Date().toISOString()
          });
          // Reload tree in background for worktree panel
          reloadMessages();
        }
      }
    });
  }, [onComplete, addMessage, reloadMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, thinking]);

  // Send pending message after session creation
  useEffect(() => {
    if (activeSessionId && connected && pendingMessageRef.current) {
      const text = pendingMessageRef.current;
      pendingMessageRef.current = null;
      sendMessage(text);
    }
  }, [activeSessionId, connected]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || thinking || streamingText || creating) return;

    // Find the last message's DB ID to use as parent
    const lastMsg = messages[messages.length - 1];
    const parentId = lastMsg?.id || null;

    // Add user message to local state immediately
    addMessage({
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    });
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // If no session, create one first
    if (!activeSessionId) {
      setCreating(true);
      try {
        const session = await createSession('새 작업');
        pendingMessageRef.current = text;
        activateSession(session.id);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setCreating(false);
      }
      return;
    }

    sendMessage(text, parentId);
  };

  const handleRegenerate = (userMessageId) => {
    if (thinking || streamingText) return;
    regenerate(userMessageId);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  // No session selected — show empty chat ready for input
  if (!activeSessionId) {
    return (
      <div className="chat-container">
        <div className="chat-header-bar">
          <div className="chat-header-left">
            <span className="chat-header-title">새 작업</span>
          </div>
        </div>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-welcome">
              <p>메시지를 입력하여 Claude와 대화를 시작하세요</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <MessageBubble key={msg.id || `msg-${i}`} role={msg.role} content={msg.content} />
          ))}
          {creating && (
            <div className="message assistant">
              <div className="message-avatar"><ClaudeAvatar size={32} isAnimated /></div>
              <div className="message-body">
                <div className="thinking-indicator">
                  <span className="dot" /><span className="dot" /><span className="dot" />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input-area">
          <div className="chat-input-wrapper">
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요... (Shift+Enter로 줄바꿈)"
              rows={1}
              disabled={creating}
            />
            <button
              className="btn btn-primary chat-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || creating}
            >
              전송
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isTyping = thinking || !!streamingText;

  return (
    <div className="chat-container">
      <div className="chat-header-bar">
        <div className="chat-header-left">
          <span className="chat-header-title">{activeSession?.name}</span>
          {metadata && (
            <div className="chat-header-meta">
              {metadata.sessionSizeBytes > 0 && (
                <span className="meta-tag" title="Claude 세션 크기">{formatSize(metadata.sessionSizeBytes)}</span>
              )}
              {metadata.messageSizeBytes > 0 && !metadata.sessionSizeBytes && (
                <span className="meta-tag" title="메시지 크기">{formatSize(metadata.messageSizeBytes)}</span>
              )}
              {metadata.gitInfo && (
                <span className="meta-tag git" title={metadata.gitInfo.remote}>
                  {metadata.gitInfo.remote.replace(/^.*[/:](.*?)(\.git)?$/, '$1')}
                  {metadata.gitInfo.branch && ` : ${metadata.gitInfo.branch}`}
                </span>
              )}
              {metadata.lastActivityAt && (
                <span className="meta-tag" title={new Date(metadata.lastActivityAt).toLocaleString()}>
                  {formatTimeAgo(metadata.lastActivityAt)}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="chat-header-right">
          {connState === WS_STATE.CONNECTED && (
            <span className="chat-header-status active">연결됨</span>
          )}
          {connState === WS_STATE.CONNECTING && (
            <span className="chat-header-status connecting">연결 중...</span>
          )}
          {connState === WS_STATE.RECONNECTING && (
            <span className="chat-header-status reconnecting">
              재연결 중{retryCount > 0 ? ` (${retryCount}회)` : '...'}
            </span>
          )}
          {connState === WS_STATE.DISCONNECTED && (
            <span className="chat-header-status disconnected">연결 끊김</span>
          )}
          <button
            className="btn-icon chat-delete-btn"
            title="세션 삭제"
            onClick={async () => {
              if (!confirm('이 세션을 영구적으로 삭제하시겠습니까? 모든 대화 기록이 삭제됩니다.')) return;
              try {
                await deleteSessionPermanently(activeSessionId);
                toast.success('세션이 삭제되었습니다');
              } catch (err) {
                toast.error(err.message);
              }
            }}
          >
            &times;
          </button>
        </div>
      </div>

      {/* Reconnection banner */}
      {connState === WS_STATE.RECONNECTING && (
        <div className="ws-reconnect-banner">
          <span className="ws-reconnect-spinner" />
          <span>연결이 끊어졌습니다. 재연결 시도 중... ({retryCount}회)</span>
        </div>
      )}
      {connState === WS_STATE.DISCONNECTED && retryCount > 0 && (
        <div className="ws-reconnect-banner failed">
          <span>연결에 실패했습니다.</span>
          <button className="btn btn-sm btn-primary" onClick={reconnect} style={{ marginLeft: 8 }}>
            다시 연결
          </button>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && !isTyping && (
          <div className="chat-welcome">
            <p>메시지를 입력하여 Claude와 대화를 시작하세요</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id || `msg-${i}`}
            role={msg.role}
            content={msg.content}
            messageId={msg.id}
            siblingCount={msg.siblingCount}
            siblingIndex={msg.siblingIndex}
            parentMessageId={msg.parent_message_id}
            onRegenerate={isLive && msg.role === 'assistant' && !isTyping ? handleRegenerate : null}
            onSwitchBranch={msg.siblingCount > 1 ? switchBranch : null}
          />
        ))}

        {/* Streaming response */}
        {streamingText && (
          <MessageBubble role="assistant" content={streamingText} isStreaming />
        )}

        {/* Thinking indicator */}
        {thinking && !streamingText && (
          <div className="message assistant">
            <div className="message-avatar"><ClaudeAvatar size={32} isAnimated /></div>
            <div className="message-body">
              <div className="thinking-indicator">
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder={
              connState === WS_STATE.RECONNECTING
                ? '재연결 중... 메시지는 연결 후 자동 전송됩니다'
                : connState === WS_STATE.DISCONNECTED
                  ? '연결이 끊어졌습니다'
                  : '메시지를 입력하세요... (Shift+Enter로 줄바꿈)'
            }
            rows={1}
            disabled={connState === WS_STATE.DISCONNECTED && retryCount > 0}
          />
          {isTyping ? (
            <button className="btn btn-danger chat-send-btn" onClick={cancelResponse}>
              중지
            </button>
          ) : (
            <button
              className="btn btn-primary chat-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || (connState === WS_STATE.DISCONNECTED && retryCount > 0)}
            >
              전송
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
