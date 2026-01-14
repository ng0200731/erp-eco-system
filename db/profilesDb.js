import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const dbPath = path.join(dataDir, 'tasks.db'); // Reuse same DB

let dbPromise = null;

async function ensureSchema(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      remark TEXT,
      mailUser TEXT NOT NULL,
      mailPass TEXT NOT NULL,
      imapHost TEXT NOT NULL,
      imapPort INTEGER NOT NULL,
      imapTls TEXT NOT NULL,
      smtpHost TEXT NOT NULL,
      smtpPort INTEGER NOT NULL,
      smtpSecure TEXT NOT NULL,
      port INTEGER NOT NULL,
      isActive INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_isActive ON profiles(isActive);
  `);
}

export async function getProfilesDb() {
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

export async function listProfiles() {
  const db = await getProfilesDb();
  return await db.all('SELECT * FROM profiles ORDER BY createdAt DESC');
}

export async function getProfileById(id) {
  const db = await getProfilesDb();
  return await db.get('SELECT * FROM profiles WHERE id = ?', id);
}

export async function getActiveProfile() {
  const db = await getProfilesDb();
  return await db.get('SELECT * FROM profiles WHERE isActive = 1 LIMIT 1');
}

export async function createProfile(profile) {
  const db = await getProfilesDb();
  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO profiles (name, remark, mailUser, mailPass, imapHost, imapPort, imapTls, smtpHost, smtpPort, smtpSecure, port, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    profile.name || '',
    profile.remark || '',
    profile.mailUser || '',
    profile.mailPass || '',
    profile.imapHost || '',
    profile.imapPort || 993,
    profile.imapTls || 'true',
    profile.smtpHost || '',
    profile.smtpPort || 465,
    profile.smtpSecure || 'true',
    profile.port || 3001,
    profile.isActive || 0,
    now,
    now
  );
  return result.lastID;
}

export async function updateProfile(id, profile) {
  const db = await getProfilesDb();
  const now = new Date().toISOString();
  await db.run(
    `UPDATE profiles SET name = ?, remark = ?, mailUser = ?, mailPass = ?, imapHost = ?, imapPort = ?, imapTls = ?, smtpHost = ?, smtpPort = ?, smtpSecure = ?, port = ?, updatedAt = ?
     WHERE id = ?`,
    profile.name,
    profile.remark,
    profile.mailUser,
    profile.mailPass,
    profile.imapHost,
    profile.imapPort,
    profile.imapTls,
    profile.smtpHost,
    profile.smtpPort,
    profile.smtpSecure,
    profile.port,
    now,
    id
  );
}

export async function setActiveProfile(id) {
  const db = await getProfilesDb();
  await db.run('UPDATE profiles SET isActive = 0'); // Clear all active
  await db.run('UPDATE profiles SET isActive = 1 WHERE id = ?', id);
}

export async function deleteProfile(id) {
  const db = await getProfilesDb();
  await db.run('DELETE FROM profiles WHERE id = ?', id);
}

