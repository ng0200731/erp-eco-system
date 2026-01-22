import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import multer from 'multer';
import {
  createTask, getTaskById, listTasks, TASK_STATUS, updateTaskStatus,
  createSentEmail, listSentEmails, getSentEmailById, getSentEmailsCount,
  // Customer functions
  getAllCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer, createCustomerMember,
  // Quotation functions
  getAllQuotations, getQuotationById, createQuotation, updateQuotation, deleteQuotation,
  // Skills functions
  getAllSkills, getSkillsStats, getSkillByName, getSkillById, createSkill, updateSkill, deleteSkill
} from './db/tasksDb.js';
import SkillManager from './skills/skillManager.js';
import { getNormalizedRelativePath } from './utils/pathUtils.js';

// ---------- ENV ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, 'env');
dotenv.config({ path: envPath, override: true });

// ---------- FILE UPLOAD CONFIG ----------
const uploadsDir = path.join(__dirname, 'uploads');
const profileImagesDir = path.join(uploadsDir, 'profile-images');
const attachmentsDir = path.join(uploadsDir, 'attachments');

// Ensure upload directories exist
await fs.mkdir(uploadsDir, { recursive: true });
await fs.mkdir(profileImagesDir, { recursive: true });
await fs.mkdir(attachmentsDir, { recursive: true });

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'profileImage') {
      cb(null, profileImagesDir);
    } else if (file.fieldname === 'attachments') {
      cb(null, attachmentsDir);
    } else {
      cb(new Error('Invalid field name'), null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allow all file types for attachments, but restrict profile images to images only
  if (file.fieldname === 'profileImage') {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Profile image must be an image file'), false);
    }
  } else {
    cb(null, true); // Allow all file types for attachments
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

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








if (!MAIL_USER || !MAIL_PASS) {
  console.error('Missing MAIL_USER or MAIL_PASS in environment. Exiting.');
  process.exit(1);
}

// ---------- IMAP ----------
let imapClient = null;

function createImapClient(activeProfile = null) {
  // If no active profile provided, use the old env-based config
  if (!activeProfile) {
    return new ImapFlow({
      host: IMAP_HOST,
      port: Number(IMAP_PORT),
      secure: IMAP_TLS === 'true',
      auth: {
        user: MAIL_USER,
        pass: MAIL_PASS,
      },
    });
  }

  // Use active profile configuration
  return new ImapFlow({
    host: activeProfile.imapHost,
    port: Number(activeProfile.imapPort),
    secure: activeProfile.imapTls === 'true',
    auth: {
      user: activeProfile.mailUser,
      pass: activeProfile.mailPass,
    },
    logger: true, // Enable debug logs to see what's happening
    tlsOptions: {
      rejectUnauthorized: true, // Validate TLS certificates for security
    },
    // Add connection timeouts to prevent hanging
    connectionTimeout: 10000, // 10 seconds for initial connection
    greetingTimeout: 5000,    // 5 seconds for server greeting
  });
}

// Connect immediately (lazy reconnect logic handled below)
async function connectImap() {
  try {
    // Get active profile for IMAP configuration
    const profiles = await getProfilesMemory();
    const activeProfile = profiles.find(p => p.isActive === 1);
    if (!activeProfile) {
      throw new Error('No active email profile found. Please activate a profile in Settings.');
    }

    // Check if we have a valid connected client
    // ImapFlow state: 0=disconnected, 1=connecting, 2=authenticated, 3=selected, 4=idle
    if (imapClient && imapClient.state >= 2) {
      // Check if socket is still connected by checking the state
      // If state is valid, assume connection is good (we'll catch errors during operations)
      console.log(`Reusing existing IMAP connection (state: ${imapClient.state})`);
      return; // Reuse existing connection
    }

    console.log(`IMAP client state: ${imapClient?.state || 'null'} - need new connection`);

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

    // Create fresh client instance using active profile
    imapClient = createImapClient(activeProfile);
    
    
    
    
    await imapClient.connect();
    
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
    rejectUnauthorized: true, // Validate TLS certificates for security
    // Let Node.js auto-negotiate TLS version
  },
  connectionTimeout: 30000, // 30 seconds (increased for idle reconnection)
  greetingTimeout: 20000,   // 20 seconds (increased for idle reconnection)
  socketTimeout: 30000,      // 30 seconds (increased for idle reconnection)
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

// (SMTP configuration logged once above if needed during debugging)

// Create SMTP transport - we'll recreate it for each request to avoid connection reuse issues
let smtpTransport = null;

function createSmtpTransport(activeProfile = null) {
  // If no active profile provided, use the old env-based config
  if (!activeProfile) {
    return nodemailer.createTransport(smtpConfig);
  }

  // Use active profile configuration
  return nodemailer.createTransport({
    host: activeProfile.smtpHost,
    port: Number(activeProfile.smtpPort),
    secure: activeProfile.smtpSecure === 'true',
    auth: {
      user: activeProfile.mailUser,
      pass: activeProfile.mailPass,
    },
    tls: {
      rejectUnauthorized: true, // Validate TLS certificates for security
    },
    connectionTimeout: 30000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
  });
}

smtpTransport = createSmtpTransport();

// ---------- Express ----------
const app = express();
app.use(cors());
app.use(express.json());

// serve static UI
app.use(express.static(path.join(__dirname, 'public')));

// ---------- SKILL MANAGER ----------
let skillManager;
try {
  skillManager = new SkillManager('./skills');
  console.log('Skill manager initialized successfully');
} catch (error) {
  console.error('Failed to initialize skill manager:', error);
  skillManager = null;
}

// Health check endpoint with connection diagnostics
app.get('/api/health', async (req, res) => {
  const health = {
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    connections: {
      imap: {
        connected: false,
        state: null,
        stateName: 'unknown'
      },
      smtp: {
        configured: true,
        host: SMTP_HOST,
        port: SMTP_PORT
      }
    }
  };

  // Check IMAP connection state
  if (imapClient) {
    health.connections.imap.connected = imapClient.state >= 2;
    health.connections.imap.state = imapClient.state;
    health.connections.imap.stateName = 
      imapClient.state === 0 ? 'disconnected' :
      imapClient.state === 1 ? 'connecting' :
      imapClient.state === 2 ? 'authenticated' :
      imapClient.state === 3 ? 'selected' :
      imapClient.state === 4 ? 'idle' : 'unknown';
  }

  res.json(health);
});

// Email/IMAP/SMTP config endpoints (read + write env file)
app.get('/api/config', (req, res) => {
  // NOTE: Values here reflect what the server started with.
  res.json({
    success: true,
    config: {
      MAIL_USER,
      MAIL_PASS,
      IMAP_HOST,
      IMAP_PORT,
      IMAP_TLS,
      SMTP_HOST,
      SMTP_PORT,
      SMTP_SECURE,
      PORT,
    },
    note: 'Changes require server restart (close window and run start.bat again).',
  });
});

// Profiles API (simple, in-memory; longriver default from env)
// Simple file-based profile persistence
const profilesFilePath = path.join(__dirname, 'profiles.json');

async function loadProfiles() {
  try {
    const data = await fs.readFile(profilesFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    // File doesn't exist or is corrupted, return defaults
    return [
      {
        id: 1,
        name: 'longriver.com',
        remark: 'longriver.com',
        mailUser: MAIL_USER || '',
        mailPass: MAIL_PASS || '',
        imapHost: IMAP_HOST || 'imap.bbmail.com.hk',
        imapPort: Number(IMAP_PORT) || 993,
        imapTls: IMAP_TLS || 'true',
        smtpHost: SMTP_HOST || 'homegw.bbmail.com.hk',
        smtpPort: Number(SMTP_PORT) || 465,
        smtpSecure: SMTP_SECURE || 'true',
        port: Number(PORT) || 3001,
        isActive: 1,
      },
      {
        id: 2,
        name: 'lcf',
        remark: 'lcf',
        mailUser: 'weiwu@fuchanghk.com',
        mailPass: 'mrkE190#',
        imapHost: 'imap.qiye.163.com',
        imapPort: 993,
        imapTls: 'true',
        smtpHost: 'smtp.qiye.163.com',
        smtpPort: 994,
        smtpSecure: 'true',
        port: 3001,
        isActive: 0,
      }
    ];
  }
}

async function saveProfiles(profiles) {
  try {
    await fs.writeFile(profilesFilePath, JSON.stringify(profiles, null, 2));
  } catch (err) {
    console.error('Failed to save profiles:', err);
  }
}

function getProfilesMemory() {
  // Return a promise that resolves to the profiles
  return loadProfiles();
}

app.get('/api/profiles', async (req, res) => {
  try {
    const profiles = await getProfilesMemory();
    res.json({ success: true, profiles });
  } catch (err) {
    console.error('Error getting profiles:', err);
    res.status(500).json({ success: false, error: 'Failed to load profiles' });
  }
});

app.get('/api/profiles/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const profiles = await getProfilesMemory();
    const profile = profiles.find(p => p.id === id);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    res.json({ success: true, profile });
  } catch (err) {
    console.error('Error getting profile:', err);
    res.status(500).json({ success: false, error: 'Failed to load profile' });
  }
});

app.post('/api/profiles', async (req, res) => {
  try {
    const profiles = await getProfilesMemory();
    const nextId = Math.max(...profiles.map(p => p.id)) + 1;
    const payload = req.body || {};
    const profile = {
      id: nextId,
      name: payload.name || 'Unnamed',
      remark: payload.remark || '',
      mailUser: payload.mailUser || '',
      mailPass: payload.mailPass || '',
      imapHost: payload.imapHost || '',
      imapPort: Number(payload.imapPort) || 993,
      imapTls: payload.imapTls || 'true',
      smtpHost: payload.smtpHost || '',
      smtpPort: Number(payload.smtpPort) || 465,
      smtpSecure: payload.smtpSecure || 'true',
      port: Number(payload.port) || 3001,
      isActive: payload.isActive ? 1 : 0,
    };
    profiles.push(profile);
    await saveProfiles(profiles);
    res.json({ success: true, id: nextId });
  } catch (err) {
    console.error('Error creating profile:', err);
    res.status(500).json({ success: false, error: 'Failed to create profile' });
  }
});

app.put('/api/profiles/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const profiles = await getProfilesMemory();
    const idx = profiles.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Profile not found' });
    const payload = req.body || {};
    profiles[idx] = {
      ...profiles[idx],
      ...payload,
      id,
      imapPort: Number(payload.imapPort ?? profiles[idx].imapPort) || 993,
      smtpPort: Number(payload.smtpPort ?? profiles[idx].smtpPort) || 465,
      port: Number(payload.port ?? profiles[idx].port) || 3001,
      isActive: payload.isActive ? 1 : 0,
    };
    await saveProfiles(profiles);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

app.post('/api/profiles/:id/activate', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const profiles = await getProfilesMemory();
    profiles.forEach(p => (p.isActive = p.id === id ? 1 : 0));
    await saveProfiles(profiles);
    res.json({ success: true });
  } catch (err) {
    console.error('Error activating profile:', err);
    res.status(500).json({ success: false, error: 'Failed to activate profile' });
  }
});

app.delete('/api/profiles/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const profiles = await getProfilesMemory();
    const idx = profiles.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Profile not found' });
    profiles.splice(idx, 1);
    await saveProfiles(profiles);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting profile:', err);
    res.status(500).json({ success: false, error: 'Failed to delete profile' });
  }
});

