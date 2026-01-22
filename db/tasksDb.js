import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const dbPath = path.join(dataDir, 'tasks.db');

let dbPromise = null;

async function ensureSchema(db) {
  await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,

      sourceEmailUid INTEGER,
      sourceSubject TEXT,
      customerEmail TEXT,

      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,

      replyMessageId TEXT,
      repliedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      remark TEXT,
      mailUser TEXT NOT NULL,
      mailPass TEXT NOT NULL,
      imapHost TEXT NOT NULL,
      imapPort INTEGER NOT NULL DEFAULT 993,
      imapTls TEXT NOT NULL DEFAULT 'true',
      smtpHost TEXT NOT NULL,
      smtpPort INTEGER NOT NULL DEFAULT 465,
      smtpSecure TEXT NOT NULL DEFAULT 'true',
      port INTEGER NOT NULL DEFAULT 3001,
      isActive INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sent_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_text TEXT,
      body_html TEXT,
      message_id TEXT,
      smtp_response TEXT,
      status TEXT NOT NULL DEFAULT 'sent',
      error_message TEXT,
      sent_at TEXT NOT NULL,
      profile_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES profiles(id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyName TEXT NOT NULL,
      emailDomain TEXT NOT NULL,
      companyAddress TEXT,
      companyTel TEXT,
      companyType TEXT NOT NULL,
      companyWebsite TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER NOT NULL,
      name TEXT NOT NULL,
      emailPrefix TEXT,
      title TEXT,
      tel TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerName TEXT NOT NULL,
      contactPerson TEXT,
      email TEXT,
      phone TEXT,
      productType TEXT NOT NULL,
      productDetails TEXT,
      quantity INTEGER NOT NULL,
      unitPrice REAL NOT NULL,
      total REAL NOT NULL,
      notes TEXT,
      type TEXT DEFAULT 'non email',
      profileImagePath TEXT,
      attachmentPaths TEXT,
      dateCreated TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
    );

    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      tags TEXT,
      components TEXT,
      features TEXT,
      dependencies TEXT,
      data_structure TEXT,
      ui_components TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_createdAt ON tasks(createdAt);
    CREATE INDEX IF NOT EXISTS idx_tasks_sourceEmailUid ON tasks(sourceEmailUid);
    CREATE INDEX IF NOT EXISTS idx_profiles_isActive ON profiles(isActive);
    CREATE INDEX IF NOT EXISTS idx_sent_emails_sent_at ON sent_emails(sent_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sent_emails_profile_id ON sent_emails(profile_id);
    CREATE INDEX IF NOT EXISTS idx_sent_emails_to_email ON sent_emails(to_email);
    CREATE INDEX IF NOT EXISTS idx_customers_companyName ON customers(companyName);
    CREATE INDEX IF NOT EXISTS idx_customers_emailDomain ON customers(emailDomain);
    CREATE INDEX IF NOT EXISTS idx_customer_members_customerId ON customer_members(customerId);
    CREATE INDEX IF NOT EXISTS idx_customer_members_name ON customer_members(name);
    CREATE INDEX IF NOT EXISTS idx_quotations_customerName ON quotations(customerName);
    CREATE INDEX IF NOT EXISTS idx_quotations_productType ON quotations(productType);
    CREATE INDEX IF NOT EXISTS idx_quotations_dateCreated ON quotations(dateCreated DESC);
    CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
    CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
  `);

  // Add new columns if they don't exist (for database migration)
  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN profileImagePath TEXT;`);
  } catch (err) {
    // Column might already exist, ignore error
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding profileImagePath column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN attachmentPaths TEXT;`);
  } catch (err) {
    // Column might already exist, ignore error
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding attachmentPaths column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN type TEXT DEFAULT 'non email';`);
  } catch (err) {
    // Column might already exist, ignore error
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding type column:', err);
    }
  }
}

export async function getTasksDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      await fs.mkdir(dataDir, { recursive: true });
      const db = await open({
        filename: dbPath,
        driver: sqlite3.Database,
      });
      await ensureSchema(db);
      return db;
    })();
  }
  return dbPromise;
}

