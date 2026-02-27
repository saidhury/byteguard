import React, { useState, useRef, useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import {
  generateAESKey, exportAESKey, encryptAES, sha256Hex,
  uint8ToBase64, calcEntropy, wrapAESKeyWithKyber
} from '../crypto/pqc';
import { getKyberKeypair } from '../crypto/keyStore';

/**
 * Encryption — the main "Encryption Lab" page.
 * Provides drag-and-drop file encryption with an animated progress timeline
 * and entropy visualisation.  All colours come from CSS custom properties.
 */
export default function Encryption() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [encrypting, setEncrypting] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState(0);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const onFilePick = useCallback((f) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setPhase(0);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    onFilePick(e.dataTransfer.files[0]);
  };

  /** Real encryption pipeline — see comments inside */
  const encrypt = async () => {
    if (!file) return;
    setEncrypting(true);
    setResult(null);

    try {
      const buf = await file.arrayBuffer();
      const plaintext = new Uint8Array(buf);

      // 1 — Generate AES-256-GCM key
      setPhase(1);
      const aesKey = await generateAESKey();
      const aesKeyBytes = await exportAESKey(aesKey);

      // 2 — Wrap AES key with owner's Kyber public key (for later retrieval)
      setPhase(2);
      const kp = await getKyberKeypair(user.researcherId);
      if (!kp) throw new Error('No Kyber keypair found — please re-login.');
      const { kemCiphertext: ownerKemCT, wrappedKey: ownerWrappedKey } =
        await wrapAESKeyWithKyber(aesKeyBytes, kp.publicKey);
      const ownerKemPayload = new Uint8Array(ownerKemCT.length + ownerWrappedKey.length);
      ownerKemPayload.set(ownerKemCT, 0);
      ownerKemPayload.set(ownerWrappedKey, ownerKemCT.length);

      // 3 — Encrypt with AES-256-GCM
      setPhase(3);
      const { ciphertext, iv } = await encryptAES(aesKey, plaintext);

      // 4 — SHA-256 fingerprint
      setPhase(4);
      const fingerprint = await sha256Hex(ciphertext);

      // 5 — Upload (IV ∥ ciphertext)
      setPhase(5);
      const encBlob = new Blob([iv, ciphertext]);
      const entropy = calcEntropy(ciphertext.slice(0, 4096));

      const formData = new FormData();
      formData.append('file', encBlob, file.name + '.enc');
      formData.append('fileName', file.name);
      formData.append('originalSize', String(file.size));
      formData.append('iv', uint8ToBase64(iv));
      formData.append('sha256Hash', fingerprint);
      formData.append('contentType', file.type || 'application/octet-stream');
      formData.append('ownerKemCt', uint8ToBase64(ownerKemPayload));

      const uploadResult = await api.uploadFile(formData);

      const res = {
        ...uploadResult,
        name: file.name,
        originalSize: file.size,
        encryptedSize: encBlob.size,
        blob: encBlob,
        fingerprint,
        entropy,
        timestamp: new Date().toISOString(),
        type: file.type || 'unknown',
      };

      setResult(res);
      drawEntropyCanvas(ciphertext.slice(0, 2048));
      showToast('File encrypted with AES-256-GCM & uploaded', 'success');
    } catch (err) {
      showToast('Encryption failed: ' + err.message, 'error');
      setPhase(0);
    } finally {
      setEncrypting(false);
    }
  };

  const download = () => {
    if (!result?.blob) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.name + '.enc';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Encrypted file downloaded', 'success');
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setPhase(0);
  };

  function drawEntropyCanvas(bytes) {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const w = (cvs.width = cvs.offsetWidth);
    const h = (cvs.height = 120);
    ctx.clearRect(0, 0, w, h);
    const sliceLen = Math.max(1, Math.floor(bytes.length / w));
    for (let x = 0; x < w; x++) {
      const slice = bytes.slice(x * sliceLen, (x + 1) * sliceLen);
      const avg = slice.reduce((s, b) => s + b, 0) / slice.length;
      const barH = (avg / 255) * h;
      const hue = (avg / 255) * 270;
      ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
      ctx.fillRect(x, h - barH, 1, barH);
    }
  }

  const phaseLabels = [
    '',
    'Generating AES-256-GCM key…',
    'Kyber-512 keypair ready…',
    'AES-256-GCM encryption…',
    'Computing SHA-256 fingerprint…',
    'Uploading encrypted blob…',
  ];

  const fmtSize = (b) => {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  };

  return (
    <div>
      {/* ── Page header ─────────────────────────────── */}
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>🔐 Encryption Lab</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Post-quantum secure file encryption with AES-256-GCM + CRYSTALS-Kyber-512
        </p>
      </div>

      {/* ── Drop zone ───────────────────────────────── */}
      {!result && (
        <div
          className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all"
          style={{
            borderColor: dragOver ? 'var(--accent)' : file ? 'var(--border)' : 'var(--border)',
            borderStyle: file ? 'solid' : 'dashed',
            background: dragOver ? 'var(--accent-soft)' : file ? 'var(--surface-secondary)' : 'var(--surface)',
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" hidden onChange={e => onFilePick(e.target.files[0])} />
          {file ? (
            <div className="flex items-center gap-3 text-left">
              <span className="text-3xl">📄</span>
              <div className="flex-1 min-w-0">
                <strong className="block truncate" style={{ color: 'var(--text-primary)' }}>{file.name}</strong>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{fmtSize(file.size)}</span>
              </div>
              <button
                className="px-3 py-1.5 text-xs rounded-lg transition"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                onClick={(e) => { e.stopPropagation(); reset(); }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span className="text-4xl">📁</span>
              <p style={{ color: 'var(--text-secondary)' }}>Drop a file here or click to browse</p>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Max 100 MB · Any file type</span>
            </div>
          )}
        </div>
      )}

      {/* ── Encrypt button ──────────────────────────── */}
      {file && !result && (
        <div className="flex justify-center mt-6">
          <button
            className="font-medium py-3 px-8 rounded-xl transition disabled:opacity-50 text-base text-white"
            style={{ background: 'var(--accent)', boxShadow: '0 4px 14px var(--shadow)' }}
            onClick={encrypt}
            disabled={encrypting}
          >
            {encrypting ? 'Encrypting…' : '🔐 Encrypt File'}
          </button>
        </div>
      )}

      {/* ── Progress timeline ───────────────────────── */}
      {encrypting && (
        <div className="flex flex-col md:flex-row md:justify-between gap-2 py-4 mt-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex md:flex-col items-center gap-3 md:gap-1.5 md:text-center p-2 rounded-lg text-sm flex-1 transition-all"
              style={{
                color: phase === i ? 'var(--accent-text)' : phase > i ? 'var(--success)' : 'var(--text-muted)',
                background: phase === i ? 'var(--accent-soft)' : 'transparent',
              }}
            >
              <div
                className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 transition-all"
                style={{
                  borderColor: phase === i ? 'var(--accent)' : phase > i ? 'var(--success)' : 'var(--border)',
                  background: phase === i ? 'var(--accent-soft)' : phase > i ? 'var(--success-soft)' : 'transparent',
                }}
              >
                {phase > i ? '✓' : i}
              </div>
              <span className="text-xs">{phaseLabels[i]}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Result panel ────────────────────────────── */}
      {result && (
        <div className="animate-fade-in">
          <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--success)' }}>✅ Encryption Complete</h3>
            <button
              className="px-3 py-1.5 text-xs rounded-lg transition"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              onClick={reset}
            >
              Encrypt Another
            </button>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              ['Original', fmtSize(result.originalSize)],
              ['Encrypted', fmtSize(result.encryptedSize)],
              ['Entropy', result.entropy.toFixed(4) + ' bits/byte'],
              ['Algorithm', 'AES-256-GCM'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg p-3"
                   style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
                <span className="text-[0.65rem] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span className="block text-lg font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Entropy canvas */}
          <div className="rounded-xl p-4 mb-4"
               style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
            <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Entropy Visualization</h4>
            <canvas ref={canvasRef} className="w-full h-[120px] rounded-lg"
                    style={{ background: 'var(--code-bg)' }} />
          </div>

          {/* SHA-256 fingerprint */}
          <div className="rounded-xl p-4 mb-4"
               style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
            <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>File Fingerprint (SHA-256)</h4>
            <code className="block break-all rounded-lg p-3 text-xs leading-relaxed font-mono"
                  style={{ background: 'var(--code-bg)', color: 'var(--accent-text)' }}>
              {result.fingerprint}
            </code>
          </div>

          {/* Security metadata */}
          <div className="rounded-xl p-4 mb-4"
               style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
            <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Security Metadata</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {[
                ['Cipher', 'AES-256-GCM'],
                ['Key Exchange', 'CRYSTALS-Kyber-512'],
                ['IV Size', '96 bits'],
                ['Auth Tag', '128 bits (GCM)'],
                ['Key Wrapping', 'Kyber KEM + XOR'],
                ['PQC Level', 'NIST Level 1 (Kyber-512)'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2 text-sm last:border-0"
                     style={{ borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Download encrypted file */}
          <button
            className="w-full font-medium py-3 rounded-xl transition text-base text-white"
            style={{ background: 'var(--accent)', boxShadow: '0 4px 14px var(--shadow)' }}
            onClick={download}
          >
            ⬇️ Download Encrypted File
          </button>
        </div>
      )}
    </div>
  );
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
