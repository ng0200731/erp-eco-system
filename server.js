import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------- ENV ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, 'env'), override: true });

const {
  MAIL_USER,
  MAIL_PASS: rawPassword,
  IMAP_HOST = 'imap.bbmail.com.hk',
  IMAP_PORT = 993,
  IMAP_TLS = 'true',
  SMTP_HOST = 'smtp.bbmail.com.hk',
  SMTP_PORT = 465,
  SMTP_SECURE = 'true',
  PORT = 3000,
} = process.env;

// Process password (remove quotes)
const MAIL_PASS = rawPassword?.replace(/^["']|["']$/g, '') || rawPassword;

// Log loaded config for debugging
console.log('=== Loaded Environment Config ===');
console.log('SMTP_HOST:', SMTP_HOST);
console.log('SMTP_PORT:', SMTP_PORT);
console.log('SMTP_SECURE:', SMTP_SECURE);
console.log('IMAP_HOST:', IMAP_HOST);
console.log('PORT:', PORT);
console.log('===============================');

if (!MAIL_USER || !MAIL_PASS) {
  console.error('Missing MAIL_USER or MAIL_PASS in environment. Exiting.');
  process.exit(1);
}

// ---------- IMAP ----------
let imapClient = null;

function createImapClient() {
  return new ImapFlow({
    host: IMAP_HOST,
    port: Number(IMAP_PORT),
    secure: IMAP_TLS === 'true',
    auth: {
      user: MAIL_USER,
      pass: MAIL_PASS,
    },
    logger: true, // Enable debug logs to see what's happening
    tlsOptions: {
      rejectUnauthorized: false, // Allow self-signed certificates
    },
    // Add connection timeouts to prevent hanging
    connectionTimeout: 10000, // 10 seconds for initial connection
    greetingTimeout: 5000,    // 5 seconds for server greeting
  });
}

// Connect immediately (lazy reconnect logic handled below)
async function connectImap() {
  try {
    // Check if we have a valid connected client
    // ImapFlow state: 0=disconnected, 1=connecting, 2=authenticated, 3=selected, 4=idle
    if (imapClient && imapClient.state >= 2) {
      // Check if socket is still connected by checking the state
      // If state is valid, assume connection is good (we'll catch errors during operations)
      console.log(`IMAP already connected (state: ${imapClient.state})`);
      return; // Reuse existing connection
    }
    
    // Need a new client - clean up old one first
    if (imapClient) {
      try {
        if (imapClient.state >= 2) {
          await imapClient.logout();
        }
      } catch (e) {
        // Ignore cleanup errors - client might already be closed
      }
      imapClient = null; // Clear reference
    }
    
    // Create fresh client instance
    console.log('Creating new IMAP client instance...');
    imapClient = createImapClient();
    
    console.log(`Connecting to IMAP server: ${IMAP_HOST}:${IMAP_PORT} (TLS: ${IMAP_TLS === 'true'})`);
    console.log(`User: ${MAIL_USER}`);
    console.log(`Password length: ${MAIL_PASS ? MAIL_PASS.length : 0} characters`);
    await imapClient.connect();
    console.log(`IMAP connected successfully (state: ${imapClient.state})`);
  } catch (err) {
    console.error('========== IMAP CONNECTION ERROR ==========');
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Error type:', err.name);
    console.error('Error response:', err.response);
    console.error('Error responseCode:', err.responseCode);
    console.error('Error responseText:', err.responseText);
    console.error('Full error object:', err);
    if (err.stack) {
      console.error('Stack trace:', err.stack);
    }
    console.error('==========================================');
    
    // Reset client on error so next attempt creates a new one
    imapClient = null;
    
    // Provide more helpful error message
    let errorMsg = err.message || 'Unknown IMAP error';
    if (err.responseCode === 'NO' || err.responseText?.includes('AUTHENTICATE')) {
      errorMsg = 'Authentication failed. Please check your email and password.';
    } else if (err.responseCode === 'BAD') {
      errorMsg = 'Invalid command or server error. Check server configuration.';
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      errorMsg = `Cannot connect to ${IMAP_HOST}:${IMAP_PORT}. Check network/firewall.`;
    }
    
    throw new Error(errorMsg);
  }
}

// Try initial connection but don't block startup
connectImap().catch(err => {
  console.error('Initial IMAP connection failed:', err.message);
});

// Note: We don't set up event listeners on the initial client since it might be replaced

// ---------- SMTP ----------
// Create SMTP transport - try with connection retry
const smtpConfig = {
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: SMTP_SECURE === 'true', // true for 465 (SSL/TLS), false for 587 (STARTTLS)
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS, // Password already processed (quotes removed)
  },
  tls: {
    rejectUnauthorized: false, // Accept all certificates (接受所有憑證)
    // Let Node.js auto-negotiate TLS version
  },
  connectionTimeout: 20000, // 20 seconds
  greetingTimeout: 15000,   // 15 seconds
  socketTimeout: 20000,      // 20 seconds
  pool: false, // Disable connection pooling
  ignoreTLS: false,
  // Enable debug logging
  debug: true,
  logger: true,
};

// For port 587 (STARTTLS), require TLS upgrade
if (SMTP_SECURE !== 'true') {
  smtpConfig.requireTLS = true;
}

console.log('SMTP Configuration:', {
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE === 'true',
  method: SMTP_SECURE === 'true' ? 'SSL/TLS (direct)' : 'STARTTLS (upgrade)'
});

// Create SMTP transport - we'll recreate it for each request to avoid connection reuse issues
let smtpTransport = null;

function createSmtpTransport() {
  return nodemailer.createTransport(smtpConfig);
}

smtpTransport = createSmtpTransport();

// ---------- Express ----------
const app = express();
app.use(cors());
app.use(express.json());

// serve static UI
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running', timestamp: new Date().toISOString() });
});

