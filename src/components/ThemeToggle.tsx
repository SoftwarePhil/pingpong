'use client';

import { useTheme } from './ThemeProvider';

/** Light/dark switch shown in the settings menu. */
export function ThemeToggle() {
  const { theme, ready, toggleTheme } = useTheme();
  if (!ready) return null;

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className="settings-menu__action"
      onClick={toggleTheme}
      aria-pressed={isDark}
    >
      <span className="settings-menu__action-icon" aria-hidden="true">{isDark ? '☀' : '☾'}</span>
      <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}
