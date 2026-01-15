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

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_createdAt ON tasks(createdAt);
    CREATE INDEX IF NOT EXISTS idx_tasks_sourceEmailUid ON tasks(sourceEmailUid);
    CREATE INDEX IF NOT EXISTS idx_profiles_isActive ON profiles(isActive);
  `);
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


