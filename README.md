# ERP Email Service

Email service for ERP system with IMAP (incoming) and SMTP (outgoing) support.

## Features

- 📥 **IMAP Email Fetching** - Fetch emails from inbox
- 📤 **SMTP Email Sending** - Send emails via SMTP
- 🌐 **Web Interface** - Simple web UI to view and send emails
- 🔒 **Secure** - Credentials stored in environment variables

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `env.example` to `env` and fill in your email credentials:
   ```bash
   copy env.example env
   ```

3. Edit `env` file with your email settings:
   ```
   MAIL_USER=your-email@example.com
   MAIL_PASS=your-password
   IMAP_HOST=imap.example.com
   IMAP_PORT=993
   IMAP_TLS=true
   SMTP_HOST=smtp.example.com
   SMTP_PORT=465
   SMTP_SECURE=true
   PORT=3001
   ```

4. Start the server:
   ```bash
   npm start
   ```

5. Open browser: `http://localhost:3001`

## API Endpoints

- `GET /api/emails?limit=20` - List emails
- `GET /api/emails/:uid` - Get email by UID
- `POST /api/email/send` - Send email
- `POST /api/email/test` - Send test email
- `GET /api/smtp/test` - Test SMTP connection
- `GET /api/health` - Health check

## Security

⚠️ **Never commit the `env` file to git!** It contains sensitive credentials.

