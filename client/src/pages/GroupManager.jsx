import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import {
  wrapAESKeyWithKyber, unwrapAESKeyWithKyber,
  uint8ToBase64, base64ToUint8
} from '../crypto/pqc';
import { getKyberKeypair } from '../crypto/keyStore';

/**
 * GroupManager — CRUD for research groups with PQC file sharing.
 * All visuals use CSS custom properties for light / dark support.
 */
export default function GroupManager() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const { showToast } = useToast();
  const { user } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try { setGroups(await api.listGroups()); }
    catch { showToast('Failed to load groups', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2 mb-6">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>👥 Research Groups</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Create groups and share encrypted files with teams</p>
        </div>
        <button
          className="px-4 py-2 text-sm font-medium rounded-lg transition text-white"
          style={{ background: 'var(--accent)' }}
          onClick={() => setShowCreate(true)}
        >
          + Create Group
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="spinner" />
          <p style={{ color: 'var(--text-muted)' }}>Loading groups…</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-5xl mb-4">👥</span>
          <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No research groups</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Create a group to share encrypted files with your team</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map(g => (
            <div
              key={g.id}
              className="surface-card cursor-pointer group"
              onClick={() => setSelectedGroup(g)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">👥</span>
                  <div>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{g.name}</h3>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>by {g.ownerName}</span>
                  </div>
                </div>
                {g.isOwner && (
                  <span className="px-2 py-0.5 rounded-full text-[0.6rem]"
                        style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
                    Owner
                  </span>
                )}
              </div>
              {g.description && (
                <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{g.description}</p>
              )}
              <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>👤 {g.memberCount} members</span>
                  <span className="px-2 py-0.5 rounded-full text-xs"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
                    {g.myRole}
                  </span>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(g.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={(g) => { setGroups(prev => [g, ...prev]); setShowCreate(false); }}
        />
      )}

      {selectedGroup && (
        <GroupDetailModal
          groupId={selectedGroup.id}
          onClose={() => { setSelectedGroup(null); load(); }}
        />
      )}
    </div>
  );
}


/* ── Create Group Modal ──────────────────────────── */

function CreateGroupModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const { showToast } = useToast();

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { showToast('Enter a group name', 'warning'); return; }
    setCreating(true);
    try {
      const group = await api.createGroup(name.trim(), description.trim());
      showToast('Group created!', 'success');
      onCreated(group);
    } catch (err) {
      showToast(err.message || 'Failed to create group', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in"
         style={{ background: 'var(--overlay)' }} onClick={onClose}>
      <div className="rounded-xl w-full max-w-md animate-scale-in"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>👥 Create Research Group</h3>
          <button style={{ color: 'var(--text-muted)' }} onClick={onClose}>✕</button>
        </div>
        {/* Form */}
        <form onSubmit={submit} className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Group Name</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g., Quantum Research Lab"
              autoFocus
              className="rounded-lg px-3 py-2.5 outline-none transition"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Description (optional)</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of the group…"
              rows={3}
              className="rounded-lg px-3 py-2.5 outline-none resize-none transition"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="px-4 py-2 rounded-lg text-sm transition"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                    onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg text-sm text-white transition disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}
                    disabled={creating}>
              {creating ? 'Creating…' : '+ Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


/* ── Group Detail Modal ──────────────────────────── */

function GroupDetailModal({ groupId, onClose }) {
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [memberQuery, setMemberQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [addingMember, setAddingMember] = useState(false);
  const [showShareFile, setShowShareFile] = useState(false);
  const { showToast } = useToast();
  const { user } = useAuth();

  const loadGroup = useCallback(async () => {
    try {
      const data = await api.getGroup(groupId);
      setGroup(data);
    } catch (err) {
      showToast('Failed to load group details', 'error');
    } finally {
      setLoading(false);
    }
  }, [groupId, showToast]);

  useEffect(() => { loadGroup(); }, [loadGroup]);

  /* Debounced user search */
  useEffect(() => {
    if (memberQuery.trim().length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(() => {
      api.searchUsers(memberQuery.trim()).then(setSearchResults).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [memberQuery]);

  const addMember = async (researcherId) => {
    setAddingMember(true);
    try {
      await api.addGroupMember(groupId, researcherId);
      showToast(`${researcherId} added to group`, 'success');
      setMemberQuery('');
      setSearchResults([]);
      loadGroup();
    } catch (err) {
      showToast(err.message || 'Failed to add member', 'error');
    } finally {
      setAddingMember(false);
    }
  };

  const removeMember = async (userId) => {
    try {
      await api.removeGroupMember(groupId, userId);
      showToast('Member removed', 'success');
      loadGroup();
    } catch (err) {
      showToast(err.message || 'Failed to remove member', 'error');
    }
  };

  const deleteGroup = async () => {
    if (!confirm('Delete this group? This cannot be undone.')) return;
    try {
      await api.deleteGroup(groupId);
      showToast('Group deleted', 'success');
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to delete group', 'error');
    }
  };

  /* Loading overlay */
  if (loading) return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'var(--overlay)' }}>
      <div className="spinner" />
    </div>
  );
  if (!group) return null;

  const isAdmin = group.isOwner || group.myRole === 'admin';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in"
         style={{ background: 'var(--overlay)' }} onClick={onClose}>
      <div className="rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{group.name}</h3>
            {group.description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{group.description}</p>}
          </div>
          <button style={{ color: 'var(--text-muted)' }} onClick={onClose}>✕</button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Members */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Members ({group.members?.length || 0})</h4>
            </div>

            <div className="flex flex-col gap-2 mb-3">
              {group.members?.map(m => (
                <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg"
                     style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: 'var(--accent)' }}>
                      {m.researcherId?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                    <div>
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{m.researcherId}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[0.6rem]" style={{ color: 'var(--text-muted)' }}>{m.role}</span>
                        {m.hasKyberKey && <span className="text-[0.6rem]" style={{ color: 'var(--success)' }}>🔑</span>}
                      </div>
                    </div>
                  </div>
                  {isAdmin && m.userId !== group.ownerId && (
                    <button className="text-xs transition" style={{ color: 'var(--error)' }}
                            onClick={() => removeMember(m.userId)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add member search */}
            {isAdmin && (
              <div className="flex flex-col gap-1.5">
                <input
                  type="text" value={memberQuery}
                  onChange={e => setMemberQuery(e.target.value)}
                  placeholder="Search researcher to add…"
                  className="rounded-lg px-3 py-2 text-sm outline-none transition"
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
                {searchResults.length > 0 && (
                  <div className="rounded-lg max-h-32 overflow-y-auto"
                       style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
                    {searchResults.map(u => (
                      <button key={u.id} type="button"
                              className="w-full text-left px-3 py-2 text-sm transition flex justify-between"
                              style={{ color: 'var(--text-secondary)' }}
                              onClick={() => addMember(u.researcherId)}
                              disabled={addingMember}>
                        <span>{u.researcherId}</span>
                        {u.hasKyberKey && <span className="text-xs" style={{ color: 'var(--success)' }}>🔑</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Shared files */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Shared Files ({group.sharedFiles?.length || 0})</h4>
              <button className="px-3 py-1 text-xs rounded-lg transition"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '1px solid transparent' }}
                      onClick={() => setShowShareFile(true)}>
                + Share File
              </button>
            </div>
            {group.sharedFiles?.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No files shared with this group yet</p>
            ) : (
              <div className="flex flex-col gap-2">
                {group.sharedFiles?.map(f => (
                  <div key={f.id} className="flex items-center justify-between py-2 px-3 rounded-lg"
                       style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2">
                      <span>📄</span>
                      <div>
                        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{f.fileName}</span>
                        <span className="text-xs block" style={{ color: 'var(--text-muted)' }}>by {f.sharedBy}</span>
                      </div>
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(f.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Actions */}
          <div className="flex justify-between items-center pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            {group.isOwner && (
              <button className="px-3 py-1.5 text-xs rounded-lg transition"
                      style={{ background: 'var(--error-soft)', color: 'var(--error)', border: '1px solid transparent' }}
                      onClick={deleteGroup}>
                🗑️ Delete Group
              </button>
            )}
            <button className="px-4 py-2 rounded-lg text-sm transition ml-auto"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                    onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {showShareFile && (
          <GroupShareFileModal
            groupId={groupId}
            onClose={() => setShowShareFile(false)}
            onShared={() => { setShowShareFile(false); loadGroup(); }}
          />
        )}
      </div>
    </div>
  );
}


/* ── Group Share File Modal ──────────────────────── */

function GroupShareFileModal({ groupId, onClose, onShared }) {
  const [myFiles, setMyFiles] = useState([]);
  const [fileId, setFileId] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const { showToast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    api.myFiles().then(setMyFiles).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!fileId) { showToast('Select a file', 'warning'); return; }

    setSending(true);
    try {
      /* ── Step 1: recover the original AES key from owner's KEM payload ── */
      setStatus('Recovering file encryption key…');
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

      /* ── Step 2: wrap the SAME AES key for each group member ── */
      setStatus('Fetching group member public keys…');
      const pubkeys = await api.getGroupPubkeys(groupId);
      if (pubkeys.length === 0) throw new Error('No group members have Kyber public keys');

      setStatus(`Encapsulating key for ${pubkeys.length} members…`);
      const kemCiphertexts = {};
      for (const member of pubkeys) {
        const recipientPK = base64ToUint8(member.kyberPublicKey);
        const { kemCiphertext, wrappedKey } = await wrapAESKeyWithKyber(aesKeyBytes, recipientPK);
        const combined = new Uint8Array(kemCiphertext.length + wrappedKey.length);
        combined.set(kemCiphertext, 0);
        combined.set(wrappedKey, kemCiphertext.length);
        kemCiphertexts[String(member.userId)] = uint8ToBase64(combined);
      }

      setStatus('Sharing with group…');
      await api.shareFileWithGroup(groupId, Number(fileId), kemCiphertexts);
      showToast('File shared with group!', 'success');
      onShared();
    } catch (err) {
      showToast(err.message || 'Sharing failed', 'error');
    } finally {
      setSending(false);
      setStatus('');
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-fade-in"
         style={{ background: 'var(--overlay)' }} onClick={onClose}>
      <div className="rounded-xl w-full max-w-md animate-scale-in"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>📤 Share File with Group</h3>
          <button style={{ color: 'var(--text-muted)' }} onClick={onClose}>✕</button>
        </div>
        {/* Form */}
        <form onSubmit={submit} className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Select File</label>
            <select value={fileId} onChange={e => setFileId(e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm outline-none transition"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="">Select an encrypted file…</option>
              {myFiles.map(f => <option key={f.id} value={f.id}>{f.fileName}</option>)}
            </select>
          </div>

          {status && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--accent)' }}>
              <div className="spinner-sm" />
              {status}
            </div>
          )}

          <div className="rounded-lg p-3 text-xs"
               style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '1px solid transparent' }}>
            <strong>🔐 End-to-End Encrypted:</strong> The AES key will be individually encapsulated with each member's Kyber-512 public key. Only group members can decrypt.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="px-4 py-2 rounded-lg text-sm transition"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                    onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg text-sm text-white transition disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}
                    disabled={sending}>
              {sending ? 'Encrypting…' : '🔐 Share with Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
