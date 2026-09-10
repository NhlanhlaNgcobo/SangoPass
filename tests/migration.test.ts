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
  OrganisationRecord,
  PropertyRecord,
  UnitRecord,
  UserRecord,
  VisitorRecord,
} from "../lib/server/store";
import { DEFAULT_THEME } from "../lib/shared/theme";
import { encodeEntryCode } from "../lib/shared/passcode";

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
  assert.ok(
    await store.get("reservations", `loginCode:${property!.loginCode}`),
  );
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
  // v6 brought the brand colours, v7 the entry code, v8 the books, v9 archiving.
  raw.exec("ALTER TABLE organisations DROP COLUMN brandPrimary");
  raw.exec("ALTER TABLE organisations DROP COLUMN brandAccent");
  raw.exec("ALTER TABLE visitors DROP COLUMN entryCode");
  raw.exec("ALTER TABLE units DROP COLUMN rentPaidPeriod");
  raw.exec("ALTER TABLE units DROP COLUMN archivedAt");
  raw.exec("ALTER TABLE units DROP COLUMN archivedWithProperty");
  raw.exec("ALTER TABLE properties DROP COLUMN archivedAt");
  // v11 put the company logo on the organisation; an older database has none.
  raw.exec("ALTER TABLE organisations DROP COLUMN logoKey");
  raw.exec("ALTER TABLE organisations DROP COLUMN logoMime");
  raw.exec("ALTER TABLE organisations DROP COLUMN logoUpdatedAt");
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
  // v6 gives every existing organisation the SangoPass pair, so an upgraded
  // database looks exactly as it did before.
  const organisation = await upgraded.get<OrganisationRecord>(
    "organisations",
    "org1",
  );
  assert.equal(organisation!.brandPrimary, DEFAULT_THEME.primary);
  assert.equal(organisation!.brandAccent, DEFAULT_THEME.accent);
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
  assert.ok(
    await store.get("reservations", "username:property1:sp-existing-01"),
  );
  await store.close();
});

test("a v5 database gains the brand colours without losing anything", async () => {
  const folder = mkdtempSync(join(tmpdir(), "sangopass-migration-v5-"));
  const file = join(folder, "v5.sqlite");

  // Build a current database, then rewind it to exactly what a v5 install
  // looks like: everything but the two colour columns.
  const seed = new DatabaseSync(file);
  seed.exec(LEGACY_V1);
  seed.close();
  const built = new SqliteStore(file);
  await built.close();
  const raw = new DatabaseSync(file);
  raw.exec("ALTER TABLE organisations DROP COLUMN brandPrimary");
  raw.exec("ALTER TABLE organisations DROP COLUMN brandAccent");
  raw.exec("ALTER TABLE visitors DROP COLUMN entryCode");
  raw.exec("ALTER TABLE units DROP COLUMN rentPaidPeriod");
  raw.exec("ALTER TABLE units DROP COLUMN archivedAt");
  raw.exec("ALTER TABLE units DROP COLUMN archivedWithProperty");
  raw.exec("ALTER TABLE properties DROP COLUMN archivedAt");
  // v11 put the company logo on the organisation; an older database has none.
  raw.exec("ALTER TABLE organisations DROP COLUMN logoKey");
  raw.exec("ALTER TABLE organisations DROP COLUMN logoMime");
  raw.exec("ALTER TABLE organisations DROP COLUMN logoUpdatedAt");
  raw.exec("PRAGMA user_version=5");
  raw.close();

  const upgraded = new SqliteStore(file);
  const organisation = await upgraded.get<OrganisationRecord>(
    "organisations",
    "org1",
  );
  assert.equal(organisation!.name, "Legacy Homes");
  assert.equal(organisation!.brandPrimary, DEFAULT_THEME.primary);
  assert.equal(organisation!.brandAccent, DEFAULT_THEME.accent);
  // The v4 and v5 work is not repeated: its backfills stay as they were.
  const visit = await upgraded.get<VisitorRecord>("visitors", "visit1");
  assert.equal(visit!.endDate, "2026-02-01");
  assert.equal(visit!.unitId, "unit1");
  await upgraded.close();

  // And a manager's own colours survive the next open.
  const store = new SqliteStore(file);
  await store.tx(async (t) => {
    t.update("organisations", "org1", {
      brandPrimary: "#3D1F42",
      brandAccent: "#E7C6F0",
    });
  });
  await store.close();
  const reopened = new SqliteStore(file);
  const saved = await reopened.get<OrganisationRecord>("organisations", "org1");
  assert.equal(saved!.brandPrimary, "#3D1F42");
  assert.equal(saved!.brandAccent, "#E7C6F0");
  await reopened.close();
});

