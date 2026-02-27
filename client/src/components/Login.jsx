import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';

/**
 * Login — authentication page with researcher ID + password form.
 * Includes a small theme toggle in the top-right corner.
 */
export default function Login() {
  const [researcherId, setResearcherId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const { login, register } = useAuth();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!researcherId.trim() || !password.trim()) {
      showToast('Please fill in all fields', 'warning');
      return;
    }
    setLoading(true);
    try {
      if (isRegister) {
        await register(researcherId.trim(), password.trim());
        showToast('Account created · Kyber-512 keypair generated', 'success');
      } else {
        await login(researcherId.trim(), password.trim());
        showToast('Secure session established', 'success');
      }
    } catch (err) {
      showToast(err.message || 'Authentication failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ background: 'var(--bg)' }}>

      {/* Theme toggle — top right corner */}
      <button
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        className="fixed top-4 right-4 w-9 h-9 rounded-lg flex items-center justify-center transition z-50"
        style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      <div className="relative z-10 rounded-xl p-8 w-full max-w-md"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 8px 30px var(--shadow-lg)' }}>

        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🛡️</div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>ByteGuard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Post-Quantum Secure Data Sharing</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="researcherId" className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Researcher ID
            </label>
            <input
              id="researcherId"
              type="text"
              value={researcherId}
              onChange={e => setResearcherId(e.target.value)}
              placeholder="Enter your researcher ID"
              autoFocus
              className="rounded-lg px-3 py-2.5 transition"
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={isRegister ? 'Create a secure password (6+ chars)' : 'Enter your password'}
              className="rounded-lg px-3 py-2.5 transition"
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <button
            type="submit"
            className="w-full font-medium py-2.5 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed mt-2 text-white"
            style={{ background: 'var(--accent)' }}
            disabled={loading}
          >
            {loading
              ? (isRegister ? 'Creating Account...' : 'Authenticating...')
              : (isRegister ? 'Create Account & Generate Keys' : 'Initialize Secure Session')
            }
          </button>
        </form>

        {/* Toggle register / login */}
        <div className="mt-4 text-center">
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-sm transition"
            style={{ color: 'var(--accent-text)' }}
          >
            {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
          </button>
        </div>

        {/* Crypto badges */}
        <div className="mt-6 text-center">
          <div className="flex flex-wrap justify-center gap-2">
            {['AES-256-GCM', 'CRYSTALS-Kyber-512', 'Post-Quantum'].map(tag => (
              <span key={tag}
                className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
