import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ConflictError,
  type Collection,
  type Query,
  type Store,
  type Tx,
  type Where,
} from "./types";

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

// Field lists double as the injection whitelist for the query translator and
// as the column order for writes. Denormalised display fields (hostName,
// propertyName, residentName) exist so this backend answers exactly the same
// queries as Firestore, which cannot join.
export const FIELDS: Record<Collection, readonly string[]> = {
  users: ["id", "email", "name", "password", "createdAt"],
  organisations: [
    "id",
    "name",
    "plan",
    "trialUntil",
    "paidUntil",
    "brandPrimary",
    "brandAccent",
    "logoKey",
    "logoMime",
    "logoUpdatedAt",
    "createdAt",
  ],
  memberships: [
    "id",
    "userId",
    "orgId",
    "role",
    "propertyId",
    "unitId",
    "username",
    "usernameKey",
    "orgName",
    "memberName",
    "userEmail",
  ],
  properties: [
    "id",
    "orgId",
    "name",
    "address",
    "type",
    "loginCode",
    "sleepoverNightsPerMonth",
    "maxConsecutiveNights",
    "maxActiveGuests",
    "archivedAt",
  ],
  units: [
    "id",
    "orgId",
    "propertyId",
    "label",
    "rentCents",
    "rentPaid",
    "frequency",
    "residentId",
    "residentName",
    "rentPaidPeriod",
    "archivedAt",
    "archivedWithProperty",
  ],
  invitations: [
    "id",
    "orgId",
    "email",
    "role",
    "propertyId",
    "unitId",
    "hash",
    "expiresAt",
    "acceptedAt",
    "username",
    "usernameKey",
    "emailStatus",
    "emailSentAt",
  ],
  visitors: [
    "id",
    "orgId",
    "propertyId",
    "unitId",
    "hostId",
    "visitorName",
    "phone",
    "visitorEmail",
    "idType",
    "idNumber",
    "reference",
    "token",
    "entryCode",
    "visitType",
    "visitDate",
    "endDate",
    "arrival",
    "departure",
    "nights",
    "status",
    "active",
    "createdAt",
    "checkedInAt",
    "checkedOutAt",
    "propertyName",
    "hostName",
    "unitLabel",
  ],
  reports: [
    "id",
    "orgId",
    "propertyId",
    "authorId",
    "authorName",
    "category",
    "description",
    "urgency",
    "urgencyRank",
    "status",
    "createdAt",
    "unitLabel",
  ],
  tenancies: [
    "id",
    "orgId",
    "propertyId",
    "propertyName",
    "unitId",
    "unitLabel",
    "residentId",
    "residentName",
    "residentEmail",
    "username",
    "startedAt",
    "endedAt",
    "endedReason",
    "current",
  ],
  documents: [
    "id",
    "orgId",
    "propertyId",
    "propertyName",
    "unitId",
    "unitLabel",
    "tenancyId",
    "residentId",
    "residentName",
    "title",
    "kind",
    "filename",
    "mime",
    "bytes",
    "storageKey",
    "uploadedAt",
    "uploadedBy",
    "uploadedByName",
  ],
  requests: [
    "id",
    "orgId",
    "propertyId",
    "propertyName",
    "unitId",
    "unitLabel",
    "residentId",
    "residentName",
    "kind",
    "effectiveDate",
    "details",
    "status",
    "open",
    "createdAt",
    "decidedAt",
    "decidedBy",
    "decidedByName",
    "decisionNote",
  ],
  contractors: [
    "id",
    "orgId",
    "name",
    "trade",
    "company",
    "phone",
    "email",
    "kind",
    "notes",
    "createdAt",
  ],
  ledger: [
    "id",
    "orgId",
    "period",
    "kind",
    "category",
    "nature",
    "amountCents",
    "description",
    "propertyId",
    "propertyName",
    "unitId",
    "unitLabel",
    "recordedBy",
    "createdAt",
  ],
  invoices: [
    "id",
    "orgId",
    "plan",
    "amountCents",
    "status",
    "paymentId",
    "createdAt",
  ],
  audit: [
    "id",
    "orgId",
    "userId",
    "userName",
    "action",
    "subject",
    "createdAt",
  ],
  sessions: ["id", "userId", "expiresAt"],
  resetTokens: ["id", "userId", "expiresAt"],
  rateLimits: ["id", "count", "resetsAt"],
  reservations: ["id", "owner", "createdAt"],
};

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS organisations(id TEXT PRIMARY KEY, name TEXT NOT NULL, plan TEXT NOT NULL DEFAULT 'starter', trialUntil TEXT NOT NULL, paidUntil TEXT, brandPrimary TEXT NOT NULL DEFAULT '#143E35', brandAccent TEXT NOT NULL DEFAULT '#D5ED9F', logoKey TEXT NOT NULL DEFAULT '', logoMime TEXT NOT NULL DEFAULT '', logoUpdatedAt TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS memberships(id TEXT PRIMARY KEY, userId TEXT NOT NULL, orgId TEXT NOT NULL, role TEXT NOT NULL, propertyId TEXT, unitId TEXT, username TEXT, usernameKey TEXT, orgName TEXT NOT NULL DEFAULT '', memberName TEXT NOT NULL DEFAULT '', userEmail TEXT NOT NULL DEFAULT '')",
  "CREATE TABLE IF NOT EXISTS properties(id TEXT PRIMARY KEY, orgId TEXT NOT NULL, name TEXT NOT NULL, address TEXT NOT NULL, type TEXT NOT NULL, loginCode TEXT NOT NULL DEFAULT '', sleepoverNightsPerMonth INTEGER NOT NULL DEFAULT 8, maxConsecutiveNights INTEGER NOT NULL DEFAULT 3, maxActiveGuests INTEGER NOT NULL DEFAULT 2, archivedAt TEXT)",
  "CREATE TABLE IF NOT EXISTS units(id TEXT PRIMARY KEY, orgId TEXT NOT NULL DEFAULT '', propertyId TEXT NOT NULL, label TEXT NOT NULL, rentCents INTEGER NOT NULL DEFAULT 0, rentPaid INTEGER NOT NULL DEFAULT 0, frequency TEXT NOT NULL DEFAULT 'monthly', residentId TEXT, residentName TEXT, rentPaidPeriod TEXT NOT NULL DEFAULT '', archivedAt TEXT, archivedWithProperty INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY, orgId TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, propertyId TEXT, unitId TEXT, hash TEXT NOT NULL, expiresAt TEXT NOT NULL, acceptedAt TEXT, username TEXT, usernameKey TEXT, emailStatus TEXT NOT NULL DEFAULT 'not_sent', emailSentAt TEXT)",
  "CREATE TABLE IF NOT EXISTS visitors(id TEXT PRIMARY KEY, orgId TEXT NOT NULL, propertyId TEXT NOT NULL, unitId TEXT, hostId TEXT NOT NULL, visitorName TEXT NOT NULL, phone TEXT NOT NULL, visitorEmail TEXT, idType TEXT NOT NULL DEFAULT 'sa_id', idNumber TEXT NOT NULL DEFAULT '', reference TEXT NOT NULL, token TEXT NOT NULL, entryCode TEXT NOT NULL DEFAULT '', visitType TEXT NOT NULL DEFAULT 'daily', visitDate TEXT NOT NULL, endDate TEXT NOT NULL DEFAULT '', arrival TEXT NOT NULL, departure TEXT NOT NULL, nights INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'upcoming', active INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL, checkedInAt TEXT, checkedOutAt TEXT, propertyName TEXT NOT NULL DEFAULT '', hostName TEXT NOT NULL DEFAULT '', unitLabel TEXT)",
  "CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, orgId TEXT NOT NULL, propertyId TEXT NOT NULL, authorId TEXT NOT NULL, authorName TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, description TEXT NOT NULL, urgency TEXT NOT NULL DEFAULT 'normal', urgencyRank INTEGER NOT NULL DEFAULT 2, status TEXT NOT NULL DEFAULT 'open', createdAt TEXT NOT NULL, unitLabel TEXT)",
  "CREATE TABLE IF NOT EXISTS tenancies(id TEXT PRIMARY KEY, orgId TEXT NOT NULL, propertyId TEXT NOT NULL, propertyName TEXT NOT NULL DEFAULT '', unitId TEXT NOT NULL, unitLabel TEXT NOT NULL DEFAULT '', residentId TEXT NOT NULL, residentName TEXT NOT NULL DEFAULT '', residentEmail TEXT NOT NULL DEFAULT '', username TEXT, startedAt TEXT NOT NULL, endedAt TEXT, endedReason TEXT NOT NULL DEFAULT '', current INTEGER NOT NULL DEFAULT 1)",
  "CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, orgId TEXT NOT NULL, propertyId TEXT NOT NULL, propertyName TEXT NOT NULL DEFAULT '', unitId TEXT, unitLabel TEXT, tenancyId TEXT, residentId TEXT, residentName TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'other', filename TEXT NOT NULL, mime TEXT NOT NULL DEFAULT 'application/octet-stream', bytes INTEGER NOT NULL DEFAULT 0, storageKey TEXT NOT NULL, uploadedAt TEXT NOT NULL, uploadedBy TEXT NOT NULL DEFAULT '', uploadedByName TEXT NOT NULL DEFAULT '')",
  "CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, orgId TEXT NOT NULL, propertyId TEXT NOT NULL, propertyName TEXT NOT NULL DEFAULT '', unitId TEXT, unitLabel TEXT, residentId TEXT NOT NULL, residentName TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, effectiveDate TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', open INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL, decidedAt TEXT, decidedBy TEXT, decidedByName TEXT NOT NULL DEFAULT '', decisionNote TEXT NOT NULL DEFAULT '')",
  "CREATE TABLE IF NOT EXISTS contractors(id TEXT PRIMARY KEY, orgId TEXT NOT NULL, name TEXT NOT NULL, trade TEXT NOT NULL, company TEXT, phone TEXT NOT NULL, email TEXT, kind TEXT NOT NULL DEFAULT 'contractor', notes TEXT, createdAt TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY, orgId TEXT NOT NULL, period TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL, nature TEXT NOT NULL DEFAULT 'variable', amountCents INTEGER NOT NULL DEFAULT 0, description TEXT NOT NULL DEFAULT '', propertyId TEXT, propertyName TEXT NOT NULL DEFAULT '', unitId TEXT, unitLabel TEXT, recordedBy TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY, orgId TEXT NOT NULL, plan TEXT NOT NULL, amountCents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', paymentId TEXT, createdAt TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, orgId TEXT, userId TEXT, userName TEXT NOT NULL DEFAULT '', action TEXT NOT NULL, subject TEXT, createdAt TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, userId TEXT NOT NULL, expiresAt TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS resetTokens(id TEXT PRIMARY KEY, userId TEXT NOT NULL, expiresAt TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS rateLimits(id TEXT PRIMARY KEY, count INTEGER NOT NULL, resetsAt INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY, owner TEXT NOT NULL, createdAt TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS membership_user ON memberships(userId)",
  "CREATE INDEX IF NOT EXISTS membership_org ON memberships(orgId, role)",
  "CREATE INDEX IF NOT EXISTS membership_username ON memberships(propertyId, usernameKey)",
  "CREATE INDEX IF NOT EXISTS property_org ON properties(orgId, name)",
  "CREATE INDEX IF NOT EXISTS property_code ON properties(loginCode)",
  "CREATE INDEX IF NOT EXISTS unit_org ON units(orgId, label)",
  "CREATE INDEX IF NOT EXISTS unit_property ON units(propertyId, label)",
  "CREATE INDEX IF NOT EXISTS invitation_org ON invitations(orgId, expiresAt)",
  "CREATE INDEX IF NOT EXISTS invitation_hash ON invitations(hash)",
  "CREATE INDEX IF NOT EXISTS invitation_unit ON invitations(unitId)",
  "CREATE INDEX IF NOT EXISTS visitor_org ON visitors(orgId, visitDate DESC, arrival DESC)",
  "CREATE INDEX IF NOT EXISTS visitor_host ON visitors(orgId, hostId, visitDate DESC)",
  "CREATE INDEX IF NOT EXISTS visitor_property ON visitors(orgId, propertyId, visitDate DESC)",
  "CREATE INDEX IF NOT EXISTS visitor_token ON visitors(token)",
  "CREATE INDEX IF NOT EXISTS visitor_unit_active ON visitors(unitId, active)",
  "CREATE INDEX IF NOT EXISTS visitor_unit_dates ON visitors(unitId, visitDate)",
  "CREATE INDEX IF NOT EXISTS report_org ON reports(orgId, createdAt DESC)",
  "CREATE INDEX IF NOT EXISTS report_author ON reports(orgId, authorId, createdAt DESC)",
  "CREATE INDEX IF NOT EXISTS report_property ON reports(orgId, propertyId, createdAt DESC)",
  "CREATE INDEX IF NOT EXISTS report_queue ON reports(orgId, urgencyRank, createdAt DESC)",
  "CREATE INDEX IF NOT EXISTS tenancy_org ON tenancies(orgId, startedAt DESC)",
  "CREATE INDEX IF NOT EXISTS tenancy_unit ON tenancies(unitId, startedAt DESC)",
  "CREATE INDEX IF NOT EXISTS tenancy_resident ON tenancies(orgId, residentId)",
  "CREATE INDEX IF NOT EXISTS tenancy_current ON tenancies(orgId, current)",
  "CREATE INDEX IF NOT EXISTS tenancy_property ON tenancies(orgId, propertyId, startedAt DESC)",
  "CREATE INDEX IF NOT EXISTS document_org ON documents(orgId, uploadedAt DESC)",
  "CREATE INDEX IF NOT EXISTS document_property ON documents(orgId, propertyId, uploadedAt DESC)",
  "CREATE INDEX IF NOT EXISTS document_unit ON documents(unitId, uploadedAt DESC)",
  "CREATE INDEX IF NOT EXISTS document_tenancy ON documents(tenancyId)",
  "CREATE INDEX IF NOT EXISTS request_org ON requests(orgId, createdAt DESC)",
  "CREATE INDEX IF NOT EXISTS request_property ON requests(orgId, propertyId, createdAt DESC)",
  "CREATE INDEX IF NOT EXISTS request_resident ON requests(orgId, residentId, createdAt DESC)",
  "CREATE INDEX IF NOT EXISTS request_open ON requests(orgId, open, createdAt DESC)",
  "CREATE INDEX IF NOT EXISTS contractor_org ON contractors(orgId, name)",
  "CREATE INDEX IF NOT EXISTS ledger_org ON ledger(orgId, period DESC, createdAt DESC)",
  "CREATE INDEX IF NOT EXISTS ledger_unit ON ledger(unitId, period)",
  "CREATE INDEX IF NOT EXISTS invoice_org ON invoices(orgId, createdAt DESC)",
  "CREATE INDEX IF NOT EXISTS invoice_payment ON invoices(paymentId)",
  "CREATE INDEX IF NOT EXISTS audit_org ON audit(orgId, createdAt DESC)",
  "CREATE INDEX IF NOT EXISTS session_user ON sessions(userId)",
  "CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expiresAt)",
  "CREATE INDEX IF NOT EXISTS reset_user ON resetTokens(userId)",
  "CREATE INDEX IF NOT EXISTS ratelimit_expiry ON rateLimits(resetsAt)",
].join(";\n");

