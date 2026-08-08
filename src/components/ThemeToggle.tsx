'use client';

import { useTheme } from './ThemeProvider';

export function ThemeToggle({ embedded = false }: { embedded?: boolean } = {}) {
  const { theme, ready, toggleTheme } = useTheme();
  if (!ready) return null;

  const isDark = theme === 'dark';

  if (embedded) {
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

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="theme-toggle__icon" aria-hidden="true">{isDark ? '☀' : '☾'}</span>
      <span className="theme-toggle__label">{isDark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}
