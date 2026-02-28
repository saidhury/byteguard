import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import FileViewer from '../components/modals/FileViewer';

/**
 * History — rich chronological view of all encryption operations.
 * Features: search, filter-by-operation, sort, View File & Timeline buttons,
 * CSV export, bulk clear.  Styled with CSS custom properties.
 */

const OP_BADGE = {
  encrypt:  { icon: 'fa-lock',        bg: 'rgba(16,185,129,0.12)', color: '#10b981', label: 'Encrypted' },
  share:    { icon: 'fa-share-square', bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', label: 'Shared' },
  decrypt:  { icon: 'fa-unlock',       bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'Decrypted' },
  default:  { icon: 'fa-cog',          bg: 'rgba(107,114,128,0.12)',color: '#6b7280', label: 'Other' },
};

export default function History() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterOp, setFilterOp] = useState('all');
  const [sortDir, setSortDir] = useState('desc');
  const [viewFile, setViewFile] = useState(null);
  const [timelineFile, setTimelineFile] = useState(null);
  const [metaCache, setMetaCache] = useState({});
  const { showToast } = useToast();
  const { user } = useAuth();

  const load = async () => {
    setLoading(true);
    try { setItems(await api.getHistory()); }
    catch { showToast('Failed to load history', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  /* ── Delete / Clear ─────────────────────────────── */
  const deleteItem = async (id) => {
    try {
      await api.deleteHistory(id);
      setItems(prev => prev.filter(i => i.id !== id));
      showToast('Entry removed', 'success');
    } catch { showToast('Failed to delete', 'error'); }
  };

  const clearAll = async () => {
    if (!confirm('Clear all history entries? This cannot be undone.')) return;
    try {
      await api.clearHistory();
      setItems([]);
      showToast('History cleared', 'success');
    } catch { showToast('Failed to clear', 'error'); }
  };

  /* ── Filtering + Sorting ────────────────────────── */
  const filtered = useMemo(() => {
    let list = items;
    if (filterOp !== 'all') list = list.filter(i => i.operation === filterOp);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    if (sortDir === 'asc') list = [...list].reverse();
    return list;
  }, [items, filterOp, search, sortDir]);

  const opCounts = useMemo(() => {
    const c = { all: items.length, encrypt: 0, share: 0, decrypt: 0 };
    items.forEach(i => { if (c[i.operation] !== undefined) c[i.operation]++; });
    return c;
  }, [items]);

  /* ── CSV Export ─────────────────────────────────── */
  const exportCSV = () => {
    if (!filtered.length) return;
    const header = 'Name,Original Size,Encrypted Size,Type,Operation,Timestamp\n';
    const rows = filtered.map(i =>
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

  /* ── View File ──────────────────────────────────── */
  const handleView = async (item) => {
    if (!item.fileId) {
      showToast('No linked file — this is an older entry', 'error');
      return;
    }
    try {
      let meta = metaCache[item.fileId];
      if (!meta) {
        meta = await api.getFileMeta(item.fileId);
        setMetaCache(prev => ({ ...prev, [item.fileId]: meta }));
      }
      setViewFile({
        fileId: item.fileId,
        kemPayload: meta.ownerKemCt,
        fileName: item.name,
        contentType: item.contentType || meta.contentType || 'application/octet-stream',
      });
    } catch {
      showToast('Cannot open file — it may have been deleted', 'error');
    }
  };

  const handleTimeline = (item) => {
    if (!item.fileId) {
      showToast('No linked file — this is an older entry', 'error');
      return;
    }
    setTimelineFile({ fileId: item.fileId, ownerId: user?.id });
  };

  /* ── Helpers ────────────────────────────────────── */
  const fmtSize = (b) => {
    if (!b) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  };
  const fmtDate = (d) => new Date(d).toLocaleString();
  const badge = (op) => OP_BADGE[op] || OP_BADGE.default;

  /* ── Render ─────────────────────────────────────── */
  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2 mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <i className="fas fa-history"></i>
            <span>File History</span>
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Record of all encryption &amp; sharing operations
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 text-xs rounded-lg transition disabled:opacity-50"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                  onClick={exportCSV} disabled={!filtered.length}>
            <i className="fas fa-download mr-1"></i> Export CSV
          </button>
          <button className="px-3 py-1.5 text-xs rounded-lg transition disabled:opacity-50"
                  style={{ background: 'var(--error-soft)', color: 'var(--error)', border: '1px solid transparent' }}
                  onClick={clearAll} disabled={!items.length}>
            <i className="fas fa-trash mr-1"></i> Clear All
          </button>
        </div>
      </div>

      {/* Search + Filters Bar */}
      {items.length > 0 && (
        <div className="flex flex-col md:flex-row gap-3 mb-5">
          {/* Search */}
          <div className="relative flex-1">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-xs"
               style={{ color: 'var(--text-muted)' }}></i>
            <input
              type="text"
              placeholder="Search files…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg outline-none transition"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Operation filter pills */}
          <div className="flex gap-1.5 flex-wrap">
            {['all', 'encrypt', 'share', 'decrypt'].map(op => (
              <button
                key={op}
                onClick={() => setFilterOp(op)}
                className="px-3 py-1.5 text-xs rounded-full transition font-medium"
                style={{
                  background: filterOp === op ? 'var(--accent)' : 'var(--surface)',
                  color: filterOp === op ? '#fff' : 'var(--text-secondary)',
                  border: filterOp === op ? 'none' : '1px solid var(--border)',
                }}
              >
                {op === 'all' ? 'All' : badge(op).label}
                <span className="ml-1 opacity-70">({opCounts[op] || 0})</span>
              </button>
            ))}
          </div>

          {/* Sort toggle */}
          <button
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            className="px-3 py-1.5 text-xs rounded-lg transition flex items-center gap-1"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            title={sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
          >
            <i className={`fas fa-sort-amount-${sortDir === 'desc' ? 'down' : 'up'}`}></i>
            {sortDir === 'desc' ? 'Newest' : 'Oldest'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="spinner" />
          <p style={{ color: 'var(--text-muted)' }}>Loading history…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <i className="fas fa-history text-5xl mb-4" style={{ color: 'var(--text-muted)' }}></i>
          <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No encryption history</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Files you encrypt or share will appear here</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <i className="fas fa-search text-4xl mb-4" style={{ color: 'var(--text-muted)' }}></i>
          <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No matching entries</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Try a different search or filter</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const b = badge(item.operation);
            return (
              <div
                key={item.id}
                className="rounded-xl p-4 transition group"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: b.bg }}
                  >
                    <i className={`fas ${b.icon}`} style={{ color: b.color }}></i>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <strong className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        {item.name}
                      </strong>
                      <span
                        className="px-2 py-0.5 rounded-full text-[0.65rem] font-medium shrink-0"
                        style={{ background: b.bg, color: b.color }}
                      >
                        {b.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span><i className="fas fa-file-alt mr-1"></i>{fmtSize(item.originalSize)}</span>
                      <span><i className="fas fa-lock mr-1"></i>{fmtSize(item.encryptedSize)}</span>
                      {item.type && item.type !== 'unknown' && item.type !== 'share' && item.type !== 'group-share' && (
                        <span><i className="fas fa-tag mr-1"></i>{item.type}</span>
                      )}
                      <span><i className="fas fa-clock mr-1"></i>{fmtDate(item.timestamp)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 opacity-60 group-hover:opacity-100 transition">
                    {item.fileId && (
                      <>
                        <button
                          onClick={() => handleView(item)}
                          className="px-2.5 py-1.5 text-xs rounded-lg transition flex items-center gap-1"
                          style={{
                            background: 'var(--accent-soft)',
                            color: 'var(--accent-text)',
                            border: '1px solid var(--border)',
                          }}
                          title="View file"
                        >
                          <i className="fas fa-eye"></i>
                          <span className="hidden sm:inline">View</span>
                        </button>
                        <button
                          onClick={() => handleTimeline(item)}
                          className="px-2.5 py-1.5 text-xs rounded-lg transition flex items-center gap-1"
                          style={{
                            background: 'rgba(139,92,246,0.08)',
                            color: '#8b5cf6',
                            border: '1px solid var(--border)',
                          }}
                          title="Security timeline"
                        >
                          <i className="fas fa-shield-alt"></i>
                          <span className="hidden sm:inline">Timeline</span>
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="px-2 py-1.5 text-xs rounded-lg transition"
                      style={{ color: 'var(--text-muted)', border: '1px solid transparent' }}
                      title="Remove entry"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stats bar */}
      {items.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span><strong>{items.length}</strong> total entries</span>
          <span><strong>{opCounts.encrypt}</strong> encryptions</span>
          <span><strong>{opCounts.share}</strong> shares</span>
          {filtered.length !== items.length && (
            <span>Showing <strong>{filtered.length}</strong> of {items.length}</span>
          )}
        </div>
      )}

      {/* File Viewer modal */}
      {viewFile && (
        <FileViewer
          fileId={viewFile.fileId}
          kemPayload={viewFile.kemPayload}
          fileName={viewFile.fileName}
          contentType={viewFile.contentType}
          ownerId={user?.id}
          onClose={() => setViewFile(null)}
        />
      )}

      {/* Timeline-only viewer modal */}
      {timelineFile && (
        <FileViewer
          fileId={timelineFile.fileId}
          timelineOnly
          ownerId={timelineFile.ownerId}
          onClose={() => setTimelineFile(null)}
        />
      )}
    </div>
  );
}
