import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as derive,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { all, one, run, transaction } from "./db";
import { AppError, email, password, text } from "./validation";
import type { Account, Membership } from "@/types/workspace";
const scrypt = promisify(derive);
export const cookieName = "sangopass_session";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
export const now = () => new Date().toISOString();
export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(value, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(value: string, stored: string) {
  const [salt, digest] = stored.split(":");
  const expected = Buffer.from(digest, "hex");
  const actual = (await scrypt(value, salt, 64)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function throttle(key: string, limit = 10) {
  const bucket = hashToken(key);
  const time = Date.now();
  transaction(() => {
    run("DELETE FROM rate_limits WHERE resetsAt < ?", time);
    const row = one<{ count: number }>(
      "SELECT count FROM rate_limits WHERE key=?",
      bucket,
    );
    if (row && row.count >= limit)
      throw new AppError(
        "Too many attempts. Please try again in 15 minutes.",
        429,
      );
    run(
      "INSERT INTO rate_limits(key,count,resetsAt) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
      bucket,
      time + 900000,
    );
  });
}
export function memberships(userId: string) {
  return all<Membership>(
    "SELECT m.orgId,o.name orgName,m.role,m.propertyId,m.unitId,m.username FROM memberships m JOIN organisations o ON o.id=m.orgId WHERE m.userId=? ORDER BY o.name",
    userId,
  );
}
export function session(token?: string): Account | undefined {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  return one<Account>(
    "SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.userId WHERE s.hash=? AND s.expiresAt>?",
    hashToken(token),
    now(),
  );
}
export function createSession(userId: string) {
  const token = newToken();
  run("DELETE FROM sessions WHERE expiresAt<?", now());
  run(
    "INSERT INTO sessions VALUES(?,?,?)",
    hashToken(token),
    userId,
    new Date(Date.now() + 7 * 86400000).toISOString(),
  );
  return token;
}
export function endSession(token?: string) {
  if (token) run("DELETE FROM sessions WHERE hash=?", hashToken(token));
}
export async function register(input: Record<string, unknown>) {
  const address = email(input.email);
  const name = text(input.name, "name", 100);
  const organisation = text(input.organisation, "organisation name", 120);
  const pass = password(input.password);
  throttle("register:" + address, 5);
  throttle("registrations", 100);
  const digest = await hashPassword(pass);
  const userId = randomUUID(),
    orgId = randomUUID();
  transaction(() => {
    if (one("SELECT id FROM users WHERE email=?", address))
      throw new AppError(
        "An account already exists for this email. Please sign in.",
        409,
      );
    run(
      "INSERT INTO users VALUES(?,?,?,?,?)",
      userId,
      address,
      name,
      digest,
      now(),
    );
    run(
      "INSERT INTO organisations(id,name,trialUntil,createdAt) VALUES(?,?,?,?)",
      orgId,
      organisation,
      new Date(Date.now() + 14 * 86400000).toISOString(),
      now(),
    );
    run(
      "INSERT INTO memberships(userId,orgId,role) VALUES(?,?,'manager')",
      userId,
      orgId,
    );
  });
  return {
    token: createSession(userId),
    user: { id: userId, name, email: address },
    orgId,
  };
}
export async function login(input: Record<string, unknown>) {
  const address = email(input.email);
  const pass =
    typeof input.password === "string" && input.password.length <= 128
      ? input.password
      : "";
  throttle("login:" + address);
  throttle("logins", 300);
  const user = one<Account & { password: string }>(
    "SELECT id,name,email,password FROM users WHERE email=?",
    address,
  );
  // Perform a password derivation even when the account is unknown.
  const digest =
    user?.password || "00000000000000000000000000000000:" + "00".repeat(64);
  if (!(await verifyPassword(pass, digest)) || !user)
    throw new AppError("Email or password is incorrect.", 401);
  return {
    token: createSession(user.id),
    user: { id: user.id, name: user.name, email: user.email },
  };
}

export async function tenantLogin(input: Record<string, unknown>) {
  const username = text(
    input.username,
    "username or student number",
    80,
  ).toLowerCase();
  const propertyCode = text(
    input.propertyCode,
    "property code",
    40,
  ).toLowerCase();
  throttle("tenant-login:" + propertyCode + ":" + username);
  throttle("logins", 300);
  const user = one<Account & { password: string; orgId: string }>(
    "SELECT u.id,u.name,u.email,u.password,m.orgId FROM memberships m JOIN users u ON u.id=m.userId JOIN properties p ON p.id=m.propertyId WHERE p.loginCode=? AND m.username=? AND m.role='tenant'",
    propertyCode,
    username,
  );
  const pass =
    typeof input.password === "string" && input.password.length <= 128
      ? input.password
      : "";
  const digest =
    user?.password || "00000000000000000000000000000000:" + "00".repeat(64);
  if (!(await verifyPassword(pass, digest)) || !user)
    throw new AppError(
      "Property code, username or password is incorrect.",
      401,
    );
  return { token: createSession(user.id), orgId: user.orgId };
}
