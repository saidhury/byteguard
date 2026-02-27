import React from 'react';
import { useAuth } from '../../context/AuthContext';

/**
 * ProfileModal — displays researcher identity details and a sign-out action.
 * All colours use CSS custom properties for light / dark theme support.
 */
export default function ProfileModal({ onClose }) {
  const { user, logout } = useAuth();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in"
         style={{ background: 'var(--overlay)' }} onClick={onClose}>
      <div className="rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scale-in"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Researcher Profile</h3>
          <button style={{ color: 'var(--text-muted)' }} onClick={onClose}>✕</button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Avatar */}
          <div className="w-18 h-18 mx-auto rounded-full flex items-center justify-center text-3xl font-bold text-white"
               style={{ background: 'var(--accent)' }}>
            {user?.researcherId?.charAt(0)?.toUpperCase() || 'R'}
          </div>

          {/* Details */}
          <div className="flex flex-col gap-3">
            {[
              ['Researcher ID',   user?.researcherId || '—'],
              ['Role',            user?.role || 'Researcher'],
              ['Kyber-512 Key',   user?.hasKyberKey ? '✅ Registered' : '❌ Not set'],
              ['Account Created', user?.createdAt ? new Date(user.createdAt).toLocaleString() : '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center py-2 text-sm last:border-0"
                   style={{ borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
            <div className="flex justify-between items-center py-2 text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Security Clearance</span>
              <span className="px-2 py-0.5 rounded-full text-xs"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
                PQC Level 5
              </span>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="px-4 py-2 rounded-lg text-sm transition"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                  onClick={onClose}>
            Close
          </button>
          <button className="px-4 py-2 rounded-lg text-sm transition"
                  style={{ background: 'var(--error-soft)', color: 'var(--error)', border: '1px solid transparent' }}
                  onClick={logout}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
