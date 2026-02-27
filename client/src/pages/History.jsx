import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../api/client';

/**
 * History — shows a chronological table of encryption operations.
 * Supports CSV export and bulk clear.  Styled with CSS custom properties.
 */
export default function History() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try { setItems(await api.getHistory()); }
    catch { showToast('Failed to load history', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const deleteItem = async (id) => {
    try {
      await api.deleteHistory(id);
      setItems(prev => prev.filter(i => i.id !== id));
      showToast('Entry removed', 'success');
    } catch { showToast('Failed to delete', 'error'); }
  };

  const clearAll = async () => {
    try {
      await api.clearHistory();
      setItems([]);
      showToast('History cleared', 'success');
    } catch { showToast('Failed to clear', 'error'); }
  };

  const exportCSV = () => {
    if (!items.length) return;
    const header = 'Name,Original Size,Encrypted Size,Type,Operation,Timestamp\n';
    const rows = items.map(i =>
      `"${i.name}",${i.originalSize},${i.encryptedSize},${i.type},${i.operation},${i.timestamp}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'encryption-history.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('History exported', 'success');
  };

  const fmtSize = (b) => {
    if (!b) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  };

  const fmtDate = (d) => new Date(d).toLocaleString();

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2 mb-6">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>📋 File History</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Record of all encryption operations</p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 text-xs rounded-lg transition disabled:opacity-50"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                  onClick={exportCSV} disabled={!items.length}>
            📊 Export
          </button>
          <button className="px-3 py-1.5 text-xs rounded-lg transition disabled:opacity-50"
                  style={{ background: 'var(--error-soft)', color: 'var(--error)', border: '1px solid transparent' }}
                  onClick={clearAll} disabled={!items.length}>
            🗑️ Clear All
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="spinner" />
          <p style={{ color: 'var(--text-muted)' }}>Loading history…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-5xl mb-4">📋</span>
          <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No encryption history</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Files you encrypt will appear here</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {['File Name', 'Original', 'Encrypted', 'Operation', 'Date', ''].map((h, idx) => (
                  <th key={h || idx}
                      className={`text-left px-3 py-2 text-[0.65rem] uppercase tracking-wider ${idx >= 1 && idx <= 3 ? 'hidden md:table-cell' : ''}`}
                      style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="transition"
                    style={{ '--tw-bg-opacity': 0 }}>
                  <td className="px-3 py-2 max-w-[200px] truncate" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>{item.name}</td>
                  <td className="px-3 py-2 hidden md:table-cell" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{fmtSize(item.originalSize)}</td>
                  <td className="px-3 py-2 hidden md:table-cell" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{fmtSize(item.encryptedSize)}</td>
                  <td className="px-3 py-2 hidden md:table-cell" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="px-2 py-0.5 rounded-full text-xs"
                          style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
                      {item.operation}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{fmtDate(item.timestamp)}</td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                    <button className="transition" style={{ color: 'var(--text-muted)' }} onClick={() => deleteItem(item.id)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