export const TASK_STATUS = {
  NEW: 'new',
  IN_PROGRESS: 'in_progress',
  WAITING_CUSTOMER: 'waiting_customer',
  REPLIED: 'replied',
  FOLLOW_UP: 'follow_up',
  CLOSED: 'closed',
};

export async function createTask({
  type,
  status = TASK_STATUS.NEW,
  sourceEmailUid = null,
  sourceSubject = null,
  customerEmail = null,
  notes = null,
} = {}) {
  if (!type || typeof type !== 'string') {
    throw new Error('Task type is required');
  }

  const db = await getTasksDb();
  const now = new Date().toISOString();

  const result = await db.run(
    `
      INSERT INTO tasks (type, status, sourceEmailUid, sourceSubject, customerEmail, notes, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [type, status, sourceEmailUid, sourceSubject, customerEmail, notes, now, now]
  );

  return await db.get(`SELECT * FROM tasks WHERE id = ?`, [result.lastID]);
}

export async function listTasks({ status } = {}) {
  const db = await getTasksDb();
  if (status) {
    return await db.all(
      `SELECT * FROM tasks WHERE status = ? ORDER BY id DESC`,
      [status]
    );
  }
  return await db.all(`SELECT * FROM tasks ORDER BY id DESC`);
}

export async function getTaskById(id) {
  const db = await getTasksDb();
  return await db.get(`SELECT * FROM tasks WHERE id = ?`, [id]);
}

export async function updateTaskStatus(id, status) {
  const db = await getTasksDb();
  const now = new Date().toISOString();
  await db.run(
    `UPDATE tasks SET status = ?, updatedAt = ? WHERE id = ?`,
    [status, now, id]
  );
  return await getTaskById(id);
}

// Profile management functions
export async function getProfiles() {
  const db = await getTasksDb();
  return await db.all(`SELECT * FROM profiles ORDER BY id ASC`);
}

export async function createProfile(profileData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  const result = await db.run(
    `
      INSERT INTO profiles (name, remark, mailUser, mailPass, imapHost, imapPort, imapTls, smtpHost, smtpPort, smtpSecure, port, isActive, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      profileData.name,
      profileData.remark || '',
      profileData.mailUser,
      profileData.mailPass,
      profileData.imapHost,
      profileData.imapPort || 993,
      profileData.imapTls || 'true',
      profileData.smtpHost,
      profileData.smtpPort || 465,
      profileData.smtpSecure || 'true',
      profileData.port || 3001,
      profileData.isActive || 0,
      now,
      now
    ]
  );

  return await db.get(`SELECT * FROM profiles WHERE id = ?`, [result.lastID]);
}

export async function updateProfile(id, profileData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  await db.run(
    `
      UPDATE profiles SET
        name = ?,
        remark = ?,
        mailUser = ?,
        mailPass = ?,
        imapHost = ?,
        imapPort = ?,
        imapTls = ?,
        smtpHost = ?,
        smtpPort = ?,
        smtpSecure = ?,
        port = ?,
        isActive = ?,
        updatedAt = ?
      WHERE id = ?
    `,
    [
      profileData.name,
      profileData.remark || '',
      profileData.mailUser,
      profileData.mailPass,
      profileData.imapHost,
      profileData.imapPort || 993,
      profileData.imapTls || 'true',
      profileData.smtpHost,
      profileData.smtpPort || 465,
      profileData.smtpSecure || 'true',
      profileData.port || 3001,
      profileData.isActive || 0,
      now,
      id
    ]
  );

  return await db.get(`SELECT * FROM profiles WHERE id = ?`, [id]);
}