// Diagnostic endpoint for IMAP
app.get('/api/imap/diagnostic', async (req, res) => {
  try {
    const diagnostics = {
      imapClientExists: !!imapClient,
      imapClientState: imapClient?.state || null,
      imapClientStateName: imapClient?.state === 0 ? 'disconnected' : 
                          imapClient?.state === 1 ? 'connecting' : 
                          imapClient?.state === 2 ? 'authenticated' : 
                          imapClient?.state === 3 ? 'selected' : 
                          imapClient?.state === 4 ? 'idle' : 'unknown',
      imapHost: IMAP_HOST,
      imapPort: IMAP_PORT,
      mailUser: MAIL_USER ? `${MAIL_USER.substring(0, 3)}***` : 'not set'
    };
    
    // Try to connect
    try {
      await connectImap();
      diagnostics.connectionTest = 'success';
      diagnostics.imapClientStateAfterConnect = imapClient?.state || null;
      
      // Try to open mailbox
      if (imapClient && imapClient.state >= 2) {
        try {
          const mailbox = await imapClient.mailboxOpen('INBOX', { readOnly: true });
          diagnostics.mailboxTest = 'success';
          diagnostics.mailboxExists = mailbox.exists;
          diagnostics.mailboxUidValidity = mailbox.uidValidity;
        } catch (mbErr) {
          diagnostics.mailboxTest = 'failed';
          diagnostics.mailboxError = mbErr.message;
        }
      }
    } catch (connErr) {
      diagnostics.connectionTest = 'failed';
      diagnostics.connectionError = connErr.message;
    }
    
    res.json({ success: true, diagnostics });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message,
      diagnostics: { error: err.message }
    });
  }
});

