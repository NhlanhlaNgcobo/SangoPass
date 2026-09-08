import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { db, one } from "../lib/server/db";
test("version-one data migrates without changing passwords or unit assignments and reopens safely", () => {
  const folder = mkdtempSync(join(tmpdir(), "sangopass-migration-"));
  process.env.SANGOPASS_DATABASE_PATH = join(folder, "legacy.sqlite");
  const old = new DatabaseSync(process.env.SANGOPASS_DATABASE_PATH);
  old.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,password TEXT,createdAt TEXT);
 CREATE TABLE organisations(id TEXT PRIMARY KEY,name TEXT,plan TEXT,trialUntil TEXT,paidUntil TEXT,createdAt TEXT);
 CREATE TABLE properties(id TEXT PRIMARY KEY,orgId TEXT,name TEXT,address TEXT,type TEXT);
 CREATE TABLE units(id TEXT PRIMARY KEY,propertyId TEXT,label TEXT,rentCents INTEGER,rentPaid INTEGER,frequency TEXT);
 CREATE TABLE memberships(userId TEXT,orgId TEXT,role TEXT,propertyId TEXT,unitId TEXT,PRIMARY KEY(userId,orgId));
 CREATE TABLE invitations(id TEXT PRIMARY KEY,orgId TEXT,email TEXT,role TEXT,propertyId TEXT,unitId TEXT,hash TEXT,expiresAt TEXT,acceptedAt TEXT);
 INSERT INTO users VALUES('user1','legacy@example.test','Legacy Resident','original-password-digest','2026-01-01');
 INSERT INTO organisations VALUES('org1','Legacy Homes','starter','2027-01-01',NULL,'2026-01-01');
 INSERT INTO properties VALUES('property1','org1','Legacy Court','Cape Town','apartment');
 INSERT INTO units VALUES('unit1','property1','A1',450000,0,'monthly');
 INSERT INTO memberships VALUES('user1','org1','tenant','property1','unit1');
 PRAGMA user_version=1;`);
  old.close();
  assert.equal(
    (db().prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version,
    2,
  );
  const member = one<{ username: string; unitId: string }>(
    "SELECT username,unitId FROM memberships WHERE userId='user1'",
  )!;
  assert.ok(member.username.startsWith("SP-"));
  assert.equal(member.unitId, "unit1");
  assert.equal(
    one<{ password: string }>("SELECT password FROM users WHERE id='user1'")!
      .password,
    "original-password-digest",
  );
  const code = one<{ loginCode: string }>(
    "SELECT loginCode FROM properties WHERE id='property1'",
  )!.loginCode;
  assert.match(code, /^[a-f0-9]{12}$/);
  const reopened = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--eval",
      "const {one}=require('./lib/server/db.ts'); process.stdout.write(one(\"SELECT loginCode FROM properties WHERE id='property1'\").loginCode)",
    ],
    { env: process.env, encoding: "utf8", windowsHide: true },
  );
  assert.equal(reopened, code);
});