const REBUILT = [
  "users",
  "organisations",
  "memberships",
  "properties",
  "units",
  "invitations",
  "visitors",
  "reports",
  "invoices",
  "audit",
  "sessions",
  "resetTokens",
  "rateLimits",
];

/* ------------------------------------------------------------------ */
/* Migration                                                           */
/* ------------------------------------------------------------------ */

export const SCHEMA_VERSION = 11;

// v11 lets a company put its own logo on its dashboards. The columns default
// to empty, which reads as "no logo uploaded" - and that is exactly what every
// existing organisation has, so nothing is backfilled and every workspace
// keeps the SangoPass mark until someone chooses otherwise.
const ALTERS_V11 = [
  "ALTER TABLE organisations ADD COLUMN logoKey TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE organisations ADD COLUMN logoMime TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE organisations ADD COLUMN logoUpdatedAt TEXT NOT NULL DEFAULT ''",
];

// v10 adds occupancy history, the tenant document archive and the resident
// notice queue. All three are new tables, which the schema re-run at the end
// of a migration creates, so there is nothing to alter and no column to
// backfill. Occupancy before the upgrade was never recorded and none is
// invented: a unit's current resident is opened as a tenancy starting now,
// and the register reads as having no history before that, which is the
// truth. See openingTenancies() below.

