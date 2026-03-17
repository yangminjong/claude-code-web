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

export default function MessageBubble({ role, content, isStreaming }) {
  const parts = parseContent(content);

  return (
    <div className={`message ${role}`}>
      <div className="message-avatar">
        {role === 'user' ? <UserAvatar size={32} /> : <ClaudeAvatar size={32} />}
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
      </div>
    </div>
  );
}
