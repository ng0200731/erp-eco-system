## Tech Stack (keep simplest + stable)

### Runtime
- Node.js (current project uses ESM)

### Backend
- Express (API + static hosting for `public/`)
- `imapflow` for IMAP
- `nodemailer` for SMTP

### Frontend
- Single-file `public/index.html` (vanilla JS + CSS)
- In-app centered modal for all user messages (no browser popups)
- Strict monochrome UI (black/white only) and straight borders

### Ops / Scripts
- `start.bat` for local startup (kill port, start server, open browser)
- Optional test scripts: `test-connection.bat`, `test-smtp-raw.js`, etc.

### Docs
- `EMAIL_CONFIG_DETAILS.md` for configuration + troubleshooting
- `memory-bank/*` for planning + architecture + progress (this folder)


