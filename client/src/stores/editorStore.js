import { create } from 'zustand';
import { api } from '../api/client.js';

// 텍스트 편집 가능한 확장자
const TEXT_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'json', 'html', 'htm', 'css', 'scss', 'less',
  'md', 'markdown', 'txt', 'py', 'rb', 'java', 'c', 'cpp', 'h', 'hpp',
  'go', 'rs', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'sql', 'xml', 'svg', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf',
  'env', 'gitignore', 'dockerignore', 'dockerfile', 'makefile',
  'editorconfig', 'eslintrc', 'prettierrc', 'babelrc',
  'lock', 'log', 'csv', 'tsv', 'graphql', 'gql',
  'vue', 'svelte', 'astro', 'php', 'lua', 'r', 'swift', 'kt', 'kts',
  'dart', 'ex', 'exs', 'erl', 'hrl', 'hs', 'ml', 'mli',
  'tf', 'hcl', 'prisma', 'proto',
]);

// 확장자 → Monaco 언어 ID
const LANG_MAP = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  json: 'json', jsonc: 'json',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', markdown: 'markdown',
  py: 'python',
  rb: 'ruby',
  java: 'java',
  c: 'c', h: 'c',
  cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cxx: 'cpp',
  go: 'go',
  rs: 'rust',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql',
  xml: 'xml', svg: 'xml',
  yml: 'yaml', yaml: 'yaml',
  toml: 'ini', ini: 'ini', cfg: 'ini',
  dockerfile: 'dockerfile',
  graphql: 'graphql', gql: 'graphql',
  php: 'php',
  lua: 'lua',
  r: 'r',
  swift: 'swift',
  kt: 'kotlin', kts: 'kotlin',
  dart: 'dart',
};

export function isTextFile(filename) {
  const name = filename.toLowerCase();
  // 확장자 없는 특수 파일
  const baseName = name.split('/').pop();
  if (['makefile', 'dockerfile', '.gitignore', '.dockerignore', '.editorconfig', '.eslintrc', '.prettierrc', '.babelrc', '.env'].includes(baseName)) {
    return true;
  }
  const ext = name.split('.').pop();
  return TEXT_EXTENSIONS.has(ext);
}

export function getLanguage(filename) {
  const name = filename.toLowerCase();
  const baseName = name.split('/').pop();
  if (baseName === 'dockerfile') return 'dockerfile';
  if (baseName === 'makefile') return 'makefile';
  const ext = name.split('.').pop();
  return LANG_MAP[ext] || 'plaintext';
}

export const useEditorStore = create((set, get) => ({
  // 열린 탭 목록: [{ path, name, content, originalContent, language, loading, error }]
  tabs: [],
  activeTabPath: null,

  // 에디터 활성 여부 (true면 중앙 영역에 에디터 표시)
  isEditorActive: false,

  openFile: async (path, name) => {
    const { tabs } = get();

    // 이미 열려있으면 탭만 활성화
    const existing = tabs.find(t => t.path === path);
    if (existing) {
      set({ activeTabPath: path, isEditorActive: true });
      return;
    }

    // 새 탭 추가 (로딩 상태)
    const language = getLanguage(name);
    const newTab = { path, name, content: '', originalContent: '', language, loading: true, error: null };
    set({
      tabs: [...tabs, newTab],
      activeTabPath: path,
      isEditorActive: true,
    });

    // 파일 내용 로드
    try {
      const { content } = await api.readFileContent(path);
      set(s => ({
        tabs: s.tabs.map(t =>
          t.path === path ? { ...t, content, originalContent: content, loading: false } : t
        ),
      }));
    } catch (err) {
      set(s => ({
        tabs: s.tabs.map(t =>
          t.path === path ? { ...t, loading: false, error: err.message } : t
        ),
      }));
    }
  },

  closeTab: (path) => {
    const { tabs, activeTabPath } = get();
    const idx = tabs.findIndex(t => t.path === path);
    const newTabs = tabs.filter(t => t.path !== path);

    let newActive = activeTabPath;
    if (activeTabPath === path) {
      if (newTabs.length === 0) {
        newActive = null;
      } else if (idx >= newTabs.length) {
        newActive = newTabs[newTabs.length - 1].path;
      } else {
        newActive = newTabs[idx].path;
      }
    }

    set({
      tabs: newTabs,
      activeTabPath: newActive,
      isEditorActive: newTabs.length > 0,
    });
  },

  setActiveTab: (path) => {
    set({ activeTabPath: path, isEditorActive: true });
  },

  updateContent: (path, content) => {
    set(s => ({
      tabs: s.tabs.map(t =>
        t.path === path ? { ...t, content } : t
      ),
    }));
  },

  saveFile: async (path) => {
    const { tabs } = get();
    const tab = tabs.find(t => t.path === path);
    if (!tab || tab.content === tab.originalContent) return;

    try {
      await api.writeFileContent(path, tab.content);
      set(s => ({
        tabs: s.tabs.map(t =>
          t.path === path ? { ...t, originalContent: tab.content } : t
        ),
      }));
      return true;
    } catch (err) {
      throw err;
    }
  },

  isDirty: (path) => {
    const tab = get().tabs.find(t => t.path === path);
    return tab ? tab.content !== tab.originalContent : false;
  },

  // 채팅으로 돌아가기
  showChat: () => {
    set({ isEditorActive: false });
  },

  // 탭에서 파일이 외부에서 삭제/이름변경 된 경우 정리
  closeTabsForPath: (path) => {
    const { tabs } = get();
    const toClose = tabs.filter(t => t.path === path || t.path.startsWith(path + '/'));
    toClose.forEach(t => get().closeTab(t.path));
  },
}));
