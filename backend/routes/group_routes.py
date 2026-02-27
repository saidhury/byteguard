"""
Group management routes — create groups, manage members, share files with groups.
Supports post-quantum group-level file sharing via per-member KEM ciphertexts.
"""

import json
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import (
    db, User, Group, GroupMembership, GroupFileAccess,
    FileMetadata, FileHistory
)

groups_bp = Blueprint('groups', __name__)


# ── List my groups ────────────────────────────────────────

@groups_bp.route('/', methods=['GET'])
@jwt_required()
def list_groups():
    """List all groups the user owns or is a member of."""
    user_id = int(get_jwt_identity())

    # Groups I own
    owned = Group.query.filter_by(owner_id=user_id).all()
    owned_ids = {g.id for g in owned}

    # Groups I'm a member of (but don't own)
    memberships = GroupMembership.query.filter_by(user_id=user_id).all()
    member_group_ids = {m.group_id for m in memberships if m.group_id not in owned_ids}
    member_groups = Group.query.filter(Group.id.in_(member_group_ids)).all() if member_group_ids else []

    all_groups = owned + member_groups
    result = []
    for g in all_groups:
        d = g.to_dict()
        d['isOwner'] = g.owner_id == user_id
        # Find user's role
        membership = GroupMembership.query.filter_by(
            group_id=g.id, user_id=user_id
        ).first()
        d['myRole'] = membership.role if membership else ('admin' if g.owner_id == user_id else 'member')
        result.append(d)

    return jsonify(result)


# ── Create a group ────────────────────────────────────────

@groups_bp.route('/create', methods=['POST'])
@jwt_required()
def create_group():
    """
    Create a new research group.
    Body: { name, description? }
    The creator becomes the owner and an admin member.
    """
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    name = (data.get('name') or '').strip()
    description = (data.get('description') or '').strip()

    if not name:
        return jsonify({'error': 'Group name is required'}), 400

    if len(name) > 200:
        return jsonify({'error': 'Group name too long (max 200 chars)'}), 400

    group = Group(
        name=name,
        description=description,
        owner_id=user_id,
    )
    db.session.add(group)
    db.session.flush()  # Get the group.id

    # Add owner as admin member
    membership = GroupMembership(
        group_id=group.id,
        user_id=user_id,
        role='admin',
    )
    db.session.add(membership)
    db.session.commit()

    result = group.to_dict()
    result['isOwner'] = True
    result['myRole'] = 'admin'
    return jsonify(result), 201


# ── Get group details ─────────────────────────────────────

@groups_bp.route('/<int:group_id>', methods=['GET'])
@jwt_required()
def get_group(group_id):
    """Get details of a specific group including members."""
    user_id = int(get_jwt_identity())
    group = Group.query.get(group_id)
    if not group:
        return jsonify({'error': 'Group not found'}), 404

    # Check membership
    membership = GroupMembership.query.filter_by(
        group_id=group_id, user_id=user_id
    ).first()
    if not membership and group.owner_id != user_id:
        return jsonify({'error': 'Access denied'}), 403

    result = group.to_dict()
    result['isOwner'] = group.owner_id == user_id
    result['myRole'] = membership.role if membership else 'admin'
    result['members'] = [m.to_dict() for m in group.members.all()]

    # Include shared files for this group, with per-user KEM extraction
    file_accesses = GroupFileAccess.query.filter_by(group_id=group_id).all()
    shared_files = []
    for fa in file_accesses:
        d = fa.to_dict()
        # Extract this user's KEM ciphertext
        try:
            cts = json.loads(fa.kem_ciphertexts)
            d['myKemCiphertext'] = cts.get(str(user_id), None)
        except (json.JSONDecodeError, AttributeError):
            d['myKemCiphertext'] = None
        # Include file metadata for viewer
        if fa.file:
            d['contentType'] = fa.file.content_type
            d['originalSize'] = fa.file.original_size
            d['iv'] = fa.file.iv
        shared_files.append(d)
    result['sharedFiles'] = shared_files

    return jsonify(result)


