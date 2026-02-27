import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import ReceiveModal from '../components/modals/ReceiveModal';
import FileViewer from '../components/modals/FileViewer';

/**
 * ReceivedFiles — tabbed view of individually-shared and group-shared files.
 * All colours use CSS custom properties for theme support.
 */
export default function ReceivedFiles() {
  const [items, setItems] = useState([]);
  const [groupFiles, setGroupFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showReceive, setShowReceive] = useState(false);
  const [viewFile, setViewFile] = useState(null);
  const [activeTab, setActiveTab] = useState('individual');
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [received, gFiles] = await Promise.all([
        api.getReceived(),
        api.listGroupSharedFiles()
      ]);
      setItems(received);
      setGroupFiles(gFiles);
    } catch { showToast('Failed to load received files', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onReceived = () => {
    load();
    setShowReceive(false);
    showToast('File decrypted & downloaded', 'success');
  };

  const handleView = (fileId, kemCiphertext, fileName, contentType) => {
    setViewFile({ fileId, kemPayload: kemCiphertext, fileName, contentType });
  };

  const tabs = [
    { key: 'individual', label: '📤 Direct Shares', count: items.length },
    { key: 'group', label: '👥 Group Shares', count: groupFiles.length },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2 mb-6">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>📥 Received Files</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Encrypted files shared with you</p>
        </div>
        <button
          className="px-4 py-2 text-white text-sm font-medium rounded-lg transition"
          style={{ background: 'var(--accent)' }}
          onClick={() => setShowReceive(true)}
        >
          + Receive File
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className="px-4 py-2 rounded-lg text-sm font-medium transition"
            style={{
              background: activeTab === tab.key ? 'var(--accent-soft)' : 'var(--surface)',
              color: activeTab === tab.key ? 'var(--accent-text)' : 'var(--text-secondary)',
              border: `1px solid ${activeTab === tab.key ? 'var(--accent)' : 'var(--border)'}`,
            }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            <span className="ml-2 px-1.5 py-0.5 rounded-full text-[0.6rem]"
                  style={{ background: 'var(--surface-secondary)' }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="spinner" />
          <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
        </div>
      ) : activeTab === 'individual' ? (
        items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">📥</span>
            <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No received files</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Enter a share code to decrypt files sent to you</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map(item => (
              <div key={item.id} className="surface-card rounded-xl p-4 transition">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-2xl">📄</span>
                  <div className="min-w-0 flex-1">
                    <strong className="text-sm block truncate" style={{ color: 'var(--text-primary)' }}>{item.fileName}</strong>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>From: {item.senderName}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
                    {item.permission || 'view'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--surface-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    Kyber-512 KEM
                  </span>
                </div>
                <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(item.createdAt).toLocaleDateString()}</span>
                  <button
                    className="px-3 py-1 text-xs rounded-lg transition"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '1px solid transparent' }}
                    onClick={() => handleView(item.fileId, item.kemCiphertext, item.fileName, item.contentType)}
                  >
                    👁️ View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        groupFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">👥</span>
            <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No group-shared files</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Files shared with your groups will appear here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {groupFiles.map(item => (
              <div key={item.id} className="surface-card rounded-xl p-4 transition">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-2xl">📄</span>
                  <div className="min-w-0 flex-1">
                    <strong className="text-sm block truncate" style={{ color: 'var(--text-primary)' }}>{item.fileName}</strong>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Group: {item.groupName}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--accent2-soft)', color: 'var(--accent2)' }}>
                    👥 Group
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--surface-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    Kyber-512 KEM
                  </span>
                </div>
                <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(item.createdAt).toLocaleDateString()}</span>
                  {item.myKemCiphertext ? (
                    <button
                      className="px-3 py-1 text-xs rounded-lg transition"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '1px solid transparent' }}
                      onClick={() => handleView(item.fileId, item.myKemCiphertext, item.fileName, item.contentType)}
                    >
                      👁️ View
                    </button>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No KEM key for you</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {showReceive && <ReceiveModal onClose={() => setShowReceive(false)} onReceived={onReceived} />}
      {viewFile && (
        <FileViewer
          fileId={viewFile.fileId}
          kemPayload={viewFile.kemPayload}
          fileName={viewFile.fileName}
          contentType={viewFile.contentType}
          onClose={() => setViewFile(null)}
        />
      )}
    </div>
  );
}
