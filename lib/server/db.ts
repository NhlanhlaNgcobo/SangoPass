import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
let database: DatabaseSync | undefined;
export function db() {
  if (database) return database;
  const file =
    process.env.SANGOPASS_DATABASE_PATH || resolve("data/sangopass.sqlite");
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  database = new DatabaseSync(file, { timeout: 5000 });
  database.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, password TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS organisations(id TEXT PRIMARY KEY, name TEXT NOT NULL, plan TEXT NOT NULL DEFAULT 'starter', trialUntil TEXT NOT NULL, paidUntil TEXT, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS properties(id TEXT PRIMARY KEY, orgId TEXT NOT NULL REFERENCES organisations(id), name TEXT NOT NULL, address TEXT NOT NULL, type TEXT NOT NULL, UNIQUE(orgId,name));
CREATE TABLE IF NOT EXISTS units(id TEXT PRIMARY KEY, propertyId TEXT NOT NULL REFERENCES properties(id), label TEXT NOT NULL, rentCents INTEGER NOT NULL DEFAULT 0 CHECK(rentCents>=0), rentPaid INTEGER NOT NULL DEFAULT 0, frequency TEXT NOT NULL DEFAULT 'monthly', UNIQUE(propertyId,label));
CREATE TABLE IF NOT EXISTS memberships(userId TEXT NOT NULL REFERENCES users(id), orgId TEXT NOT NULL REFERENCES organisations(id), role TEXT NOT NULL CHECK(role IN ('manager','tenant','security')), propertyId TEXT REFERENCES properties(id), unitId TEXT REFERENCES units(id), PRIMARY KEY(userId,orgId));
CREATE UNIQUE INDEX IF NOT EXISTS unit_resident ON memberships(unitId) WHERE role='tenant';
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), expiresAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY, orgId TEXT NOT NULL REFERENCES organisations(id), email TEXT NOT NULL COLLATE NOCASE, role TEXT NOT NULL, propertyId TEXT REFERENCES properties(id), unitId TEXT REFERENCES units(id), hash TEXT NOT NULL UNIQUE, expiresAt TEXT NOT NULL, acceptedAt TEXT);
CREATE TABLE IF NOT EXISTS visitors(id TEXT PRIMARY KEY, orgId TEXT NOT NULL REFERENCES organisations(id), propertyId TEXT NOT NULL REFERENCES properties(id), hostId TEXT NOT NULL REFERENCES users(id), visitorName TEXT NOT NULL, phone TEXT NOT NULL, reference TEXT NOT NULL UNIQUE, token TEXT NOT NULL UNIQUE, visitDate TEXT NOT NULL, arrival TEXT NOT NULL, departure TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'upcoming', createdAt TEXT NOT NULL, checkedInAt TEXT, checkedOutAt TEXT);
CREATE INDEX IF NOT EXISTS visitor_scope ON visitors(orgId,propertyId,hostId);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, orgId TEXT NOT NULL REFERENCES organisations(id), propertyId TEXT NOT NULL REFERENCES properties(id), authorId TEXT NOT NULL REFERENCES users(id), category TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY, orgId TEXT NOT NULL REFERENCES organisations(id), plan TEXT NOT NULL, amountCents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', paymentId TEXT UNIQUE, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reset_tokens(hash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), expiresAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, resetsAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, orgId TEXT REFERENCES organisations(id), userId TEXT, action TEXT NOT NULL, createdAt TEXT NOT NULL);
`);
  database.exec("BEGIN IMMEDIATE");
  try {
    const version = database.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    if (version.user_version < 2) {
      database.exec(`ALTER TABLE properties ADD COLUMN loginCode TEXT COLLATE NOCASE;
        CREATE UNIQUE INDEX property_login_code ON properties(loginCode);
        ALTER TABLE memberships ADD COLUMN username TEXT COLLATE NOCASE;
        CREATE UNIQUE INDEX tenant_username ON memberships(propertyId,username) WHERE role='tenant';
        ALTER TABLE invitations ADD COLUMN username TEXT COLLATE NOCASE;
        ALTER TABLE invitations ADD COLUMN emailStatus TEXT NOT NULL DEFAULT 'not_sent';
        ALTER TABLE invitations ADD COLUMN emailSentAt TEXT;
        UPDATE properties SET loginCode=lower(hex(randomblob(6))) WHERE loginCode IS NULL;
        UPDATE memberships SET username='SP-' || upper(substr(replace(unitId,'-',''),1,8)) || '-' || upper(substr(replace(userId,'-',''),1,8)) WHERE role='tenant';
        UPDATE invitations SET username='SP-' || upper(substr(replace(unitId,'-',''),1,8)) || '-' || upper(substr(replace(id,'-',''),1,8)) WHERE role='tenant';
        PRAGMA user_version=2;`);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    database.close();
    database = undefined;
    throw error;
  }
  return database;
}
export function one<T>(sql: string, ...values: SQLInputValue[]): T | undefined {
  const row = db()
    .prepare(sql)
    .get(...values);
  // node:sqlite returns null-prototype rows; React Server Components need plain objects.
  return row ? ({ ...row } as T) : undefined;
}
export function all<T>(sql: string, ...values: SQLInputValue[]): T[] {
  return db()
    .prepare(sql)
    .all(...values)
    .map((row) => ({ ...row }) as T);
}
export function run(sql: string, ...values: SQLInputValue[]) {
  return db()
    .prepare(sql)
    .run(...values);
}
export function transaction<T>(work: () => T): T {
  db().exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db().exec("COMMIT");
    return result;
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}
