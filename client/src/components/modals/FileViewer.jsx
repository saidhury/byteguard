import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import {
  unwrapAESKeyWithKyber, importAESKey, decryptAES,
  generateAESKey, exportAESKey, encryptAES,
  wrapAESKeyWithKyber, uint8ToBase64, base64ToUint8
} from '../../crypto/pqc';
import { getKyberKeypair } from '../../crypto/keyStore';

/**
 * FileViewer — inline viewer for decrypted files (PDF, images, text).
 *
 * Props:
 *   fileId       — server-side file ID
 *   shareCode    — (optional) share code for shared files
 *   kemPayload   — base64 KEM ciphertext+wrappedKey for shared/group files
 *   fileName     — display name
 *   contentType  — MIME type of the original file
 *   onClose      — callback to close viewer
 *   timelineOnly — (optional) if true, skip decryption, show only timeline tab
 *   ownerId      — (optional) owner user ID for ownership detection
 */
export default function FileViewer({ fileId, shareCode, kemPayload, fileName, contentType, onClose, timelineOnly, ownerId }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [decryptedBlob, setDecryptedBlob] = useState(null);
  const [loading, setLoading] = useState(!timelineOnly);
  const [error, setError] = useState(null);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [status, setStatus] = useState(timelineOnly ? '' : 'Preparing…');
  const [activeTab, setActiveTab] = useState(timelineOnly ? 'timeline' : 'viewer');
  const [isOwner, setIsOwner] = useState(false);
  const { showToast } = useToast();
  const { user } = useAuth();

  /* ── Determine file ownership ─────────────────────── */
  useEffect(() => {
    // If ownerId is explicitly passed, compare directly
    if (ownerId != null && user?.id != null) {
      setIsOwner(Number(ownerId) === Number(user.id));
      return;
    }
    // Otherwise fetch file metadata to check ownership
    (async () => {
      try {
        const meta = await api.getFileMeta(fileId);
        setIsOwner(meta.ownerId === user?.id);
      } catch {
        // If access denied on meta, user is likely not owner
        setIsOwner(false);
      }
    })();
  }, [fileId, user, ownerId]);

  /* ── Decrypt pipeline (skipped in timelineOnly mode) ── */
  useEffect(() => {
    if (timelineOnly) return; // No decryption needed
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
  }, [fileId, timelineOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Revoke blob URL on unmount ───────────────────── */
  useEffect(() => {
    return () => {
      if (blobUrl) {
        const raw = blobUrl.split('#')[0];
        URL.revokeObjectURL(raw);
      }
    };
  }, [blobUrl]);

  /* ── Periodic access check (non-owner recipients) ── */
  useEffect(() => {
    // Only poll for non-owners who already have the file decrypted & displayed.
    // Skip while still loading (isOwner starts false and gets resolved async)
    if (timelineOnly || isOwner || accessRevoked || loading) return;
    // Only start polling once decryption has actually succeeded
    if (!blobUrl) return;

    const CHECK_INTERVAL = 10_000; // 10 seconds

    const check = async () => {
      try {
        await api.getFileMeta(fileId);
        // 200 → still has access, do nothing
      } catch (err) {
        // 403 or 404 → access revoked
        if (err?.status === 403 || err?.status === 404) {
          // Wipe decrypted content from memory
          if (blobUrl) {
            const raw = blobUrl.split('#')[0];
            URL.revokeObjectURL(raw);
          }
          setBlobUrl(null);
          setDecryptedBlob(null);
          setAccessRevoked(true);
          showToast('Your access to this file has been revoked', 'error');
        }
      }
    };

    const timer = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(timer);
  }, [fileId, timelineOnly, isOwner, accessRevoked, loading, blobUrl, showToast]);

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
  const tabs = timelineOnly
    ? [{ key: 'timeline', label: 'Security & Access Timeline', icon: 'fa-shield-alt' }]
    : [
        { key: 'viewer', label: 'File Viewer', icon: 'fa-eye' },
        { key: 'timeline', label: 'Security & Access Timeline', icon: 'fa-shield-alt' },
      ];

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
          {decryptedBlob && activeTab === 'viewer' && !accessRevoked && (
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

      {/* ── Tab bar ─────────────────────────────────── */}
      <div className="flex gap-0 px-4"
           style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors relative"
            style={{
              color: activeTab === t.key ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activeTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            <i className={`fas ${t.icon}`}></i>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content area ────────────────────────────── */}
      {activeTab === 'viewer' && (
        <div className="flex-1 overflow-auto flex items-center justify-center p-4"
             style={{ background: 'var(--bg)' }}>

          {/* Access revoked overlay */}
          {accessRevoked && (
            <div className="flex flex-col items-center gap-4 text-center max-w-md animate-fade-in">
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                   style={{ background: 'rgba(239, 68, 68, 0.12)' }}>
                <i className="fas fa-user-slash text-3xl" style={{ color: '#ef4444' }}></i>
              </div>
              <div>
                <h4 className="text-lg font-semibold mb-1" style={{ color: '#ef4444' }}>Access Revoked</h4>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  The file owner has revoked your access. The decrypted content has been securely wiped from your browser.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-lg text-sm font-medium transition"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Close
              </button>
            </div>
          )}

          {/* Loading spinner */}
          {loading && !accessRevoked && (
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
      )}

      {activeTab === 'timeline' && (
        <div className="flex-1 overflow-auto p-4" style={{ background: 'var(--bg)' }}>
          <TimelinePanel fileId={fileId} isOwner={isOwner} />
        </div>
      )}
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


/* ── Event type display config ─────────────────────── */
const EVENT_CONFIG = {
  FILE_UPLOADED:     { icon: 'fa-cloud-upload-alt', color: 'var(--accent)',  label: 'File Uploaded' },
  FILE_SHARED_USER:  { icon: 'fa-user-plus',        color: '#3b82f6',       label: 'Shared with User' },
  FILE_SHARED_GROUP: { icon: 'fa-users',             color: '#8b5cf6',       label: 'Shared with Group' },
  ACCESS_REVOKED:    { icon: 'fa-user-slash',         color: '#ef4444',       label: 'Access Revoked' },
  FILE_VIEWED:       { icon: 'fa-eye',                color: '#10b981',       label: 'File Viewed' },
  KEYS_ROTATED:      { icon: 'fa-sync-alt',           color: '#f59e0b',       label: 'Keys Rotated' },
};

function eventSummary(evt) {
  const meta = evt.metadata || {};
  switch (evt.eventType) {
    case 'FILE_SHARED_USER':
      return meta.recipient_name ? `Shared with ${meta.recipient_name}` : `Shared with user #${meta.recipient_id}`;
    case 'FILE_SHARED_GROUP':
      return meta.group_name ? `Shared with group "${meta.group_name}"` : `Shared with group #${meta.group_id}`;
    case 'ACCESS_REVOKED':
      return `Revoked access for user #${meta.revoked_user_id}`;
    case 'FILE_VIEWED':
      return meta.action === 'download' ? 'File downloaded' : 'File viewed inline';
    case 'KEYS_ROTATED':
      return `File re-encrypted; ${meta.remaining_users_count ?? 0} user(s) re-keyed`;
    default:
      return '';
  }
}


/**
 * performKeyRotation — client-side key rotation for revoking a user.
 *
 * 1. Download the current encrypted blob
 * 2. Decrypt with the owner's Kyber private key
 * 3. Generate a fresh AES-256 key
 * 4. Re-encrypt the plaintext
 * 5. Wrap the new key for the owner + every *remaining* user
 * 6. POST everything to /rotate-keys
 */
async function performKeyRotation(fileId, revokedUserId, showToast) {
  // Step 0 — Fetch file metadata (to get ownerKemCt, etc.)
  showToast?.('Rotating keys — fetching file info…', 'info');
  const meta = await api.getFileMeta(fileId);
  const ownerKemCt = meta.ownerKemCt;   // base64 owner KEM payload
  const ownerResearcherId = meta.ownerResearcherId || meta.researcherId;

  // Step 1 — Get owner's Kyber keypair from IndexedDB
  const kp = await getKyberKeypair(ownerResearcherId);
  if (!kp) throw new Error('No Kyber keypair found — please re-login.');

  // Step 2 — Download encrypted blob
  showToast?.('Downloading encrypted file…', 'info');
  const res = await api.viewFile(fileId);
  const encBlob = await res.blob();
  const encBytes = new Uint8Array(await encBlob.arrayBuffer());

  // Step 3 — Decrypt with current key
  showToast?.('Decrypting with current key…', 'info');
  const iv = encBytes.slice(0, 12);
  const ciphertext = encBytes.slice(12);

  const kemFull     = base64ToUint8(ownerKemCt);
  const kemCipher   = kemFull.slice(0, kemFull.length - 32);
  const wrappedKey  = kemFull.slice(kemFull.length - 32);
  const aesKeyBytes = await unwrapAESKeyWithKyber(kemCipher, wrappedKey, kp.privateKey);
  const aesKey      = await importAESKey(aesKeyBytes);
  const plaintext   = await decryptAES(aesKey, ciphertext, iv);

  // Step 4 — Generate new AES key & re-encrypt
  showToast?.('Re-encrypting with new key…', 'info');
  const newAesKey   = await generateAESKey();
  const newKeyBytes = await exportAESKey(newAesKey);
  const encrypted   = await encryptAES(newAesKey, plaintext);
  const newIvBytes  = new Uint8Array(encrypted.iv);
  const newCtBytes  = new Uint8Array(encrypted.ciphertext);

  // Combine IV + ciphertext into a single blob (matches upload format)
  const newBlob = new Uint8Array(newIvBytes.length + newCtBytes.length);
  newBlob.set(newIvBytes, 0);
  newBlob.set(newCtBytes, newIvBytes.length);

  // Step 5 — Wrap new key for owner
  showToast?.('Wrapping key for owner & remaining users…', 'info');
  const ownerWrap = await wrapAESKeyWithKyber(newKeyBytes, kp.publicKey);
  const ownerPayload = new Uint8Array(ownerWrap.kemCiphertext.length + ownerWrap.wrappedKey.length);
  ownerPayload.set(ownerWrap.kemCiphertext, 0);
  ownerPayload.set(ownerWrap.wrappedKey, ownerWrap.kemCiphertext.length);
  const ownerKemB64 = uint8ToBase64(ownerPayload);

  // Step 6 — Wrap new key for each remaining user
  const accessList = await api.getFileAccessList(fileId);
  const sharedKems = {};
  for (const entry of accessList) {
    if (Number(entry.userId) === Number(revokedUserId)) continue; // skip revoked user
    try {
      const pubKeyData = await api.getPublicKey(entry.researcherId);
      const pubKeyBytes = base64ToUint8(pubKeyData.kyberPublicKey);
      const wrap = await wrapAESKeyWithKyber(newKeyBytes, pubKeyBytes);
      const payload = new Uint8Array(wrap.kemCiphertext.length + wrap.wrappedKey.length);
      payload.set(wrap.kemCiphertext, 0);
      payload.set(wrap.wrappedKey, wrap.kemCiphertext.length);
      sharedKems[String(entry.userId)] = uint8ToBase64(payload);
    } catch (err) {
      console.warn(`Could not wrap key for user ${entry.userId}:`, err);
    }
  }

  // Step 7 — Build multipart form & send
  showToast?.('Uploading rotated keys…', 'info');
  const fd = new FormData();
  fd.append('file', new Blob([newBlob], { type: 'application/octet-stream' }), 'rotated.enc');
  fd.append('new_iv', uint8ToBase64(newIvBytes));
  fd.append('new_owner_kem_ct', ownerKemB64);
  fd.append('new_shared_kems', JSON.stringify(sharedKems));
  fd.append('revoked_user_id', String(revokedUserId));

  const result = await api.rotateKeys(fileId, fd);
  return result;
}


/**
 * TimelinePanel — displays the audit timeline and manage-access panel
 * for a file. Fetched from the server, no mock data.
 */
function TimelinePanel({ fileId, isOwner }) {
  const [events, setEvents] = useState([]);
  const [accessList, setAccessList] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(true);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const { showToast } = useToast();

  const fetchTimeline = useCallback(async () => {
    try {
      const data = await api.getFileTimeline(fileId);
      setEvents(data);
    } catch (err) {
      console.error('[Timeline] fetch error:', err);
    } finally {
      setLoadingTimeline(false);
    }
  }, [fileId]);

  const fetchAccessList = useCallback(async () => {
    if (!isOwner) return;
    setLoadingAccess(true);
    try {
      const data = await api.getFileAccessList(fileId);
      setAccessList(data);
    } catch (err) {
      console.error('[AccessList] fetch error:', err);
    } finally {
      setLoadingAccess(false);
    }
  }, [fileId, isOwner]);

  useEffect(() => {
    fetchTimeline();
    fetchAccessList();
  }, [fetchTimeline, fetchAccessList]);

  const handleRevoke = async (targetUserId, name) => {
    if (!confirm(`Revoke access for ${name}?\n\nThis will re-encrypt the file with a new key so the revoked user can never decrypt it again.`)) return;
    setRevoking(targetUserId);
    try {
      await performKeyRotation(fileId, targetUserId, showToast);
      showToast(`Access revoked for ${name} — keys rotated`, 'success');
      fetchAccessList();
      fetchTimeline();
    } catch (err) {
      showToast(err.message || 'Key rotation failed', 'error');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* ── Manage Access (owner only) ─────────────── */}
      {isOwner && (
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <i className="fas fa-user-lock" style={{ color: 'var(--accent)' }}></i>
            Manage Access
          </h4>

          {loadingAccess && (
            <p className="text-xs py-3" style={{ color: 'var(--text-muted)' }}>Loading access list…</p>
          )}

          {!loadingAccess && accessList.length === 0 && (
            <p className="text-xs py-3" style={{ color: 'var(--text-muted)' }}>
              No users currently have access to this file.
            </p>
          )}

          {!loadingAccess && accessList.length > 0 && (
            <div className="space-y-2">
              {accessList.map(u => (
                <div key={u.userId}
                     className="flex items-center justify-between py-2 px-3 rounded-lg"
                     style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <i className="fas fa-user-circle text-sm" style={{ color: 'var(--text-muted)' }}></i>
                    <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {u.researcherId}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{
                            background: u.accessType === 'direct' ? 'var(--accent-soft)' : '#8b5cf620',
                            color: u.accessType === 'direct' ? 'var(--accent)' : '#8b5cf6',
                          }}>
                      {u.accessType === 'direct' ? 'Direct' : `Group: ${u.groupName || 'group'}`}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRevoke(u.userId, u.researcherId)}
                    disabled={revoking === u.userId}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition"
                    style={{
                      background: '#ef444415',
                      color: '#ef4444',
                      border: '1px solid #ef444430',
                      opacity: revoking === u.userId ? 0.5 : 1,
                    }}
                  >
                    <i className={`fas ${revoking === u.userId ? 'fa-spinner fa-spin' : 'fa-ban'}`}></i>
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Timeline ───────────────────────────────── */}
      <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h4 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <i className="fas fa-stream" style={{ color: 'var(--accent)' }}></i>
          Access Timeline
        </h4>

        {loadingTimeline && (
          <p className="text-xs py-3" style={{ color: 'var(--text-muted)' }}>Loading timeline…</p>
        )}

        {!loadingTimeline && events.length === 0 && (
          <p className="text-xs py-3" style={{ color: 'var(--text-muted)' }}>No events recorded yet.</p>
        )}

        {!loadingTimeline && events.length > 0 && (
          <div className="relative">
            {/* vertical line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-px" style={{ background: 'var(--border)' }}></div>

            <div className="space-y-4">
              {events.map(evt => {
                const cfg = EVENT_CONFIG[evt.eventType] || { icon: 'fa-circle', color: 'var(--text-muted)', label: evt.eventType };
                return (
                  <div key={evt.id} className="flex items-start gap-3 relative">
                    <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0 z-10"
                         style={{ background: cfg.color + '20', border: `2px solid ${cfg.color}` }}>
                      <i className={`fas ${cfg.icon}`} style={{ color: cfg.color, fontSize: '9px' }}></i>
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {cfg.label}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          by {evt.actor}
                        </span>
                      </div>
                      {eventSummary(evt) && (
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {eventSummary(evt)}
                        </p>
                      )}
                      <time className="text-[10px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>
                        {new Date(evt.timestamp).toLocaleString()}
                      </time>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
