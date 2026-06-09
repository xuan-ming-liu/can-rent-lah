import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'can-rent-lah.db');

// Ensure data dir exists
import { mkdirSync } from 'node:fs';
mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    email       TEXT PRIMARY KEY,
    password    TEXT NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'free',
    role        TEXT NOT NULL DEFAULT 'user',
    activated   INTEGER NOT NULL DEFAULT 0,
    chat_count  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    email       TEXT NOT NULL REFERENCES users(email),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL DEFAULT (datetime('now', '+7 days'))
  );

  CREATE TABLE IF NOT EXISTS listings (
    id          TEXT PRIMARY KEY,
    user_email  TEXT NOT NULL REFERENCES users(email),
    title       TEXT NOT NULL DEFAULT '',
    price       TEXT NOT NULL DEFAULT '',
    address     TEXT NOT NULL DEFAULT '',
    bedrooms    TEXT NOT NULL DEFAULT '',
    bathrooms   TEXT NOT NULL DEFAULT '',
    floor_area  TEXT NOT NULL DEFAULT '',
    property_type TEXT NOT NULL DEFAULT '',
    mrt         TEXT NOT NULL DEFAULT '',
    availability TEXT NOT NULL DEFAULT '',
    posted_date TEXT NOT NULL DEFAULT '',
    url         TEXT NOT NULL DEFAULT '',
    source      TEXT NOT NULL DEFAULT 'propertyguru',
    pros        TEXT NOT NULL DEFAULT '',
    cons        TEXT NOT NULL DEFAULT '',
    captured_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    user_email  TEXT NOT NULL REFERENCES users(email),
    status      TEXT NOT NULL DEFAULT 'pending',
    question    TEXT NOT NULL DEFAULT '',
    intent_json TEXT,
    rounds_json TEXT,
    result_json TEXT,
    total_collected INTEGER NOT NULL DEFAULT 0,
    current_round   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS profiles (
    user_email  TEXT PRIMARY KEY REFERENCES users(email),
    content     TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS learning_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email  TEXT NOT NULL REFERENCES users(email),
    entry       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activation_codes (
    code        TEXT PRIMARY KEY,
    plan        TEXT NOT NULL DEFAULT 'pro',
    max_uses    INTEGER NOT NULL DEFAULT 1,
    used_count  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email  TEXT NOT NULL REFERENCES users(email),
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    summarized  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_user_email ON messages(user_email);
  CREATE INDEX IF NOT EXISTS idx_messages_summarized ON messages(user_email, summarized);
`);

// ---------------------------------------------------------------------------
// Schema migrations (safe to run on existing DBs)
// ---------------------------------------------------------------------------

// SQLite ALTER TABLE only supports constant defaults — use multi-step migration
try {
  db.exec("ALTER TABLE sessions ADD COLUMN expires_at TEXT");
  db.exec("UPDATE sessions SET expires_at = datetime(created_at, '+7 days') WHERE expires_at IS NULL");
} catch {}
try { db.exec("ALTER TABLE listings ADD COLUMN pros TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE listings ADD COLUMN cons TEXT NOT NULL DEFAULT ''"); } catch {}

// ---------------------------------------------------------------------------
// Password utils
// ---------------------------------------------------------------------------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === check;
}

// ---------------------------------------------------------------------------
// User operations
// ---------------------------------------------------------------------------

export function createUser(email, password, { plan = 'free', role = 'user', activated = false } = {}) {
  const stmt = db.prepare('INSERT OR IGNORE INTO users (email, password, plan, role, activated) VALUES (?, ?, ?, ?, ?)');
  const result = stmt.run(email, hashPassword(password), plan, role, activated ? 1 : 0);
  if (result.changes === 0) return null;
  return getUser(email);
}

export function getUser(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
}

export function verifyUser(email, password) {
  const user = getUser(email);
  if (!user) return null;
  if (!verifyPassword(password, user.password)) return null;
  return publicUser(user);
}

export function publicUser(user) {
  if (!user) return null;
  return {
    email: user.email,
    plan: user.plan,
    role: user.role,
    activated: Boolean(user.activated),
    chatCount: user.chat_count,
    createdAt: user.created_at,
  };
}

export function changePassword(email, oldPassword, newPassword) {
  const user = getUser(email);
  if (!user) return { error: '用户不存在' };
  if (!verifyPassword(oldPassword, user.password)) return { error: '原密码错误' };
  db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hashPassword(newPassword), email);
  return { success: true };
}

export function incrementChatCount(email) {
  db.prepare('UPDATE users SET chat_count = chat_count + 1 WHERE email = ?').run(email);
}

// ---------------------------------------------------------------------------
// Session operations
// ---------------------------------------------------------------------------

const SESSION_TTL_DAYS = 7;

export function createSession(email) {
  const token = crypto.randomBytes(24).toString('base64url');
  db.prepare(
    'INSERT OR REPLACE INTO sessions (token, email, expires_at) VALUES (?, ?, datetime(\'now\', ?))'
  ).run(token, email, `+${SESSION_TTL_DAYS} days`);
  return token;
}

export function getSessionEmail(token) {
  const row = db.prepare(
    'SELECT email FROM sessions WHERE token = ? AND expires_at > datetime(\'now\')'
  ).get(token);
  return row ? row.email : null;
}

export function deleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function cleanupExpiredSessions() {
  const result = db.prepare(
    "DELETE FROM sessions WHERE expires_at <= datetime('now')"
  ).run();
  return result.changes;
}

export function cleanupExpiredTasks() {
  const result = db.prepare(
    "UPDATE tasks SET status = 'expired' WHERE status IN ('waiting_search', 'searching') AND updated_at < datetime('now', '-30 minutes')"
  ).run();
  return result.changes;
}

// ---------------------------------------------------------------------------
// Activation operations
// ---------------------------------------------------------------------------

export function redeemCode(email, code) {
  const ac = db.prepare('SELECT * FROM activation_codes WHERE code = ?').get(code);
  if (!ac) return { error: 'Invalid activation code' };
  if (ac.used_count >= ac.max_uses) return { error: 'Activation code already used' };

  db.prepare('UPDATE activation_codes SET used_count = used_count + 1 WHERE code = ?').run(code);
  db.prepare('UPDATE users SET plan = ?, activated = 1 WHERE email = ?').run(ac.plan, email);

  return { user: publicUser(getUser(email)) };
}

export function seedActivationCodes(codes) {
  const stmt = db.prepare('INSERT OR IGNORE INTO activation_codes (code, plan, max_uses) VALUES (?, ?, ?)');
  for (const [code, plan, maxUses = 999] of codes) {
    stmt.run(code, plan, maxUses);
  }
}

// ---------------------------------------------------------------------------
// Listing operations
// ---------------------------------------------------------------------------

export function saveListing(userEmail, listing) {
  const id = listing.id || crypto.randomUUID();
  try {
    db.prepare(`
      INSERT OR REPLACE INTO listings
        (id, user_email, title, price, address, bedrooms, bathrooms, floor_area, property_type, mrt, availability, posted_date, url, source, pros, cons, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, userEmail,
      listing.title || '', listing.price || '', listing.address || '',
      listing.bedrooms || '', listing.bathrooms || '', listing.floorArea || listing.floor_area || '',
      listing.propertyType || listing.property_type || '', listing.mrt || '',
      listing.availability || '', listing.postedDate || listing.posted_date || '',
      listing.url || '', listing.source || 'propertyguru',
      listing._pros || listing.pros || '',
      listing._cons || listing.cons || '',
      listing.capturedAt || listing.captured_at || new Date().toISOString()
    );
  } catch {
    // Fallback for older schema without pros/cons columns
    db.prepare(`
      INSERT OR REPLACE INTO listings
        (id, user_email, title, price, address, bedrooms, bathrooms, floor_area, property_type, mrt, availability, posted_date, url, source, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, userEmail,
      listing.title || '', listing.price || '', listing.address || '',
      listing.bedrooms || '', listing.bathrooms || '', listing.floorArea || listing.floor_area || '',
      listing.propertyType || listing.property_type || '', listing.mrt || '',
      listing.availability || '', listing.postedDate || listing.posted_date || '',
      listing.url || '', listing.source || 'propertyguru', listing.capturedAt || listing.captured_at || new Date().toISOString()
    );
  }
  return getListing(id);
}

export function getListing(id) {
  return db.prepare('SELECT * FROM listings WHERE id = ?').get(id) || null;
}

export function getUserListings(userEmail) {
  return db.prepare('SELECT * FROM listings WHERE user_email = ? ORDER BY captured_at DESC').all(userEmail);
}

export function deleteListing(userEmail, id) {
  const row = db.prepare('SELECT * FROM listings WHERE id = ? AND user_email = ?').get(id, userEmail);
  if (!row) return { error: 'Listing not found' };
  db.prepare('DELETE FROM listings WHERE id = ? AND user_email = ?').run(id, userEmail);
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// Task operations
// ---------------------------------------------------------------------------

export function createTask({ email, question, intent, rounds, status = 'waiting_search' }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks (id, user_email, status, question, intent_json, rounds_json, total_collected, current_round, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
  `).run(id, email, status, question, JSON.stringify(intent || {}), JSON.stringify(rounds || []), now, now);
  return getTask(id);
}

export function getTask(id) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) || null;
}

