import { create } from 'zustand';
import { api } from '../api/client.js';
import { useThemeStore } from './themeStore.js';

export const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  loading: true,

  init: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const { user } = await api.me();
      useThemeStore.getState().syncTheme(user?.theme);
      set({ user, token, loading: false });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, loading: false });
    }
  },

  login: async (email, password) => {
    const { user, token } = await api.login({ email, password });
    localStorage.setItem('token', token);
    useThemeStore.getState().syncTheme(user?.theme);
    set({ user, token });
  },

  register: async (email, password, displayName) => {
    const { user, token } = await api.register({ email, password, displayName });
    localStorage.setItem('token', token);
    useThemeStore.getState().syncTheme(user?.theme);
    set({ user, token });
  },

  logout: async () => {
    try { await api.logout(); } catch {}
    localStorage.removeItem('token');
    set({ user: null, token: null });
  },

  setAvatarUrl: (avatarUrl) => {
    set((state) => ({ user: { ...state.user, avatarUrl } }));
  }
}));
