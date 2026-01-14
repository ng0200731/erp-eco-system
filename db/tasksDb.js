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

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_createdAt ON tasks(createdAt);
    CREATE INDEX IF NOT EXISTS idx_tasks_sourceEmailUid ON tasks(sourceEmailUid);
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


