'use client';

import { useEffect, useRef, useState } from 'react';
import { AuthControls } from './AuthProvider';
import { ThemeToggle } from './ThemeToggle';

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="settings-menu" ref={menuRef}>
      <button
        type="button"
        className="settings-menu__trigger"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open settings"
        title="Settings"
      >
        <span aria-hidden="true">⚙</span>
      </button>
      {open && (
        <div className="settings-menu__popover" role="menu" aria-label="Settings">
          <p className="settings-menu__heading">Settings</p>
          <div className="settings-menu__section" role="none">
            <ThemeToggle embedded />
          </div>
          <div className="settings-menu__section" role="none">
            <p className="settings-menu__label">Access</p>
            <AuthControls embedded />
          </div>
        </div>
      )}
    </div>
  );
}
