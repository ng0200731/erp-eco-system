## Architecture (high level)

### Overview
- Single Node.js process serves:
  - Static frontend: `public/index.html`
  - JSON API endpoints under `/api/*`
  - (Next) Task ecosystem endpoints for dashboard + task lifecycle

### Backend (`server.js`)
- Loads config from `env` file in project root.
- IMAP:
  - List emails: `GET /api/emails` (shared `imapClient`)
  - Fetch email by UID: `GET /api/emails/:uid` (fresh `fetchClient` per request)
- SMTP:
  - Send email: `POST /api/email/send` (fresh Nodemailer transport per attempt, retries once on retryable errors)
  - Test SMTP: `GET /api/smtp/test`
  - (Next) Task APIs:
    - Create task from email
    - Update task status / assign / follow-up
    - Reply to customer referencing original email
 - Tasks (SQLite):
   - DB file: `data/tasks.db` (ignored by git)
   - Schema table: `tasks`
     - id (INTEGER PK AUTOINCREMENT)
     - type, status
     - sourceEmailUid, sourceSubject, customerEmail
     - notes, createdAt, updatedAt
     - replyMessageId, repliedAt
   - APIs:
     - `GET /api/tasks`
     - `GET /api/tasks/:id`
     - `POST /api/tasks`
     - `POST /api/tasks/:id/status`

### Frontend (`public/index.html`)
- Email list view + detail view (email profile / settings layer)
- Uses `fetch` with `AbortController` timeouts
- Idle recovery:
  - Read email auto-retries once and refreshes list cache during reconnect
- UX constraints:
  - Strict monochrome (black/white only)
  - Straight borders only
  - No browser popups; centered in-app modal
 - (Next) Dashboard + tasks:
   - Tasks list (open/closed)
   - Task detail with lifecycle + reply action

### Docs
- `EMAIL_CONFIG_DETAILS.md`: configuration + troubleshooting playbook
- `memory-bank/*`: planning + architecture + progress history (this folder)


