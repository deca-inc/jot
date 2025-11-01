## Security & Encryption

### Threat Model
- Protect against lost/stolen device, nosy processes, and cloud providers.
- Not defending against targeted, persistent attackers with device root access.

### Keys
- **Master Key**: 256-bit key derived from passphrase via Argon2id (salted, memory-hard).
- **Key Storage**: Encrypted with OS keystore (Keychain on macOS). Passphrase required to unlock.

### Data at Rest
- **DB Encryption**: Encrypt the entire SQLite storage file as a whole (opaque to most of the system). This keeps the encryption layer separate from the application logic.
- **Files**: Each attachment encrypted with random file key; keys wrapped by master key.

### Backups
- Client-side encryption before upload. Zero-knowledge providers.
- Integrity: HMAC over archive manifest; per-file checksums.

### Privacy
- No content leaves device unless exporting/backing up. Telemetry off by default.
