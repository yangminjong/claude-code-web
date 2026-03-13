import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore.js';

export function useAuth() {
  const { user, token, loading, init, login, register, logout } = useAuthStore();

  useEffect(() => {
    init();
  }, []);

  return { user, token, loading, isAuthenticated: !!user, login, register, logout };
}
