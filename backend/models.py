"""
SQLAlchemy models for ByteGuard Post-Quantum Secure Data Sharing Platform.

Tables:
  - User: researcher accounts with Kyber public keys
  - FileMetadata: encrypted file blob metadata
  - SharedAccess: sharing records with KEM ciphertexts
  - FileHistory: encryption operation audit log
  - UserSettings: per-user preferences
"""

from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    researcher_id = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    kyber_public_key = db.Column(db.Text, nullable=True)  # base64-encoded Kyber-512 public key
    role = db.Column(db.String(50), default='Researcher')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    files = db.relationship('FileMetadata', backref='owner', lazy='dynamic',
                            foreign_keys='FileMetadata.owner_id')
    settings = db.relationship('UserSettings', backref='user', uselist=False,
                               cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'researcherId': self.researcher_id,
            'role': self.role,
            'hasKyberKey': self.kyber_public_key is not None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
        }


class FileMetadata(db.Model):
    __tablename__ = 'file_metadata'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    file_name = db.Column(db.String(512), nullable=False)
    original_size = db.Column(db.Integer, default=0)
    encrypted_size = db.Column(db.Integer, default=0)
    storage_path = db.Column(db.String(1024), nullable=False)
    content_type = db.Column(db.String(128), default='application/octet-stream')
    sha256_hash = db.Column(db.String(64), nullable=True)
    iv = db.Column(db.String(64), nullable=True)  # base64-encoded IV used for AES-GCM
    owner_kem_ct = db.Column(db.Text, nullable=True)  # owner's KEM-wrapped AES key (base64)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    shares = db.relationship('SharedAccess', backref='file', lazy='dynamic',
                             cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'ownerId': self.owner_id,
            'fileName': self.file_name,
            'originalSize': self.original_size,
            'encryptedSize': self.encrypted_size,
            'contentType': self.content_type,
            'sha256Hash': self.sha256_hash,
            'iv': self.iv,
            'ownerKemCt': self.owner_kem_ct,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
        }


class SharedAccess(db.Model):
    __tablename__ = 'shared_access'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    file_id = db.Column(db.Integer, db.ForeignKey('file_metadata.id'), nullable=False, index=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    recipient_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    kem_ciphertext = db.Column(db.Text, nullable=False)  # base64-encoded Kyber KEM ciphertext
    share_code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    permission = db.Column(db.String(20), default='download')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    sender = db.relationship('User', foreign_keys=[sender_id], backref='sent_shares')
    recipient = db.relationship('User', foreign_keys=[recipient_id], backref='received_shares')

    def to_dict(self):
        return {
            'id': self.id,
            'fileId': self.file_id,
            'fileName': self.file.file_name if self.file else None,
            'contentType': self.file.content_type if self.file else None,
            'senderId': self.sender_id,
            'senderName': self.sender.researcher_id if self.sender else None,
            'recipientId': self.recipient_id,
            'recipientName': self.recipient.researcher_id if self.recipient else None,
            'shareCode': self.share_code,
            'permission': self.permission,
            'kemCiphertext': self.kem_ciphertext,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
        }


class FileHistory(db.Model):
    __tablename__ = 'file_history'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    name = db.Column(db.String(512), nullable=False)
    original_size = db.Column(db.Integer, default=0)
    encrypted_size = db.Column(db.Integer, default=0)
    file_type = db.Column(db.String(128), default='unknown')
    operation = db.Column(db.String(20), default='encrypt')  # encrypt / decrypt / share
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship('User', backref='history')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'originalSize': self.original_size,
            'encryptedSize': self.encrypted_size,
            'type': self.file_type,
            'operation': self.operation,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
        }


class Group(db.Model):
    __tablename__ = 'groups'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default='')
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    owner = db.relationship('User', backref='owned_groups', foreign_keys=[owner_id])
    members = db.relationship('GroupMembership', backref='group', lazy='dynamic',
                              cascade='all, delete-orphan')
    file_access = db.relationship('GroupFileAccess', backref='group', lazy='dynamic',
                                  cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'ownerId': self.owner_id,
            'ownerName': self.owner.researcher_id if self.owner else None,
            'memberCount': self.members.count(),
            'createdAt': self.created_at.isoformat() if self.created_at else None,
        }


class GroupMembership(db.Model):
    __tablename__ = 'group_memberships'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    role = db.Column(db.String(20), default='member')  # admin / member
    joined_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship('User', backref='group_memberships')

    __table_args__ = (db.UniqueConstraint('group_id', 'user_id', name='uq_group_user'),)

    def to_dict(self):
        return {
            'id': self.id,
            'groupId': self.group_id,
            'userId': self.user_id,
            'researcherId': self.user.researcher_id if self.user else None,
            'hasKyberKey': self.user.kyber_public_key is not None if self.user else False,
            'role': self.role,
            'joinedAt': self.joined_at.isoformat() if self.joined_at else None,
        }


class GroupFileAccess(db.Model):
    __tablename__ = 'group_file_access'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    file_id = db.Column(db.Integer, db.ForeignKey('file_metadata.id'), nullable=False, index=True)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id'), nullable=False, index=True)
    shared_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    kem_ciphertexts = db.Column(db.Text, nullable=False)  # JSON: { "userId": "base64_kem_ct", ... }
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    file = db.relationship('FileMetadata', backref='group_accesses')
    sharer = db.relationship('User', foreign_keys=[shared_by])

    __table_args__ = (db.UniqueConstraint('file_id', 'group_id', name='uq_file_group'),)

    def to_dict(self):
        return {
            'id': self.id,
            'fileId': self.file_id,
            'fileName': self.file.file_name if self.file else None,
            'groupId': self.group_id,
            'groupName': self.group.name if self.group else None,
            'sharedBy': self.sharer.researcher_id if self.sharer else None,
            'kemCiphertexts': self.kem_ciphertexts,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
        }


class UserSettings(db.Model):
    __tablename__ = 'user_settings'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)
    algorithm = db.Column(db.String(50), default='AES-256-GCM')
    key_size = db.Column(db.String(10), default='512')
    auto_delete = db.Column(db.Boolean, default=False)
    animations = db.Column(db.Boolean, default=True)
    high_contrast = db.Column(db.Boolean, default=False)
    session_timeout = db.Column(db.String(10), default='30')
    two_factor = db.Column(db.Boolean, default=False)
    audit_logging = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            'algorithm': self.algorithm,
            'keySize': self.key_size,
            'autoDelete': self.auto_delete,
            'animations': self.animations,
            'highContrast': self.high_contrast,
            'sessionTimeout': self.session_timeout,
            'twoFactor': self.two_factor,
            'auditLogging': self.audit_logging,
        }