// Opens a tenancy for every unit that has a resident in it right now, so an
// upgraded database knows who is living where. The start date is the moment of
// the upgrade rather than a guess: when they actually moved in was never
// recorded, and inventing a date would put a number on a lease dispute that
// nothing in the database supports. Units standing empty get no row - a
// tenancy is a stay, and an empty unit has not had one.
const BACKFILL_V10 = `INSERT INTO tenancies(id,orgId,propertyId,propertyName,unitId,unitLabel,residentId,residentName,residentEmail,username,startedAt,endedAt,endedReason,current)
SELECT 'tncy_' || u.id, u.orgId, u.propertyId, coalesce(p.name,''), u.id, u.label,
       u.residentId, coalesce(u.residentName,''), coalesce(m.userEmail,''), m.username,
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, '', 1
FROM units u
LEFT JOIN properties p ON p.id=u.propertyId
LEFT JOIN memberships m ON m.userId=u.residentId AND m.orgId=u.orgId
WHERE u.residentId IS NOT NULL AND u.residentId<>''`;

// v9 lets a property or a unit be archived instead of deleted, so a sold
// building or a unit that no longer exists leaves last year's books, the
// visitor register and the audit trail exactly as they were. Null means in
// use, which is what every existing row already is.
const ALTERS_V9 = [
  "ALTER TABLE properties ADD COLUMN archivedAt TEXT",
  "ALTER TABLE units ADD COLUMN archivedAt TEXT",
  "ALTER TABLE units ADD COLUMN archivedWithProperty INTEGER NOT NULL DEFAULT 0",
];

