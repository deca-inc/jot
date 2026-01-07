## Security & Encryption

### Threat Model

- Protect against lost/stolen device, nosy processes, and cloud providers.
- Not defending against targeted, persistent attackers with device root access.

### Keys

- **Master Key**: 256-bit key auto-generated using cryptographically secure random number generation.
- **Key Storage**: Stored securely in OS keystore (Keychain on macOS/iOS, Keystore on Android).
- **Key Management**: Key is automatically generated on first launch and stored securely. No user passphrase required for default encryption mode, providing seamless UX while still protecting against lost/stolen devices, nosy processes, and cloud providers.
- **Optional Passphrase Mode**: Future enhancement - allow users to optionally enable passphrase-based encryption for additional security (defends against attackers with device + Keychain access).

### Data at Rest

- **DB Encryption**: Encrypt the entire SQLite storage file as a whole (opaque to most of the system). This keeps the encryption layer separate from the application logic.
- **Files (Planned)**: Each attachment encrypted with random file key; keys wrapped by master key. _Note: Attachments feature not yet implemented._

### Backups (Planned)

_Backup functionality is not yet implemented. The following describes the planned strategy:_

- Client-side encryption before upload. Zero-knowledge providers.
- Integrity: HMAC over archive manifest; per-file checksums.

### Privacy

- No content leaves device unless exporting/backing up. Telemetry off by default.
