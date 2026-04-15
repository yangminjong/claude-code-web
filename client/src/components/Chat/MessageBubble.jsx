import React from 'react';
import CodeBlock from './CodeBlock.jsx';
import ClaudeAvatar from './ClaudeAvatar.jsx';
import UserAvatar from './UserAvatar.jsx';

function parseContent(text) {
  const parts = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', language: match[1] || 'text', content: match[2] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
}

export default function MessageBubble({
  role, content, isStreaming,
  messageId, siblingCount, siblingIndex, parentMessageId,
  onRegenerate, onSwitchBranch
}) {
  const parts = parseContent(content);
  const hasBranches = siblingCount > 1;

  // Find the user message ID for regenerate
  // For assistant messages, the parentMessageId points to the user message
  const userMsgIdForRegen = role === 'assistant' ? parentMessageId : null;

  return (
    <div className={`message ${role}`}>
      <div className="message-avatar">
        {role === 'user' ? <UserAvatar size={32} /> : <ClaudeAvatar size={32} isAnimated={!!isStreaming} />}
      </div>
      <div className="message-body">
        <div className={`message-bubble ${isStreaming ? 'streaming' : ''}`}>
          {parts.map((part, i) =>
            part.type === 'code' ? (
              <CodeBlock key={i} language={part.language} code={part.content} />
            ) : (
              <div key={i} className="message-text">
                {part.content.split('\n').map((line, j) => (
                  <React.Fragment key={j}>
                    {line}
                    {j < part.content.split('\n').length - 1 && <br />}
                  </React.Fragment>
                ))}
              </div>
            )
          )}
        </div>

        {/* Branch navigator + Regenerate button */}
        {!isStreaming && role === 'assistant' && (hasBranches || onRegenerate) && (
          <div className="message-branch-bar">
            {hasBranches && (
              <div className="branch-navigator">
                <button
                  className="branch-nav-btn"
                  disabled={siblingIndex <= 0}
                  onClick={() => onSwitchBranch?.(parentMessageId, siblingIndex - 1)}
                  title="이전 분기"
                >
                  ◀
                </button>
                <span className="branch-nav-label">
                  {siblingIndex + 1} / {siblingCount}
                </span>
                <button
                  className="branch-nav-btn"
                  disabled={siblingIndex >= siblingCount - 1}
                  onClick={() => onSwitchBranch?.(parentMessageId, siblingIndex + 1)}
                  title="다음 분기"
                >
                  ▶
                </button>
              </div>
            )}
            {onRegenerate && userMsgIdForRegen && (
              <button
                className="regenerate-btn"
                onClick={() => onRegenerate(userMsgIdForRegen)}
                title="다른 응답 생성"
              >
                ↻ 재생성
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
