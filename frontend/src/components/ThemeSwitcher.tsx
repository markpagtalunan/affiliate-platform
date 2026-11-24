import { useState } from 'react';
import { getTheme, setTheme, THEMES, type ThemeId } from '../lib/theme';

export default function ThemeSwitcher() {
  const [current, setCurrent] = useState<ThemeId>(getTheme());
  const pick = (id: ThemeId) => {
    setTheme(id);
    setCurrent(id);
  };
  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`theme-dot${current === t.id ? ' on' : ''}`}
          aria-pressed={current === t.id}
          aria-label={t.label}
          title={t.label}
          onClick={() => pick(t.id)}
        >
          <span style={{ background: t.swatch }} />
        </button>
      ))}
    </div>
  );
}
