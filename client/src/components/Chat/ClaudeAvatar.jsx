import React from 'react';

const BASE_URL = '/assets/image';

export default function ClaudeAvatar({ size = 32, isAnimated = false }) {
  const src = isAnimated ? `${BASE_URL}/chatbarq.gif` : `${BASE_URL}/chat.png`;

  return (
    <div
      className="claude-avatar"
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: 'transparent'
      }}
    >
      <img
        src={src}
        alt="Claude"
        style={{
          width: size,
          height: size,
          objectFit: 'cover'
        }}
      />
    </div>
  );
}