// Test IMAP connection endpoint
app.get('/api/test-connection', async (req, res) => {
  try {
    await connectImap();
    if (imapClient.connected) {
      res.json({ success: true, message: 'IMAP connection successful' });
    } else {
      res.status(500).json({ success: false, error: 'IMAP client exists but not connected' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.toString() });
  }
});

// List latest N emails (default 20)
app.get('/api/emails', async (req, res) => {
  console.log('=== /api/emails endpoint called ===');
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    
    // Ensure IMAP is connected
    try {
      await connectImap();
    } catch (connectErr) {
      return res.status(500).json({ 
        success: false, 
        error: `IMAP connection failed: ${connectErr.message}. Check your credentials and network.` 
      });
    }

    // Verify connection state
    // ImapFlow state: 0=disconnected, 1=connecting, 2=authenticated, 3=selected, 4=idle
    const state = imapClient?.state;
    
    console.log('IMAP connection check:', { 
      clientExists: !!imapClient, 
      state,
      stateName: state === 0 ? 'disconnected' : state === 1 ? 'connecting' : state === 2 ? 'authenticated' : state === 3 ? 'selected' : state === 4 ? 'idle' : 'unknown'
    });
    
    if (!imapClient || state < 2) {
      return res.status(500).json({ 
        success: false, 
        error: `IMAP client not authenticated. State: ${state} (${state === 0 ? 'disconnected' : state === 1 ? 'connecting' : 'unknown'}). Check server logs for connection errors.` 
      });
    }

    // Select INBOX read-only
    let mailbox;
    try {
      mailbox = await imapClient.mailboxOpen('INBOX', { readOnly: true });
      console.log(`Opened INBOX. Total messages: ${mailbox.exists}`);
    } catch (mailboxErr) {
      console.error('Failed to open INBOX:', mailboxErr);
      // If mailbox open fails, try reconnecting
      if (mailboxErr.message?.includes('timeout') || mailboxErr.message?.includes('closed') || mailboxErr.message?.includes('disconnected')) {
        console.log('Connection appears stale, attempting reconnect...');
        try {
          imapClient = null;
          await connectImap();
          mailbox = await imapClient.mailboxOpen('INBOX', { readOnly: true });
          console.log(`Opened INBOX after reconnect. Total messages: ${mailbox.exists}`);
        } catch (retryErr) {
          return res.status(500).json({ 
            success: false, 
            error: `Failed to open INBOX after reconnect: ${retryErr.message}` 
          });
        }
      } else {
        return res.status(500).json({ 
          success: false, 
          error: `Failed to open INBOX: ${mailboxErr.message}` 
        });
      }
    }
    
    if (mailbox.exists === 0) {
      return res.json({ success: true, emails: [] });
    }
    
    const start = Math.max(mailbox.exists - limit + 1, 1);
    const messages = [];

    // Fetch headers for the range with timeout
    try {
      console.log(`Fetching messages from sequence ${start} to end...`);
      
      // Add timeout wrapper
      const fetchPromise = (async () => {
        const fetchedMessages = [];
        for await (const msg of imapClient.fetch(`${start}:*`, {
          envelope: true,
          uid: true,
          source: false,
        })) {
          fetchedMessages.push({
            uid: msg.uid,
            subject: msg.envelope.subject || '(No subject)',
            from: msg.envelope.from?.map((a) => `${a.name || ''} <${a.address}>`).join(', ') || 'Unknown',
            date: msg.envelope.date || new Date(),
          });
          
          // Log progress every 10 messages
          if (fetchedMessages.length % 10 === 0) {
            console.log(`Fetched ${fetchedMessages.length} messages so far...`);
          }
        }
        return fetchedMessages;
      })();
      
      // Add 20 second timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('IMAP fetch operation timed out after 20 seconds')), 20000);
      });
      
      const fetchedMessages = await Promise.race([fetchPromise, timeoutPromise]);
      messages.push(...fetchedMessages);
      
      console.log(`Successfully fetched ${messages.length} messages`);
    } catch (fetchErr) {
      console.error('========== FETCH MESSAGES ERROR ==========');
      console.error('Error message:', fetchErr.message);
      console.error('Error code:', fetchErr.code);
      console.error('Error responseCode:', fetchErr.responseCode);
      console.error('Error responseText:', fetchErr.responseText);
      console.error('Full error:', fetchErr);
      console.error('==========================================');
      
      // If timeout, try to reset IMAP connection
      if (fetchErr.message.includes('timeout') || fetchErr.message.includes('timed out')) {
        console.log('Resetting IMAP connection due to timeout...');
        imapClient = null;
      }
      
      return res.status(500).json({ 
        success: false, 
        error: `Failed to fetch messages: ${fetchErr.message}`,
        code: fetchErr.code || fetchErr.responseCode || 'UNKNOWN',
        responseText: fetchErr.responseText
      });
    }

    // Sort newest first
    messages.sort((a, b) => b.uid - a.uid);
    
    res.json({ success: true, emails: messages });
  } catch (err) {
    // Log full error details to console
    console.error('========== LIST EMAILS ERROR ==========');
    console.error('Error type:', typeof err);
    console.error('Error name:', err?.name);
    console.error('Error message:', err?.message);
    console.error('Error code:', err?.code);
    console.error('Error cause:', err?.cause);
    console.error('Full error object:', err);
    if (err?.stack) {
      console.error('Error stack:', err.stack);
    }
    console.error('=======================================');
    
    // Extract error message safely
    let errorMsg = 'Failed to list emails';
    if (err?.message) {
      errorMsg = err.message;
    } else if (typeof err === 'string') {
      errorMsg = err;
    } else if (err?.toString) {
      errorMsg = err.toString();
    }
    
    const errorCode = err?.code || err?.name || 'UNKNOWN';
    
    res.status(500).json({ 
      success: false, 
      error: errorMsg,
      code: errorCode,
      type: err?.name || typeof err
    });
  } finally {
    // ALWAYS close mailbox after operation to ensure clean state
    try {
      if (imapClient && imapClient.state >= 3) {
        await imapClient.mailboxClose();
        console.log('Mailbox closed after list operation.');
      }
    } catch (closeErr) {
      console.warn('Error closing mailbox in finally block:', closeErr.message);
    }
  }
});