// v8 adds the organisation's own books - rent received and what the property
// costs to run - and the month a unit's rent flag refers to. Existing units
// carry an empty period, which reads as unpaid for the current month: the
// flag was never period-aware, so no month can be claimed for it honestly.
const ALTERS_V8 = [
  "ALTER TABLE units ADD COLUMN rentPaidPeriod TEXT NOT NULL DEFAULT ''",
];

// v7 adds the visitor's entry code: the short code a guest without a
// smartphone recites at the gate. A pass issued before this upgrade has none
// and none is invented for it - its QR and reference still work, exactly as no
// identity number was invented for a pass taken before v4.
const ALTERS_V7 = [
  "ALTER TABLE visitors ADD COLUMN entryCode TEXT NOT NULL DEFAULT ''",
];

// v6 adds the organisation's brand colours. The column defaults are the
// SangoPass forest/lime pair, so every existing organisation keeps exactly the
// look it had and no backfill statement is needed.
const ALTERS_V6 = [
  "ALTER TABLE organisations ADD COLUMN brandPrimary TEXT NOT NULL DEFAULT '#143E35'",
  "ALTER TABLE organisations ADD COLUMN brandAccent TEXT NOT NULL DEFAULT '#D5ED9F'",
];

// v5 adds report urgency and the maintenance contacts directory. Existing
// reports become "normal", which is exactly what they were: undifferentiated.
const BACKFILL_V5 = [
  "UPDATE reports SET urgency='normal' WHERE urgency IS NULL OR urgency=''",
  "UPDATE reports SET urgencyRank=2 WHERE urgencyRank IS NULL",
  "UPDATE reports SET unitLabel=(SELECT u.label FROM units u JOIN memberships m ON m.unitId=u.id WHERE m.userId=reports.authorId AND m.orgId=reports.orgId) WHERE unitLabel IS NULL",
].join(";\n");

