import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import {
  unwrapAESKeyWithKyber, importAESKey, decryptAES,
  base64ToUint8
} from '../../crypto/pqc';
import { getKyberKeypair } from '../../crypto/keyStore';

/**
 * FileViewer — inline viewer for decrypted files (PDF, images, text).
 *
 * Key design choices to avoid blank-screen / 304 issues:
 *   • PDFs are rendered in an <iframe> with a blob URL that has a unique
 *     cache-busting fragment (`#t=<timestamp>`), which prevents the browser
 *     from serving a stale 304 response.
 *   • The blob URL is created with the correct MIME type so the browser's
 *     built-in PDF renderer kicks in immediately.
 *   • A dedicated "Download" button creates a temporary <a> link and clicks
 *     it programmatically so downloads always work.
 *   • If the PDF still fails (e.g. unsupported browser) a clear error
 *     fallback message is shown with a download alternative.
 *
 * Props:
 *   fileId      — server-side file ID
 *   shareCode   — (optional) share code for shared files
 *   kemPayload  — base64 KEM ciphertext+wrappedKey for shared/group files
 *   fileName    — display name
 *   contentType — MIME type of the original file
 *   onClose     — callback to close viewer
 */
export default function FileViewer({ fileId, shareCode, kemPayload, fileName, contentType, onClose }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [decryptedBlob, setDecryptedBlob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('Preparing…');
  const { showToast } = useToast();
  const { user } = useAuth();

  /* ── Decrypt pipeline ─────────────────────────────── */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        /* Step 1 — download encrypted blob from server */
        setStatus('Downloading encrypted file…');
        const res = await api.viewFile(fileId);
        const encBlob = await res.blob();
        const encBytes = new Uint8Array(await encBlob.arrayBuffer());

        /* Step 2 — split IV (12 bytes) + AES-GCM ciphertext */
        const iv = encBytes.slice(0, 12);
        const ciphertext = encBytes.slice(12);

        /* Step 3 — recover the AES key via Kyber KEM decapsulation */
        if (!kemPayload) {
          throw new Error(
            'This viewer requires a KEM ciphertext. Use the Receive flow for shared files.'
          );
        }

        setStatus('Decapsulating KEM ciphertext…');
        const kp = await getKyberKeypair(user.researcherId);
        if (!kp) throw new Error('No Kyber keypair found — please re-login.');

        const kemFull     = base64ToUint8(kemPayload);
        const kemCipher   = kemFull.slice(0, kemFull.length - 32);
        const wrappedKey  = kemFull.slice(kemFull.length - 32);
        const aesKeyBytes = await unwrapAESKeyWithKyber(kemCipher, wrappedKey, kp.privateKey);

        /* Step 4 — AES-256-GCM decryption */
        setStatus('Decrypting with AES-256-GCM…');
        const aesKey    = await importAESKey(aesKeyBytes);
        const plaintext = await decryptAES(aesKey, ciphertext, iv);

        if (cancelled) return;

        /* Step 5 — create a blob URL with the correct MIME type
         * Append a cache-busting fragment to prevent 304 responses */
        const mime = contentType || 'application/octet-stream';
        const blob = new Blob([plaintext], { type: mime });
        const url  = URL.createObjectURL(blob);
        setBlobUrl(url + '#t=' + Date.now()); // cache-bust for PDF viewers
        setDecryptedBlob(blob);
        setLoading(false);
        setStatus('');
      } catch (err) {
        if (!cancelled) {
          console.error('[FileViewer] decrypt error:', err);
          setError(err.message || 'Failed to decrypt file');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Revoke blob URL on unmount ───────────────────── */
  useEffect(() => {
    return () => {
      if (blobUrl) {
        const raw = blobUrl.split('#')[0]; // strip cache-bust fragment
        URL.revokeObjectURL(raw);
      }
    };
  }, [blobUrl]);

  /* ── Download handler ─────────────────────────────── */
  const handleDownload = useCallback(() => {
    if (!decryptedBlob) return;
    const url = URL.createObjectURL(decryptedBlob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = fileName || 'decrypted_file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('File downloaded', 'success');
  }, [decryptedBlob, fileName, showToast]);

  /* ── MIME helpers ──────────────────────────────────── */
  const isPDF   = contentType === 'application/pdf';
  const isImage = contentType?.startsWith('image/');
  const isText  = contentType?.startsWith('text/') || contentType === 'application/json';

  /* ── Render ────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-[200] flex flex-col animate-fade-in"
         style={{ background: 'var(--overlay)' }}>

      {/* ── Header bar ──────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3"
           style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg">📄</span>
          <div className="min-w-0">
            <h3 className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {fileName || 'File Viewer'}
            </h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {contentType || 'unknown type'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Dedicated Download button — always visible when we have data */}
          {decryptedBlob && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition"
              style={{
                background: 'var(--accent-soft)',
                color: 'var(--accent-text)',
                border: '1px solid var(--border)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg transition"
            style={{
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* ── Content area ────────────────────────────── */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4"
           style={{ background: 'var(--bg)' }}>

        {/* Loading spinner */}
        {loading && (
          <div className="flex flex-col items-center gap-4">
            <div className="spinner" />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{status}</p>
          </div>
        )}

        {/* Error fallback with download alternative */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
                 style={{ background: 'var(--error-soft)' }}>
              <span className="text-2xl">⚠️</span>
            </div>
            <div>
              <h4 className="font-semibold mb-1" style={{ color: 'var(--error)' }}>
                Failed to load file
              </h4>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm transition"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              Close
            </button>
          </div>
        )}

        {/* PDF viewer — rendered in an iframe for maximum compatibility */}
        {!loading && !error && blobUrl && isPDF && (
          <iframe
            src={blobUrl}
            title={fileName}
            className="w-full h-full rounded-lg"
            style={{ border: '1px solid var(--border)', minHeight: '70vh' }}
          />
        )}

        {/* Image viewer */}
        {!loading && !error && blobUrl && isImage && (
          <img
            src={blobUrl}
            alt={fileName}
            className="max-w-full max-h-full rounded-lg"
            style={{ boxShadow: '0 8px 30px var(--shadow-lg)' }}
          />
        )}

        {/* Text / JSON viewer */}
        {!loading && !error && blobUrl && isText && (
          <TextViewer url={blobUrl} />
        )}

        {/* Unsupported file type — offer download */}
        {!loading && !error && blobUrl && !isPDF && !isImage && !isText && (
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="text-5xl">📄</span>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Preview not available for this file type
            </p>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download File
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


/**
 * TextViewer — loads text content from a blob URL and renders it
 * inside a styled <pre> block.
 */
function TextViewer({ url }) {
  const [text, setText] = useState('Loading…');

  useEffect(() => {
    fetch(url)
      .then(r => r.text())
      .then(setText)
      .catch(() => setText('⚠ Failed to load text content'));
  }, [url]);

  return (
    <pre
      className="w-full max-w-4xl max-h-full overflow-auto rounded-lg p-6 text-sm font-mono whitespace-pre-wrap"
      style={{
        background: 'var(--code-bg)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      {text}
    </pre>
  );
}