export async function deleteProfile(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM profiles WHERE id = ?`, [id]);
}

export async function activateProfile(id) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  // First, set all profiles to inactive
  await db.run(`UPDATE profiles SET isActive = 0, updatedAt = ?`, [now]);

  // Then activate the specified profile
  await db.run(`UPDATE profiles SET isActive = 1, updatedAt = ? WHERE id = ?`, [now, id]);
}

// Sent emails management functions
export async function createSentEmail({
  to_email,
  subject,
  body_text,
  body_html,
  message_id,
  smtp_response,
  status = 'sent',
  error_message = null,
  profile_id = null,
}) {
  if (!to_email || !subject) {
    throw new Error('to_email and subject are required');
  }

  const db = await getTasksDb();
  const now = new Date().toISOString();

  const result = await db.run(
    `
      INSERT INTO sent_emails (to_email, subject, body_text, body_html, message_id, smtp_response, status, error_message, sent_at, profile_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [to_email, subject, body_text, body_html, message_id, smtp_response, status, error_message, now, profile_id, now]
  );

  return await db.get(`SELECT * FROM sent_emails WHERE id = ?`, [result.lastID]);
}

export async function listSentEmails({ limit = 50, offset = 0, profile_id, sender_email } = {}) {
  const db = await getTasksDb();
  let query = `SELECT se.*, p.name as profile_name, p.mailUser as sender_email FROM sent_emails se LEFT JOIN profiles p ON se.profile_id = p.id`;
  let params = [];

  let whereClause = [];
  if (profile_id !== undefined) {
    whereClause.push(`se.profile_id = ?`);
    params.push(profile_id);
  }

  if (sender_email) {
    whereClause.push(`p.mailUser = ?`);
    params.push(sender_email);
  }

  if (whereClause.length > 0) {
    query += ` WHERE ` + whereClause.join(' AND ');
  }

  query += ` ORDER BY se.sent_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return await db.all(query, params);
}

export async function getSentEmailById(id) {
  const db = await getTasksDb();
  return await db.get(
    `SELECT se.*, p.name as profile_name, p.mailUser as sender_email FROM sent_emails se LEFT JOIN profiles p ON se.profile_id = p.id WHERE se.id = ?`,
    [id]
  );
}

export async function getSentEmailsCount({ profile_id, sender_email } = {}) {
  const db = await getTasksDb();
  let query = `SELECT COUNT(*) as count FROM sent_emails se LEFT JOIN profiles p ON se.profile_id = p.id`;
  let params = [];

  let whereClause = [];
  if (profile_id !== undefined) {
    whereClause.push(`se.profile_id = ?`);
    params.push(profile_id);
  }

  if (sender_email) {
    whereClause.push(`p.mailUser = ?`);
    params.push(sender_email);
  }

  if (whereClause.length > 0) {
    query += ` WHERE ` + whereClause.join(' AND ');
  }

  const result = await db.get(query, params);
  return result.count;
}

// ========== CUSTOMER FUNCTIONS ==========

export async function createCustomer(customerData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  const result = await db.run(
    `
      INSERT INTO customers (companyName, emailDomain, companyAddress, companyTel, companyType, companyWebsite, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      customerData.companyName,
      customerData.emailDomain,
      customerData.companyAddress || null,
      customerData.companyTel || null,
      customerData.companyType,
      customerData.companyWebsite || null,
      now,
      now
    ]
  );

  return result.lastID;
}

export async function getCustomerById(id) {
  const db = await getTasksDb();
  const customer = await db.get(`SELECT * FROM customers WHERE id = ?`, [id]);

  if (customer) {
    // Get members
    const members = await db.all(`SELECT * FROM customer_members WHERE customerId = ? ORDER BY name`, [id]);
    customer.members = members;
  }

  return customer;
}

export async function getAllCustomers() {
  const db = await getTasksDb();
  const customers = await db.all(`SELECT * FROM customers ORDER BY companyName`);

  // Get members for each customer
  for (const customer of customers) {
    const members = await db.all(`SELECT * FROM customer_members WHERE customerId = ? ORDER BY name`, [customer.id]);
    customer.members = members;
  }

  return customers;
}