// Get a single email body (plain text)
app.get('/api/emails/:uid', async (req, res) => {
  // Use a fresh connection for each fetch to avoid state issues
  let fetchClient = null;
  
  try {
    const uid = Number(req.params.uid);
    if (!uid || isNaN(uid)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid email UID. Must be a number.' 
      });
    }

    console.log(`=== Fetching email UID ${uid} with fresh connection ===`);
    
    // Create a fresh IMAP client for this request
    fetchClient = createImapClient();
    console.log(`Connecting fresh IMAP client for UID ${uid}...`);
    await fetchClient.connect();
    console.log(`Fresh IMAP client connected (state: ${fetchClient.state})`);

    // Open INBOX
    let mailbox;
    try {
      console.log('Opening INBOX for email fetch...');
      mailbox = await fetchClient.mailboxOpen('INBOX');
      console.log(`Opened INBOX. Total messages: ${mailbox.exists}, UID validity: ${mailbox.uidValidity}`);
    } catch (mailboxErr) {
      console.error('Failed to open INBOX:', mailboxErr);
      return res.status(500).json({ 
        success: false, 
        error: `Failed to open INBOX: ${mailboxErr.message}`,
        code: mailboxErr.code || 'UNKNOWN'
      });
    }

    // Check if UID is in valid range
    if (mailbox.exists === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Mailbox is empty',
        uid: uid
      });
    }

    // Get sequence number for this UID using search
    // Note: We'll do this in the fetch section below, not here

    let bodyText = '';
    let found = false;
    
    try {
      // The issue: ImapFlow's fetch() interprets numbers as sequence numbers, not UIDs
      // Solution: Use search() to find the sequence number for this UID, then fetch by sequence
      console.log(`Fetching email with UID: ${uid}`);
      
      // Step 1: Search for the UID to get its sequence number (with timeout)
      // Double-check mailbox is still open before searching
      if (!fetchClient || fetchClient.state < 3) {
        console.error(`Mailbox check failed: client=${!!fetchClient}, state=${fetchClient?.state}`);
        throw new Error('Mailbox is not open. Cannot search.');
      }
      
      // Verify mailbox is actually INBOX
      if (!fetchClient.mailbox || fetchClient.mailbox.path !== 'INBOX') {
        console.error(`Mailbox path mismatch: expected INBOX, got ${fetchClient.mailbox?.path}`);
        throw new Error('Mailbox is not INBOX. Cannot search.');
      }
      
      let seqNum = null;
      try {
        console.log(`Searching for UID ${uid} (mailbox state: ${fetchClient.state}, path: ${fetchClient.mailbox?.path})...`);
        const searchStartTime = Date.now();
        const searchPromise = fetchClient.search({ uid: uid });
        const searchTimeout = new Promise((_, reject) => {
          setTimeout(() => {
            const elapsed = Date.now() - searchStartTime;
            console.error(`Search timeout after 5 seconds for UID ${uid} (elapsed: ${elapsed}ms, state: ${fetchClient?.state})`);
            reject(new Error('Search operation timed out after 5 seconds'));
          }, 5000);
        });
        
        const searchResult = await Promise.race([searchPromise, searchTimeout]);
        const searchDuration = Date.now() - searchStartTime;
        console.log(`Search completed in ${searchDuration}ms`);
        
        if (searchResult && searchResult.length > 0) {
          seqNum = searchResult[0];
          console.log(`Found UID ${uid} at sequence number ${seqNum}`);
        } else {
          return res.status(404).json({ 
            success: false, 
            error: `Email with UID ${uid} not found in mailbox`,
            code: 'EMAIL_NOT_FOUND',
            uid: uid
          });
        }
      } catch (searchErr) {
        console.error('========== SEARCH ERROR ==========');
        console.error('UID:', uid);
        console.error('Error:', searchErr.message);
        console.error('Full error:', searchErr);
        console.error('==================================');
        
        // Search failed - return error
        return res.status(500).json({ 
          success: false, 
          error: `Failed to search for email: ${searchErr.message}`,
          code: searchErr.code || 'SEARCH_FAILED',
          uid: uid
        });
      }
      
      // Step 2: Fetch by sequence number (not UID) with timeout
      const fetchOptions = {
        source: true,
        uid: true  // Include UID in response for verification
      };
      
      if (!seqNum) {
        return res.status(500).json({ 
          success: false, 
          error: 'Sequence number not found',
          uid: uid
        });
      }
      
      // Ensure mailbox is still open before fetching
      if (!fetchClient || fetchClient.state < 3) {
        throw new Error('Mailbox is not open. Cannot fetch.');
      }
      
      console.log(`Fetching sequence number ${seqNum} (UID: ${uid})...`);
      const fetchStartTime = Date.now();
      
      const fetchPromise = (async () => {
        let messageReceived = false;
        for await (const msg of fetchClient.fetch(seqNum, fetchOptions)) {
          console.log(`Received message - UID: ${msg.uid}, Seq: ${msg.seq}`);
          messageReceived = true;
          // Verify this is the correct message
          if (msg.uid === uid) {
            bodyText = msg.source ? msg.source.toString() : '';
            found = true;
            const fetchDuration = Date.now() - fetchStartTime;
            console.log(`Successfully fetched email UID ${uid} in ${fetchDuration}ms, body length: ${bodyText.length}`);
            break;
          }
        }
        if (!messageReceived) {
          throw new Error('No message received from fetch operation');
        }
      })();
      
      // Add 10 second timeout to fetch operation (reduced from 12)
      const fetchTimeout = new Promise((_, reject) => {
        setTimeout(() => {
          const elapsed = Date.now() - fetchStartTime;
          console.error(`Fetch timeout after 10 seconds for UID ${uid}, seqNum ${seqNum} (elapsed: ${elapsed}ms)`);
          reject(new Error('Fetch operation timed out after 10 seconds'));
        }, 10000);
      });
      
      await Promise.race([fetchPromise, fetchTimeout]);
    } catch (fetchErr) {
      console.error('========== FETCH EMAIL ERROR ==========');
      console.error('UID:', uid);
      console.error('Error message:', fetchErr.message);
      console.error('Error code:', fetchErr.code);
      console.error('Error name:', fetchErr.name);
      console.error('Error response:', fetchErr.response);
      console.error('Error responseCode:', fetchErr.responseCode);
      console.error('Error responseText:', fetchErr.responseText);
      console.error('Error command:', fetchErr.command);
      console.error('Full error object:', fetchErr);
      if (fetchErr.stack) {
        console.error('Stack trace:', fetchErr.stack);
      }
      console.error('=======================================');
      
      // Extract more detailed error information
      let errorMsg = fetchErr.message || 'Failed to fetch email';
      let errorCode = fetchErr.code || fetchErr.responseCode || 'UNKNOWN';
      
      // Provide more specific error messages
      if (fetchErr.responseCode === 'NO') {
        errorMsg = `Email not found or cannot be accessed. UID: ${uid}`;
      } else if (fetchErr.responseCode === 'BAD') {
        errorMsg = `Invalid command or server error. UID: ${uid}`;
      } else if (fetchErr.message?.includes('not found') || fetchErr.message?.includes('does not exist')) {
        errorMsg = `Email with UID ${uid} does not exist in the mailbox`;
        errorCode = 'EMAIL_NOT_FOUND';
      } else if (fetchErr.message?.includes('Command failed')) {
        errorMsg = `IMAP command failed. The email may have been deleted or moved. UID: ${uid}`;
        if (fetchErr.responseText) {
          errorMsg += `\nServer response: ${fetchErr.responseText}`;
        }
      }
      
      return res.status(500).json({ 
        success: false, 
        error: errorMsg,
        code: errorCode,
        uid: uid,
        responseCode: fetchErr.responseCode,
        responseText: fetchErr.responseText,
        command: fetchErr.command
      });
    }

    if (!found) {
      return res.status(404).json({ 
        success: false, 
        error: `Email with UID ${uid} not found` 
      });
    }

    res.json({ success: true, uid, source: bodyText });
  } catch (err) {
    console.error('========== FETCH EMAIL ERROR ==========');
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Error type:', err.name);
    console.error('Full error:', err);
    if (err?.stack) {
      console.error('Stack trace:', err.stack);
    }
    console.error('=======================================');
    
    res.status(500).json({ 
      success: false, 
      error: err.message || 'Failed to fetch email',
      code: err.code || 'UNKNOWN'
    });
  } finally {
    // ALWAYS close and cleanup the fresh connection we created for this request
    if (fetchClient) {
      try {
        if (fetchClient.state >= 3) {
          await fetchClient.mailboxClose();
          console.log('Mailbox closed after fetch operation.');
        }
        if (fetchClient.state >= 2) {
          await fetchClient.logout();
          console.log('Fresh IMAP client logged out.');
        }
      } catch (closeErr) {
        console.warn('Error closing fresh IMAP client:', closeErr.message);
      }
    }
  }
});

