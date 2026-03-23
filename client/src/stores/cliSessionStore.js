import { create } from 'zustand';
import { api } from '../api/client.js';

export const useCliSessionStore = create((set, get) => ({
  sessions: [],
  stats: null,
  loading: false,
  searchQuery: '',
  selectedSession: null,

  fetchSessions: async (params = {}) => {
    set({ loading: true });
    const minDelay = new Promise(r => setTimeout(r, 600));
    try {
      const query = get().searchQuery;
      const [, { sessions }] = await Promise.all([
        minDelay,
        api.getCliSessions({ ...params, find: query || undefined })
      ]);
      set({ sessions, loading: false });
    } catch (err) {
      await minDelay;
      console.error('[cliSessionStore] fetchSessions error:', err.message);
      set({ loading: false });
    }
  },

  fetchStats: async (refresh = false) => {
    try {
      const stats = await api.getCliSessionStats(refresh);
      set({ stats });
    } catch (err) {
      console.error('[cliSessionStore] fetchStats error:', err.message);
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  setSelectedSession: (session) => {
    set({ selectedSession: session });
  }
}));
