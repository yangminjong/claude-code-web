import { create } from 'zustand';
import { api } from '../api/client.js';

export const useSessionStore = create((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  messagesTotal: 0,
  loading: false,

  fetchSessions: async () => {
    set({ loading: true });
    try {
      const { sessions } = await api.getSessions();
      set({ sessions, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createSession: async (name, workMode = 'server', projectPath = 'default', sshProfileId = null) => {
    const { session } = await api.createSession({ name, workMode, projectPath, sshProfileId });
    set((s) => ({ sessions: [session, ...s.sessions] }));
    return session;
  },

  setActiveSession: async (id) => {
    set({ activeSessionId: id, messages: [], messagesTotal: 0 });
    if (id) {
      try {
        const { messages, total } = await api.getMessages(id);
        set({ messages, messagesTotal: total });
      } catch {}
    }
  },

  deleteSession: async (id) => {
    await api.deleteSession(id);
    set((s) => ({
      sessions: s.sessions.map(sess =>
        sess.id === id ? { ...sess, status: 'ended' } : sess
      ),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId
    }));
  },

  addMessage: (msg) => {
    set((s) => ({ messages: [...s.messages, msg] }));
  },

  loadMoreMessages: async (page) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    const { messages, total } = await api.getMessages(activeSessionId, page);
    set((s) => ({ messages: [...messages, ...s.messages], messagesTotal: total }));
  }
}));