const ALTERS_V5 = [
  "ALTER TABLE reports ADD COLUMN urgency TEXT NOT NULL DEFAULT 'normal'",
  "ALTER TABLE reports ADD COLUMN urgencyRank INTEGER NOT NULL DEFAULT 2",
  "ALTER TABLE reports ADD COLUMN unitLabel TEXT",
  "ALTER TABLE visitors ADD COLUMN visitorEmail TEXT",
];

// Backfills a pre-v4 visitor row onto the visit-type model. Legacy passes were
// all same-day, and no visitor identity number was captured, so idNumber stays
// empty and the interface reports it as not recorded rather than inventing one.
const BACKFILL_V4 = [
  "UPDATE visitors SET endDate=visitDate WHERE endDate IS NULL OR endDate=''",
  "UPDATE visitors SET visitType='daily' WHERE visitType IS NULL OR visitType=''",
  "UPDATE visitors SET nights=0 WHERE nights IS NULL",
  "UPDATE visitors SET idType='sa_id' WHERE idType IS NULL OR idType=''",
  "UPDATE visitors SET idNumber='' WHERE idNumber IS NULL",
  "UPDATE visitors SET active=CASE WHEN status IN ('upcoming','checked_in') THEN 1 ELSE 0 END",
  "UPDATE visitors SET unitId=(SELECT m.unitId FROM memberships m WHERE m.userId=visitors.hostId AND m.orgId=visitors.orgId) WHERE unitId IS NULL",
].join(";\n");

