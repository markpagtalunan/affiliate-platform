export type ThemeId = 'klook' | 'ocean' | 'teal' | 'dark';

export const THEMES: { id: ThemeId; label: string; swatch: string }[] = [
  { id: 'klook', label: 'Orange (Klook style)', swatch: '#ff5b00' },
  { id: 'ocean', label: 'Ocean Blue', swatch: '#1d5fd6' },
  { id: 'teal', label: 'LakbayHub Teal', swatch: '#0e6b63' },
  { id: 'dark', label: 'Dark', swatch: '#232323' },
];

const KEY = 'ap-theme';

export function getTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY) as ThemeId | null;
    if (v && THEMES.some((t) => t.id === v)) return v;
  } catch {
    /* storage unavailable */
  }
  return 'klook';
}

export function setTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable */
  }
}

// apply as soon as the module is loaded so the first paint is themed
document.documentElement.dataset.theme = getTheme();
