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

        /* Step 5 — create a blob URL with the correct MIME type */
        const mime = contentType || 'application/octet-stream';
        const blob = new Blob([plaintext], { type: mime });
        const url  = URL.createObjectURL(blob);
        setBlobUrl(url + '#t=' + Date.now());
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
        const raw = blobUrl.split('#')[0];
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
    <div className="fixed inset-0 z-[300] flex flex-col animate-fade-in"
         style={{ background: 'var(--overlay)' }}>

      {/* ── Header bar ──────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3"
           style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <i className="fas fa-file text-lg" style={{ color: 'var(--accent)' }}></i>
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
              <i className="fas fa-download"></i>
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
            <i className="fas fa-times mr-1"></i>
            Close
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

        {/* Error fallback */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
                 style={{ background: 'var(--error-soft)' }}>
              <i className="fas fa-exclamation-triangle text-2xl" style={{ color: 'var(--error)' }}></i>
            </div>
            <div>
              <h4 className="font-semibold mb-1" style={{ color: 'var(--error)' }}>Unable to View File</h4>
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

        {/* PDF viewer */}
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
            <i className="fas fa-file text-5xl" style={{ color: 'var(--text-muted)' }}></i>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Preview not available for this file type
            </p>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              <i className="fas fa-download"></i>
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
      .catch(() => setText('Failed to load text content'));
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
