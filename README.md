# 🛡️ ByteGuard — Post-Quantum Secure Data Sharing Platform

> Because your data deserves protection that even a quantum computer can't crack.

ByteGuard is a full-stack encrypted file sharing platform built for researchers and teams who take security seriously. It uses **real post-quantum cryptography** — not a simulation, not a demo — actual CRYSTALS-Kyber key encapsulation running entirely in your browser, paired with AES-256-GCM symmetric encryption.

The server **never** sees your plaintext files or encryption keys. Ever.

![ByteGuard Banner](./screenshots/banner.png)
<!-- TODO: Add a banner screenshot of the login or dashboard page -->

---

## ✨ What It Does

- **Encrypt files** with AES-256-GCM before they ever leave your browser
- **Share encrypted files** with individuals using Kyber-512 Key Encapsulation Mechanism (KEM)
- **Create research groups** and share files with entire teams using per-member KEM ciphertexts
- **View files inline** — PDF viewer, image preview, and text viewer with client-side decryption
- **Receive & decrypt** shared files using your locally-stored private key
- **Track everything** — full encryption history with CSV export
- **Manage access** — revoke individual or group file access at any time
- **Light & dark theme** — modern, accessible interface with smooth animations and CSS custom-property design tokens
- Zero-trust architecture: the server stores only ciphertext blobs

![Dashboard](./screenshots/dashboard.png)
<!-- TODO: Screenshot of the Encryption page with a file ready to encrypt -->

---

## 🔐 How the Crypto Works

This isn't a toy. Here's the actual pipeline:

### Encrypting a File
1. Browser generates a random **AES-256-GCM** key via WebCrypto
2. File is encrypted with that key (12-byte IV, 128-bit auth tag)
3. The AES key is **Kyber-KEM-wrapped with the owner's own public key** and stored alongside the file metadata (`ownerKemCt`), so the owner can recover it later for sharing
4. The encrypted blob (`IV || ciphertext`) is uploaded to the server
5. SHA-256 fingerprint is computed for integrity verification
6. Server stores the blob and the owner's KEM ciphertext — it has no idea what's inside

### Sharing with Someone
1. Sender **unwraps their own `ownerKemCt`** using their Kyber private key to recover the original AES key
2. Sender looks up the recipient's **Kyber-512 public key** from the server
3. A Kyber KEM encapsulation produces a `kemCiphertext` + `sharedSecret`
4. The **same** AES key is XOR-wrapped with the `sharedSecret` → `wrappedKey`
5. `kemCiphertext + wrappedKey` are sent to the server alongside the share metadata
6. Recipient gets a **share code** to claim the file

### Receiving & Decrypting
1. Recipient enters the share code (or views a group-shared file)
2. Browser loads their **Kyber private key from IndexedDB** (never leaves the browser)
3. KEM decapsulation recovers the `sharedSecret`
4. XOR-unwrap recovers the original AES key
5. Encrypted blob is downloaded, IV is split off, AES-GCM decrypts the file
6. File is displayed inline (PDF/image/text) or downloaded. Done.

### Sharing with a Group
1. Group owner/admin shares a file with the group
2. Browser **unwraps `ownerKemCt`** to recover the original AES key
3. Browser fetches all group members' Kyber-512 public keys
4. The **same** AES key is individually encapsulated for each member → per-user KEM ciphertexts
5. All KEM ciphertexts stored as JSON on server: `{"userId": "kemPayload", ...}`
6. Any group member can decrypt using their own private key + their KEM ciphertext

![Encryption Flow](./screenshots/encryption-flow.png)
<!-- TODO: Screenshot of the Encryption page showing encryption stats and fingerprint -->

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, TailwindCSS v4 |
| **Backend** | Python 3, Flask, SQLAlchemy, Flask-JWT-Extended |
| **Database** | SQLite (via SQLAlchemy ORM) |
| **Crypto (symmetric)** | AES-256-GCM — native WebCrypto API |
| **Crypto (post-quantum)** | CRYSTALS-Kyber-512 — `crystals-kyber-js` |
| **Key Storage** | Browser IndexedDB (private keys never leave the client) |
| **Auth** | JWT tokens with bcrypt password hashing |
| **Containerization** | Docker + Docker Compose + Nginx |

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.10+** (for the Flask backend)
- **Node.js 18+** (for the React frontend)
- **Docker & Docker Compose** (optional, for containerized deployment)

