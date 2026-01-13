import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------- ENV ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, 'env') });
const {
  MAIL_USER,
  MAIL_PASS = rawPassword?.replace(/^["']|["']$/g, ''), // Remove quotes if present
  IMAP_HOST = 'imap.bbmail.com.hk',
  IMAP_PORT = 993,
  IMAP_TLS = 'true',
  SMTP_HOST = 'smtp.bbmail.com.hk',
  SMTP_PORT = 465,
  SMTP_SECURE = 'true',
  PORT = 3000,
} = process.env;

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
  });
}

// Connect immediately (lazy reconnect logic handled below)
async function connectImap() {
  try {
    // Check if we have a valid connected client
    // ImapFlow state: 0=disconnected, 1=connecting, 2=authenticated, 3=selected, 4=idle
    if (imapClient && imapClient.state >= 2) {
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
const smtpTransport = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: SMTP_SECURE === 'true', // true for 465, false for 587 + STARTTLS
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS, // Password already processed (quotes removed)
  },
  tls: {
    rejectUnauthorized: false, // Allow self-signed certificates
  },
});

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
      return res.status(500).json({ 
        success: false, 
        error: `Failed to open INBOX: ${mailboxErr.message}` 
      });
    }
    
    if (mailbox.exists === 0) {
      return res.json({ success: true, emails: [] });
    }
    
    const start = Math.max(mailbox.exists - limit + 1, 1);
    const messages = [];

    // Fetch headers for the range
    try {
      for await (const msg of imapClient.fetch(`${start}:*`, {
        envelope: true,
        uid: true,
        source: false,
      })) {
        messages.push({
          uid: msg.uid,
          subject: msg.envelope.subject || '(No subject)',
          from: msg.envelope.from?.map((a) => `${a.name || ''} <${a.address}>`).join(', ') || 'Unknown',
          date: msg.envelope.date || new Date(),
        });
      }
    } catch (fetchErr) {
      console.error('Failed to fetch messages:', fetchErr);
      return res.status(500).json({ 
        success: false, 
        error: `Failed to fetch messages: ${fetchErr.message}` 
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
  }
});

// Get a single email body (plain text)
app.get('/api/emails/:uid', async (req, res) => {
  try {
    const uid = Number(req.params.uid);
    await connectImap();

    let bodyText = '';
    for await (const msg of imapClient.fetch(uid, { source: true })) {
      bodyText = msg.source.toString();
    }
    res.json({ success: true, uid, source: bodyText });
  } catch (err) {
    console.error('Fetch email error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch email' });
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
    
    // Verify SMTP connection first
    try {
      await smtpTransport.verify();
      console.log('SMTP connection verified');
    } catch (verifyErr) {
      console.error('SMTP verification failed:', verifyErr.message);
      return res.status(500).json({ 
        success: false, 
        error: `SMTP connection failed: ${verifyErr.message}. Check your SMTP settings.`,
        code: verifyErr.code
      });
    }
    
    const info = await smtpTransport.sendMail({ 
      from: `"ERP System" <${MAIL_USER}>`,
      to, 
      subject, 
      text: text || html?.replace(/<[^>]*>/g, ''), // Strip HTML if only html provided
      html: html || text?.replace(/\n/g, '<br>') // Convert newlines to <br> if only text provided
    });
    console.log('Email sent successfully:', info.messageId);
    console.log('Server response:', info.response);
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
    
    res.status(500).json({ 
      success: false, 
      error: errorMsg,
      code: err.code
    });
  }
});

// Test SMTP connection endpoint
app.get('/api/smtp/test', async (req, res) => {
  try {
    console.log('Testing SMTP connection...');
    await smtpTransport.verify();
    res.json({ success: true, message: 'SMTP connection successful' });
  } catch (err) {
    console.error('SMTP connection test error:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message || 'SMTP connection failed',
      code: err.code
    });
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
    console.error('Test email error:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message || 'Failed to send test email',
      code: err.code
    });
  }
});

app.listen(Number(PORT), () => console.log(`Email service running on :${PORT}`));