// Send email
app.post('/api/email/send', async (req, res) => {
  const { to, subject, text, html } = req.body || {};
  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({ success: false, error: 'to, subject, and text|html are required' });
  }
  try {
    console.log(`Sending email to: ${to}, subject: ${subject}`);
    console.log(`SMTP config: ${SMTP_HOST}:${SMTP_PORT}, secure: ${SMTP_SECURE === 'true'}`);
    console.log(`From: ${MAIL_USER}`);
    
    // Create fresh transport for this request
    const transport = createSmtpTransport();
    
    // Try to send directly (verify happens during sendMail)
    const info = await transport.sendMail({ 
      from: `"ERP System" <${MAIL_USER}>`,
      to, 
      subject, 
      text: text || html?.replace(/<[^>]*>/g, ''), // Strip HTML if only html provided
      html: html || text?.replace(/\n/g, '<br>') // Convert newlines to <br> if only text provided
    });
    console.log('Email sent successfully:', info.messageId);
    console.log('Server response:', info.response);
    
    // Close transport after sending
    transport.close();
    
    res.json({ success: true, messageId: info.messageId, response: info.response });
  } catch (err) {
    console.error('========== SEND EMAIL ERROR ==========');
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Error response:', err.response);
    console.error('Error responseCode:', err.responseCode);
    console.error('Full error:', err);
    console.error('======================================');
    
    let errorMsg = err.message || 'Failed to send email';
    if (err.code === 'EAUTH') {
      errorMsg = 'SMTP authentication failed. Check your email and password.';
    } else if (err.code === 'ECONNECTION') {
      errorMsg = `Cannot connect to SMTP server ${SMTP_HOST}:${SMTP_PORT}. Check network/firewall.`;
    } else if (err.code === 'ETIMEDOUT') {
      errorMsg = 'SMTP connection timeout. Server may be down or unreachable.';
    }
    
    const errorResponse = {
      success: false, 
      error: errorMsg,
      code: err.code || 'UNKNOWN',
      host: SMTP_HOST || 'homegw.bbmail.com.hk',
      port: Number(SMTP_PORT) || 465,
      secure: SMTP_SECURE === 'true',
      originalError: err.message
    };
    
    console.log('Send email error response:', errorResponse);
    res.status(500).json(errorResponse);
  }
});