test("a v6 database gains entry codes without inventing one", async () => {
  const folder = mkdtempSync(join(tmpdir(), "sangopass-migration-v6-"));
  const file = join(folder, "v6.sqlite");

  const seed = new DatabaseSync(file);
  seed.exec(LEGACY_V1);
  seed.close();
  const built = new SqliteStore(file);
  await built.close();
  const raw = new DatabaseSync(file);
  raw.exec("ALTER TABLE visitors DROP COLUMN entryCode");
  raw.exec("ALTER TABLE units DROP COLUMN rentPaidPeriod");
  raw.exec("ALTER TABLE units DROP COLUMN archivedAt");
  raw.exec("ALTER TABLE units DROP COLUMN archivedWithProperty");
  raw.exec("ALTER TABLE properties DROP COLUMN archivedAt");
  // v11 put the company logo on the organisation; an older database has none.
  raw.exec("ALTER TABLE organisations DROP COLUMN logoKey");
  raw.exec("ALTER TABLE organisations DROP COLUMN logoMime");
  raw.exec("ALTER TABLE organisations DROP COLUMN logoUpdatedAt");
  raw.exec("PRAGMA user_version=6");
  raw.close();

  const upgraded = new SqliteStore(file);
  const visit = await upgraded.get<VisitorRecord>("visitors", "visit1");
  // No code is invented for a pass whose guest was never sent one: the same
  // rule v4 followed for identity numbers. Its QR and reference still work.
  assert.equal(visit!.entryCode, "");
  assert.equal(visit!.reference, "SP-REF1");
  await upgraded.close();

  // A pass created after the upgrade gets one, and it survives a reopen.
  const store = new SqliteStore(file);
  const code = encodeEntryCode([1, 2, 3, 4, 5]);
  await store.tx(async (t) => {
    t.update("visitors", "visit1", { entryCode: code });
  });
  await store.close();
  const reopened = new SqliteStore(file);
  assert.equal(
    (await reopened.get<VisitorRecord>("visitors", "visit1"))!.entryCode,
    code,
  );
  await reopened.close();
});

test("a v7 database gains the books and the rent period", async () => {
  const folder = mkdtempSync(join(tmpdir(), "sangopass-migration-v7-"));
  const file = join(folder, "v7.sqlite");

  const seed = new DatabaseSync(file);
  seed.exec(LEGACY_V1);
  seed.close();
  const built = new SqliteStore(file);
  await built.close();
  const raw = new DatabaseSync(file);
  raw.exec("DROP TABLE IF EXISTS ledger");
  raw.exec("ALTER TABLE units DROP COLUMN rentPaidPeriod");
  raw.exec("ALTER TABLE units DROP COLUMN archivedAt");
  raw.exec("ALTER TABLE units DROP COLUMN archivedWithProperty");
  raw.exec("ALTER TABLE properties DROP COLUMN archivedAt");
  // v11 put the company logo on the organisation; an older database has none.
  raw.exec("ALTER TABLE organisations DROP COLUMN logoKey");
  raw.exec("ALTER TABLE organisations DROP COLUMN logoMime");
  raw.exec("ALTER TABLE organisations DROP COLUMN logoUpdatedAt");
  raw.exec("PRAGMA user_version=7");
  raw.close();

  const upgraded = new SqliteStore(file);
  // No month is claimed for a flag that was never period-aware, so a unit
  // marked paid under the old schema reads as unpaid until it is marked again.
  const unit = await upgraded.get<UnitRecord>("units", "unit1");
  assert.equal(unit!.rentPaidPeriod, "");
  assert.equal(unit!.rentCents, 450000);

  // The books start empty and are writable straight away.
  assert.equal(await upgraded.count("ledger"), 0);
  await upgraded.tx(async (t) => {
    t.create("ledger", "entry1", {
      orgId: "org1",
      period: "2026-09",
      kind: "expense",
      category: "security",
      nature: "fixed",
      amountCents: 185000,
      description: "Guarding contract",
      propertyId: "property1",
      propertyName: "Legacy Court",
      unitId: null,
      unitLabel: null,
      recordedBy: "Legacy Manager",
      createdAt: "2026-09-01T00:00:00.000Z",
    });
  });
  await upgraded.close();

  const reopened = new SqliteStore(file);
  const entry = await reopened.get<{ amountCents: number; category: string }>(
    "ledger",
    "entry1",
  );
  assert.equal(entry!.amountCents, 185000);
  assert.equal(entry!.category, "security");
  await reopened.close();
});