app.post('/api/config', async (req, res) => {
  try {
    const {
      MAIL_USER: nextUser,
      MAIL_PASS: nextPass,
      IMAP_HOST: nextImapHost,
      IMAP_PORT: nextImapPort,
      IMAP_TLS: nextImapTls,
      SMTP_HOST: nextSmtpHost,
      SMTP_PORT: nextSmtpPort,
      SMTP_SECURE: nextSmtpSecure,
      PORT: nextPort,
    } = req.body || {};

    if (!nextUser || !nextPass) {
      return res.status(400).json({
        success: false,
        error: 'MAIL_USER and MAIL_PASS are required',
      });
    }

    const lines = [
      `MAIL_USER=${nextUser}`,
      `MAIL_PASS=${nextPass}`,
      `IMAP_HOST=${nextImapHost || IMAP_HOST}`,
      `IMAP_PORT=${nextImapPort || IMAP_PORT}`,
      `IMAP_TLS=${String(nextImapTls ?? IMAP_TLS)}`,
      `SMTP_HOST=${nextSmtpHost || SMTP_HOST}`,
      `SMTP_PORT=${nextSmtpPort || SMTP_PORT}`,
      `SMTP_SECURE=${String(nextSmtpSecure ?? SMTP_SECURE)}`,
      `PORT=${nextPort || PORT}`,
      '',
    ].join('\n');

    await fs.writeFile(envPath, lines, 'utf8');

    res.json({
      success: true,
      message: 'Configuration saved to env file. Please restart server (close window and run start.bat) so changes take effect.',
      envPath,
      config: {
        MAIL_USER: nextUser,
        IMAP_HOST: nextImapHost || IMAP_HOST,
        IMAP_PORT: nextImapPort || IMAP_PORT,
        IMAP_TLS: String(nextImapTls ?? IMAP_TLS),
        SMTP_HOST: nextSmtpHost || SMTP_HOST,
        SMTP_PORT: nextSmtpPort || SMTP_PORT,
        SMTP_SECURE: String(nextSmtpSecure ?? SMTP_SECURE),
        PORT: nextPort || PORT,
      },
    });
  } catch (err) {
    console.error('Error writing env config:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to save configuration',
    });
  }
});