export async function updateCustomer(id, customerData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  await db.run(
    `
      UPDATE customers
      SET companyName = ?, emailDomain = ?, companyAddress = ?, companyTel = ?, companyType = ?, companyWebsite = ?, updatedAt = ?
      WHERE id = ?
    `,
    [
      customerData.companyName,
      customerData.emailDomain,
      customerData.companyAddress || null,
      customerData.companyTel || null,
      customerData.companyType,
      customerData.companyWebsite || null,
      now,
      id
    ]
  );

  return true;
}

export async function deleteCustomer(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM customers WHERE id = ?`, [id]);
  return true;
}

export async function createCustomerMember(customerId, memberData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  const result = await db.run(
    `
      INSERT INTO customer_members (customerId, name, emailPrefix, title, tel, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      customerId,
      memberData.name,
      memberData.emailPrefix || null,
      memberData.title || null,
      memberData.tel || null,
      now,
      now
    ]
  );

  return result.lastID;
}

export async function updateCustomerMember(id, memberData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  await db.run(
    `
      UPDATE customer_members
      SET name = ?, emailPrefix = ?, title = ?, tel = ?, updatedAt = ?
      WHERE id = ?
    `,
    [
      memberData.name,
      memberData.emailPrefix || null,
      memberData.title || null,
      memberData.tel || null,
      now,
      id
    ]
  );

  return true;
}

export async function deleteCustomerMember(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM customer_members WHERE id = ?`, [id]);
  return true;
}

// ========== QUOTATION FUNCTIONS ==========

export async function createQuotation(quotationData) {
  const db = await getTasksDb();

  const result = await db.run(
    `
      INSERT INTO quotations (customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, notes, type, profileImagePath, attachmentPaths, dateCreated, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      quotationData.customerName,
      quotationData.contactPerson || null,
      quotationData.email || null,
      quotationData.phone || null,
      quotationData.productType,
      JSON.stringify(quotationData.productDetails || {}),
      quotationData.quantity,
      quotationData.unitPrice,
      quotationData.total,
      quotationData.notes || null,
      quotationData.type || 'non email',
      quotationData.profileImagePath || null,
      JSON.stringify(quotationData.attachmentPaths || []),
      quotationData.dateCreated,
      quotationData.status || 'draft'
    ]
  );

  return result.lastID;
}

export async function getQuotationById(id) {
  const db = await getTasksDb();
  const quotation = await db.get(`SELECT * FROM quotations WHERE id = ?`, [id]);

  if (quotation) {
    quotation.productDetails = JSON.parse(quotation.productDetails || '{}');
    quotation.attachmentPaths = JSON.parse(quotation.attachmentPaths || '[]');
  }

  return quotation;
}

export async function getAllQuotations() {
  const db = await getTasksDb();
  const quotations = await db.all(`SELECT * FROM quotations ORDER BY dateCreated DESC`);

  // Parse JSON fields
  for (const quotation of quotations) {
    quotation.productDetails = JSON.parse(quotation.productDetails || '{}');
    quotation.attachmentPaths = JSON.parse(quotation.attachmentPaths || '[]');
  }

  return quotations;
}

export async function updateQuotation(id, quotationData) {
  const db = await getTasksDb();

  await db.run(
    `
      UPDATE quotations
      SET customerName = ?, contactPerson = ?, email = ?, phone = ?, productType = ?, productDetails = ?, quantity = ?, unitPrice = ?, total = ?, notes = ?, type = ?, profileImagePath = ?, attachmentPaths = ?, status = ?
      WHERE id = ?
    `,
    [
      quotationData.customerName,
      quotationData.contactPerson || null,
      quotationData.email || null,
      quotationData.phone || null,
      quotationData.productType,
      JSON.stringify(quotationData.productDetails || {}),
      quotationData.quantity,
      quotationData.unitPrice,
      quotationData.total,
      quotationData.notes || null,
      quotationData.type || 'non email',
      quotationData.profileImagePath || null,
      JSON.stringify(quotationData.attachmentPaths || []),
      quotationData.status || 'draft',
      id
    ]
  );

  return true;
}