// v1 to v2 added property login codes and unit-linked usernames.
// v2 to v3 rebuilds every table on the denormalised, backend-neutral shape and
// moves uniqueness from SQL constraints into the shared reservations table, so
// SQLite and Firestore enforce the same rules in the same way.
// v3 to v4 adds visit types, sleepover windows, the visitor's own identity
// document, and the per-property visitor limits a manager sets.
// v4 to v5 adds report urgency with a numeric rank the manager queue sorts on,
// the maintenance contacts directory, and an optional visitor email address.
// v5 to v6 adds the organisation's brand colours, defaulted to the SangoPass
// pair so an upgraded database looks unchanged until a manager picks their own.
// v6 to v7 adds the visitor entry code, empty on every existing pass.
// v7 to v8 adds the finance ledger and the period a rent flag belongs to.
// v8 to v9 adds archiving for properties and units; every existing row is in
// use, which is what a null archivedAt means.
// v9 to v10 adds occupancy history, the tenant document archive and the
// resident notice queue. Whoever is living in a unit today becomes that unit's
// current tenancy; nothing is claimed about who lived there before, because
// nothing ever recorded it.
// v10 to v11 lets a company upload its own logo. Empty means none, which is
// what every organisation upgrading has, so their dashboards look unchanged.
function migrate(database: DatabaseSync) {
  const version = () =>
    (database.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version;
  const tables = () =>
    new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row) => String((row as { name: string }).name)),
    );

  if (!tables().has("users")) {
    database.exec(SCHEMA);
    database.exec(`PRAGMA user_version=${SCHEMA_VERSION}`);
    return;
  }

  if (version() >= SCHEMA_VERSION) {
    // Re-running the schema only adds anything genuinely missing.
    database.exec(SCHEMA);
    return;
  }

  // A database already on the v3 shape or later only needs the new columns.
  if (version() >= 3 && version() < SCHEMA_VERSION) {
    const from = version();
    const steps: string[] = [];
    if (from < 4)
      steps.push(
        "ALTER TABLE properties ADD COLUMN sleepoverNightsPerMonth INTEGER NOT NULL DEFAULT 8",
        "ALTER TABLE properties ADD COLUMN maxConsecutiveNights INTEGER NOT NULL DEFAULT 3",
        "ALTER TABLE properties ADD COLUMN maxActiveGuests INTEGER NOT NULL DEFAULT 2",
        "ALTER TABLE visitors ADD COLUMN unitId TEXT",
        "ALTER TABLE visitors ADD COLUMN idType TEXT NOT NULL DEFAULT 'sa_id'",
        "ALTER TABLE visitors ADD COLUMN idNumber TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE visitors ADD COLUMN visitType TEXT NOT NULL DEFAULT 'daily'",
        "ALTER TABLE visitors ADD COLUMN endDate TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE visitors ADD COLUMN nights INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE visitors ADD COLUMN active INTEGER NOT NULL DEFAULT 1",
        BACKFILL_V4,
      );
    if (from < 5) steps.push(...ALTERS_V5, BACKFILL_V5);
    if (from < 6) steps.push(...ALTERS_V6);
    if (from < 7) steps.push(...ALTERS_V7);
    if (from < 8) steps.push(...ALTERS_V8);
    if (from < 9) steps.push(...ALTERS_V9);
    if (from < 11) steps.push(...ALTERS_V11);
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(
        [...steps, `PRAGMA user_version=${SCHEMA_VERSION}`].join(";\n"),
      );
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    // Creates the contractors table and the new indexes.
    database.exec(SCHEMA);
    // Only now do the v10 tables exist, so the occupancy this database already
    // knows about can be opened as history.
    if (from < 10) database.exec(BACKFILL_V10);
    return;
  }

  if (version() < 2) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(
        [
          "ALTER TABLE properties ADD COLUMN loginCode TEXT",
          "ALTER TABLE memberships ADD COLUMN username TEXT",
          "ALTER TABLE invitations ADD COLUMN username TEXT",
          "ALTER TABLE invitations ADD COLUMN emailStatus TEXT NOT NULL DEFAULT 'not_sent'",
          "ALTER TABLE invitations ADD COLUMN emailSentAt TEXT",
          "UPDATE properties SET loginCode=lower(hex(randomblob(6))) WHERE loginCode IS NULL",
          "UPDATE memberships SET username='SP-' || upper(substr(replace(unitId,'-',''),1,8)) || '-' || upper(substr(replace(userId,'-',''),1,8)) WHERE role='tenant'",
          "UPDATE invitations SET username='SP-' || upper(substr(replace(unitId,'-',''),1,8)) || '-' || upper(substr(replace(id,'-',''),1,8)) WHERE role='tenant'",
          "PRAGMA user_version=2",
        ].join(";\n"),
      );
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  const present = tables();
  database.exec("PRAGMA foreign_keys=OFF");
  database.exec("BEGIN IMMEDIATE");
  try {
    if (present.has("reset_tokens"))
      database.exec("ALTER TABLE reset_tokens RENAME TO legacy_resetTokens");
    if (present.has("rate_limits"))
      database.exec("ALTER TABLE rate_limits RENAME TO legacy_rateLimits");
    for (const table of REBUILT)
      if (present.has(table))
        database.exec(`ALTER TABLE ${table} RENAME TO legacy_${table}`);
    database.exec(SCHEMA);

    const copy = (sql: string, requires: string[]) => {
      if (requires.every((table) => present.has(table))) database.exec(sql);
    };
    copy(
      "INSERT INTO users(id,email,name,password,createdAt) SELECT id,lower(email),name,password,createdAt FROM legacy_users",
      ["users"],
    );
    copy(
      "INSERT INTO organisations(id,name,plan,trialUntil,paidUntil,createdAt) SELECT id,name,coalesce(plan,'starter'),trialUntil,paidUntil,createdAt FROM legacy_organisations",
      ["organisations"],
    );
    copy(
      "INSERT INTO properties(id,orgId,name,address,type,loginCode) SELECT id,orgId,name,address,type,coalesce(loginCode,lower(hex(randomblob(6)))) FROM legacy_properties",
      ["properties"],
    );
    copy(
      "INSERT INTO units(id,orgId,propertyId,label,rentCents,rentPaid,frequency,residentId,residentName)" +
        " SELECT u.id,p.orgId,u.propertyId,u.label,u.rentCents,u.rentPaid,coalesce(u.frequency,'monthly'),m.userId,a.name" +
        " FROM legacy_units u JOIN legacy_properties p ON p.id=u.propertyId" +
        " LEFT JOIN legacy_memberships m ON m.unitId=u.id AND m.role='tenant'" +
        " LEFT JOIN legacy_users a ON a.id=m.userId",
      ["units", "properties", "memberships", "users"],
    );
    copy(
      "INSERT INTO memberships(id,userId,orgId,role,propertyId,unitId,username,usernameKey,orgName,memberName,userEmail)" +
        " SELECT m.userId || '__' || m.orgId,m.userId,m.orgId,m.role,m.propertyId,m.unitId,m.username,lower(m.username),o.name,u.name,lower(u.email)" +
        " FROM legacy_memberships m JOIN legacy_organisations o ON o.id=m.orgId JOIN legacy_users u ON u.id=m.userId",
      ["memberships", "organisations", "users"],
    );
    copy(
      "INSERT INTO invitations(id,orgId,email,role,propertyId,unitId,hash,expiresAt,acceptedAt,username,usernameKey,emailStatus,emailSentAt)" +
        " SELECT id,orgId,lower(email),role,propertyId,unitId,hash,expiresAt,acceptedAt,username,lower(username),coalesce(emailStatus,'not_sent'),emailSentAt FROM legacy_invitations",
      ["invitations"],
    );
    copy(
      "INSERT INTO visitors(id,orgId,propertyId,hostId,visitorName,phone,reference,token,visitDate,arrival,departure,status,createdAt,checkedInAt,checkedOutAt,propertyName,hostName,unitLabel)" +
        " SELECT v.id,v.orgId,v.propertyId,v.hostId,v.visitorName,v.phone,v.reference,v.token,v.visitDate,v.arrival,v.departure,v.status,v.createdAt,v.checkedInAt,v.checkedOutAt,p.name,h.name,t.label" +
        " FROM legacy_visitors v JOIN legacy_properties p ON p.id=v.propertyId JOIN legacy_users h ON h.id=v.hostId" +
        " LEFT JOIN legacy_memberships m ON m.userId=v.hostId AND m.orgId=v.orgId" +
        " LEFT JOIN legacy_units t ON t.id=m.unitId",
      ["visitors", "properties", "users", "memberships", "units"],
    );
    copy(
      "INSERT INTO reports(id,orgId,propertyId,authorId,authorName,category,description,status,createdAt)" +
        " SELECT r.id,r.orgId,r.propertyId,r.authorId,a.name,r.category,r.description,r.status,r.createdAt" +
        " FROM legacy_reports r JOIN legacy_users a ON a.id=r.authorId",
      ["reports", "users"],
    );
    copy(
      "INSERT INTO invoices(id,orgId,plan,amountCents,status,paymentId,createdAt) SELECT id,orgId,plan,amountCents,status,paymentId,createdAt FROM legacy_invoices",
      ["invoices"],
    );
    copy(
      "INSERT INTO audit(id,orgId,userId,userName,action,subject,createdAt) SELECT id,orgId,userId,'',action,NULL,createdAt FROM legacy_audit",
      ["audit"],
    );
    copy(
      "INSERT INTO sessions(id,userId,expiresAt) SELECT hash,userId,expiresAt FROM legacy_sessions",
      ["sessions"],
    );
    if (present.has("reset_tokens"))
      database.exec(
        "INSERT INTO resetTokens(id,userId,expiresAt) SELECT hash,userId,expiresAt FROM legacy_resetTokens",
      );

    // Uniqueness now lives in reservations so both backends agree.
    database.exec(
      [
        "INSERT OR IGNORE INTO reservations(id,owner,createdAt) SELECT 'userEmail:' || email, id, createdAt FROM users",
        "INSERT OR IGNORE INTO reservations(id,owner,createdAt) SELECT 'property:' || orgId || ':' || lower(name), id, '' FROM properties",
        "INSERT OR IGNORE INTO reservations(id,owner,createdAt) SELECT 'loginCode:' || loginCode, id, '' FROM properties",
        "INSERT OR IGNORE INTO reservations(id,owner,createdAt) SELECT 'unit:' || propertyId || ':' || lower(label), id, '' FROM units",
        "INSERT OR IGNORE INTO reservations(id,owner,createdAt) SELECT 'unitResident:' || unitId, id, '' FROM memberships WHERE role='tenant' AND unitId IS NOT NULL",
        "INSERT OR IGNORE INTO reservations(id,owner,createdAt) SELECT 'username:' || propertyId || ':' || usernameKey, id, '' FROM memberships WHERE role='tenant' AND usernameKey IS NOT NULL AND propertyId IS NOT NULL",
        "INSERT OR IGNORE INTO reservations(id,owner,createdAt) SELECT 'visitorRef:' || reference, id, '' FROM visitors",
        "INSERT OR IGNORE INTO reservations(id,owner,createdAt) SELECT 'visitorToken:' || token, id, '' FROM visitors",
        "INSERT OR IGNORE INTO reservations(id,owner,createdAt) SELECT 'paymentId:' || paymentId, id, '' FROM invoices WHERE paymentId IS NOT NULL",
      ].join(";\n"),
    );

    // The rebuilt tables already carry the v4 and v5 columns; only their
    // values for the copied rows still need deriving.
    database.exec(BACKFILL_V4);
    database.exec(BACKFILL_V5);

    for (const table of REBUILT)
      database.exec(`DROP TABLE IF EXISTS legacy_${table}`);
    database.exec(`PRAGMA user_version=${SCHEMA_VERSION}`);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys=ON");
  }
}