// ---------- Tasks (SQLite) ----------
// MVP APIs for task ecosystem (Step B1)

app.get('/api/tasks', async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const tasks = await listTasks({ status });
    res.json({ success: true, tasks });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to list tasks',
      code: err.code || 'UNKNOWN',
    });
  }
});

app.get('/api/tasks/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid task id' });
    }
    const task = await getTaskById(id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to get task',
      code: err.code || 'UNKNOWN',
    });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const {
      type,
      status,
      sourceEmailUid,
      sourceSubject,
      customerEmail,
      notes,
    } = req.body || {};

    const created = await createTask({
      type,
      status: status || TASK_STATUS.NEW,
      sourceEmailUid: sourceEmailUid ?? null,
      sourceSubject: sourceSubject ?? null,
      customerEmail: customerEmail ?? null,
      notes: notes ?? null,
    });

    res.json({ success: true, task: created });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message || 'Failed to create task',
      code: err.code || 'BAD_REQUEST',
    });
  }
});

app.post('/api/tasks/:id/status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid task id' });
    }
    if (!status || typeof status !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    const updated = await updateTaskStatus(id, status);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, task: updated });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to update task status',
      code: err.code || 'UNKNOWN',
    });
  }
});

// ---------- Sent Emails API ----------
app.get('/api/sent-emails', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const sender_email = req.query.sender_email; // Filter by specific sender

    const sentEmails = await listSentEmails({ limit, offset, sender_email });
    const totalCount = await getSentEmailsCount({ sender_email });

    res.json({
      success: true,
      sentEmails,
      pagination: {
        limit,
        offset,
        total: totalCount,
        hasMore: offset + limit < totalCount
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to list sent emails',
      code: err.code || 'UNKNOWN',
    });
  }
});

app.get('/api/sent-emails/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid sent email id' });
    }
    const sentEmail = await getSentEmailById(id);
    if (!sentEmail) {
      return res.status(404).json({ success: false, error: 'Sent email not found' });
    }
    res.json({ success: true, sentEmail });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to get sent email',
      code: err.code || 'UNKNOWN',
    });
  }
});

