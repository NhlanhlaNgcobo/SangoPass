import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { SqliteStore } from "../lib/server/store/sqlite";
import type {
  MembershipRecord,
  PropertyRecord,
  UnitRecord,
  UserRecord,
  VisitorRecord,
} from "../lib/server/store";

const LEGACY_V1 = `
CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,password TEXT,createdAt TEXT);
CREATE TABLE organisations(id TEXT PRIMARY KEY,name TEXT,plan TEXT,trialUntil TEXT,paidUntil TEXT,createdAt TEXT);
CREATE TABLE properties(id TEXT PRIMARY KEY,orgId TEXT,name TEXT,address TEXT,type TEXT);
CREATE TABLE units(id TEXT PRIMARY KEY,propertyId TEXT,label TEXT,rentCents INTEGER,rentPaid INTEGER,frequency TEXT);
CREATE TABLE memberships(userId TEXT,orgId TEXT,role TEXT,propertyId TEXT,unitId TEXT,PRIMARY KEY(userId,orgId));
CREATE TABLE invitations(id TEXT PRIMARY KEY,orgId TEXT,email TEXT,role TEXT,propertyId TEXT,unitId TEXT,hash TEXT,expiresAt TEXT,acceptedAt TEXT);
CREATE TABLE visitors(id TEXT PRIMARY KEY,orgId TEXT,propertyId TEXT,hostId TEXT,visitorName TEXT,phone TEXT,reference TEXT UNIQUE,token TEXT UNIQUE,visitDate TEXT,arrival TEXT,departure TEXT,status TEXT,createdAt TEXT,checkedInAt TEXT,checkedOutAt TEXT);
CREATE TABLE reports(id TEXT PRIMARY KEY,orgId TEXT,propertyId TEXT,authorId TEXT,category TEXT,description TEXT,status TEXT,createdAt TEXT);
CREATE TABLE invoices(id TEXT PRIMARY KEY,orgId TEXT,plan TEXT,amountCents INTEGER,status TEXT,paymentId TEXT,createdAt TEXT);
CREATE TABLE sessions(hash TEXT PRIMARY KEY,userId TEXT,expiresAt TEXT);
CREATE TABLE reset_tokens(hash TEXT PRIMARY KEY,userId TEXT,expiresAt TEXT);
CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,resetsAt INTEGER);
INSERT INTO users VALUES('user1','Legacy@Example.test','Legacy Resident','original-password-digest','2026-01-01');
INSERT INTO users VALUES('user2','manager@example.test','Legacy Manager','manager-digest','2026-01-01');
INSERT INTO organisations VALUES('org1','Legacy Homes','starter','2027-01-01',NULL,'2026-01-01');
INSERT INTO properties VALUES('property1','org1','Legacy Court','Cape Town','apartment');
INSERT INTO units VALUES('unit1','property1','A1',450000,0,'monthly');
INSERT INTO memberships VALUES('user1','org1','tenant','property1','unit1');
INSERT INTO memberships VALUES('user2','org1','manager',NULL,NULL);
INSERT INTO visitors VALUES('visit1','org1','property1','user1','Lebo','+27821234567','SP-REF1','tok1','2026-02-01','08:00','20:00','checked_out','2026-01-15','2026-02-01','2026-02-01');
INSERT INTO reports VALUES('report1','org1','property1','user1','Maintenance','Tap leaking','open','2026-01-20');
PRAGMA user_version=1;
`;

