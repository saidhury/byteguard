import React from 'react';
import { useTheme } from '../context/ThemeContext';

/**
 * TopBar — top navigation bar with hamburger (mobile), branding,
 * light/dark toggle, quantum-safe badge, and profile button.
 */
export default function TopBar({ user, onMenuToggle, onProfileClick }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 backdrop-blur-xl"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* ── Mobile hamburger ──────────────────────────── */}
      <button
        className="flex flex-col gap-1 p-1.5 lg:hidden"
        onClick={onMenuToggle}
        aria-label="Toggle menu"
      >
        <span className="block w-5 h-0.5 rounded-sm" style={{ background: 'var(--text-muted)' }} />
        <span className="block w-5 h-0.5 rounded-sm" style={{ background: 'var(--text-muted)' }} />
        <span className="block w-5 h-0.5 rounded-sm" style={{ background: 'var(--text-muted)' }} />
      </button>

      {/* ── Mobile brand ──────────────────────────────── */}
      <div className="flex items-center gap-2 font-bold text-sm lg:hidden"
           style={{ color: 'var(--text-primary)' }}>
        <i className="fas fa-shield-alt" style={{ color: 'var(--accent)' }}></i>
        <span>ByteGuard</span>
      </div>
      <div className="hidden lg:block" />

      {/* ── Right-side actions ────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Quantum-safe badge */}
        <span className="hidden md:flex items-center gap-1.5 text-xs"
              style={{ color: 'var(--success)' }}>
          <span className="w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
          Quantum Safe
        </span>

        {/* ── Light / Dark toggle ─────────────────────── */}
        <button
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          className="relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
          style={{ border: '1px solid var(--border)', background: 'var(--surface-secondary)' }}
        >
          {/* Sun icon — visible in dark mode */}
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute transition-all duration-300"
            style={{
              color: 'var(--warning)',
              opacity: theme === 'dark' ? 1 : 0,
              transform: theme === 'dark' ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0)',
            }}
          >
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          {/* Moon icon — visible in light mode */}
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute transition-all duration-300"
            style={{
              color: 'var(--accent2)',
              opacity: theme === 'light' ? 1 : 0,
              transform: theme === 'light' ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0)',
            }}
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>

        {/* ── Profile pill ────────────────────────────── */}
        <button
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 cursor-pointer transition"
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
          onClick={onProfileClick}
        >
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ background: 'var(--accent)' }}>
            {user?.researcherId?.charAt(0)?.toUpperCase() || 'R'}
          </span>
          <span className="text-xs hidden md:inline">{user?.researcherId || 'Researcher'}</span>
        </button>
      </div>
    </header>
  );
}
