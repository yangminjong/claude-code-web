import { create } from 'zustand';
import { api } from '../api/client.js';

export const useExplorerStore = create((set, get) => ({
  open: true,
  collapsed: false,
  width: 280,
  tree: null,           // { name, path, isDirectory, children, isLoaded }
  expandedPaths: new Set(),
  selectedPath: null,
  loadingPaths: new Set(),

  // 컨텍스트 메뉴
  contextMenu: null,     // { x, y, node }
  // 생성 중 상태
  creatingIn: null,      // 부모 디렉토리 경로
  creatingType: null,    // 'file' | 'directory'
  // 이름 변경 상태
  renamingPath: null,

  toggleOpen: () => set(s => ({ open: !s.open })),
  setOpen: (open) => set({ open }),
  toggleCollapsed: () => set(s => ({ collapsed: !s.collapsed })),
  setWidth: (width) => set({ width: Math.max(200, Math.min(600, width)) }),
  setSelectedPath: (path) => set({ selectedPath: path }),

  showContextMenu: (x, y, node) => set({ contextMenu: { x, y, node } }),
  hideContextMenu: () => set({ contextMenu: null }),

  startCreating: (parentPath, type) => {
    // 부모 폴더를 확장
    const { expandedPaths } = get();
    const newExpanded = new Set(expandedPaths);
    if (parentPath !== '.') newExpanded.add(parentPath);
    set({ creatingIn: parentPath, creatingType: type, expandedPaths: newExpanded });

    // 부모 폴더가 아직 로드 안 됐으면 로드
    if (parentPath !== '.') {
      const node = get()._findNode(parentPath);
      if (node && !node.isLoaded) {
        get().toggleExpand(parentPath);
      }
    }
  },
  stopCreating: () => set({ creatingIn: null, creatingType: null }),
  isCreatingIn: (path) => get().creatingIn === path,

  setRenamingPath: (path) => set({ renamingPath: path }),

  // 루트 디렉토리 로드
  loadRoot: async () => {
    try {
      const { items } = await api.listFiles('.');
      const children = items
        .sort((a, b) => (b.isDirectory - a.isDirectory) || a.name.localeCompare(b.name))
        .map(item => ({
          name: item.name,
          path: item.name,
          isDirectory: item.isDirectory,
          size: item.size,
          modifiedAt: item.modifiedAt,
          children: item.isDirectory ? [] : null,
          isLoaded: false,
        }));
      set({
        tree: { name: 'workspace', path: '.', isDirectory: true, children, isLoaded: true },
      });
    } catch (err) {
      console.error('Failed to load root:', err);
    }
  },

  // 디렉토리 확장/접기
  toggleExpand: async (path) => {
    const { expandedPaths, loadingPaths } = get();
    const newExpanded = new Set(expandedPaths);

    if (newExpanded.has(path)) {
      newExpanded.delete(path);
      set({ expandedPaths: newExpanded });
      return;
    }

    newExpanded.add(path);
    set({ expandedPaths: newExpanded });

    // 이미 로드된 디렉토리면 그냥 확장
    const node = get()._findNode(path);
    if (node && node.isLoaded) return;

    // 로딩 시작
    const newLoading = new Set(loadingPaths);
    newLoading.add(path);
    set({ loadingPaths: newLoading });

    try {
      const { items } = await api.listFiles(path);
      const children = items
        .sort((a, b) => (b.isDirectory - a.isDirectory) || a.name.localeCompare(b.name))
        .map(item => ({
          name: item.name,
          path: path === '.' ? item.name : `${path}/${item.name}`,
          isDirectory: item.isDirectory,
          size: item.size,
          modifiedAt: item.modifiedAt,
          children: item.isDirectory ? [] : null,
          isLoaded: false,
        }));

      set(s => ({
        tree: s._updateNode(s.tree, path, { children, isLoaded: true }),
        loadingPaths: (() => { const l = new Set(s.loadingPaths); l.delete(path); return l; })(),
      }));
    } catch (err) {
      console.error('Failed to load directory:', err);
      set(s => {
        const l = new Set(s.loadingPaths); l.delete(path);
        const e = new Set(s.expandedPaths); e.delete(path);
        return { loadingPaths: l, expandedPaths: e };
      });
    }
  },

  // 새로고침 (전체 트리 리로드)
  refresh: async () => {
    const { expandedPaths } = get();
    await get().loadRoot();

    // 확장되어 있던 폴더들을 다시 로드
    for (const path of expandedPaths) {
      if (path === '.') continue;
      try {
        const { items } = await api.listFiles(path);
        const children = items
          .sort((a, b) => (b.isDirectory - a.isDirectory) || a.name.localeCompare(b.name))
          .map(item => ({
            name: item.name,
            path: path === '.' ? item.name : `${path}/${item.name}`,
            isDirectory: item.isDirectory,
            size: item.size,
            modifiedAt: item.modifiedAt,
            children: item.isDirectory ? [] : null,
            isLoaded: false,
          }));
        set(s => ({
          tree: s._updateNode(s.tree, path, { children, isLoaded: true }),
        }));
      } catch {
        // 삭제된 폴더는 무시
      }
    }
  },

  collapseAll: () => set({ expandedPaths: new Set() }),

  // 내부 헬퍼: 경로로 노드 찾기
  _findNode: (path) => {
    const { tree } = get();
    if (!tree) return null;
    if (path === '.') return tree;

    const parts = path.split('/');
    let node = tree;
    for (const part of parts) {
      if (!node.children) return null;
      node = node.children.find(c => c.name === part);
      if (!node) return null;
    }
    return node;
  },

  // 내부 헬퍼: 노드 업데이트 (immutable)
  _updateNode: (tree, path, updates) => {
    if (!tree) return tree;
    if (path === '.') return { ...tree, ...updates };

    const parts = path.split('/');
    const updateRecursive = (node, depth) => {
      if (depth === parts.length) return { ...node, ...updates };
      if (!node.children) return node;
      return {
        ...node,
        children: node.children.map(child =>
          child.name === parts[depth] ? updateRecursive(child, depth + 1) : child
        ),
      };
    };
    return updateRecursive(tree, 0);
  },
}));
