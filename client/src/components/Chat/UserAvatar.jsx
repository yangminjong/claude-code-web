import React from 'react';
import { useAuthStore } from '../../stores/authStore.js';

export default function UserAvatar({ size = 32 }) {
  const user = useAuthStore((s) => s.user);
  const avatarUrl = user?.avatarUrl;
  const initial = (user?.displayName || user?.email || 'U')[0].toUpperCase();

  if (avatarUrl) {
    const src = avatarUrl.startsWith('/') ? avatarUrl : `/api/auth/avatar/${avatarUrl}`;
    return (
      <img
        className="user-avatar-img"
        src={src}
        alt={user?.displayName || 'User'}
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          objectFit: 'cover',
          flexShrink: 0
        }}
      />
    );
  }

  return (
    <div
      className="user-avatar-initial"
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: 'var(--user-bubble)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 700,
        flexShrink: 0
      }}
    >
      {initial}
    </div>
  );
}