export function getUserTasks(userEmail, statusFilter) {
  let rows;
  if (statusFilter) {
    rows = db.prepare('SELECT * FROM tasks WHERE user_email = ? AND status = ? ORDER BY created_at DESC').all(userEmail, statusFilter);
  } else {
    rows = db.prepare('SELECT * FROM tasks WHERE user_email = ? ORDER BY created_at DESC').all(userEmail);
  }
  return rows.map(publicTask);
}

export function updateTaskStatus(id, status) {
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, new Date().toISOString(), id);
}

export function updateTaskRound(id, roundIndex, collected, totalCollected) {
  db.prepare('UPDATE tasks SET current_round = ?, total_collected = ?, updated_at = ? WHERE id = ?')
    .run(roundIndex, totalCollected, new Date().toISOString(), id);
}

export function completeTask(id, result) {
  db.prepare('UPDATE tasks SET status = ?, result_json = ?, updated_at = ? WHERE id = ?')
    .run('completed', JSON.stringify(result), new Date().toISOString(), id);
}

export function updateTaskFull(id, { status, rounds, totalCollected, currentRound, result }) {
  const updates = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (rounds) updates.rounds_json = JSON.stringify(rounds);
  if (totalCollected !== undefined) updates.total_collected = totalCollected;
  if (currentRound !== undefined) updates.current_round = currentRound;
  if (result) updates.result_json = JSON.stringify(result);

  const keys = Object.keys(updates);
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => updates[k]);

  db.prepare(`UPDATE tasks SET ${sets} WHERE id = ?`).run(...values, id);
}

function publicTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.user_email,
    status: row.status,
    question: row.question,
    intent: safeJson(row.intent_json),
    rounds: safeJson(row.rounds_json, []),
    currentRound: row.current_round,
    totalCollected: row.total_collected,
    result: safeJson(row.result_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Profile operations
// ---------------------------------------------------------------------------

export function getProfile(email) {
  const row = db.prepare('SELECT * FROM profiles WHERE user_email = ?').get(email);
  if (!row) return { email, exists: false, raw: '', sections: {} };
  return {
    email,
    exists: true,
    raw: row.content,
    sections: parseProfileSections(row.content),
    updatedAt: row.updated_at,
  };
}

export function saveProfile(email, content) {
  db.prepare('INSERT OR REPLACE INTO profiles (user_email, content, updated_at) VALUES (?, ?, ?)')
    .run(email, content, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Messages (conversation history)
// ---------------------------------------------------------------------------

export function saveMessages(email, messages) {
  const stmt = db.prepare('INSERT INTO messages (user_email, role, content) VALUES (?, ?, ?)');
  const saveMany = db.transaction((msgs) => {
    for (const m of msgs) {
      if (!m.content || !String(m.content).trim()) continue;
      stmt.run(email, m.role, String(m.content).trim());
    }
  });
  saveMany(messages);
  return { saved: true };
}

export function getRecentMessages(email, limit = 20) {
  const rows = db.prepare(
    'SELECT role, content, created_at FROM messages WHERE user_email = ? AND summarized = 0 ORDER BY id DESC LIMIT ?'
  ).all(email, limit);
  return rows.reverse();
}

export function getUnsummarizedCount(email) {
  const row = db.prepare(
    'SELECT COUNT(*) as cnt FROM messages WHERE user_email = ? AND summarized = 0'
  ).get(email);
  return row ? row.cnt : 0;
}

export function getOldestUnsummarized(email, limit = 20) {
  return db.prepare(
    'SELECT role, content FROM messages WHERE user_email = ? AND summarized = 0 ORDER BY id ASC LIMIT ?'
  ).all(email, limit);
}

export function markMessagesSummarized(email, oldestCount) {
  // Mark the oldest N unsummarized messages as summarized
  const ids = db.prepare(
    'SELECT id FROM messages WHERE user_email = ? AND summarized = 0 ORDER BY id ASC LIMIT ?'
  ).all(email, oldestCount);
  if (!ids.length) return 0;
  const idList = ids.map((r) => r.id);
  const placeholders = idList.map(() => '?').join(',');
  const result = db.prepare(
    `UPDATE messages SET summarized = 1 WHERE id IN (${placeholders})`
  ).run(...idList);
  return result.changes;
}

// ---------------------------------------------------------------------------
// Learning log
// ---------------------------------------------------------------------------

export function getLog(email, limit = 100) {
  const rows = db.prepare('SELECT entry, created_at FROM learning_logs WHERE user_email = ? ORDER BY created_at DESC LIMIT ?').all(email, limit);
  return rows.reverse().map((r) => r.entry).join('\n');
}

export function appendLog(email, entry) {
  db.prepare('INSERT INTO learning_logs (user_email, entry) VALUES (?, ?)').run(email, entry);
}

// ---------------------------------------------------------------------------
// Seed default data
// ---------------------------------------------------------------------------

export function seedDefaults() {
  // Create admin and demo accounts if they don't exist
  const admin = createUser('admin@canrentlah.com', 'Admin@2026', { plan: 'pro', role: 'admin', activated: true });
  const demo = createUser('demo@canrentlah.com', 'Demo@2026', { plan: 'pro', role: 'user', activated: true });

  // Seed activation codes
  seedActivationCodes([
    ['DEMO-PRO-2026', 'pro', 999],
    ['RENTLAH-TEST', 'pro', 999],
    ['MAX-2026-INTERNAL', 'max', 50],
  ]);

  return { admin, demo };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJson(str, fallback = null) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function parseProfileSections(markdown) {
  const sections = {};
  let current = '';
  if (!markdown) return sections;
  const lines = markdown.split('\n');
  for (const line of lines) {
    const h2 = line.match(/^## (.+)$/);
    if (h2) { current = h2[1].trim(); sections[current] = []; }
    else if (current) { sections[current].push(line); }
  }
  return sections;
}

export default db;