export async function deleteQuotation(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM quotations WHERE id = ?`, [id]);
  return true;
}

// ========== SKILL FUNCTIONS ==========

export async function createSkill(skillData) {
  const db = await getTasksDb();

  const result = await db.run(
    `
      INSERT INTO skills (name, description, version, status, created, updated, tags, components, features, dependencies, data_structure, ui_components)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      skillData.name,
      skillData.description || null,
      skillData.version,
      skillData.status,
      skillData.created,
      skillData.updated,
      JSON.stringify(skillData.tags || []),
      JSON.stringify(skillData.components || {}),
      JSON.stringify(skillData.features || []),
      JSON.stringify(skillData.dependencies || []),
      JSON.stringify(skillData.data_structure || {}),
      JSON.stringify(skillData.ui_components || {})
    ]
  );

  return result.lastID;
}

export async function getSkillById(id) {
  const db = await getTasksDb();
  const skill = await db.get(`SELECT * FROM skills WHERE id = ?`, [id]);

  if (skill) {
    // Parse JSON fields
    skill.tags = JSON.parse(skill.tags || '[]');
    skill.components = JSON.parse(skill.components || '{}');
    skill.features = JSON.parse(skill.features || '[]');
    skill.dependencies = JSON.parse(skill.dependencies || '[]');
    skill.data_structure = JSON.parse(skill.data_structure || '{}');
    skill.ui_components = JSON.parse(skill.ui_components || '{}');
  }

  return skill;
}

export async function getSkillByName(name) {
  const db = await getTasksDb();
  const skill = await db.get(`SELECT * FROM skills WHERE name = ?`, [name]);

  if (skill) {
    // Parse JSON fields
    skill.tags = JSON.parse(skill.tags || '[]');
    skill.components = JSON.parse(skill.components || '{}');
    skill.features = JSON.parse(skill.features || '[]');
    skill.dependencies = JSON.parse(skill.dependencies || '[]');
    skill.data_structure = JSON.parse(skill.data_structure || '{}');
    skill.ui_components = JSON.parse(skill.ui_components || '{}');
  }

  return skill;
}

export async function getAllSkills() {
  const db = await getTasksDb();
  const skills = await db.all(`SELECT * FROM skills ORDER BY updated DESC`);

  // Parse JSON fields
  for (const skill of skills) {
    skill.tags = JSON.parse(skill.tags || '[]');
    skill.components = JSON.parse(skill.components || '{}');
    skill.features = JSON.parse(skill.features || '[]');
    skill.dependencies = JSON.parse(skill.dependencies || '[]');
    skill.data_structure = JSON.parse(skill.data_structure || '{}');
    skill.ui_components = JSON.parse(skill.ui_components || '{}');
  }

  return skills;
}

export async function updateSkill(id, skillData) {
  const db = await getTasksDb();

  await db.run(
    `
      UPDATE skills
      SET name = ?, description = ?, version = ?, status = ?, updated = ?, tags = ?, components = ?, features = ?, dependencies = ?, data_structure = ?, ui_components = ?
      WHERE id = ?
    `,
    [
      skillData.name,
      skillData.description || null,
      skillData.version,
      skillData.status,
      skillData.updated,
      JSON.stringify(skillData.tags || []),
      JSON.stringify(skillData.components || {}),
      JSON.stringify(skillData.features || []),
      JSON.stringify(skillData.dependencies || []),
      JSON.stringify(skillData.data_structure || {}),
      JSON.stringify(skillData.ui_components || {}),
      id
    ]
  );

  return true;
}

export async function deleteSkill(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM skills WHERE id = ?`, [id]);
  return true;
}

export async function getSkillsStats() {
  const db = await getTasksDb();
  const stats = await db.get(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) as inProgress,
      SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END) as planned
    FROM skills
  `);

  return {
    total: stats.total || 0,
    completed: stats.completed || 0,
    inProgress: stats.inProgress || 0,
    planned: stats.planned || 0
  };
}


