import { create } from 'zustand';

export const themes = {
  dark: {
    name: 'Dark',
    label: '다크',
    vars: {
      '--bg-primary': '#0d1117',
      '--bg-secondary': '#161b22',
      '--bg-tertiary': '#21262d',
      '--bg-hover': '#30363d',
      '--border': '#30363d',
      '--text-primary': '#e6edf3',
      '--text-secondary': '#8b949e',
      '--text-muted': '#6e7681',
      '--accent': '#58a6ff',
      '--accent-hover': '#79c0ff',
      '--success': '#3fb950',
      '--warning': '#d29922',
      '--danger': '#f85149',
      '--user-bubble': '#1f6feb',
      '--assistant-bubble': '#21262d',
    }
  },
  dimmed: {
    name: 'Dimmed',
    label: '다크 (소프트)',
    vars: {
      '--bg-primary': '#1c2128',
      '--bg-secondary': '#22272e',
      '--bg-tertiary': '#2d333b',
      '--bg-hover': '#373e47',
      '--border': '#373e47',
      '--text-primary': '#cdd9e5',
      '--text-secondary': '#768390',
      '--text-muted': '#636e7b',
      '--accent': '#539bf5',
      '--accent-hover': '#6cb6ff',
      '--success': '#57ab5a',
      '--warning': '#c69026',
      '--danger': '#e5534b',
      '--user-bubble': '#316dca',
      '--assistant-bubble': '#2d333b',
    }
  },
  light: {
    name: 'Light',
    label: '라이트',
    vars: {
      '--bg-primary': '#ffffff',
      '--bg-secondary': '#f6f8fa',
      '--bg-tertiary': '#eef1f5',
      '--bg-hover': '#e2e6ea',
      '--border': '#d1d9e0',
      '--text-primary': '#1f2328',
      '--text-secondary': '#59636e',
      '--text-muted': '#818b98',
      '--accent': '#0969da',
      '--accent-hover': '#0550ae',
      '--success': '#1a7f37',
      '--warning': '#9a6700',
      '--danger': '#d1242f',
      '--user-bubble': '#0969da',
      '--assistant-bubble': '#f6f8fa',
    }
  },
  solarized: {
    name: 'Solarized',
    label: '솔라라이즈드',
    vars: {
      '--bg-primary': '#fdf6e3',
      '--bg-secondary': '#eee8d5',
      '--bg-tertiary': '#e4ddc8',
      '--bg-hover': '#d6ceb5',
      '--border': '#d3cbb7',
      '--text-primary': '#073642',
      '--text-secondary': '#586e75',
      '--text-muted': '#93a1a1',
      '--accent': '#268bd2',
      '--accent-hover': '#1a6da0',
      '--success': '#859900',
      '--warning': '#b58900',
      '--danger': '#dc322f',
      '--user-bubble': '#268bd2',
      '--assistant-bubble': '#eee8d5',
    }
  },
  nord: {
    name: 'Nord',
    label: '노드',
    vars: {
      '--bg-primary': '#2e3440',
      '--bg-secondary': '#3b4252',
      '--bg-tertiary': '#434c5e',
      '--bg-hover': '#4c566a',
      '--border': '#4c566a',
      '--text-primary': '#eceff4',
      '--text-secondary': '#d8dee9',
      '--text-muted': '#7b88a1',
      '--accent': '#88c0d0',
      '--accent-hover': '#8fbcbb',
      '--success': '#a3be8c',
      '--warning': '#ebcb8b',
      '--danger': '#bf616a',
      '--user-bubble': '#5e81ac',
      '--assistant-bubble': '#3b4252',
    }
  },
  monokai: {
    name: 'Monokai',
    label: '모노카이',
    vars: {
      '--bg-primary': '#272822',
      '--bg-secondary': '#2e2f28',
      '--bg-tertiary': '#3e3d32',
      '--bg-hover': '#4e4d42',
      '--border': '#4e4d42',
      '--text-primary': '#f8f8f2',
      '--text-secondary': '#c0bfb5',
      '--text-muted': '#75715e',
      '--accent': '#66d9ef',
      '--accent-hover': '#a6e7f5',
      '--success': '#a6e22e',
      '--warning': '#e6db74',
      '--danger': '#f92672',
      '--user-bubble': '#ae81ff',
      '--assistant-bubble': '#2e2f28',
    }
  },
};

function applyTheme(themeId) {
  const theme = themes[themeId];
  if (!theme) return;
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value);
  }
}

const savedTheme = localStorage.getItem('theme') || 'dark';
applyTheme(savedTheme);

export const useThemeStore = create((set) => ({
  theme: savedTheme,

  setTheme: (themeId) => {
    if (!themes[themeId]) return;
    localStorage.setItem('theme', themeId);
    applyTheme(themeId);
    set({ theme: themeId });
  }
}));
