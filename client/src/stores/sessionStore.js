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

  deleteSessionPermanently: async (id) => {
    // End session first if active, then permanently delete on server
    try { await api.deleteSession(id); } catch {}
    await api.deleteSessionPermanently(id);
    // Remove from UI after server confirms deletion
    set((s) => ({
      sessions: s.sessions.filter(sess => sess.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
      messages: s.activeSessionId === id ? [] : s.messages
    }));
  },

  resumeSession: async (id) => {
    const { session } = await api.resumeSession(id);
    set((s) => ({
      sessions: s.sessions.map(sess =>
        sess.id === id ? session : sess
      ),
      activeSessionId: id
    }));
    return session;
  },

  renameSession: (id, name) => {
    set((s) => ({
      sessions: s.sessions.map(sess =>
        sess.id === id ? { ...sess, name } : sess
      )
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