test("version-one data migrates without changing passwords or unit assignments and reopens safely", async () => {
  const folder = mkdtempSync(join(tmpdir(), "sangopass-migration-"));
  const file = join(folder, "legacy.sqlite");
  process.env.SANGOPASS_DATABASE_PATH = file;
  process.env.SANGOPASS_BACKEND = "sqlite";

  const old = new DatabaseSync(file);
  old.exec(LEGACY_V1);
  old.close();

  const store = new SqliteStore(file);

  // Credentials survive verbatim: migration must never invalidate a password.
  const user = await store.get<UserRecord>("users", "user1");
  assert.equal(user!.password, "original-password-digest");
  assert.equal(user!.email, "legacy@example.test");

  // v2 gave residents a generated username, v3 gives it a lower-cased key.
  const membership = await store.get<MembershipRecord>(
    "memberships",
    "user1__org1",
  );
  assert.ok(membership!.username!.startsWith("SP-"));
  assert.equal(membership!.usernameKey, membership!.username!.toLowerCase());
  assert.equal(membership!.unitId, "unit1");
  assert.equal(membership!.orgName, "Legacy Homes");
  assert.equal(membership!.memberName, "Legacy Resident");
  assert.equal(membership!.userEmail, "legacy@example.test");

  // v3 backfills the denormalised fields Firestore needs, from the old joins.
  const unit = await store.get<UnitRecord>("units", "unit1");
  assert.equal(unit!.orgId, "org1");
  assert.equal(unit!.residentId, "user1");
  assert.equal(unit!.residentName, "Legacy Resident");

  const visit = await store.get<VisitorRecord>("visitors", "visit1");
  assert.equal(visit!.propertyName, "Legacy Court");
  assert.equal(visit!.hostName, "Legacy Resident");
  assert.equal(visit!.unitLabel, "A1");

  const report = await store.get<{ authorName: string }>("reports", "report1");
  assert.equal(report!.authorName, "Legacy Resident");

  const property = await store.get<PropertyRecord>("properties", "property1");
  assert.match(property!.loginCode, /^[a-f0-9]{12}$/);

  // Uniqueness moved into reservations, and legacy rows are represented there.
  assert.ok(await store.get("reservations", "unitResident:unit1"));
  assert.ok(await store.get("reservations", "unit:property1:a1"));
  assert.ok(await store.get("reservations", `loginCode:${property!.loginCode}`));
  assert.ok(await store.get("reservations", "userEmail:legacy@example.test"));

  await store.close();

  // Reopening is idempotent, in this process and in a fresh one.
  const again = new SqliteStore(file);
  const reread = await again.get<PropertyRecord>("properties", "property1");
  assert.equal(reread!.loginCode, property!.loginCode);
  await again.close();

  const child = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--eval",
      "import('./lib/server/store/sqlite.ts').then(async (m)=>{const s=new m.SqliteStore(process.env.SANGOPASS_DATABASE_PATH);const p=await s.get('properties','property1');process.stdout.write(p.loginCode);await s.close();})",
    ],
    { env: process.env, encoding: "utf8", windowsHide: true },
  );
  assert.equal(child.trim(), property!.loginCode);
});

test("v4 backfills visit windows, guest slots and the host's unit", async () => {
  const folder = mkdtempSync(join(tmpdir(), "sangopass-migration-v4-"));
  const file = join(folder, "v4.sqlite");
  const old = new DatabaseSync(file);
  old.exec(LEGACY_V1);
  old.close();

  const store = new SqliteStore(file);

  // The legacy visit was same-day, so it becomes a day visit that ends on the
  // date it started, and it no longer occupies a guest slot because it is
  // already checked out.
  const visit = await store.get<VisitorRecord>("visitors", "visit1");
  assert.equal(visit!.visitType, "daily");
  assert.equal(visit!.endDate, "2026-02-01");
  assert.equal(visit!.nights, 0);
  assert.equal(visit!.active, 0);
  // The unit is derived from the host's membership, so per-unit limits work.
  assert.equal(visit!.unitId, "unit1");
  // No identity number was ever captured, and none is invented.
  assert.equal(visit!.idNumber, "");

  // Properties gain the manager-set limits at their defaults.
  const property = await store.get<PropertyRecord>("properties", "property1");
  assert.equal(property!.sleepoverNightsPerMonth, 8);
  assert.equal(property!.maxConsecutiveNights, 3);
  assert.equal(property!.maxActiveGuests, 2);

  await store.close();
});

