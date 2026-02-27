import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import ShareModal from '../components/modals/ShareModal';

/**
 * SharedFiles — lists files the current user has shared.
 * Colours use CSS custom properties for light/dark theme awareness.
 */
export default function SharedFiles() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try { setItems(await api.getShared()); }
    catch { showToast('Failed to load shared files', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const revoke = async (id) => {
    try {
      await api.revokeShare(id);
      setItems(prev => prev.filter(i => i.id !== id));
      showToast('Access revoked', 'success');
    } catch { showToast('Failed to revoke', 'error'); }
  };

  const onShared = (item) => {
    setItems(prev => [item, ...prev]);
    setShowShareModal(false);
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    showToast('Share code copied', 'success');
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2 mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <i className="fas fa-share-square"></i>
            <span>Shared Files</span>
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Files you've shared with other researchers</p>
        </div>
        <button
          className="px-4 py-2 text-white text-sm font-medium rounded-lg transition"
          style={{ background: 'var(--accent)' }}
          onClick={() => setShowShareModal(true)}
        >
          <i className="fas fa-plus mr-1"></i>
          Share File
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="spinner" />
          <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <i className="fas fa-share-square text-5xl mb-4" style={{ color: 'var(--text-muted)' }}></i>
          <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No shared files</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Share encrypted files using the button above</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map(item => (
            <div key={item.id} className="surface-card transition group">
              <div className="flex items-start gap-3 mb-3">
                <i className="fas fa-file text-2xl" style={{ color: 'var(--accent)' }}></i>
                <div className="min-w-0 flex-1">
                  <strong className="text-sm block truncate" style={{ color: 'var(--text-primary)' }}>{item.fileName}</strong>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>To: {item.recipientName || item.recipient}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="px-2 py-0.5 rounded-full text-xs"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
                  {item.permission || 'view'}
                </span>
                <button
                  className="px-2 py-0.5 rounded-full text-xs transition cursor-pointer flex items-center gap-1"
                  style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
                  onClick={() => copyCode(item.shareCode)}
                  title="Click to copy"
                >
                  <i className="fas fa-key"></i>
                  {item.shareCode}
                </button>
              </div>
              <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {new Date(item.createdAt || item.timestamp).toLocaleDateString()}
                </span>
                <button
                  className="px-3 py-1 text-xs rounded-lg transition flex items-center gap-1"
                  style={{ background: 'var(--error-soft)', color: 'var(--error)', border: '1px solid transparent' }}
                  onClick={() => revoke(item.id)}
                >
                  <i className="fas fa-times"></i>
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showShareModal && <ShareModal onClose={() => setShowShareModal(false)} onShared={onShared} />}
    </div>
  );
}