test("a v8 database gains archiving, with everything in use", async () => {
  const folder = mkdtempSync(join(tmpdir(), "sangopass-migration-v8-"));
  const file = join(folder, "v8.sqlite");

  const seed = new DatabaseSync(file);
  seed.exec(LEGACY_V1);
  seed.close();
  const built = new SqliteStore(file);
  await built.close();
  const raw = new DatabaseSync(file);
  raw.exec("ALTER TABLE units DROP COLUMN archivedAt");
  raw.exec("ALTER TABLE units DROP COLUMN archivedWithProperty");
  raw.exec("ALTER TABLE properties DROP COLUMN archivedAt");
  // v11 put the company logo on the organisation; an older database has none.
  raw.exec("ALTER TABLE organisations DROP COLUMN logoKey");
  raw.exec("ALTER TABLE organisations DROP COLUMN logoMime");
  raw.exec("ALTER TABLE organisations DROP COLUMN logoUpdatedAt");
  raw.exec("PRAGMA user_version=8");
  raw.close();

  const upgraded = new SqliteStore(file);
  // Nothing was archived before archiving existed, so everything is in use.
  const property = await upgraded.get<PropertyRecord>(
    "properties",
    "property1",
  );
  const unit = await upgraded.get<UnitRecord>("units", "unit1");
  assert.equal(property!.archivedAt, null);
  assert.equal(unit!.archivedAt, null);
  assert.equal(unit!.archivedWithProperty, 0);
  assert.equal(property!.name, "Legacy Court");
  assert.equal(unit!.label, "A1");

  // And the column takes a value, which survives a reopen.
  await upgraded.tx(async (t) => {
    t.update("units", "unit1", { archivedAt: "2026-09-01T00:00:00.000Z" });
  });
  await upgraded.close();
  const reopened = new SqliteStore(file);
  assert.equal(
    (await reopened.get<UnitRecord>("units", "unit1"))!.archivedAt,
    "2026-09-01T00:00:00.000Z",
  );
  await reopened.close();
});

test("a v11 database gains the announcements board, empty", async () => {
  const folder = mkdtempSync(join(tmpdir(), "sangopass-migration-v11-"));
  const file = join(folder, "v11.sqlite");

  const seed = new DatabaseSync(file);
  seed.exec(LEGACY_V1);
  seed.close();
  const built = new SqliteStore(file);
  await built.close();
  const raw = new DatabaseSync(file);
  // Wind the database back to v11: the board did not exist, so neither did
  // the table. Everything else about a v11 database stays as it was.
  raw.exec("DROP TABLE announcements");
  raw.exec("PRAGMA user_version=11");
  raw.close();

  const upgraded = new SqliteStore(file);
  // Nothing is invented. An organisation that upgrades has announced nothing,
  // because before this there was nowhere to announce it.
  assert.deepEqual(await upgraded.find("announcements"), []);
  assert.equal(
    (await upgraded.get<PropertyRecord>("properties", "property1"))!.name,
    "Legacy Court",
    "and the rest of the database is untouched",
  );

  // The new table takes a row, and it survives a reopen.
  await upgraded.tx(async (t) => {
    t.create("announcements", "ann1", {
      orgId: "org1",
      propertyId: "property1",
      propertyName: "Legacy Court",
      title: "Water off Tuesday",
      body: "09:00 to 15:00.",
      level: "important",
      levelRank: 1,
      audience: "everyone",
      showUntil: "2026-12-31",
      publishedAt: "2026-09-10T08:00:00.000Z",
      editedAt: null,
      authorId: "user2",
      authorName: "Legacy Manager",
      archivedAt: null,
    });
  });
  await upgraded.close();
  const reopened = new SqliteStore(file);
  const posted = await reopened.get<{ title: string; levelRank: number }>(
    "announcements",
    "ann1",
  );
  assert.equal(posted!.title, "Water off Tuesday");
  assert.equal(posted!.levelRank, 1);
  await reopened.close();
});
