import { create } from 'zustand';
import { api } from '../api/client.js';

export const useSshProfileStore = create((set) => ({
  profiles: [],
  loading: false,

  fetchProfiles: async () => {
    set({ loading: true });
    try {
      const { profiles } = await api.getSshProfiles();
      set({ profiles, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createProfile: async (data) => {
    const { profile } = await api.createSshProfile(data);
    set((s) => ({ profiles: [profile, ...s.profiles] }));
    return profile;
  },

  updateProfile: async (id, data) => {
    const { profile } = await api.updateSshProfile(id, data);
    set((s) => ({
      profiles: s.profiles.map(p => p.id === id ? profile : p)
    }));
    return profile;
  },

  deleteProfile: async (id) => {
    await api.deleteSshProfile(id);
    set((s) => ({ profiles: s.profiles.filter(p => p.id !== id) }));
  },

  testProfile: async (id) => {
    return await api.testSshProfile(id);
  }
}));