# ── Add member to group ──────────────────────────────────

@groups_bp.route('/<int:group_id>/members', methods=['POST'])
@jwt_required()
def add_member(group_id):
    """
    Add a researcher to a group.
    Body: { researcherId, role? }
    Only group owner or admin can add members.
    """
    user_id = int(get_jwt_identity())
    group = Group.query.get(group_id)
    if not group:
        return jsonify({'error': 'Group not found'}), 404

    # Check admin permission
    membership = GroupMembership.query.filter_by(
        group_id=group_id, user_id=user_id
    ).first()
    if not membership or membership.role != 'admin':
        if group.owner_id != user_id:
            return jsonify({'error': 'Only admins can add members'}), 403

    data = request.get_json(silent=True) or {}
    researcher_id = (data.get('researcherId') or '').strip()
    role = data.get('role', 'member')

    if not researcher_id:
        return jsonify({'error': 'researcherId is required'}), 400

    if role not in ('admin', 'member'):
        return jsonify({'error': 'Role must be admin or member'}), 400

    target_user = User.query.filter_by(researcher_id=researcher_id).first()
    if not target_user:
        return jsonify({'error': 'User not found'}), 404

    # Check if already a member
    existing = GroupMembership.query.filter_by(
        group_id=group_id, user_id=target_user.id
    ).first()
    if existing:
        return jsonify({'error': 'User is already a member'}), 409

    new_member = GroupMembership(
        group_id=group_id,
        user_id=target_user.id,
        role=role,
    )
    db.session.add(new_member)
    db.session.commit()

    return jsonify(new_member.to_dict()), 201


# ── Remove member from group ─────────────────────────────

@groups_bp.route('/<int:group_id>/members/<int:member_user_id>', methods=['DELETE'])
@jwt_required()
def remove_member(group_id, member_user_id):
    """
    Remove a member from a group.
    Only the owner/admin or the user themselves can remove.
    """
    user_id = int(get_jwt_identity())
    group = Group.query.get(group_id)
    if not group:
        return jsonify({'error': 'Group not found'}), 404

    # Can't remove the owner
    if member_user_id == group.owner_id:
        return jsonify({'error': 'Cannot remove the group owner'}), 400

    # Permission check: must be admin/owner or removing self
    if member_user_id != user_id:
        my_membership = GroupMembership.query.filter_by(
            group_id=group_id, user_id=user_id
        ).first()
        if (not my_membership or my_membership.role != 'admin') and group.owner_id != user_id:
            return jsonify({'error': 'Only admins can remove members'}), 403

    target_membership = GroupMembership.query.filter_by(
        group_id=group_id, user_id=member_user_id
    ).first()
    if not target_membership:
        return jsonify({'error': 'Member not found'}), 404

    db.session.delete(target_membership)
    db.session.commit()
    return jsonify({'message': 'Member removed'})


# ── Share file with group (per-member KEM ciphertexts) ────

