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
- ✅ **State checking**: Reuses existing connection if already authenticated (for list emails)
- ✅ **Fresh instance**: Creates new client if old one is invalid
- ✅ **Debug logging**: Enabled for troubleshooting
- ✅ **Error handling**: Detailed error messages for connection/auth failures
- ✅ **Isolated fetch connections**: Each email fetch uses its own fresh IMAP connection (see Troubleshooting #5)

### API Endpoints
- `GET /api/emails?limit=50` - List emails from inbox (uses shared `imapClient`)
- `GET /api/emails/:uid` - Get full email content (uses fresh `fetchClient` per request)
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
  connectionTimeout: 30000,   // 30 seconds (increased for idle reconnection)
  greetingTimeout: 20000,      // 20 seconds (increased for idle reconnection)
  socketTimeout: 30000,        // 30 seconds (increased for idle reconnection)
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

4. **Extended Timeouts**: 30 seconds for connection/greeting
   - Allows time for SSL/TLS handshake
   - Accommodates slower network conditions
   - Handles idle period reconnection

5. **Retry-after-idle (server-side)**:
   - For sending email (`POST /api/email/send`), the server retries once on connection/timeout errors.
   - Each retry uses a **fresh Nodemailer transport** to avoid stale sockets.

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

5. **❌ Second Email Fetch Fails After First Email Works**
   - **Problem**: 
     - First email fetch works perfectly
     - Second email fetch times out with "Request timeout - server took too long to respond"
     - Error: "Mailbox is not open. Cannot search."
     - Server logs show mailbox state issues
   - **Root Cause**:
     - Shared IMAP connection (`imapClient`) was being reused across multiple fetch requests
     - After first email fetch, mailbox was closed in `finally` block
     - When second email fetch started, code was checking `imapClient` state but mailbox was already closed
     - Mailbox state became inconsistent between requests
     - Variable reference bug: Code created fresh `fetchClient` but still checked old `imapClient` variable
   - **Solution**: **Fresh IMAP Connection Per Fetch Request**
     - Changed `/api/emails/:uid` endpoint to create a **dedicated IMAP client** (`fetchClient`) for each request
     - Each email fetch operation gets its own isolated connection
     - Connection is properly closed and logged out after each operation
     - No shared state between requests
   - **Implementation Details**:
     ```javascript
     // BEFORE (Shared Connection - Problematic):
     app.get('/api/emails/:uid', async (req, res) => {
       await connectImap();  // Uses shared imapClient
       // ... operations on imapClient
       // Problem: State conflicts between requests
     });
     
     // AFTER (Fresh Connection Per Request - Fixed):
     app.get('/api/emails/:uid', async (req, res) => {
       let fetchClient = null;  // Fresh client for this request
       try {
         fetchClient = createImapClient();  // Create new client
         await fetchClient.connect();       // Connect fresh
         // ... all operations use fetchClient
       } finally {
         // Cleanup: Close mailbox and logout
         if (fetchClient?.state >= 3) await fetchClient.mailboxClose();
         if (fetchClient?.state >= 2) await fetchClient.logout();
       }
     });
     ```
   - **Key Changes**:
     1. **Fresh Client Creation**: Each fetch creates `fetchClient = createImapClient()`
     2. **Isolated Connection**: No sharing with list emails endpoint or other fetches
     3. **Proper Cleanup**: `finally` block ensures connection is closed and logged out
     4. **Variable Consistency**: All operations use `fetchClient`, not `imapClient`
     5. **State Verification**: Checks `fetchClient.state` before operations
   - **Why This Works**:
     - ✅ **No State Conflicts**: Each request has its own connection
     - ✅ **Clean State**: Every fetch starts with a fresh, authenticated connection
     - ✅ **Proper Cleanup**: Connection is fully closed after each operation
     - ✅ **Isolation**: One request cannot affect another
     - ✅ **Reliability**: No dependency on previous request's state
   - **Trade-offs**:
     - ⚠️ **Slight Performance Cost**: Creating new connection per fetch (~100-200ms overhead)
     - ✅ **Reliability Gain**: Eliminates all state-related bugs
     - ✅ **Worth It**: Small performance cost is acceptable for reliability
   - **Status**: ✅ **FIXED** - All email fetches now work reliably, regardless of order

6. **❌ Idle Timeout / “Failed to fetch” after leaving the page open**
   - **Problem**:
     - After leaving the web UI idle for a while, clicking an email may fail with:
       - `TypeError: Failed to fetch` (browser-side)
       - or a request timeout (AbortError)
   - **Root Cause**:
     - Idle network connections can be dropped by router/firewall/server.
     - The browser sometimes fails the request before it even reaches Express (so you see “Failed to fetch”).
   - **Fix (Frontend + Backend)**:
     - **Backend**:
       - IMAP fetch already uses fresh `fetchClient` per request (so it naturally “reconnects” by creating a new IMAP connection).
       - SMTP send now retries once using a fresh transport.
     - **Frontend**:
       - `show(uid)` (read email) now **auto-retries once** when it detects idle network/timeout errors.
       - Instead of throwing an error popup immediately, it shows **“Reconnecting… (retrying)”** and retries the fetch.
       - If the retry also fails, it returns to the list (so the UI never gets stuck).
   - **Notes**:
     - This prevents most user-visible errors after idle.
     - If the network is truly offline, retry will also fail (expected).

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

- **IMAP Connection Strategy**:
  - **List emails** (`/api/emails`): Uses shared `imapClient` connection (reused if authenticated)
  - **Fetch email** (`/api/emails/:uid`): Uses fresh `fetchClient` connection per request (isolated, no state conflicts)
  - This dual strategy balances performance (list) with reliability (fetch)
- **SMTP**: Transport is created fresh for each email send/test
- Both IMAP and SMTP use the same email credentials
- Debug logging is enabled for both IMAP and SMTP connections

---

---

## 🛠️ Comprehensive Troubleshooting Guide

### 📋 Table of Contents
1. [SMTP/IMAP Setup](#smtpimap-setup)
2. [Preventing Timeouts](#preventing-timeouts)
3. [Common Issues & Solutions](#common-issues--solutions)

---

## 🔧 SMTP/IMAP Setup

### Initial Setup Steps

#### 1. Environment Configuration (`env` file)
```bash
# Required settings
MAIL_USER=your-email@example.com
MAIL_PASS="your-password"  # Use quotes if password contains special characters
IMAP_HOST=imap.example.com
IMAP_PORT=993
IMAP_TLS=true
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
PORT=3001
```

**Important Notes:**
- ✅ **Password with special characters**: Must be quoted (e.g., `MAIL_PASS="Lr#3151717"`)
- ✅ **Port 465**: Use `SMTP_SECURE=true` (SSL/TLS direct)
- ✅ **Port 587**: Use `SMTP_SECURE=false` (STARTTLS)
- ✅ **Port 993**: Always use `IMAP_TLS=true` (IMAP over SSL)

#### 2. Verify Network Connectivity

**Test SMTP Port:**
```powershell
# Windows PowerShell
Test-NetConnection -ComputerName homegw.bbmail.com.hk -Port 465

# Expected: TcpTestSucceeded: True
```

**Test IMAP Port:**
```powershell
Test-NetConnection -ComputerName imap.bbmail.com.hk -Port 993

# Expected: TcpTestSucceeded: True
```

#### 3. Test Raw Connection (Optional)
```bash
node test-smtp-raw.js
```

**Expected Output:**
```
✅ TCP connection successful!
✅ SSL/TLS connection successful!
TLS Version: TLSv1.3
Cipher: TLS_AES_256_GCM_SHA384
```

---

## ⏱️ Preventing Timeouts

### Understanding Timeout Issues

**Why Timeouts Happen:**
1. **Idle Connections**: Email servers close idle connections after 15-30 minutes
2. **Network Issues**: Firewall, VPN, or network interruptions
3. **Server Overload**: Email server temporarily unavailable
4. **SSL/TLS Handshake**: Slow network or certificate validation delays

### Current Timeout Configuration

#### IMAP (Incoming Email)
```javascript
// Connection timeouts
connectionTimeout: 10000,  // 10 seconds for initial connection
greetingTimeout: 5000,     // 5 seconds for server greeting

// Operation timeouts
searchTimeout: 5000,       // 5 seconds for email search
fetchTimeout: 10000,       // 10 seconds for email fetch
frontendTimeout: 30000,    // 30 seconds (allows for reconnection)
```

#### SMTP (Outgoing Email)
```javascript
// Connection timeouts
connectionTimeout: 30000,  // 30 seconds (increased for idle reconnection)
greetingTimeout: 20000,    // 20 seconds (increased for idle reconnection)
socketTimeout: 30000,      // 30 seconds (increased for idle reconnection)

// Operation timeouts
sendTimeout: 60000,        // 60 seconds for send operation
frontendTimeout: 60000,    // 60 seconds (allows for retry)
```

### Automatic Reconnection Strategies

#### IMAP Reconnection
- ✅ **Auto-reconnect on stale connection**: Detects stale connections and reconnects automatically
- ✅ **Fresh connection per fetch**: Each email fetch uses isolated connection
- ✅ **Mailbox state recovery**: Automatically reopens mailbox if closed

#### SMTP Reconnection
- ✅ **Retry with fresh transport**: Up to 2 attempts (initial + 1 retry)
- ✅ **2-second delay between retries**: Allows server to recover
- ✅ **Fresh transport per attempt**: Each retry creates new connection

### Best Practices to Prevent Timeouts

1. **Keep Connections Active**
   - ✅ Use fresh connections for each operation (already implemented)
   - ✅ Close connections properly after use
   - ✅ Don't reuse stale connections

2. **Handle Idle Periods**
   - ✅ Automatic reconnection on first use after idle
   - ✅ Increased timeouts to allow for reconnection
   - ✅ Retry logic for transient failures

3. **Monitor Connection Health**
   - ✅ Check connection state before operations
   - ✅ Log connection state changes
   - ✅ Detect and handle stale connections

---

## 🔍 Common Issues & Solutions

### Issue 1: Cannot Read Email (IMAP)

#### Symptoms
- ❌ "Error loading emails: Request timeout"
- ❌ "IMAP connection failed"
- ❌ "Failed to fetch" after idle period
- ❌ Empty email list

#### Diagnosis Steps

1. **Check Server Logs**
   ```bash
   # Look for these messages in server console:
   - "IMAP already connected (state: X)"
   - "Creating new IMAP client instance..."
   - "IMAP connected successfully"
   - "Failed to open INBOX"
   ```

2. **Check Connection State**
   - State 0: Disconnected ❌
   - State 1: Connecting ⏳
   - State 2: Authenticated ✅
   - State 3: Selected (mailbox open) ✅

3. **Test IMAP Connection**
   ```bash
   # Visit in browser:
   http://localhost:3001/api/imap/diagnostic
   ```

#### Solutions

**Solution A: Connection Timeout After Idle**
```javascript
// Already implemented: Auto-reconnection
// The server automatically reconnects when:
// 1. Connection is stale
// 2. Mailbox open fails
// 3. Search/fetch operations timeout
```

**Solution B: Authentication Failed**
- ✅ Check `MAIL_USER` and `MAIL_PASS` in `env` file
- ✅ Verify password is quoted if it contains special characters
- ✅ Test credentials with email client (Outlook, Thunderbird)

**Solution C: Network/Firewall Issue**
- ✅ Check if port 993 is open: `Test-NetConnection -ComputerName imap.bbmail.com.hk -Port 993`
- ✅ Verify firewall allows outbound connections on port 993
- ✅ Check if VPN is required

**Solution D: Server Unavailable**
- ✅ Check if IMAP server is accessible: `ping imap.bbmail.com.hk`
- ✅ Verify server is not blocking your IP
- ✅ Contact IT if server is down

---

### Issue 2: Cannot Send Email (SMTP)

#### Symptoms
- ❌ "Error sending email: Network error: Failed to fetch"
- ❌ "SMTP connection timeout"
- ❌ "Cannot connect to SMTP server"
- ❌ Error after long idle period

#### Diagnosis Steps

1. **Check Server Logs**
   ```bash
   # Look for these messages:
   - "[Attempt 1/2] Sending email..."
   - "Connection/timeout error detected. Retrying..."
   - "Email sent successfully"
   - "SMTP connection timeout"
   ```

2. **Check Retry Status**
   - First attempt fails → Automatic retry after 2 seconds
   - Second attempt succeeds → Email sent ✅
   - Both attempts fail → Error returned ❌

#### Solutions

**Solution A: Connection Timeout After Idle (Most Common)**
```javascript
// Already implemented: Automatic retry with reconnection
// The server automatically:
// 1. Detects connection/timeout errors
// 2. Waits 2 seconds
// 3. Creates fresh SMTP transport
// 4. Retries sending email
```

**What Happens:**
1. First attempt fails with timeout/connection error
2. Server detects retryable error (`ECONNECTION`, `ETIMEDOUT`, `ESOCKET`)
3. Waits 2 seconds
4. Creates fresh transport (new connection)
5. Retries sending
6. If successful → Email sent ✅
7. If still fails → Returns error with details

**Solution B: Wrong SMTP Server/Port**
- ✅ Verify `SMTP_HOST` in `env` file
- ✅ Use `homegw.bbmail.com.hk` (not `smtp.bbmail.com.hk`)
- ✅ Use port 465 with `SMTP_SECURE=true`
- ✅ Test port connectivity: `Test-NetConnection -ComputerName homegw.bbmail.com.hk -Port 465`

**Solution C: Authentication Failed**
- ✅ Check `MAIL_USER` and `MAIL_PASS` match IMAP credentials
- ✅ Verify password is correct and quoted if needed
- ✅ Test with email client

**Solution D: Network/Firewall Issue**
- ✅ Check if port 465 is open
- ✅ Verify firewall allows outbound SMTP
- ✅ Check if VPN is required
- ✅ Some networks block SMTP ports

**Solution E: Server Rejecting Connection**
- ✅ Check if server requires specific IP whitelist
- ✅ Verify account is not locked/suspended
- ✅ Check server status with IT

---

### Issue 3: First Email Works, Second Email Keeps Loading

#### Symptoms
- ✅ First email click → Works perfectly
- ❌ Second email click → "Loading..." forever
- ❌ Error: "Request timeout - server took too long to respond"
- ❌ Error: "Mailbox is not open. Cannot search."

#### Root Cause
**Shared IMAP connection state conflict:**
- First fetch closes mailbox after operation
- Second fetch tries to use same connection
- Connection state is inconsistent
- Search operation hangs or fails

#### Solution (Already Implemented)

**Fresh Connection Per Fetch:**
```javascript
// Each email fetch now uses its own isolated connection
app.get('/api/emails/:uid', async (req, res) => {
  let fetchClient = null;  // Fresh client for this request
  
  try {
    // Create fresh IMAP client
    fetchClient = createImapClient();
    await fetchClient.connect();
    
    // Open mailbox
    await fetchClient.mailboxOpen('INBOX');
    
    // Search and fetch email
    // ... operations ...
    
  } finally {
    // Always cleanup
    if (fetchClient?.state >= 3) await fetchClient.mailboxClose();
    if (fetchClient?.state >= 2) await fetchClient.logout();
  }
});
```

**Why This Works:**
- ✅ **No State Conflicts**: Each fetch has its own connection
- ✅ **Clean State**: Every fetch starts fresh
- ✅ **Proper Cleanup**: Connection fully closed after each operation
- ✅ **Isolation**: One fetch cannot affect another

**If Issue Persists:**
1. Check server logs for connection errors
2. Verify `fetchClient` is being used (not `imapClient`)
3. Check if mailbox is properly closed in `finally` block
4. Verify connection state before search operation

### Issue 5: Idle timeout — click email shows “Failed to fetch”

#### What the system does now
- First click after idle:
  - If it fails with a network/timeout error, the UI **retries once automatically**
  - It shows **“Reconnecting… (retrying)”**
  - If retry still fails, it returns to the list (no infinite loading)

#### If you still see errors
- It usually means one of these:
  - PC network disconnected
  - VPN dropped
  - Corporate firewall blocks / resets connections
- Try:
  - refresh the page (Ctrl+F5)
  - click the email again
  - check server console for any IMAP/SMTP errors

---

### Issue 4: Timeout After Long Idle Period

#### Symptoms
- ✅ Works fine when actively used
- ❌ After 10-30 minutes idle → Timeout errors
- ❌ "Network error: Failed to fetch"
- ❌ "Connection timeout"

#### Solution (Already Implemented)

**IMAP (Receive Email):**
- ✅ Auto-reconnection on stale connection
- ✅ Fresh connection per fetch (no stale state)
- ✅ Increased timeouts (30 seconds) to allow reconnection

**SMTP (Send Email):**
- ✅ Automatic retry with fresh transport
- ✅ Detects connection/timeout errors
- ✅ Creates new connection on retry
- ✅ Increased timeouts (60 seconds) for reconnection

**What Happens:**
1. After idle period, connection is stale/closed
2. First operation detects stale connection
3. Automatically creates fresh connection
4. Retries operation
5. Usually succeeds on retry ✅

---

## 📊 Quick Reference: Error Codes

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `ECONNECTION` | Cannot connect to server | Check network/firewall, verify server address |
| `ETIMEDOUT` | Connection timeout | Check network, increase timeout, retry |
| `ESOCKET` | Socket error | Check firewall, verify port is open |
| `EAUTH` | Authentication failed | Check username/password in `env` file |
| `EMAIL_NOT_FOUND` | Email UID not found | Email may have been deleted/moved |
| `SEARCH_FAILED` | IMAP search failed | Connection may be stale, will auto-retry |
| `FETCH_FAILED` | IMAP fetch failed | Connection may be stale, will auto-retry |

---

## 🔄 Testing & Verification

### Test IMAP Connection
```bash
# Browser: http://localhost:3001/api/imap/diagnostic
# Or: http://localhost:3001/api/test-connection
```

### Test SMTP Connection
```bash
# Browser: http://localhost:3001/api/smtp/test
```

### Test Email Send
```bash
# Use the web UI compose form
# Or POST to: http://localhost:3001/api/email/send
```

### Monitor Server Logs
```bash
# Watch for:
# - Connection state changes
# - Retry attempts
# - Timeout errors
# - Successful operations
```

---

**Last Updated**: Added retry-after-idle behavior (IMAP read + SMTP send) and clarified the “1st email OK / 2nd email loading” fix
**Status**: ✅ Both IMAP and SMTP are working correctly with timeout handling