### Option 1: Run Locally (Development)

**1. Clone the repo**
```bash
git clone https://github.com/saidhury/byteguard.git
cd byteguard
```

**2. Set up the backend**
```bash
cd backend
pip install -r requirements.txt
python app.py
```
The Flask API will start on `http://localhost:5000`.

**3. Set up the frontend** (in a new terminal)
```bash
cd client
npm install
npm run dev
```
The Vite dev server will start on `http://localhost:5173` and proxy API requests to Flask automatically.

**4. Open your browser** and go to `http://localhost:5173`

That's it. No environment variables to configure for local dev — it just works.

### Option 2: Docker (Production-like)

```bash
docker-compose up --build
```

This spins up:
- `byteguard-api` — Flask + Gunicorn on port 5000
- `byteguard-ui` — Nginx serving the React build on port 80, proxying `/api` to the backend

Open `http://localhost` and you're good to go.

To tear it down:
```bash
docker-compose down
```

---

## 📁 Project Structure

```
byteguard/
├── backend/                    # Flask API
│   ├── app.py                  # App factory, blueprint registration
│   ├── config.py               # Configuration (DB path, JWT, storage)
│   ├── models.py               # SQLAlchemy models (User, FileMetadata, Group, etc.)
│   ├── requirements.txt        # Python dependencies
│   ├── Dockerfile              # Backend container
│   └── routes/
│       ├── auth_routes.py      # Register, login, logout, Kyber key mgmt
│       ├── files_routes.py     # Upload, download, view, share, history
│       ├── group_routes.py     # Group creation, members, file sharing
│       └── settings_routes.py  # User preferences
│
├── client/                     # React + Vite frontend
│   ├── src/
│   │   ├── api/client.js       # API client (JWT, fetch wrapper)
│   │   ├── crypto/
│   │   │   ├── pqc.js          # AES-256-GCM + Kyber-512 crypto functions
│   │   │   └── keyStore.js     # IndexedDB private key storage
│   │   ├── components/         # Layout, Sidebar, TopBar, modals
│   │   │   └── modals/
│   │   │       ├── FileViewer.jsx    # Inline PDF/image/text viewer
│   │   │       ├── ShareModal.jsx    # Share with individual
│   │   │       ├── ReceiveModal.jsx  # Receive via share code
│   │   │       └── ProfileModal.jsx  # User profile
│   │   ├── context/            # AuthContext (Kyber keygen), ToastContext, ThemeContext
│   │   └── pages/              # Encryption, History, Shared, Received, Groups, etc.
│   │       ├── Encryption.jsx      # File encryption lab
│   │       ├── History.jsx         # Encryption history log
│   │       ├── SharedFiles.jsx     # Files you've shared
│   │       ├── ReceivedFiles.jsx   # Files shared with you (individual + group)
│   │       ├── GroupManager.jsx    # Research group management
│   │       ├── AccessControl.jsx   # Permission matrix view
│   │       └── Settings.jsx        # User preferences
│   ├── Dockerfile              # Frontend container (build + Nginx)
│   ├── nginx.conf              # Nginx config with API proxy
│   └── vite.config.js          # Dev proxy to Flask
│
├── docker-compose.yml          # Full stack orchestration
├── data/                       # SQLite database (gitignored)
└── storage/                    # Encrypted file blobs (gitignored)
```

---

## 📸 Screenshots

### Login / Registration
![Login](./screenshots/login.png)
<!-- TODO: Screenshot of the login page with the glassmorphism UI -->