test("a v3 database upgrades in place to the current version", async () => {
  const folder = mkdtempSync(join(tmpdir(), "sangopass-migration-v3-"));
  const file = join(folder, "v3.sqlite");

  // Build a v3 database by migrating a v1 one, then rewind the stamped version
  // and strip the v4 columns, which is exactly what a v3 install looks like.
  const seed = new DatabaseSync(file);
  seed.exec(LEGACY_V1);
  seed.close();
  const built = new SqliteStore(file);
  await built.close();
  const raw = new DatabaseSync(file);
  // These indexes arrived with v4 and cover the columns being removed.
  raw.exec("DROP INDEX IF EXISTS report_queue");
  raw.exec("DROP INDEX IF EXISTS visitor_unit_active");
  raw.exec("DROP INDEX IF EXISTS visitor_unit_dates");
  raw.exec("ALTER TABLE visitors DROP COLUMN unitId");
  raw.exec("ALTER TABLE visitors DROP COLUMN idType");
  raw.exec("ALTER TABLE visitors DROP COLUMN idNumber");
  raw.exec("ALTER TABLE visitors DROP COLUMN visitType");
  raw.exec("ALTER TABLE visitors DROP COLUMN endDate");
  raw.exec("ALTER TABLE visitors DROP COLUMN nights");
  raw.exec("ALTER TABLE visitors DROP COLUMN active");
  raw.exec("ALTER TABLE properties DROP COLUMN sleepoverNightsPerMonth");
  raw.exec("ALTER TABLE properties DROP COLUMN maxConsecutiveNights");
  raw.exec("ALTER TABLE properties DROP COLUMN maxActiveGuests");
  raw.exec("ALTER TABLE reports DROP COLUMN urgency");
  raw.exec("ALTER TABLE reports DROP COLUMN urgencyRank");
  raw.exec("ALTER TABLE reports DROP COLUMN unitLabel");
  raw.exec("ALTER TABLE visitors DROP COLUMN visitorEmail");
  raw.exec("DROP TABLE IF EXISTS contractors");
  raw.exec("PRAGMA user_version=3");
  raw.close();

  const upgraded = new SqliteStore(file);
  const visit = await upgraded.get<VisitorRecord>("visitors", "visit1");
  assert.equal(visit!.visitType, "daily");
  assert.equal(visit!.endDate, "2026-02-01");
  assert.equal(visit!.unitId, "unit1");
  assert.equal(visit!.active, 0);
  const property = await upgraded.get<PropertyRecord>(
    "properties",
    "property1",
  );
  assert.equal(property!.maxActiveGuests, 2);
  await upgraded.close();

  // Reopening an already-migrated database changes nothing.
  const again = new SqliteStore(file);
  assert.equal(
    (await again.get<VisitorRecord>("visitors", "visit1"))!.endDate,
    "2026-02-01",
  );
  await again.close();
});

test("a v2 database migrates to v3 and keeps its login codes and usernames", async () => {
  const folder = mkdtempSync(join(tmpdir(), "sangopass-migration-v2-"));
  const file = join(folder, "v2.sqlite");
  const old = new DatabaseSync(file);
  old.exec(LEGACY_V1);
  old.exec(`
ALTER TABLE properties ADD COLUMN loginCode TEXT;
ALTER TABLE memberships ADD COLUMN username TEXT;
ALTER TABLE invitations ADD COLUMN username TEXT;
ALTER TABLE invitations ADD COLUMN emailStatus TEXT NOT NULL DEFAULT 'not_sent';
ALTER TABLE invitations ADD COLUMN emailSentAt TEXT;
UPDATE properties SET loginCode='abcdef123456';
UPDATE memberships SET username='SP-EXISTING-01' WHERE role='tenant';
PRAGMA user_version=2;
`);
  old.close();

  const store = new SqliteStore(file);
  const property = await store.get<PropertyRecord>("properties", "property1");
  assert.equal(property!.loginCode, "abcdef123456");
  const membership = await store.get<MembershipRecord>(
    "memberships",
    "user1__org1",
  );
  assert.equal(membership!.username, "SP-EXISTING-01");
  assert.equal(membership!.usernameKey, "sp-existing-01");
  assert.ok(await store.get("reservations", "username:property1:sp-existing-01"));
  await store.close();
});
