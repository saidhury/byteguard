"""
File management routes — upload, download, share, history.
Encrypted blobs are stored in the local /storage directory.
"""

import os
import uuid
import hashlib
from flask import Blueprint, request, jsonify, send_file, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, FileMetadata, SharedAccess, FileHistory, User

files_bp = Blueprint('files', __name__)


def _storage_dir():
    return current_app.config['STORAGE_DIR']


# ── Upload encrypted file ─────────────────────────────────

@files_bp.route('/upload', methods=['POST'])
@jwt_required()
def upload_file():
    """
    Accept an encrypted file blob + metadata via multipart/form-data.
    Fields:
      - file: the encrypted binary blob
      - fileName: original file name
      - originalSize: original unencrypted size in bytes
      - iv: base64-encoded AES-GCM IV (optional, for self-decryption)
      - sha256Hash: hex string of encrypted payload hash (optional)
    """
    user_id = int(get_jwt_identity())

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    uploaded = request.files['file']
    file_name = request.form.get('fileName', uploaded.filename or 'unnamed')
    original_size = int(request.form.get('originalSize', 0))
    iv = request.form.get('iv', '')
    sha256_hash = request.form.get('sha256Hash', '')
    content_type = request.form.get('contentType', 'application/octet-stream')
    owner_kem_ct = request.form.get('ownerKemCt', '')

    # Generate unique storage path
    file_uuid = uuid.uuid4().hex
    storage_subdir = os.path.join(_storage_dir(), file_uuid[:2])
    os.makedirs(storage_subdir, exist_ok=True)
    storage_filename = f'{file_uuid}.enc'
    full_path = os.path.join(storage_subdir, storage_filename)

    # Save to disk
    uploaded.save(full_path)
    encrypted_size = os.path.getsize(full_path)

    # Compute hash if not provided
    if not sha256_hash:
        h = hashlib.sha256()
        with open(full_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                h.update(chunk)
        sha256_hash = h.hexdigest()

    # Save metadata
    rel_path = os.path.join(file_uuid[:2], storage_filename)
    meta = FileMetadata(
        owner_id=user_id,
        file_name=file_name,
        original_size=original_size,
        encrypted_size=encrypted_size,
        storage_path=rel_path,
        content_type=content_type,
        sha256_hash=sha256_hash,
        iv=iv,
        owner_kem_ct=owner_kem_ct or None,
    )
    db.session.add(meta)

    # Also add to history
    hist = FileHistory(
        user_id=user_id,
        name=file_name,
        original_size=original_size,
        encrypted_size=encrypted_size,
        file_type=content_type,
        operation='encrypt',
    )
    db.session.add(hist)
    db.session.commit()

    return jsonify(meta.to_dict()), 201


# ── List my files (owned) ──────────────────────────────────

@files_bp.route('/my-files', methods=['GET'])
@jwt_required()
def my_files():
    """Return all files owned by the current user."""
    user_id = int(get_jwt_identity())
    files = FileMetadata.query.filter_by(owner_id=user_id).order_by(
        FileMetadata.created_at.desc()
    ).all()
    return jsonify([f.to_dict() for f in files])


# ── Download encrypted file ───────────────────────────────

@files_bp.route('/download/<int:file_id>', methods=['GET'])
@jwt_required()
def download_file(file_id):
    """
    Download an encrypted file blob.
    The requester must be the owner OR have a SharedAccess record.
    """
    user_id = int(get_jwt_identity())
    meta = FileMetadata.query.get(file_id)
    if not meta:
        return jsonify({'error': 'File not found'}), 404

    # Authorization: owner, valid share, or group access
    if meta.owner_id != user_id:
        share = SharedAccess.query.filter_by(
            file_id=file_id, recipient_id=user_id
        ).first()
        group_access = None
        if not share:
            from models import GroupFileAccess, GroupMembership
            group_access = db.session.query(GroupFileAccess).join(
                GroupMembership, GroupFileAccess.group_id == GroupMembership.group_id
            ).filter(
                GroupFileAccess.file_id == file_id,
                GroupMembership.user_id == user_id
            ).first()
        if not share and not group_access:
            return jsonify({'error': 'Access denied'}), 403

    full_path = os.path.join(_storage_dir(), meta.storage_path)
    if not os.path.exists(full_path):
        return jsonify({'error': 'File blob not found on storage'}), 404

    response = send_file(
        full_path,
        mimetype='application/octet-stream',
        as_attachment=True,
        download_name=meta.file_name + '.enc'
    )
    response.headers['Content-Type'] = 'application/octet-stream'
    response.headers['Content-Disposition'] = f'attachment; filename="{meta.file_name}.enc"'
    response.headers['X-Original-Filename'] = meta.file_name
    response.headers['X-Content-Type'] = meta.content_type
    response.headers['X-Original-Size'] = str(meta.original_size)
    response.headers['Access-Control-Expose-Headers'] = 'Content-Disposition, X-Original-Filename, X-Content-Type, X-Original-Size'
    return response


# ── View file inline (PDF integration) ────────────────────

@files_bp.route('/view/<int:file_id>', methods=['GET'])
@jwt_required()
def view_file(file_id):
    """
    Stream the encrypted file blob for in-app viewing.
    The client decrypts in-browser and renders inline (e.g. PDF.js).
    Returns the raw encrypted blob with original content-type metadata in headers.
    """
    user_id = int(get_jwt_identity())
    meta = FileMetadata.query.get(file_id)
    if not meta:
        return jsonify({'error': 'File not found'}), 404

    # Authorization: owner or valid share
    if meta.owner_id != user_id:
        share = SharedAccess.query.filter_by(
            file_id=file_id, recipient_id=user_id
        ).first()
        # Also check group access
        group_access = None
        if not share:
            from models import GroupFileAccess, GroupMembership
            group_access = db.session.query(GroupFileAccess).join(
                GroupMembership, GroupFileAccess.group_id == GroupMembership.group_id
            ).filter(
                GroupFileAccess.file_id == file_id,
                GroupMembership.user_id == user_id
            ).first()
        if not share and not group_access:
            return jsonify({'error': 'Access denied'}), 403

    full_path = os.path.join(_storage_dir(), meta.storage_path)
    if not os.path.exists(full_path):
        return jsonify({'error': 'File blob not found on storage'}), 404

    response = send_file(
        full_path,
        mimetype='application/octet-stream',
    )
    response.headers['Content-Type'] = 'application/octet-stream'
    response.headers['X-Original-Filename'] = meta.file_name
    response.headers['X-Content-Type'] = meta.content_type
    response.headers['X-Original-Size'] = str(meta.original_size)
    response.headers['X-IV'] = meta.iv or ''
    response.headers['Access-Control-Expose-Headers'] = 'X-Original-Filename, X-Content-Type, X-Original-Size, X-IV'
    return response


# ── File metadata by ID ───────────────────────────────────

@files_bp.route('/<int:file_id>/meta', methods=['GET'])
@jwt_required()
def file_meta(file_id):
    """Get metadata for a single file."""
    user_id = int(get_jwt_identity())
    meta = FileMetadata.query.get(file_id)
    if not meta:
        return jsonify({'error': 'File not found'}), 404
    if meta.owner_id != user_id:
        share = SharedAccess.query.filter_by(
            file_id=file_id, recipient_id=user_id
        ).first()
        if not share:
            return jsonify({'error': 'Access denied'}), 403
    result = meta.to_dict()
    result['iv'] = meta.iv
    # Only expose the owner's wrapped AES key to the file owner
    if meta.owner_id == user_id:
        result['ownerKemCt'] = meta.owner_kem_ct
    return jsonify(result)


# ── Share file with KEM ciphertext ────────────────────────

@files_bp.route('/share', methods=['POST'])
@jwt_required()
def share_file():
    """
    Share an encrypted file with a recipient.
    Body (JSON): { fileId, recipientId (researcher_id string), kemCiphertext, permission? }
    The kemCiphertext is the Kyber-512 encapsulation of the AES key.
    """
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    file_id = data.get('fileId')
    recipient_rid = (data.get('recipientId') or '').strip()
    kem_ct = data.get('kemCiphertext', '')
    permission = data.get('permission', 'download')

    if not file_id or not recipient_rid or not kem_ct:
        return jsonify({'error': 'fileId, recipientId, and kemCiphertext are required'}), 400

    # Validate file ownership
    meta = FileMetadata.query.get(file_id)
    if not meta or meta.owner_id != user_id:
        return jsonify({'error': 'File not found or access denied'}), 404

    # Find recipient
    recipient = User.query.filter_by(researcher_id=recipient_rid).first()
    if not recipient:
        return jsonify({'error': 'Recipient not found'}), 404

    # Generate share code
    share_code = uuid.uuid4().hex[:8].upper()

    share = SharedAccess(
        file_id=file_id,
        sender_id=user_id,
        recipient_id=recipient.id,
        kem_ciphertext=kem_ct,
        share_code=share_code,
        permission=permission,
    )
    db.session.add(share)

    # Log
    hist = FileHistory(
        user_id=user_id,
        name=meta.file_name,
        original_size=meta.original_size,
        encrypted_size=meta.encrypted_size,
        file_type='share',
        operation='share',
    )
    db.session.add(hist)
    db.session.commit()

    return jsonify(share.to_dict()), 201


# ── List my shared files (sent) ───────────────────────────

@files_bp.route('/shared', methods=['GET'])
@jwt_required()
def list_shared():
    user_id = int(get_jwt_identity())
    shares = SharedAccess.query.filter_by(sender_id=user_id).order_by(
        SharedAccess.created_at.desc()
    ).all()
    return jsonify([s.to_dict() for s in shares])


# ── List files shared with me (received) ──────────────────

@files_bp.route('/received', methods=['GET'])
@jwt_required()
def list_received():
    user_id = int(get_jwt_identity())
    shares = SharedAccess.query.filter_by(recipient_id=user_id).order_by(
        SharedAccess.created_at.desc()
    ).all()
    return jsonify([s.to_dict() for s in shares])


# ── Get share details (for downloading shared file) ───────

@files_bp.route('/share/<share_code>', methods=['GET'])
@jwt_required()
def get_share_by_code(share_code):
    """
    Get share details including KEM ciphertext for the recipient to
    decapsulate and recover the AES key.
    """
    user_id = int(get_jwt_identity())
    share = SharedAccess.query.filter_by(share_code=share_code).first()
    if not share:
        return jsonify({'error': 'Share not found'}), 404

    if share.recipient_id != user_id and share.sender_id != user_id:
        return jsonify({'error': 'Access denied'}), 403

    result = share.to_dict()
    # Include file IV for decryption
    if share.file:
        result['iv'] = share.file.iv
        result['originalSize'] = share.file.original_size
        result['encryptedSize'] = share.file.encrypted_size
    return jsonify(result)


# ── Revoke a share ────────────────────────────────────────

@files_bp.route('/shared/<int:share_id>', methods=['DELETE'])
@jwt_required()
def revoke_share(share_id):
    user_id = int(get_jwt_identity())
    share = SharedAccess.query.get(share_id)
    if not share or share.sender_id != user_id:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(share)
    db.session.commit()
    return jsonify({'message': 'Access revoked'})


# ── File History ──────────────────────────────────────────

@files_bp.route('/history', methods=['GET'])
@jwt_required()
def get_history():
    user_id = int(get_jwt_identity())
    items = FileHistory.query.filter_by(user_id=user_id).order_by(
        FileHistory.timestamp.desc()
    ).limit(100).all()
    return jsonify([i.to_dict() for i in items])


@files_bp.route('/history', methods=['POST'])
@jwt_required()
def add_history():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    entry = FileHistory(
        user_id=user_id,
        name=data.get('name', 'Unnamed'),
        original_size=int(data.get('originalSize', 0)),
        encrypted_size=int(data.get('encryptedSize', 0)),
        file_type=data.get('type', 'unknown'),
        operation=data.get('operation', 'encrypt'),
    )
    db.session.add(entry)
    db.session.commit()
    return jsonify(entry.to_dict()), 201


@files_bp.route('/history/<int:item_id>', methods=['DELETE'])
@jwt_required()
def delete_history_item(item_id):
    user_id = int(get_jwt_identity())
    item = FileHistory.query.filter_by(id=item_id, user_id=user_id).first()
    if not item:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(item)
    db.session.commit()
    return jsonify({'message': 'Deleted'})


@files_bp.route('/history', methods=['DELETE'])
@jwt_required()
def clear_history():
    user_id = int(get_jwt_identity())
    FileHistory.query.filter_by(user_id=user_id).delete()
    db.session.commit()
    return jsonify({'message': 'History cleared'})


# ── My files (list uploaded encrypted blobs) ──────────────

@files_bp.route('/my-files', methods=['GET'])
@jwt_required()
def list_my_files():
    user_id = int(get_jwt_identity())
    files = FileMetadata.query.filter_by(owner_id=user_id).order_by(
        FileMetadata.created_at.desc()
    ).all()
    result = []
    for f in files:
        d = f.to_dict()
        d['ownerKemCt'] = f.owner_kem_ct   # include owner's wrapped AES key
        result.append(d)
    return jsonify(result)
