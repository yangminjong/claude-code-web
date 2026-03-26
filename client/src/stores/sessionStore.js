import { create } from 'zustand';
import { api } from '../api/client.js';

export const useSessionStore = create((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],         // active path messages (with sibling info)
  messagesTotal: 0,
  messageTree: [],      // full tree (all messages)
  branchSelections: [], // active branch selections
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

  syncCliSessions: async () => {
    try {
      await api.syncCliSessions();
      await get().fetchSessions();
    } catch {}
  },

  createSession: async (name, workMode = 'server', projectPath = 'default', sshProfileId = null) => {
    const { session } = await api.createSession({ name, workMode, projectPath, sshProfileId });
    set((s) => ({ sessions: [session, ...s.sessions] }));
    return session;
  },

  setActiveSession: async (id) => {
    set({ activeSessionId: id, messages: [], messagesTotal: 0, messageTree: [], branchSelections: [] });
    if (id) {
      try {
        // Load active path (primary view)
        const { messages } = await api.getActivePath(id);
        set({ messages, messagesTotal: messages.length });

        // Load full tree for worktree panel
        const { tree, selections } = await api.getMessageTree(id);
        set({ messageTree: tree, branchSelections: selections });
      } catch {
        // Fallback to legacy flat loading
        try {
          const { messages, total } = await api.getMessages(id);
          set({ messages, messagesTotal: total });
        } catch {}
      }
    }
  },

  // Set activeSessionId without clearing messages (for auto-create flow)
  activateSession: (id) => {
    set({ activeSessionId: id });
  },

  // Reload active path and tree after branch changes
  reloadMessages: async () => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    try {
      const { messages } = await api.getActivePath(activeSessionId);
      set({ messages, messagesTotal: messages.length });

      const { tree, selections } = await api.getMessageTree(activeSessionId);
      set({ messageTree: tree, branchSelections: selections });
    } catch {}
  },

  // Switch branch at a fork point
  switchBranch: async (parentMessageId, branchIndex) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    try {
      const { messages } = await api.setBranch(activeSessionId, parentMessageId, branchIndex);
      set({ messages, messagesTotal: messages.length });

      // Reload tree to update selections
      const { tree, selections } = await api.getMessageTree(activeSessionId);
      set({ messageTree: tree, branchSelections: selections });
    } catch {}
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
    try { await api.deleteSession(id); } catch {}
    await api.deleteSessionPermanently(id);
    set((s) => ({
      sessions: s.sessions.filter(sess => sess.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
      messages: s.activeSessionId === id ? [] : s.messages
    }));
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

  // Replace the last assistant message (for regenerate)
  replaceLastAssistant: (msg) => {
    set((s) => {
      const msgs = [...s.messages];
      // Find last assistant message and replace
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], ...msg };
          return { messages: msgs };
        }
      }
      return { messages: [...msgs, msg] };
    });
  },

  loadMoreMessages: async (page) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    const { messages, total } = await api.getMessages(activeSessionId, page);
    set((s) => ({ messages: [...messages, ...s.messages], messagesTotal: total }));
  }
}));
