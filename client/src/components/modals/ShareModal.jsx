import React, { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import {
  wrapAESKeyWithKyber, unwrapAESKeyWithKyber,
  uint8ToBase64, base64ToUint8
} from '../../crypto/pqc';
import { getKyberKeypair } from '../../crypto/keyStore';

/**
 * ShareModal — select a file, search for a recipient, choose a
 * permission level, then Kyber-KEM-wrap an AES-256 key and share.
 * Themed with CSS custom properties for light / dark support.
 */
export default function ShareModal({ onClose, onShared }) {
  const [myFiles, setMyFiles] = useState([]);
  const [fileId, setFileId] = useState('');
  const [recipientQuery, setRecipientQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [permission, setPermission] = useState('download');
  const [sending, setSending] = useState(false);
  const { showToast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    api.myFiles().then(setMyFiles).catch(() => {});
  }, []);

  /* Debounced recipient search */
  useEffect(() => {
    if (recipientQuery.trim().length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(() => {
      api.searchUsers(recipientQuery.trim()).then(setSearchResults).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [recipientQuery]);

  const submit = async (e) => {
    e.preventDefault();
    if (!fileId || !selectedRecipient) {
      showToast('Select a file and recipient', 'warning');
      return;
    }
    if (!selectedRecipient.hasKyberKey) {
      showToast('Recipient has no Kyber public key', 'error');
      return;
    }

    setSending(true);
    try {
      /* ── Step 1: recover the original AES key from owner's KEM payload ── */
      const selectedFile = myFiles.find(f => String(f.id) === String(fileId));
      const ownerKemCtB64 = selectedFile?.ownerKemCt;
      if (!ownerKemCtB64) {
        throw new Error('This file has no stored owner key — please re-encrypt it first.');
      }

      const kp = await getKyberKeypair(user.researcherId);
      if (!kp) throw new Error('No Kyber keypair found — please re-login.');

      const ownerKemFull   = base64ToUint8(ownerKemCtB64);
      const ownerKemCipher = ownerKemFull.slice(0, ownerKemFull.length - 32);
      const ownerWrapped   = ownerKemFull.slice(ownerKemFull.length - 32);
      const aesKeyBytes    = await unwrapAESKeyWithKyber(ownerKemCipher, ownerWrapped, kp.privateKey);

      /* ── Step 2: wrap the SAME AES key for the recipient ── */
      const { kyberPublicKey: recipPKb64 } = await api.getPublicKey(selectedRecipient.researcherId);
      const recipientPK = base64ToUint8(recipPKb64);
      const { kemCiphertext, wrappedKey } = await wrapAESKeyWithKyber(aesKeyBytes, recipientPK);
      const combined = new Uint8Array(kemCiphertext.length + wrappedKey.length);
      combined.set(kemCiphertext, 0);
      combined.set(wrappedKey, kemCiphertext.length);
      const kemPayloadB64 = uint8ToBase64(combined);

      const result = await api.shareFile({
        fileId: Number(fileId),
        recipientId: selectedRecipient.researcherId,
        kemCiphertext: kemPayloadB64,
        permission,
      });

      showToast(`File shared! Code: ${result.shareCode}`, 'success');
      onShared(result);
    } catch (err) {
      showToast(err.message || 'Sharing failed', 'error');
    } finally {
      setSending(false);
    }
  };

  /* ---- Shared inline-style helpers ---- */
  const inputStyle = {
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in"
         style={{ background: 'var(--overlay)' }} onClick={onClose}>
      <div className="rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scale-in"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <i className="fas fa-share-square"></i>
            Share Encrypted File
          </h3>
          <button style={{ color: 'var(--text-muted)' }} onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <form onSubmit={submit} className="p-5 flex flex-col gap-4">
          {/* File select */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>File</label>
            <select value={fileId} onChange={e => setFileId(e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm outline-none transition"
                    style={inputStyle}>
              <option value="">Select an encrypted file…</option>
              {myFiles.map(f => <option key={f.id} value={f.id}>{f.fileName}</option>)}
            </select>
          </div>

          {/* Recipient search */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Recipient</label>
            {selectedRecipient ? (
              <div className="flex items-center justify-between rounded-lg px-3 py-2"
                   style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--accent-text)' }}>{selectedRecipient.researcherId}</span>
                  {selectedRecipient.hasKyberKey && (
                    <span className="ml-2 text-xs flex items-center gap-1" style={{ color: 'var(--success)' }}>
                      <i className="fas fa-key"></i> Kyber key
                    </span>
                  )}
                </div>
                <button type="button" className="text-sm"
                        style={{ color: 'var(--text-muted)' }}
                        onClick={() => { setSelectedRecipient(null); setRecipientQuery(''); }}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            ) : (
              <>
                <input type="text" value={recipientQuery}
                       onChange={e => setRecipientQuery(e.target.value)}
                       placeholder="Search researcher ID..."
                       className="rounded-lg px-3 py-2 text-sm outline-none transition"
                       style={inputStyle} />
                {searchResults.length > 0 && (
                  <div className="rounded-lg max-h-40 overflow-y-auto"
                       style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
                    {searchResults.map(u => (
                      <button key={u.id} type="button"
                              className="w-full text-left px-3 py-2 text-sm transition flex justify-between"
                              style={{ color: 'var(--text-secondary)' }}
                              onClick={() => { setSelectedRecipient(u); setSearchResults([]); }}>
                        <span>{u.researcherId}</span>
                        {u.hasKyberKey && <span className="text-xs" style={{ color: 'var(--success)' }}><i className="fas fa-key"></i></span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Permission */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Permission</label>
            <select value={permission} onChange={e => setPermission(e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm outline-none transition"
                    style={inputStyle}>
              <option value="view">View Only</option>
              <option value="download">Download</option>
              <option value="full">Full Access</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="px-4 py-2 rounded-lg text-sm transition"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                    onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg text-sm text-white transition disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}
                    disabled={sending}>
              {sending ? 'Encrypting & Sharing…' : (
                <>
                  <i className="fas fa-lock mr-1"></i>
                  Share with Kyber KEM
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
