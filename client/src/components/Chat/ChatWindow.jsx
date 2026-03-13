import React, { useState, useRef, useEffect } from 'react';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import { useWebSocket } from '../../hooks/useWebSocket.js';
import MessageBubble from './MessageBubble.jsx';
import toast from 'react-hot-toast';
import './Chat.css';

export default function ChatWindow() {
  const { activeSessionId, messages, addMessage, sessions } = useSessionStore();
  const token = useAuthStore((s) => s.token);
  const [input, setInput] = useState('');
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const isLive = activeSession && (activeSession.status === 'active' || activeSession.status === 'idle');

  const {
    connected, thinking, streamingText,
    sendMessage, cancelResponse, onComplete
  } = useWebSocket(isLive ? activeSessionId : null, token);

  // When assistant response completes, add it to message list
  useEffect(() => {
    onComplete((result) => {
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (result) {
        addMessage({
          role: 'assistant',
          content: result,
          created_at: new Date().toISOString()
        });
      }
    });
  }, [onComplete, addMessage]);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, thinking]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || thinking || streamingText) return;

    // Add user message to local state immediately
    addMessage({
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    });

    sendMessage(text);
    setInput('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
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

  // No session selected
  if (!activeSessionId) {
    return (
      <div className="chat-empty">
        <div className="chat-empty-content">
          <h2>Claude Code Web</h2>
          <p>왼쪽 사이드바에서 세션을 선택하거나 새 세션을 만드세요</p>
        </div>
      </div>
    );
  }

  const isEnded = !isLive;
  const isTyping = thinking || !!streamingText;

  return (
    <div className="chat-container">
      <div className="chat-header-bar">
        <span className="chat-header-title">{activeSession?.name}</span>
        <div className="chat-header-right">
          {isLive && (
            <span className={`chat-header-status ${connected ? 'active' : 'disconnected'}`}>
              {connected ? '연결됨' : '연결 중...'}
            </span>
          )}
          {isEnded && <span className="chat-header-status ended">종료됨</span>}
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !isTyping && (
          <div className="chat-welcome">
            <p>메시지를 입력하여 Claude와 대화를 시작하세요</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={msg.id || `msg-${i}`} role={msg.role} content={msg.content} />
        ))}

        {/* Streaming response */}
        {streamingText && (
          <MessageBubble role="assistant" content={streamingText} isStreaming />
        )}

        {/* Thinking indicator */}
        {thinking && !streamingText && (
          <div className="message assistant">
            <div className="message-avatar">C</div>
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
        {isEnded ? (
          <div className="chat-ended">세션이 종료되었습니다</div>
        ) : (
          <div className="chat-input-wrapper">
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요... (Shift+Enter로 줄바꿈)"
              rows={1}
              disabled={!connected}
            />
            {isTyping ? (
              <button className="btn btn-danger chat-send-btn" onClick={cancelResponse}>
                중지
              </button>
            ) : (
              <button
                className="btn btn-primary chat-send-btn"
                onClick={handleSend}
                disabled={!input.trim() || !connected}
              >
                전송
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
