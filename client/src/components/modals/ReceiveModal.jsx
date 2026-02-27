import React, { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import {
  unwrapAESKeyWithKyber, importAESKey, decryptAES,
  base64ToUint8
} from '../../crypto/pqc';
import { getKyberKeypair } from '../../crypto/keyStore';

/**
 * ReceiveModal — enter a share code, Kyber-decapsulate the AES key,
 * download the ciphertext, decrypt and save.  Themed with CSS vars.
 */
export default function ReceiveModal({ onClose, onReceived }) {
  const [shareCode, setShareCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const { showToast } = useToast();
  const { user } = useAuth();

  const submit = async (e) => {
    e.preventDefault();
    if (!shareCode.trim()) {
      showToast('Enter a share code', 'warning');
      return;
    }
    setLoading(true);
    try {
      setStatus('Fetching share details…');
      const share = await api.getShareByCode(shareCode.trim().toUpperCase());

      setStatus('Loading Kyber private key…');
      const kp = await getKyberKeypair(user.researcherId);
      if (!kp) throw new Error('No Kyber keypair found. Please re-login to generate keys.');

      setStatus('Decapsulating KEM ciphertext…');
      const kemPayload = base64ToUint8(share.kemCiphertext);
      const kemCiphertext = kemPayload.slice(0, kemPayload.length - 32);
      const wrappedKey = kemPayload.slice(kemPayload.length - 32);
      const aesKeyBytes = await unwrapAESKeyWithKyber(kemCiphertext, wrappedKey, kp.privateKey);

      setStatus('Downloading encrypted file…');
      const res = await api.downloadFile(share.fileId);
      const encryptedBlob = await res.blob();
      const encryptedBytes = new Uint8Array(await encryptedBlob.arrayBuffer());

      setStatus('Decrypting with AES-256-GCM…');
      const iv = encryptedBytes.slice(0, 12);
      const ciphertext = encryptedBytes.slice(12);
      const aesKey = await importAESKey(aesKeyBytes);
      const plaintext = await decryptAES(aesKey, ciphertext, iv);

      setStatus('Preparing download…');
      const blob = new Blob([plaintext]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = share.fileName || 'decrypted_file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('File decrypted and downloaded!', 'success');
      onReceived(share);
    } catch (err) {
      showToast(err.message || 'Failed to receive/decrypt', 'error');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in"
         style={{ background: 'var(--overlay)' }} onClick={onClose}>
      <div className="rounded-xl w-full max-w-sm max-h-[90vh] overflow-y-auto animate-scale-in"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>📥 Receive & Decrypt File</h3>
          <button style={{ color: 'var(--text-muted)' }} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={submit} className="p-5 flex flex-col gap-4">
          {/* Share code input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Share Code</label>
            <input
              type="text" value={shareCode}
              onChange={e => setShareCode(e.target.value)}
              placeholder="Enter share code (e.g., A1B2C3D4)"
              autoFocus
              className="rounded-lg px-3 py-2.5 text-center font-mono text-lg tracking-widest uppercase outline-none transition"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* Status indicator */}
          {status && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--accent)' }}>
              <div className="spinner-sm" />
              {status}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="px-4 py-2 rounded-lg text-sm transition"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                    onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg text-sm text-white transition disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}
                    disabled={loading}>
              {loading ? 'Decrypting…' : '🔓 Receive & Decrypt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
