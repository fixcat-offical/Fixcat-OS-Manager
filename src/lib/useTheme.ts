import { useEffect, useState } from 'react';

export type PanelTheme = 'cobalt' | 'black' | 'panel';

const STORAGE_KEY = 'fom-theme';
const DEFAULT_THEME: PanelTheme = 'panel';

const THEME_BY_ATTR: Record<string, PanelTheme> = {
  cobalt: 'cobalt',
  black: 'black',
  panel: 'panel',
};

function readTheme(): PanelTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (stored === 'cobalt' || stored === 'black' || stored === 'panel')) return stored;
  } catch {
    /* noop */
  }
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr && THEME_BY_ATTR[attr]) return THEME_BY_ATTR[attr];
  return DEFAULT_THEME;
}

export function useTheme() {
  const [theme, setTheme] = useState<PanelTheme>(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theming');
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* noop */
    }
    const t = window.setTimeout(() => root.classList.remove('theming'), 300);
    return () => window.clearTimeout(t);
  }, [theme]);

  return { theme, setTheme };
}