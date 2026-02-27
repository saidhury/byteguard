import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../api/client';

/**
 * AccessControl — dashboard for managing active shares, viewing
 * summary statistics, and listing security protocols.
 * All colours use CSS custom properties for light / dark support.
 */
export default function AccessControl() {
  const [shared, setShared] = useState([]);
  const [received, setReceived] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    Promise.all([api.getShared(), api.getReceived(), api.listGroups()])
      .then(([s, r, g]) => { setShared(s); setReceived(r); setGroups(g); })
      .catch(() => showToast('Failed to load data', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const revoke = async (id) => {
    try {
      await api.revokeShare(id);
      setShared(prev => prev.filter(i => i.id !== id));
      showToast('Access revoked', 'success');
    } catch { showToast('Failed to revoke', 'error'); }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    showToast('Share code copied', 'success');
  };

  /* ---------- Loading state ---------- */
  if (loading) return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="spinner" />
      <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
    </div>
  );

  /* ---------- Summary cards ---------- */
  const stats = [
    { label: 'Active Shares', value: shared.length },
    { label: 'Received',      value: received.length },
    { label: 'Groups',        value: groups.length },
    { label: 'Unread',        value: received.filter(r => !r.viewed).length },
    { label: 'Security',      value: 'PQC' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>🔑 Access Control</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Manage file permissions and access rights</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats.map(s => (
          <div key={s.label} className="surface-card text-center">
            <span className="block text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
            <span className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Active permissions table */}
      <section className="surface-card mb-6">
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Active Permissions</h3>
        {shared.length === 0 ? (
          <p className="py-4" style={{ color: 'var(--text-muted)' }}>No active shares</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {['File', 'Recipient', 'Code', ''].map((h, i) => (
                    <th key={h || i}
                        className={`text-left px-3 py-2 text-[0.65rem] uppercase tracking-wider ${i === 2 ? 'hidden md:table-cell' : ''}`}
                        style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shared.map(s => (
                  <tr key={s.id} className="transition">
                    <td className="px-3 py-2 max-w-[160px] truncate" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>{s.fileName}</td>
                    <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{s.recipientName || s.recipient}</td>
                    <td className="px-3 py-2 hidden md:table-cell" style={{ borderBottom: '1px solid var(--border)' }}>
                      <button className="font-mono text-xs hover:underline" style={{ color: 'var(--success)' }} onClick={() => copyCode(s.shareCode)}>
                        {s.shareCode}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right" style={{ borderBottom: '1px solid var(--border)' }}>
                      <button className="px-3 py-1 text-xs rounded-lg transition"
                              style={{ background: 'var(--error-soft)', color: 'var(--error)', border: '1px solid transparent' }}
                              onClick={() => revoke(s.id)}>
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Security protocols */}
      <section className="surface-card">
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Security Protocols</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { label: 'Symmetric Cipher',  value: 'AES-256-GCM',               icon: '🔐' },
            { label: 'Key Encapsulation', value: 'CRYSTALS-Kyber-512 (ML-KEM)', icon: '🔑' },
            { label: 'Hash Function',     value: 'SHA-256 (WebCrypto)',         icon: '🧬' },
            { label: 'Key Storage',       value: 'Browser IndexedDB (local)',   icon: '💾' },
          ].map(p => (
            <div key={p.label} className="flex items-center gap-3 p-3 rounded-lg"
                 style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
              <span className="text-xl">{p.icon}</span>
              <div>
                <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{p.label}</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.value}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
