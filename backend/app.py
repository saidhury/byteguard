"""
ByteGuard Flask Application Factory.
Post-Quantum Secure Data Sharing Platform — Backend.
"""

import sys
import os

# Ensure backend dir is on the path for module imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from config import Config
from models import db

jwt = JWTManager()


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Extensions
    db.init_app(app)
    CORS(app, origins=app.config.get('CORS_ORIGINS', '*'),
         supports_credentials=True)
    jwt.init_app(app)

    # Wire up token blocklist
    from routes.auth_routes import token_blocklist_check
    jwt.token_in_blocklist_loader(token_blocklist_check)

    # Create tables
    with app.app_context():
        db.create_all()
        # Migrate: add owner_kem_ct to file_metadata if missing
        with db.engine.connect() as conn:
            cols = [r[1] for r in conn.execute(db.text(
                "PRAGMA table_info(file_metadata)"
            ))]
            if 'owner_kem_ct' not in cols:
                conn.execute(db.text(
                    "ALTER TABLE file_metadata ADD COLUMN owner_kem_ct TEXT"
                ))
                conn.commit()
            # Migrate: create file_events table if missing
            tables = [r[0] for r in conn.execute(db.text(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ))]
            if 'file_events' not in tables:
                conn.execute(db.text("""
                    CREATE TABLE file_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        file_id INTEGER NOT NULL REFERENCES file_metadata(id),
                        actor_user_id INTEGER NOT NULL REFERENCES users(id),
                        event_type VARCHAR(64) NOT NULL,
                        metadata_json JSON,
                        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.execute(db.text(
                    "CREATE INDEX IF NOT EXISTS ix_file_events_file_id ON file_events(file_id)"
                ))
                conn.commit()

            # Migrate: add file_id + content_type to file_history if missing
            hist_cols = [r[1] for r in conn.execute(db.text(
                "PRAGMA table_info(file_history)"
            ))]
            if 'file_id' not in hist_cols:
                conn.execute(db.text(
                    "ALTER TABLE file_history ADD COLUMN file_id INTEGER REFERENCES file_metadata(id)"
                ))
                conn.commit()
            if 'content_type' not in hist_cols:
                conn.execute(db.text(
                    "ALTER TABLE file_history ADD COLUMN content_type VARCHAR(128) DEFAULT 'application/octet-stream'"
                ))
                conn.commit()

    # Register blueprints
    from routes.auth_routes import auth_bp
    from routes.files_routes import files_bp
    from routes.settings_routes import settings_bp
    from routes.group_routes import groups_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(files_bp, url_prefix='/api/files')
    app.register_blueprint(settings_bp, url_prefix='/api/settings')
    app.register_blueprint(groups_bp, url_prefix='/api/groups')

    # Health check
    @app.route('/api/health')
    def health():
        return {'status': 'ok', 'service': 'ByteGuard PQC Backend'}

    return app


# Module-level instance for gunicorn: `gunicorn app:app`
app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