// Simple IMAP connection test
app.get('/api/test-connection', async (req, res) => {
  try {
    // Get active profile for IMAP configuration
    const profiles = await getProfilesMemory();
    const activeProfile = profiles.find(p => p.isActive === 1);
    if (!activeProfile) {
      return res.status(400).json({
        success: false,
        error: 'No active email profile found. Please activate a profile in Settings.'
      });
    }

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
    // Get active profile for IMAP configuration
    const profiles = await getProfilesMemory();
    const activeProfile = profiles.find(p => p.isActive === 1);
    if (!activeProfile) {
      return res.status(400).json({
        success: false,
        error: 'No active email profile found. Please activate a profile in Settings.'
      });
    }

    await connectImap(activeProfile);
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

  try {
    // Get active profile for IMAP configuration
    const profiles = await getProfilesMemory();
    const activeProfile = profiles.find(p => p.isActive === 1);
    if (!activeProfile) {
      return res.status(400).json({
        success: false,
        error: 'No active email profile found. Please activate a profile in Settings.'
      });
    }

    const limit = Math.min(Number(req.query.limit) || 20, 100);

    // Ensure IMAP is connected using active profile
    try {
      await connectImap();
    } catch (connectErr) {
      return res.status(500).json({ 
        success: false, 
        error: `IMAP connection failed: ${connectErr.message}. Check your credentials and network.`,
        troubleshooting: [
          'Verify IMAP_HOST, IMAP_PORT, MAIL_USER, MAIL_PASS in env file',
          'Check network connectivity to ' + IMAP_HOST + ':' + IMAP_PORT,
          'Try restarting the server with start.bat',
          'Check server console logs for detailed error messages'
        ]
      });
    }

    // Verify connection state
    // ImapFlow state: 0=disconnected, 1=connecting, 2=authenticated, 3=selected, 4=idle
    const state = imapClient?.state;
    console.log(`IMAP client state before mailbox open: ${state}`);

    if (!imapClient || state < 2) {
      console.error(`IMAP client not ready. Client exists: ${!!imapClient}, State: ${state}`);
      return res.status(500).json({
        success: false,
        error: `IMAP client not authenticated. State: ${state} (${state === 0 ? 'disconnected' : state === 1 ? 'connecting' : 'unknown'}). Check server logs for connection errors.`,
        troubleshooting: [
          'Wait a moment and try again',
          'Check server console for connection details',
          'Verify IMAP credentials are correct',
          'Restart the server if connection issues persist'
        ]
      });
    }

    // Select INBOX read-only
    let mailbox;
    try {
      console.log(`Attempting to open INBOX with client state: ${imapClient.state}`);
      mailbox = await imapClient.mailboxOpen('INBOX', { readOnly: true });
      console.log('Successfully opened INBOX');

    } catch (mailboxErr) {
      console.error('Failed to open INBOX:', mailboxErr);
      console.error('Client state when error occurred:', imapClient?.state);

      // If mailbox open fails, try reconnecting
      if (mailboxErr.message?.includes('timeout') || mailboxErr.message?.includes('closed') ||
          mailboxErr.message?.includes('disconnected') || mailboxErr.message?.includes('not available') ||
          mailboxErr.message?.includes('Connection not available')) {

        console.log('Attempting reconnect due to connection error...');
        try {
          imapClient = null;
          await connectImap();
          console.log(`Reconnected, client state: ${imapClient.state}`);
          mailbox = await imapClient.mailboxOpen('INBOX', { readOnly: true });
          console.log('Successfully opened INBOX after reconnect');

        } catch (retryErr) {
          console.error('Failed to reconnect and open INBOX:', retryErr);
          return res.status(500).json({
            success: false,
            error: `Failed to open INBOX after reconnect: ${retryErr.message}`,
            troubleshooting: [
              'Check your IMAP server settings',
              'Verify network connectivity',
              'Try restarting the server',
              'Check if your email account is accessible'
            ]
          });
        }
      } else {
        console.error('Non-connection error when opening mailbox:', mailboxErr);
        return res.status(500).json({
          success: false,
          error: `Failed to open INBOX: ${mailboxErr.message}`,
          troubleshooting: [
            'Verify IMAP server configuration',
            'Check if INBOX mailbox exists',
            'Ensure you have read permissions'
          ]
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
        
        imapClient = null;
      }
      
      const troubleshooting = [];
      if (fetchErr.message.includes('timeout')) {
        troubleshooting.push('IMAP server is slow or unreachable');
        troubleshooting.push('Try refreshing the email list');
        troubleshooting.push('Check server console for connection state');
      } else {
        troubleshooting.push('Check server console logs for detailed error');
        troubleshooting.push('Try restarting server with start.bat');
      }

      return res.status(500).json({ 
        success: false, 
        error: `Failed to fetch messages: ${fetchErr.message}`,
        code: fetchErr.code || fetchErr.responseCode || 'UNKNOWN',
        responseText: fetchErr.responseText,
        troubleshooting: troubleshooting
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
        
      }
    } catch (closeErr) {
      console.warn('Error closing mailbox in finally block:', closeErr.message);
    }
  }
});

// Get a single email body (plain text)
app.get('/api/emails/:uid', async (req, res) => {
  // Get active profile for IMAP configuration
  const profiles = await getProfilesMemory();
  const activeProfile = profiles.find(p => p.isActive === 1);
  if (!activeProfile) {
    return res.status(400).json({
      success: false,
      error: 'No active email profile found. Please activate a profile in Settings.'
    });
  }

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



    // Create a fresh IMAP client for this request using active profile
    fetchClient = createImapClient(activeProfile);
    
    await fetchClient.connect();
    

    // Open INBOX
    let mailbox;
    try {
      
      mailbox = await fetchClient.mailboxOpen('INBOX');
      
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
        
        
        if (searchResult && searchResult.length > 0) {
          seqNum = searchResult[0];
          
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
        uid: uid,
        troubleshooting: searchErr.message.includes('timeout') ? [
          'IMAP server may be slow or unreachable',
          'Try clicking the email again after a few seconds',
          'Check server console for detailed timeout logs'
        ] : [
          'Email may have been deleted or moved',
          'Try refreshing the email list',
          'Check server console for detailed error logs'
        ]
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
      
      
      const fetchStartTime = Date.now();
      
      const fetchPromise = (async () => {
        let messageReceived = false;
        for await (const msg of fetchClient.fetch(seqNum, fetchOptions)) {
          
          messageReceived = true;
          // Verify this is the correct message
          if (msg.uid === uid) {
            bodyText = msg.source ? msg.source.toString() : '';
            found = true;
            const fetchDuration = Date.now() - fetchStartTime;
            
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
      
      const troubleshooting = [];
      if (errorCode === 'EMAIL_NOT_FOUND') {
        troubleshooting.push('Email may have been deleted or moved');
        troubleshooting.push('Try refreshing the email list');
      } else if (fetchErr.message?.includes('timeout')) {
        troubleshooting.push('IMAP server took too long to respond');
        troubleshooting.push('Try clicking the email again');
        troubleshooting.push('Check server console for connection issues');
      } else {
        troubleshooting.push('Check server console logs for detailed error');
        troubleshooting.push('Try refreshing the email list');
        troubleshooting.push('If persists, restart server with start.bat');
      }

      return res.status(500).json({ 
        success: false, 
        error: errorMsg,
        code: errorCode,
        uid: uid,
        responseCode: fetchErr.responseCode,
        responseText: fetchErr.responseText,
        command: fetchErr.command,
        troubleshooting: troubleshooting
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
          
        }
        if (fetchClient.state >= 2) {
          await fetchClient.logout();
          
        }
      } catch (closeErr) {
        console.warn('Error closing fresh IMAP client:', closeErr.message);
      }
    }
  }
});

// Send email
app.post('/api/email/send', async (req, res) => {
  // Get active profile for SMTP configuration
  const profiles = await getProfilesMemory();
  const activeProfile = profiles.find(p => p.isActive === 1);
  if (!activeProfile) {
    return res.status(400).json({
      success: false,
      error: 'No active email profile found. Please activate a profile in Settings.'
    });
  }

  const { to, subject, text, html } = req.body || {};
  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({ success: false, error: 'to, subject, and text|html are required' });
  }
  
  let transport = null;
  const maxRetries = 2; // Try up to 2 times (initial + 1 retry)
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      
      
      
      
      // Clean up previous transport if retrying
      if (transport) {
        try {
          transport.close();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      
      // Create fresh transport for this attempt using active profile
      transport = createSmtpTransport(activeProfile);
      
      // Try to send with increased timeout (no timeout limit - let it try)
      const sendPromise = transport.sendMail({
        from: `"ERP System" <${activeProfile.mailUser}>`,
        to, 
        subject, 
        text: text || html?.replace(/<[^>]*>/g, ''), // Strip HTML if only html provided
        html: html || text?.replace(/\n/g, '<br>') // Convert newlines to <br> if only text provided
      });
      
      // Add 60 second timeout (increased from default)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('SMTP send operation timed out after 60 seconds')), 60000);
      });
      
      const info = await Promise.race([sendPromise, timeoutPromise]);

      // Store the sent email in the database
      console.log('Storing sent email in database:', { to, subject, messageId: info.messageId });
      try {
        const storedEmail = await createSentEmail({
          to_email: to,
          subject: subject,
          body_text: text || html?.replace(/<[^>]*>/g, ''),
          body_html: html || text?.replace(/\n/g, '<br>'),
          message_id: info.messageId,
          smtp_response: info.response,
          status: 'sent',
          profile_id: activeProfile.id
        });
        console.log('Successfully stored sent email:', storedEmail.id);
      } catch (dbErr) {
        console.error('Failed to store sent email in database:', dbErr);
        // Don't fail the request if DB storage fails
      }

      // Close transport after sending
      transport.close();

      return res.json({ success: true, messageId: info.messageId, response: info.response });
      
    } catch (err) {
      lastError = err;
      console.error(`========== SEND EMAIL ERROR (Attempt ${attempt}/${maxRetries}) ==========`);
      console.error('Error message:', err.message);
      console.error('Error code:', err.code);
      console.error('Error response:', err.response);
      console.error('Error responseCode:', err.responseCode);
      console.error('Full error:', err);
      console.error('======================================');
      
      // Clean up transport on error
      if (transport) {
        try {
          transport.close();
        } catch (e) {
          // Ignore cleanup errors
        }
        transport = null;
      }
      
      // If it's a connection/timeout error and we have retries left, retry
      const isRetryableError = 
        err.code === 'ECONNECTION' || 
        err.code === 'ETIMEDOUT' || 
        err.code === 'ESOCKET' ||
        err.message?.includes('timeout') ||
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('Network error');
      
      if (isRetryableError && attempt < maxRetries) {
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
        continue; // Retry
      } else {
        // Not retryable or no retries left, break and return error
        break;
      }
    }
  }
  
  // All retries exhausted or non-retryable error
  // Store the failed email attempt in the database
  try {
    await createSentEmail({
      to_email: to,
      subject: subject,
      body_text: text || html?.replace(/<[^>]*>/g, ''),
      body_html: html || text?.replace(/\n/g, '<br>'),
      message_id: null,
      smtp_response: null,
      status: 'failed',
      error_message: lastError.message,
      profile_id: activeProfile.id
    });
  } catch (dbErr) {
    console.error('Failed to store failed email in database:', dbErr);
    // Don't fail the request if DB storage fails
  }

  let errorMsg = lastError.message || 'Failed to send email';
  if (lastError.code === 'EAUTH') {
    errorMsg = 'SMTP authentication failed. Check your email and password.';
  } else if (lastError.code === 'ECONNECTION') {
    errorMsg = `Cannot connect to SMTP server ${SMTP_HOST}:${SMTP_PORT}. Check network/firewall. Connection may have timed out after idle period.`;
  } else if (lastError.code === 'ETIMEDOUT' || lastError.message?.includes('timeout')) {
    errorMsg = 'SMTP connection timeout. Server may be down or unreachable. This may happen after idle period.';
  } else if (lastError.message?.includes('Failed to fetch') || lastError.message?.includes('Network error')) {
    errorMsg = 'Network error - connection lost. This may happen after idle period. Please try again.';
  }
  
  const troubleshooting = [];
  if (lastError.code === 'EAUTH') {
    troubleshooting.push('Check MAIL_USER and MAIL_PASS in env file');
    troubleshooting.push('Verify email account credentials are correct');
  } else if (lastError.code === 'ECONNECTION' || lastError.code === 'ETIMEDOUT' || lastError.code === 'ESOCKET') {
    troubleshooting.push('Check network connectivity to ' + SMTP_HOST + ':' + SMTP_PORT);
    troubleshooting.push('Verify SMTP_HOST, SMTP_PORT, SMTP_SECURE in env file');
    troubleshooting.push('Check Windows Firewall settings');
    troubleshooting.push('Try restarting server with start.bat');
  } else {
    troubleshooting.push('Check server console logs for detailed error');
    troubleshooting.push('Try sending again after a few seconds');
  }

  const errorResponse = {
    success: false, 
    error: errorMsg,
    code: lastError.code || 'UNKNOWN',
    host: SMTP_HOST || 'homegw.bbmail.com.hk',
    port: Number(SMTP_PORT) || 465,
    secure: SMTP_SECURE === 'true',
    originalError: lastError.message,
    retriesAttempted: maxRetries,
    troubleshooting: troubleshooting
  };
  
  
  res.status(500).json(errorResponse);
});

// Test SMTP connection endpoint
app.get('/api/smtp/test', async (req, res) => {
  // Get active profile for SMTP configuration
  const profiles = await getProfilesMemory();
  const activeProfile = profiles.find(p => p.isActive === 1);
  if (!activeProfile) {
    return res.status(400).json({
      success: false,
      error: 'No active email profile found. Please activate a profile in Settings.'
    });
  }

  // Use active profile settings
  const smtpHost = activeProfile.smtpHost;
  const smtpPort = Number(activeProfile.smtpPort);
  const smtpSecure = activeProfile.smtpSecure === 'true';
  
  try {
    
    
    
    
    
    // Create fresh transport for test using active profile
    const testTransport = createSmtpTransport(activeProfile);
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
  // Get active profile for SMTP configuration
  const profiles = await getProfilesMemory();
  const activeProfile = profiles.find(p => p.isActive === 1);
  if (!activeProfile) {
    return res.status(400).json({
      success: false,
      error: 'No active email profile found. Please activate a profile in Settings.'
    });
  }

  const testEmail = {
    to: 'eric.brilliant@gmail.com',
    subject: 'Test Email from ERP System',
    text: 'This is a test email sent from your ERP email service.\n\nIf you receive this, SMTP is working correctly!',
    html: '<p>This is a test email sent from your ERP email service.</p><p>If you receive this, SMTP is working correctly!</p>'
  };

  // Create fresh transport using active profile
  const profileTransport = createSmtpTransport(activeProfile);

  try {
    const info = await profileTransport.sendMail({
      from: `"ERP System" <${activeProfile.mailUser}>`,
      to: testEmail.to,
      subject: testEmail.subject,
      text: testEmail.text,
      html: testEmail.html
    });

    // Store the test email in the database
    console.log('Storing test email in database:', { to: testEmail.to, subject: testEmail.subject, messageId: info.messageId });
    try {
      const storedEmail = await createSentEmail({
        to_email: testEmail.to,
        subject: testEmail.subject,
        body_text: testEmail.text,
        body_html: testEmail.html,
        message_id: info.messageId,
        smtp_response: info.response,
        status: 'sent',
        profile_id: activeProfile.id
      });
      console.log('Successfully stored test email:', storedEmail.id);
    } catch (dbErr) {
      console.error('Failed to store test email in database:', dbErr);
      // Don't fail the request if DB storage fails
    }

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

    // Store the failed test email attempt in the database
    try {
      await createSentEmail({
        to_email: testEmail.to,
        subject: testEmail.subject,
        body_text: testEmail.text,
        body_html: testEmail.html,
        message_id: null,
        smtp_response: null,
        status: 'failed',
        error_message: err.message,
        profile_id: activeProfile.id
      });
    } catch (dbErr) {
      console.error('Failed to store failed test email in database:', dbErr);
      // Don't fail the request if DB storage fails
    }

    // Close transport on error
    try { profileTransport.close(); } catch {}

    let errorMsg = err.message || 'Failed to send test email';
    if (err.code === 'ESOCKET' || err.code === 'ETIMEDOUT') {
      errorMsg = `Cannot connect to ${activeProfile.smtpHost}:${activeProfile.smtpPort}. Connection timeout.`;
    } else if (err.code === 'EAUTH') {
      errorMsg = 'SMTP authentication failed. Check your email and password.';
    }

    res.status(500).json({
      success: false,
      error: errorMsg,
      code: err.code || 'UNKNOWN',
      host: activeProfile.smtpHost,
      port: activeProfile.smtpPort,
      secure: SMTP_SECURE === 'true',
      originalError: err.message
    });
  }
});

// ---------- SKILL MANAGEMENT API ----------
if (skillManager) {
  // Get all skills
  // ========== CUSTOMER API ENDPOINTS ==========

  app.get('/api/customers', async (req, res) => {
    try {
      const customers = await getAllCustomers();
      res.json({ success: true, customers });
    } catch (error) {
      console.error('Error fetching customers:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch customers' });
    }
  });

  app.get('/api/customers/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const customer = await getCustomerById(id);
      if (!customer) {
        return res.status(404).json({ success: false, error: 'Customer not found' });
      }
      res.json({ success: true, customer });
    } catch (error) {
      console.error('Error fetching customer:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch customer' });
    }
  });

  app.post('/api/customers', async (req, res) => {
    try {
      const customerData = req.body;

      // Validate required fields
      if (!customerData.companyName || !customerData.emailDomain || !customerData.companyType) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const customerId = await createCustomer(customerData);

      // Create members if provided
      if (customerData.members && Array.isArray(customerData.members)) {
        for (const member of customerData.members) {
          await createCustomerMember(customerId, member);
        }
      }

      const customer = await getCustomerById(customerId);
      res.json({ success: true, customer });
    } catch (error) {
      console.error('Error creating customer:', error);
      res.status(500).json({ success: false, error: 'Failed to create customer' });
    }
  });

  app.put('/api/customers/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const customerData = req.body;

      const existing = await getCustomerById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Customer not found' });
      }

      await updateCustomer(id, customerData);
      const updated = await getCustomerById(id);
      res.json({ success: true, customer: updated });
    } catch (error) {
      console.error('Error updating customer:', error);
      res.status(500).json({ success: false, error: 'Failed to update customer' });
    }
  });

  app.delete('/api/customers/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getCustomerById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Customer not found' });
      }

      await deleteCustomer(id);
      res.json({ success: true, message: 'Customer deleted successfully' });
    } catch (error) {
      console.error('Error deleting customer:', error);
      res.status(500).json({ success: false, error: 'Failed to delete customer' });
    }
  });

  // ========== QUOTATION API ENDPOINTS ==========

  app.get('/api/quotations', async (req, res) => {
    try {
      const quotations = await getAllQuotations();
      res.json({ success: true, quotations });
    } catch (error) {
      console.error('Error fetching quotations:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch quotations' });
    }
  });

  app.get('/api/quotations/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const quotation = await getQuotationById(id);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }
      res.json({ success: true, quotation });
    } catch (error) {
      console.error('Error fetching quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch quotation' });
    }
  });

  app.post('/api/quotations', async (req, res) => {
    try {
      const quotationData = req.body;

      // Validate required fields
      if (!quotationData.customerName || !quotationData.productType || !quotationData.quantity) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const quotationId = await createQuotation(quotationData);
      const quotation = await getQuotationById(quotationId);
      res.json({ success: true, quotation });
    } catch (error) {
      console.error('Error creating quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to create quotation' });
    }
  });

  app.put('/api/quotations/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const quotationData = req.body;

      const existing = await getQuotationById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      await updateQuotation(id, quotationData);
      const updated = await getQuotationById(id);
      res.json({ success: true, quotation: updated });
    } catch (error) {
      console.error('Error updating quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to update quotation' });
    }
  });

  app.delete('/api/quotations/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getQuotationById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      await deleteQuotation(id);
      res.json({ success: true, message: 'Quotation deleted successfully' });
    } catch (error) {
      console.error('Error deleting quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to delete quotation' });
    }
  });

  // ========== FILE UPLOAD ENDPOINTS ==========

  // Upload profile image for quotation
  app.post('/api/quotations/:id/upload-profile-image', upload.single('profileImage'), async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const quotation = await getQuotationById(id);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      // Delete old profile image if exists
      if (quotation.profileImagePath) {
        try {
          await fs.unlink(path.join(__dirname, quotation.profileImagePath));
        } catch (error) {
          console.warn('Failed to delete old profile image:', error);
        }
      }

      // Update quotation with new profile image path
      const relativePath = getNormalizedRelativePath(__dirname, req.file.path);
      await updateQuotation(id, { ...quotation, profileImagePath: relativePath });

      res.json({
        success: true,
        profileImagePath: relativePath,
        message: 'Profile image uploaded successfully'
      });
    } catch (error) {
      console.error('Error uploading profile image:', error);
      res.status(500).json({ success: false, error: 'Failed to upload profile image' });
    }
  });

  // Upload attachments for quotation
  app.post('/api/quotations/:id/upload-attachments', upload.array('attachments', 10), async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, error: 'No files uploaded' });
      }

      const quotation = await getQuotationById(id);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      // Get relative paths for uploaded files
      const newAttachmentPaths = req.files.map(file => getNormalizedRelativePath(__dirname, file.path));

      // Combine existing attachments with new ones
      const allAttachmentPaths = [...quotation.attachmentPaths, ...newAttachmentPaths];

      // Update quotation with new attachment paths
      await updateQuotation(id, { ...quotation, attachmentPaths: allAttachmentPaths });

      res.json({
        success: true,
        attachmentPaths: newAttachmentPaths,
        allAttachmentPaths: allAttachmentPaths,
        message: `${req.files.length} attachment(s) uploaded successfully`
      });
    } catch (error) {
      console.error('Error uploading attachments:', error);
      res.status(500).json({ success: false, error: 'Failed to upload attachments' });
    }
  });

  // Delete attachment from quotation
  app.delete('/api/quotations/:id/attachments/:filename', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const filename = req.params.filename;

      const quotation = await getQuotationById(id);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      // Find and remove the attachment
      const attachmentIndex = quotation.attachmentPaths.findIndex(path => path.includes(filename));
      if (attachmentIndex === -1) {
        return res.status(404).json({ success: false, error: 'Attachment not found' });
      }

      const filePath = quotation.attachmentPaths[attachmentIndex];
      const fullPath = path.join(__dirname, filePath);

      // Delete file from filesystem
      try {
        await fs.unlink(fullPath);
      } catch (error) {
        console.warn('Failed to delete file from filesystem:', error);
      }

      // Remove from database
      const updatedAttachments = quotation.attachmentPaths.filter((_, index) => index !== attachmentIndex);
      await updateQuotation(id, { ...quotation, attachmentPaths: updatedAttachments });

      res.json({ success: true, message: 'Attachment deleted successfully' });
    } catch (error) {
      console.error('Error deleting attachment:', error);
      res.status(500).json({ success: false, error: 'Failed to delete attachment' });
    }
  });

  // Serve uploaded files
  app.use('/uploads', express.static(uploadsDir));

  // ========== TEMPORARY FILE UPLOAD ENDPOINTS (for new quotations) ==========

  // Temporary profile image upload
  app.post('/api/quotations/temp/upload-profile-image', upload.single('profileImage'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const relativePath = getNormalizedRelativePath(__dirname, req.file.path);
      res.json({
        success: true,
        profileImagePath: relativePath,
        message: 'Profile image uploaded temporarily'
      });
    } catch (error) {
      console.error('Error uploading temporary profile image:', error);
      res.status(500).json({ success: false, error: 'Failed to upload profile image' });
    }
  });

  // Temporary attachments upload
  app.post('/api/quotations/temp/upload-attachments', upload.array('attachments', 10), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, error: 'No files uploaded' });
      }

      const attachmentPaths = req.files.map(file => getNormalizedRelativePath(__dirname, file.path));
      res.json({
        success: true,
        attachmentPaths: attachmentPaths,
        message: `${req.files.length} attachment(s) uploaded temporarily`
      });
    } catch (error) {
      console.error('Error uploading temporary attachments:', error);
      res.status(500).json({ success: false, error: 'Failed to upload attachments' });
    }
  });

  // ========== SKILL API ENDPOINTS (UPDATED TO USE DATABASE) ==========

  app.get('/api/skills', async (req, res) => {
    try {
      const { status, category, search } = req.query;
      let skills = await getAllSkills();

      // Apply filters
      if (status) {
        skills = skills.filter(skill => skill.status === status);
      }
      if (category) {
        skills = skills.filter(skill => skill.tags && skill.tags.includes(category));
      }
      if (search) {
        const searchLower = search.toLowerCase();
        skills = skills.filter(skill =>
          skill.name.toLowerCase().includes(searchLower) ||
          skill.description?.toLowerCase().includes(searchLower)
        );
      }

      res.json({ success: true, skills });
    } catch (error) {
      console.error('Error fetching skills:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch skills' });
    }
  });

  app.get('/api/skills/stats', async (req, res) => {
    try {
      const stats = await getSkillsStats();
      res.json({ success: true, stats });
    } catch (error) {
      console.error('Error fetching skills stats:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch skills stats' });
    }
  });

  app.get('/api/skills/:name', async (req, res) => {
    try {
      const skill = await getSkillByName(req.params.name);
      if (!skill) {
        return res.status(404).json({ success: false, error: 'Skill not found' });
      }
      res.json({ success: true, skill });
    } catch (error) {
      console.error('Error fetching skill:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch skill' });
    }
  });

  app.post('/api/skills', async (req, res) => {
    try {
      const skillData = req.body;

      // Validate required fields
      if (!skillData.name || !skillData.version || !skillData.status) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const skillId = await createSkill(skillData);
      const skill = await getSkillById(skillId);
      res.json({ success: true, skill });
    } catch (error) {
      console.error('Error creating skill:', error);
      res.status(500).json({ success: false, error: 'Failed to create skill' });
    }
  });

  app.put('/api/skills/:name', async (req, res) => {
    try {
      const skillName = req.params.name;
      const updates = req.body;

      const existing = await getSkillByName(skillName);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Skill not found' });
      }

      updates.updated = new Date().toISOString();
      await updateSkill(existing.id, { ...existing, ...updates });

      const updated = await getSkillByName(skillName);
      res.json({ success: true, skill: updated });
    } catch (error) {
      console.error('Error updating skill:', error);
      res.status(500).json({ success: false, error: 'Failed to update skill' });
    }
  });

  app.delete('/api/skills/:name', async (req, res) => {
    try {
      const skillName = req.params.name;
      const existing = await getSkillByName(skillName);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Skill not found' });
      }

      await deleteSkill(existing.id);
      res.json({ success: true, message: 'Skill deleted successfully' });
    } catch (error) {
      console.error('Error deleting skill:', error);
      res.status(500).json({ success: false, error: 'Failed to delete skill' });
    }
  });

  // Keep the old skill manager endpoints for backward compatibility
  app.get('/api/skills-old', (req, res) => {
    try {
      const { status, category, search } = req.query;
      let skills = skillManager.getAllSkills();

      if (status) {
        skills = skills.filter(skill => skill.status === status);
      }

      if (category) {
        skills = skills.filter(skill => skill.category === category);
      }

      if (search) {
        skills = skillManager.searchSkills(search);
      }

      res.json({ success: true, skills });
    } catch (err) {
      console.error('Error getting skills:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get skill statistics
  app.get('/api/skills/stats', (req, res) => {
    try {
      const stats = skillManager.getSkillStats();
      res.json({ success: true, stats });
    } catch (err) {
      console.error('Error getting skill stats:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get single skill
  app.get('/api/skills/:name', (req, res) => {
    try {
      const skill = skillManager.getSkill(req.params.name);
      if (!skill) {
        return res.status(404).json({ success: false, error: 'Skill not found' });
      }
      res.json({ success: true, skill });
    } catch (err) {
      console.error('Error getting skill:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create new skill
  app.post('/api/skills', (req, res) => {
    try {
      const skillData = req.body;
      const skill = skillManager.createSkill(skillData);
      res.json({ success: true, skill });
    } catch (err) {
      console.error('Error creating skill:', err);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Update skill
  app.put('/api/skills/:name', (req, res) => {
    try {
      const updates = req.body;
      const skill = skillManager.updateSkill(req.params.name, updates);
      res.json({ success: true, skill });
    } catch (err) {
      console.error('Error updating skill:', err);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Delete skill
  app.delete('/api/skills/:name', (req, res) => {
    try {
      skillManager.deleteSkill(req.params.name);
      res.json({ success: true, message: 'Skill deleted successfully' });
    } catch (err) {
      console.error('Error deleting skill:', err);
      res.status(400).json({ success: false, error: err.message });
    }
  });
} else {
  console.log('Skill API endpoints not available - skill manager failed to initialize');
}

// Global error handlers to prevent server crashes
process.on('uncaughtException', (err) => {
  console.error('========== UNCAUGHT EXCEPTION (Server will stay running) ==========');
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  console.error('===================================================================');
  // Don't exit - keep server running, but log the error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('========== UNHANDLED REJECTION (Server will stay running) ==========');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('====================================================================');
  // Don't exit - keep server running, but log the error
});

app.listen(Number(PORT), () => {
  // Server started
});