### File Encryption
![Encrypt](./screenshots/encrypt.png)
<!-- TODO: Screenshot showing file selected, entropy visualization, and encryption stats -->

### Sharing a File (Kyber KEM)
![Share](./screenshots/share.png)
<!-- TODO: Screenshot of the Share modal with recipient search and share code -->

### Receiving & Decrypting
![Receive](./screenshots/receive.png)
<!-- TODO: Screenshot of the Receive modal with share code input and decryption progress -->

### Access Control
![Access](./screenshots/access.png)
<!-- TODO: Screenshot of the Access Control page showing active permissions and security protocols -->

### Settings
![Settings](./screenshots/settings.png)
<!-- TODO: Screenshot of the Settings page with toggle switches -->

---

## 🔧 API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account + optional Kyber pubkey |
| POST | `/api/auth/login` | Login → JWT token |
| POST | `/api/auth/logout` | Revoke token |
| GET | `/api/auth/session` | Check current session |
| PUT | `/api/auth/kyber-key` | Upload/update Kyber public key |
| GET | `/api/auth/search?q=` | Search users by ID |
| GET | `/api/auth/pubkey/:id` | Get a user's Kyber public key |

### Files
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload` | Upload encrypted file blob |
| GET | `/api/files/download/:id` | Download encrypted blob (with proper headers) |
| GET | `/api/files/view/:id` | Stream encrypted blob for inline viewing |
| GET | `/api/files/:id/meta` | Get file metadata |
| GET | `/api/files/my-files` | List your uploaded files |
| POST | `/api/files/share` | Share file with KEM ciphertext |
| GET | `/api/files/shared` | List files you've shared |
| GET | `/api/files/received` | List files shared with you |
| GET | `/api/files/share/:code` | Get share details by code |
| DELETE | `/api/files/shared/:id` | Revoke a share |
| GET/POST/DELETE | `/api/files/history` | Encryption history CRUD |

### Groups
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/groups/` | List your groups |
| POST | `/api/groups/create` | Create a research group |
| GET | `/api/groups/:id` | Get group details + members |
| DELETE | `/api/groups/:id` | Delete group (owner only) |
| POST | `/api/groups/:id/members` | Add member to group |
| DELETE | `/api/groups/:id/members/:uid` | Remove member |
| GET | `/api/groups/:id/pubkeys` | Get all member public keys |
| POST | `/api/groups/:id/share-file` | Share file with group (per-member KEM) |
| GET | `/api/groups/shared-files` | List group-shared files accessible to you |

### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/` | Get user preferences |
| PUT | `/api/settings/` | Update preferences |

---

## 🤔 FAQ

**Is this actually post-quantum secure?**
Yes. Kyber-512 (ML-KEM-512) is the NIST-selected standard for post-quantum key encapsulation. The implementation uses the `crystals-kyber-js` library which implements the full Kyber specification in JavaScript.

**Where are my private keys stored?**
In your browser's IndexedDB, under the `ByteGuardKeyStore` database. They never leave your device. If you clear your browser data, you lose your keys — so back them up or don't clear browser storage.

**What if the server gets hacked?**
The attacker gets encrypted blobs and Kyber public keys. Without private keys (which are only in users' browsers), the data is useless. That's the whole point.

**Can I self-host this?**
Absolutely. Clone it, `docker-compose up`, done.

**How does group file sharing work?**
When you share a file with a group, the client recovers the original AES key from your owner KEM ciphertext, then individually re-encapsulates that same AES key for each group member's Kyber public key. The server stores all the per-member KEM ciphertexts as JSON. Each member can decrypt using only their own private key.

**Can I view files without downloading?**
Yes! The new FileViewer component decrypts files client-side and renders PDFs, images, and text files inline. The server never sees the plaintext — decryption happens entirely in your browser.

---

## 📝 License

MIT — do whatever you want with it.

---

<p align="center">
  Built with 🔐 and probably too much caffeine<br/>
  <strong>ByteGuard</strong> — because "trust the server" is not a security model
</p>
