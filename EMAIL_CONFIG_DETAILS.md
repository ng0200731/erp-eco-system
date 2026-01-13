# 📧 Email Configuration Details (IMAP & SMTP)

## 🔐 Current Working Configuration

### Environment File (`env`)
```
MAIL_USER=m.yau.01@longriverlabel.com
MAIL_PASS="Lr#3151717"
IMAP_HOST=imap.bbmail.com.hk
IMAP_PORT=993
IMAP_TLS=true
SMTP_HOST=homegw.bbmail.com.hk
SMTP_PORT=465
SMTP_SECURE=true
PORT=3001
```

---

## 📥 IMAP Configuration (Incoming Email)

### Server Details
- **Host**: `imap.bbmail.com.hk`
- **Port**: `993`
- **Security**: `TLS/SSL` (secure: true)
- **Protocol**: IMAP4 (Internet Message Access Protocol)
- **Email Account**: `m.yau.01@longriverlabel.com`

### Technical Implementation
- **Library**: `imapflow` (v1.0.92)
- **Connection Type**: Secure TLS/SSL connection on port 993
- **Authentication**: Username + Password
- **Certificate Validation**: Disabled (`rejectUnauthorized: false`) - accepts all certificates
- **Connection State Management**: 
  - State 0: Disconnected
  - State 1: Connecting
  - State 2: Authenticated ✅
  - State 3: Selected (mailbox selected)
  - State 4: Idle (waiting for new emails)

### Features
- ✅ **Auto-reconnect**: Automatically reconnects if connection drops
- ✅ **State checking**: Reuses existing connection if already authenticated
- ✅ **Fresh instance**: Creates new client if old one is invalid
- ✅ **Debug logging**: Enabled for troubleshooting
- ✅ **Error handling**: Detailed error messages for connection/auth failures

### API Endpoints
- `GET /api/emails?limit=50` - List emails from inbox
- `GET /api/emails/:uid` - Get full email content
- `GET /api/test-connection` - Test IMAP connection

---

## 📤 SMTP Configuration (Outgoing Email)

### Server Details
- **Host**: `homegw.bbmail.com.hk` ⚠️ (NOT `smtp.bbmail.com.hk`)
- **Port**: `465`
- **Security**: `SSL/TLS` (secure: true) - Direct SSL connection
- **Protocol**: SMTP (Simple Mail Transfer Protocol)
- **Email Account**: `m.yau.01@longriverlabel.com`

### Technical Implementation
- **Library**: `nodemailer` (v6.9.12)
- **Connection Type**: Direct SSL/TLS on port 465 (NOT STARTTLS)
- **Authentication**: Username + Password (PLAIN method)
- **Certificate Validation**: Disabled (`rejectUnauthorized: false`)
- **Connection Strategy**: **Fresh transport for each request** (avoids connection reuse issues)

### SMTP Configuration Object
```javascript
{
  host: 'homegw.bbmail.com.hk',
  port: 465,
  secure: true,  // SSL/TLS direct (NOT STARTTLS)
  auth: {
    user: 'm.yau.01@longriverlabel.com',
    pass: 'Lr#3151717'  // Quotes removed automatically
  },
  tls: {
    rejectUnauthorized: false  // Accept all certificates
  },
  connectionTimeout: 20000,   // 20 seconds
  greetingTimeout: 15000,      // 15 seconds
  socketTimeout: 20000,        // 20 seconds
  pool: false,                  // No connection pooling
  debug: true,                 // Debug logging enabled
  logger: true                  // Console logging enabled
}
```

### Why This Configuration Works

1. **Correct Server**: `homegw.bbmail.com.hk` (not `smtp.bbmail.com.hk`)
   - `homegw.bbmail.com.hk:465` passes port connectivity test
   - `smtp.bbmail.com.hk:465` times out

2. **Port 465 with SSL/TLS**: Direct SSL connection (not STARTTLS)
   - Port 587 (STARTTLS) also times out
   - Port 465 (SSL/TLS) works reliably