// Test SMTP connection endpoint
app.get('/api/smtp/test', async (req, res) => {
  // Ensure we have the values
  const smtpHost = SMTP_HOST || 'homegw.bbmail.com.hk';
  const smtpPort = Number(SMTP_PORT) || 465;
  const smtpSecure = SMTP_SECURE === 'true';
  
  try {
    console.log('Testing SMTP connection...');
    console.log(`Connecting to: ${smtpHost}:${smtpPort}`);
    console.log(`Secure (SSL/TLS): ${smtpSecure}`);
    console.log(`User: ${MAIL_USER}`);
    
    // Create fresh transport for test
    const testTransport = createSmtpTransport();
    await testTransport.verify();
    
    // Close test transport
    testTransport.close();
    
    res.json({ 
      success: true, 
      message: 'SMTP connection successful',
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure
    });
  } catch (err) {
    console.error('========== SMTP CONNECTION TEST ERROR ==========');
    console.error('Error:', err.message);
    console.error('Error code:', err.code);
    console.error('SMTP_HOST:', SMTP_HOST);
    console.error('SMTP_PORT:', SMTP_PORT);
    console.error('SMTP_SECURE:', SMTP_SECURE);
    console.error('Full error:', err);
    console.error('===============================================');
    
    let errorMsg = err.message || 'SMTP connection failed';
    const troubleshooting = err.code === 'ESOCKET' || err.code === 'ETIMEDOUT' ? 
      'This usually means:\n' +
      '1. Port ' + smtpPort + ' is blocked by firewall\n' +
      '2. Network restrictions prevent connection\n' +
      '3. SMTP server requires VPN or specific network\n' +
      '4. Server is temporarily unavailable\n\n' +
      'Try:\n' +
      '- Check Windows Firewall settings\n' +
      '- Connect to VPN if required\n' +
      '- Test from different network\n' +
      '- Contact IT about SMTP access' : '';
    
    if (err.code === 'ESOCKET' || err.code === 'ETIMEDOUT') {
      errorMsg = `Cannot connect to ${smtpHost}:${smtpPort}. ` + troubleshooting;
    } else if (err.code === 'EAUTH') {
      errorMsg = 'SMTP authentication failed. Check your email and password.';
    }
    
    const errorResponse = { 
      success: false, 
      error: errorMsg,
      code: err.code || 'UNKNOWN',
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      troubleshooting: troubleshooting,
      originalError: err.message
    };
    
    console.log('========== SENDING ERROR RESPONSE ==========');
    console.log('Error response object:', errorResponse);
    console.log('SMTP_HOST from env:', SMTP_HOST);
    console.log('SMTP_PORT from env:', SMTP_PORT);
    console.log('SMTP_SECURE from env:', SMTP_SECURE);
    console.log('===========================================');
    
    // Add diagnostic info
    errorResponse.diagnostic = {
      serverIP: 'Resolved from ' + smtpHost,
      configuredPort: smtpPort,
      configuredSecure: smtpSecure,
      possibleCauses: [
        `Port ${smtpPort} is blocked by firewall`,
        'Network restrictions prevent connection',
        'The SMTP server firewall is blocking your IP address',
        'VPN connection required to access this server',
        'Corporate firewall blocking SMTP ports'
      ],
      solutions: [
        'Check Windows Firewall: Control Panel > Windows Defender Firewall > Advanced Settings > Outbound Rules',
        'Try connecting from a different network (mobile hotspot)',
        'Connect to VPN if this is a corporate server',
        smtpPort === 465 ? 'Try port 587 with STARTTLS (change SMTP_PORT=587 and SMTP_SECURE=false in env file)' : 'Try port 465 with SSL/TLS (change SMTP_PORT=465 and SMTP_SECURE=true in env file)',
        'Contact IT/Email admin about SMTP access'
      ]
    };
    
    res.status(500).json(errorResponse);
  }
});