@groups_bp.route('/<int:group_id>/share-file', methods=['POST'])
@jwt_required()
def share_file_with_group(group_id):
    """
    Share an encrypted file with an entire group.
    Body: {
      fileId: int,
      kemCiphertexts: { "<userId>": "<base64 kem payload>", ... }
    }
    The client encapsulates the AES key for each group member's Kyber public key.
    """
    user_id = int(get_jwt_identity())
    group = Group.query.get(group_id)
    if not group:
        return jsonify({'error': 'Group not found'}), 404

    # Check membership
    membership = GroupMembership.query.filter_by(
        group_id=group_id, user_id=user_id
    ).first()
    if not membership and group.owner_id != user_id:
        return jsonify({'error': 'You are not a member of this group'}), 403

    data = request.get_json(silent=True) or {}
    file_id = data.get('fileId')
    kem_cts = data.get('kemCiphertexts', {})

    if not file_id or not kem_cts:
        return jsonify({'error': 'fileId and kemCiphertexts are required'}), 400

    # Validate file ownership
    meta = FileMetadata.query.get(file_id)
    if not meta or meta.owner_id != user_id:
        return jsonify({'error': 'File not found or access denied'}), 404

    # Check for existing group access
    existing = GroupFileAccess.query.filter_by(
        file_id=file_id, group_id=group_id
    ).first()
    if existing:
        # Update existing ciphertexts
        existing.kem_ciphertexts = json.dumps(kem_cts)
        db.session.commit()
        return jsonify(existing.to_dict())

    gfa = GroupFileAccess(
        file_id=file_id,
        group_id=group_id,
        shared_by=user_id,
        kem_ciphertexts=json.dumps(kem_cts),
    )
    db.session.add(gfa)

    # Log
    hist = FileHistory(
        user_id=user_id,
        name=meta.file_name,
        original_size=meta.original_size,
        encrypted_size=meta.encrypted_size,
        file_type='group-share',
        operation='share',
    )
    db.session.add(hist)
    db.session.commit()

    return jsonify(gfa.to_dict()), 201


# ── List group-shared files accessible to me ─────────────

@groups_bp.route('/shared-files', methods=['GET'])
@jwt_required()
def list_group_shared_files():
    """
    List all files shared with groups the user is a member of.
    Returns the per-user KEM ciphertext for decryption.
    """
    user_id = int(get_jwt_identity())

    # Get all groups user is a member of
    memberships = GroupMembership.query.filter_by(user_id=user_id).all()
    group_ids = [m.group_id for m in memberships]

    if not group_ids:
        return jsonify([])

    accesses = GroupFileAccess.query.filter(
        GroupFileAccess.group_id.in_(group_ids)
    ).all()

    result = []
    for a in accesses:
        d = a.to_dict()
        # Extract this user's KEM ciphertext
        try:
            cts = json.loads(a.kem_ciphertexts)
            d['myKemCiphertext'] = cts.get(str(user_id), None)
        except (json.JSONDecodeError, AttributeError):
            d['myKemCiphertext'] = None
        # Include file IV for decryption
        if a.file:
            d['iv'] = a.file.iv
            d['contentType'] = a.file.content_type
            d['originalSize'] = a.file.original_size
        result.append(d)

    return jsonify(result)


# ── Get group members' public keys ────────────────────────

@groups_bp.route('/<int:group_id>/pubkeys', methods=['GET'])
@jwt_required()
def get_group_pubkeys(group_id):
    """
    Return all group members' Kyber public keys for bulk KEM encapsulation.
    """
    user_id = int(get_jwt_identity())
    group = Group.query.get(group_id)
    if not group:
        return jsonify({'error': 'Group not found'}), 404

    # Check membership
    membership = GroupMembership.query.filter_by(
        group_id=group_id, user_id=user_id
    ).first()
    if not membership and group.owner_id != user_id:
        return jsonify({'error': 'Access denied'}), 403

    members = GroupMembership.query.filter_by(group_id=group_id).all()
    result = []
    for m in members:
        if m.user and m.user.kyber_public_key:
            result.append({
                'userId': m.user_id,
                'researcherId': m.user.researcher_id,
                'kyberPublicKey': m.user.kyber_public_key,
            })

    return jsonify(result)


# ── Delete a group ────────────────────────────────────────

@groups_bp.route('/<int:group_id>', methods=['DELETE'])
@jwt_required()
def delete_group(group_id):
    """Delete a group. Only the owner can delete."""
    user_id = int(get_jwt_identity())
    group = Group.query.get(group_id)
    if not group:
        return jsonify({'error': 'Group not found'}), 404
    if group.owner_id != user_id:
        return jsonify({'error': 'Only the owner can delete this group'}), 403

    db.session.delete(group)
    db.session.commit()
    return jsonify({'message': 'Group deleted'})