/* ------------------------------------------------------------------ */
/* Query translation                                                   */
/* ------------------------------------------------------------------ */

function column(collection: Collection, field: string) {
  if (!FIELDS[collection].includes(field))
    throw new Error(`Unknown field ${collection}.${field}`);
  return `"${field}"`;
}

function predicate(collection: Collection, clauses: Where[] = []) {
  const sql: string[] = [];
  const values: SQLInputValue[] = [];
  for (const [field, op, value] of clauses) {
    const name = column(collection, field);
    if (value === null) {
      sql.push(`${name} IS ${op === "!=" ? "NOT " : ""}NULL`);
      continue;
    }
    sql.push(`${name} ${op === "==" ? "=" : op} ?`);
    values.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
  }
  return { sql: sql.length ? ` WHERE ${sql.join(" AND ")}` : "", values };
}

function suffix(collection: Collection, query: Query = {}) {
  let sql = "";
  if (query.orderBy?.length)
    sql +=
      " ORDER BY " +
      query.orderBy
        .map(
          (order) =>
            `${column(collection, order.field)} ${order.direction === "desc" ? "DESC" : "ASC"}`,
        )
        .join(", ");
  if (query.limit) sql += ` LIMIT ${Math.max(1, Math.floor(query.limit))}`;
  return sql;
}

