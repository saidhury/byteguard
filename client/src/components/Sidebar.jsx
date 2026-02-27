import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Navigation items shown in the sidebar */
const navItems = [
  { to: '/', icon: 'fas fa-lock', label: 'Encryption Lab' },
  { to: '/history', icon: 'fas fa-history', label: 'File History' },
  { to: '/shared', icon: 'fas fa-share-square', label: 'Shared Files' },
  { to: '/received', icon: 'fas fa-inbox', label: 'Received Files' },
  { to: '/groups', icon: 'fas fa-users', label: 'Groups' },
  { to: '/access', icon: 'fas fa-key', label: 'Access Control' },
  { to: '/settings', icon: 'fas fa-cog', label: 'Settings' },
];

/**
 * Sidebar — fixed left-hand navigation.
 * Colours are driven entirely by CSS custom properties.
 */
export default function Sidebar({ open, onClose }) {
  const { logout } = useAuth();

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 w-64 flex flex-col z-50 transition-transform duration-300 ${
        open ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}
      style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
    >
      {/* ── Brand header ──────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-4"
           style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <i className="fas fa-shield-alt text-2xl" style={{ color: 'var(--accent)' }}></i>
          <div>
            <span className="font-bold text-sm block" style={{ color: 'var(--text-primary)' }}>ByteGuard</span>
            <span className="text-[0.65rem] block" style={{ color: 'var(--text-muted)' }}>Post-Quantum Secure</span>
          </div>
        </div>
        <button
          className="lg:hidden text-lg"
          style={{ color: 'var(--text-muted)' }}
          onClick={onClose}
          aria-label="Close menu"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>

      {/* ── Nav links ─────────────────────────────────── */}
      <nav className="flex-1 p-2 overflow-y-auto flex flex-col gap-0.5">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all`
            }
            style={({ isActive }) => ({
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              color: isActive ? 'var(--accent-text)' : 'var(--text-secondary)',
              fontWeight: isActive ? 600 : 400,
            })}
            onClick={onClose}
          >
            <i className={`${item.icon} text-base w-6 text-center`}></i>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* ── Footer ────────────────────────────────────── */}
      <div className="p-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 text-[0.65rem]" style={{ color: 'var(--text-muted)' }}>
          <span className="w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
          <span>PQC Secured · AES-256-GCM</span>
        </div>
        <button
          className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition"
          style={{
            background: 'var(--error-soft)',
            color: 'var(--error)',
            border: '1px solid transparent',
          }}
          onClick={logout}
        >
          <i className="fas fa-sign-out-alt"></i>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
