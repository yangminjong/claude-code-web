import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore.js';

export function useAuth() {
  const { user, token, loading, init, login, register, verifyEmail, resendVerification, logout } = useAuthStore();

  useEffect(() => {
    init();
  }, []);

  return { user, token, loading, isAuthenticated: !!user, login, register, verifyEmail, resendVerification, logout };
}