type Operation =
  | {
      kind: "create" | "set" | "update";
      collection: Collection;
      id: string;
      data: Record<string, unknown>;
    }
  | { kind: "remove"; collection: Collection; id: string };

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export class SqliteStore implements Store {
  readonly name = "sqlite" as const;
  private database: DatabaseSync;
  // node:sqlite is synchronous and its transactions cannot nest, so concurrent
  // requests are serialised rather than allowed to interleave at an await.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(file?: string) {
    const path =
      file ||
      process.env.SANGOPASS_DATABASE_PATH ||
      resolve("data/sangopass.sqlite");
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path, { timeout: 5000 });
    this.database.exec("PRAGMA journal_mode=WAL");
    this.database.exec("PRAGMA busy_timeout=5000");
    migrate(this.database);
  }

  private rows<T>(collection: Collection, query: Query = {}): T[] {
    const { sql, values } = predicate(collection, query.where);
    return this.database
      .prepare(`SELECT * FROM ${collection}${sql}${suffix(collection, query)}`)
      .all(...values)
      .map((row) => ({ ...row }) as T);
  }

  async get<T>(collection: Collection, id: string) {
    return this.rows<T>(collection, { where: [["id", "==", id]], limit: 1 })[0];
  }

  async find<T>(collection: Collection, query: Query = {}) {
    return this.rows<T>(collection, query);
  }

  async first<T>(collection: Collection, query: Query = {}) {
    return this.rows<T>(collection, { ...query, limit: 1 })[0];
  }

  async count(collection: Collection, query: Query = {}) {
    const { sql, values } = predicate(collection, query.where);
    const row = this.database
      .prepare(`SELECT count(*) n FROM ${collection}${sql}`)
      .get(...values) as { n: number };
    return row.n;
  }

  private apply(operation: Operation) {
    const { collection, id } = operation;
    if (operation.kind === "remove") {
      this.database.prepare(`DELETE FROM ${collection} WHERE "id"=?`).run(id);
      return;
    }
    const data: Record<string, unknown> = { ...operation.data, id };
    const names = Object.keys(data).filter((key) =>
      FIELDS[collection].includes(key),
    );
    const value = (key: string): SQLInputValue => {
      const raw = data[key];
      if (raw === undefined || raw === null) return null;
      if (typeof raw === "boolean") return raw ? 1 : 0;
      return raw as SQLInputValue;
    };
    if (operation.kind === "update") {
      const changed = names.filter((key) => key !== "id");
      if (!changed.length) return;
      this.database
        .prepare(
          `UPDATE ${collection} SET ${changed.map((key) => `"${key}"=?`).join(",")} WHERE "id"=?`,
        )
        .run(...changed.map(value), id);
      return;
    }
    const verb = operation.kind === "set" ? "INSERT OR REPLACE" : "INSERT";
    try {
      this.database
        .prepare(
          `${verb} INTO ${collection}(${names.map((n) => `"${n}"`).join(",")}) VALUES(${names.map(() => "?").join(",")})`,
        )
        .run(...names.map(value));
    } catch (error) {
      if (
        error instanceof Error &&
        /UNIQUE constraint failed|PRIMARY KEY/i.test(error.message)
      )
        throw new ConflictError();
      throw error;
    }
  }

  async tx<T>(work: (t: Tx) => Promise<T>): Promise<T> {
    const run = async () => {
      const pending: Operation[] = [];
      let writing = false;
      const guardRead = () => {
        if (writing)
          throw new Error(
            "Store transactions must perform every read before the first write.",
          );
      };
      const push = (operation: Operation) => {
        writing = true;
        pending.push(operation);
      };
      const handle: Tx = {
        get: async (collection, id) => {
          guardRead();
          return this.get(collection, id);
        },
        find: async (collection, query) => {
          guardRead();
          return this.find(collection, query);
        },
        first: async (collection, query) => {
          guardRead();
          return this.first(collection, query);
        },
        count: async (collection, query) => {
          guardRead();
          return this.count(collection, query);
        },
        create: (collection, id, data) =>
          push({ kind: "create", collection, id, data }),
        set: (collection, id, data) =>
          push({ kind: "set", collection, id, data }),
        update: (collection, id, patch) =>
          push({ kind: "update", collection, id, data: patch }),
        remove: (collection, id) => push({ kind: "remove", collection, id }),
        reserve: (key, owner) =>
          push({
            kind: "create",
            collection: "reservations",
            id: key,
            data: { owner, createdAt: new Date().toISOString() },
          }),
        release: (key) =>
          push({ kind: "remove", collection: "reservations", id: key }),
      };
      const result = await work(handle);
      if (!pending.length) return result;
      this.database.exec("BEGIN IMMEDIATE");
      try {
        for (const operation of pending) this.apply(operation);
        this.database.exec("COMMIT");
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async updateWhere(
    collection: Collection,
    query: Query,
    patch: Record<string, unknown>,
  ) {
    const names = Object.keys(patch).filter(
      (key) => key !== "id" && FIELDS[collection].includes(key),
    );
    if (!names.length) return 0;
    const { sql, values } = predicate(collection, query.where);
    const result = this.database
      .prepare(
        `UPDATE ${collection} SET ${names.map((key) => `"${key}"=?`).join(",")}${sql}`,
      )
      .run(
        ...names.map((key) => (patch[key] ?? null) as SQLInputValue),
        ...values,
      );
    return Number(result.changes);
  }

  async removeWhere(collection: Collection, query: Query) {
    const { sql, values } = predicate(collection, query.where);
    const result = this.database
      .prepare(`DELETE FROM ${collection}${sql}`)
      .run(...values);
    return Number(result.changes);
  }

  async close() {
    this.database.close();
  }
}