// Test send email endpoint
app.post('/api/email/test', async (req, res) => {
  const testEmail = {
    to: 'eric.brilliant@gmail.com',
    subject: 'Test Email from ERP System',
    text: 'This is a test email sent from your ERP email service.\n\nIf you receive this, SMTP is working correctly!',
    html: '<p>This is a test email sent from your ERP email service.</p><p>If you receive this, SMTP is working correctly!</p>'
  };
  
  try {
    console.log(`Sending test email to: ${testEmail.to}`);
    const info = await smtpTransport.sendMail({ 
      from: `"ERP System" <${MAIL_USER}>`,
      to: testEmail.to,
      subject: testEmail.subject,
      text: testEmail.text,
      html: testEmail.html
    });
    console.log('Test email sent successfully:', info.messageId);
    res.json({ 
      success: true, 
      message: 'Test email sent successfully',
      messageId: info.messageId,
      to: testEmail.to
    });
  } catch (err) {
    console.error('========== TEST EMAIL ERROR ==========');
    console.error('Error:', err.message);
    console.error('Error code:', err.code);
    console.error('Full error:', err);
    console.error('======================================');
    
    let errorMsg = err.message || 'Failed to send test email';
    if (err.code === 'ESOCKET' || err.code === 'ETIMEDOUT') {
      errorMsg = `Cannot connect to ${SMTP_HOST}:${SMTP_PORT}. Connection timeout.`;
    } else if (err.code === 'EAUTH') {
      errorMsg = 'SMTP authentication failed. Check your email and password.';
    }
    
    res.status(500).json({ 
      success: false, 
      error: errorMsg,
      code: err.code || 'UNKNOWN',
      host: SMTP_HOST || 'homegw.bbmail.com.hk',
      port: Number(SMTP_PORT) || 465,
      secure: SMTP_SECURE === 'true',
      originalError: err.message
    });
  }
});

app.listen(Number(PORT), () => console.log(`Email service running on :${PORT}`));
