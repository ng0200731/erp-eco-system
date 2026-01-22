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
import { createHealthRoutes } from './routes/health.js';
import { createTaskRoutes } from './routes/tasks.js';
import { createProfileRoutes } from './routes/profiles.js';
import { createCustomerRoutes } from './routes/customers.js';
import { createQuotationRoutes } from './routes/quotations.js';
import { createSkillRoutes } from './routes/skills.js';
import { createEmailRoutes } from './routes/emails.js';

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

// ---------- MOUNT ROUTES ----------
// Health and config routes
const healthRoutes = createHealthRoutes({
  imapClient,
  SMTP_HOST,
  SMTP_PORT,
  MAIL_USER,
  MAIL_PASS,
  IMAP_HOST,
  IMAP_PORT,
  IMAP_TLS,
  SMTP_SECURE
});
app.use('/api', healthRoutes);

// Task routes
const taskRoutes = createTaskRoutes({
  createTask,
  getTaskById,
  listTasks,
  updateTaskStatus,
  TASK_STATUS
});
app.use('/api/tasks', taskRoutes);

// Profile routes
const profileRoutes = createProfileRoutes({
  MAIL_USER,
  MAIL_PASS,
  IMAP_HOST,
  IMAP_PORT,
  IMAP_TLS,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  PORT
});
app.use('/api/profiles', profileRoutes);

// Helper function for getting profiles (used by other routes)
const getProfilesMemory = profileRoutes.loadProfiles;

// Customer routes
const customerRoutes = createCustomerRoutes({
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  createCustomerMember
});
app.use('/api/customers', customerRoutes);

// Quotation routes
const quotationRoutes = createQuotationRoutes({
  getAllQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  deleteQuotation,
  upload,
  getNormalizedRelativePath
});
app.use('/api/quotations', quotationRoutes);

// Skill routes
const skillRoutes = createSkillRoutes({
  getAllSkills,
  getSkillsStats,
  getSkillByName,
  getSkillById,
  createSkill,
  updateSkill,
  deleteSkill
});
app.use('/api/skills', skillRoutes);

// Email routes
const emailRoutes = createEmailRoutes({
  listSentEmails,
  getSentEmailsCount,
  getSentEmailById,
  createSentEmail,
  getProfilesMemory,
  connectImap,
  getImapClient: () => imapClient,
  setImapClient: (client) => { imapClient = client; },
  getSmtpTransport: () => smtpTransport,
  createSmtpTransport,
  config: {
    IMAP_HOST,
    IMAP_PORT,
    MAIL_USER,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE
  }
});
app.use('/api', emailRoutes);

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// ---------- POST /api/config endpoint (for updating env file) ----------
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