3. **Fresh Transport Per Request**: Creates new Nodemailer transport for each email/test
   - Prevents connection reuse issues
   - Each request gets a clean connection
   - Transport is closed after use

4. **Extended Timeouts**: 20 seconds for connection/greeting
   - Allows time for SSL/TLS handshake
   - Accommodates slower network conditions

### API Endpoints
- `POST /api/email/send` - Send email
  - Body: `{ to, subject, text, html }`
- `GET /api/smtp/test` - Test SMTP connection

---

## 🔍 Troubleshooting History

### Issues Encountered & Solutions

1. **❌ Port 587 Timeout**
   - **Problem**: `ETIMEDOUT` on port 587 (STARTTLS)
   - **Solution**: Switched to port 465 (SSL/TLS direct)

2. **❌ Wrong SMTP Server**
   - **Problem**: `smtp.bbmail.com.hk:465` timing out
   - **Solution**: Changed to `homegw.bbmail.com.hk:465`

3. **❌ Connection Reuse Issues**
   - **Problem**: Nodemailer transport reuse causing timeouts
   - **Solution**: Create fresh transport for each request

4. **❌ Insufficient Timeouts**
   - **Problem**: Default timeouts too short for SSL/TLS handshake
   - **Solution**: Increased to 20 seconds

### Verification Tests

#### Raw Connection Test (`test-smtp-raw.js`)
```bash
node test-smtp-raw.js
```
**Result**: ✅
- TCP connection: Success
- SSL/TLS handshake: Success (TLSv1.3)
- Cipher: TLS_AES_256_GCM_SHA384

#### Port Connectivity Test
```powershell
Test-NetConnection -ComputerName homegw.bbmail.com.hk -Port 465
```
**Result**: ✅ `TcpTestSucceeded: True`

---

## 📋 Alternative SMTP Servers (Tested)

| Server | Port | Security | Status |
|--------|------|----------|--------|
| `homegw.bbmail.com.hk` | 465 | SSL/TLS | ✅ **WORKING** |
| `homegw.bbmail.com.hk` | 587 | STARTTLS | ❌ Timeout |
| `smtp.bbmail.com.hk` | 465 | SSL/TLS | ❌ Timeout |
| `smtp.bbmail.com.hk` | 587 | STARTTLS | ❌ Timeout |

---

## 🚀 Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   - Copy `env.example` to `env`
   - Edit `env` with your credentials

3. **Start server**:
   ```bash
   npm start
   ```
   Or use `start.bat` (Windows)

4. **Access web UI**:
   - Open browser to `http://localhost:3001`

---

## 📚 Libraries Used

- **imapflow** (v1.0.92): Modern IMAP client for Node.js
- **nodemailer** (v6.9.12): Email sending library
- **express** (v4.18.2): Web server framework
- **dotenv** (v16.1.4): Environment variable management
- **cors** (v2.8.5): Cross-origin resource sharing

---

## ⚙️ Server Configuration

- **Web Server Port**: `3001`
- **Static Files**: `./public/` directory
- **CORS**: Enabled (allows cross-origin requests)
- **JSON Body Parser**: Enabled

---

## 🔒 Security Notes

- ⚠️ **Password in env file**: Keep `env` file secure, never commit to Git
- ⚠️ **Certificate validation disabled**: `rejectUnauthorized: false` accepts all certificates
  - This is configured to match Android device setting: "接受所有憑證" (Accept all certificates)
- ✅ **Password quoted**: Password with special characters (`#`) is quoted in env file

---

## 📝 Notes

- IMAP connection is established on server startup (non-blocking)
- SMTP transport is created fresh for each email send/test
- Both IMAP and SMTP use the same email credentials
- Debug logging is enabled for both IMAP and SMTP connections

---

**Last Updated**: Based on working configuration after troubleshooting timeout issues
**Status**: ✅ Both IMAP and SMTP are working correctly

