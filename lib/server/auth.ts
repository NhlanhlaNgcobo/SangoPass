import { createHash, randomBytes, randomUUID } from "node:crypto";
import { identity } from "./identity";
import { BACKSTOPS, bucket, throttle } from "./ratelimit";
import { store } from "./store";
import type {
  MembershipRecord,
  PropertyRecord,
  SessionRecord,
  UserRecord,
} from "./store";
import { AppError, email, password, text } from "./validation";
import { DEFAULT_THEME } from "@/lib/shared/theme";
import type { Account, Membership } from "@/types/workspace";

export const cookieName = "sangopass_session";
export const SESSION_DAYS = 7;

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
export const now = () => new Date().toISOString();

export interface RequestContext {
  ip?: string;
}

const address = (context?: RequestContext) => context?.ip || "unknown";

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export async function createSession(userId: string) {
  const token = newToken();
  await store().tx(async (t) => {
    t.set("sessions", hashToken(token), {
      userId,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000).toISOString(),
    });
  });
  return token;
}

export async function session(token?: string): Promise<Account | undefined> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  const record = await store().get<SessionRecord>("sessions", hashToken(token));
  if (!record || record.expiresAt <= now()) return;
  const user = await store().get<UserRecord>("users", record.userId);
  if (!user) return;
  return { id: user.id, name: user.name, email: user.email };
}

export async function endSession(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  await store().tx(async (t) => {
    t.remove("sessions", hashToken(token));
  });
}

export async function endAllSessions(userId: string) {
  await store().removeWhere("sessions", { where: [["userId", "==", userId]] });
  await identity().revoke(userId);
}

/* ------------------------------------------------------------------ */
/* Memberships                                                         */
/* ------------------------------------------------------------------ */

export function toMembership(record: MembershipRecord): Membership {
  return {
    orgId: record.orgId,
    orgName: record.orgName,
    role: record.role,
    propertyId: record.propertyId,
    unitId: record.unitId,
    username: record.username,
  };
}

export async function memberships(userId: string): Promise<Membership[]> {
  const rows = await store().find<MembershipRecord>("memberships", {
    where: [["userId", "==", userId]],
  });
  return rows
    .sort((a, b) => a.orgName.localeCompare(b.orgName))
    .map(toMembership);
}

export const membershipId = (userId: string, orgId: string) =>
  `${userId}__${orgId}`;

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

/**
 * Creates the credential with the active identity backend and hands back the
 * value to persist on the user record. The caller commits the user document;
 * on failure it must call rollbackAccount so Firebase Authentication is not
 * left holding an orphan.
 */
export async function prepareAccount(input: {
  id: string;
  email: string;
  name: string;
  password: string;
}) {
  const credential = await identity().createUser(input);
  const secret = await identity().secret(input.password);
  return { credential, secret };
}

export async function rollbackAccount(id: string) {
  await identity()
    .deleteUser(id)
    .catch(() => undefined);
}

export async function register(
  input: Record<string, unknown>,
  context?: RequestContext,
) {
  const emailAddress = email(input.email);
  const name = text(input.name, "name", 100);
  const organisation = text(input.organisation, "organisation name", 120);
  const secretValue = password(input.password);
  await throttle([
    bucket(`register:${emailAddress}`, 5),
    bucket(`register:ip:${address(context)}`, 10),
    BACKSTOPS.registrations,
  ]);

  if (
    await store().first<UserRecord>("users", {
      where: [["email", "==", emailAddress]],
    })
  )
    throw new AppError(
      "An account already exists for this email. Please sign in.",
      409,
    );

  const userId = randomUUID();
  const orgId = randomUUID();
  const { secret } = await prepareAccount({
    id: userId,
    email: emailAddress,
    name,
    password: secretValue,
  });
  const timestamp = now();
  try {
    await store().tx(async (t) => {
      const clash = await t.first<UserRecord>("users", {
        where: [["email", "==", emailAddress]],
      });
      if (clash)
        throw new AppError(
          "An account already exists for this email. Please sign in.",
          409,
        );
      t.reserve(`userEmail:${emailAddress}`, userId);
      t.create("users", userId, {
        email: emailAddress,
        name,
        password: secret,
        createdAt: timestamp,
      });
      t.create("organisations", orgId, {
        name: organisation,
        plan: "starter",
        trialUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        paidUntil: null,
        brandPrimary: DEFAULT_THEME.primary,
        brandAccent: DEFAULT_THEME.accent,
        // Written rather than left absent: a missing field is null in SQLite
        // and undefined in Firestore, and every record here states its fields
        // so the two backends cannot answer differently.
        suspendedAt: null,
        createdAt: timestamp,
      });
      t.create("memberships", membershipId(userId, orgId), {
        userId,
        orgId,
        role: "manager",
        propertyId: null,
        unitId: null,
        username: null,
        usernameKey: null,
        orgName: organisation,
        memberName: name,
        userEmail: emailAddress,
      });
    });
  } catch (error) {
    await rollbackAccount(userId);
    throw error;
  }
  return {
    token: await createSession(userId),
    user: { id: userId, name, email: emailAddress },
    orgId,
  };
}

export async function login(
  input: Record<string, unknown>,
  context?: RequestContext,
) {
  const emailAddress = email(input.email);
  const supplied =
    typeof input.password === "string" && input.password.length <= 128
      ? input.password
      : "";
  await throttle([
    bucket(`login:${emailAddress}`, 10),
    bucket(`login:ip:${address(context)}`, 30),
    BACKSTOPS.logins,
  ]);
  const credential = await identity().verifyPassword(emailAddress, supplied);
  if (!credential) throw new AppError("Email or password is incorrect.", 401);
  const user = await store().get<UserRecord>("users", credential.id);
  if (!user) throw new AppError("Email or password is incorrect.", 401);
  return {
    token: await createSession(user.id),
    user: { id: user.id, name: user.name, email: user.email },
  };
}

export async function tenantLogin(
  input: Record<string, unknown>,
  context?: RequestContext,
) {
  const username = text(
    input.username,
    "username or student number",
    80,
  ).toLowerCase();
  const propertyCode = text(input.propertyCode, "property code", 40)
    .toLowerCase()
    .trim();
  const supplied =
    typeof input.password === "string" && input.password.length <= 128
      ? input.password
      : "";
  await throttle([
    bucket(`tenant-login:${propertyCode}:${username}`, 10),
    bucket(`tenant-login:property:${propertyCode}`, 200),
    bucket(`login:ip:${address(context)}`, 30),
    BACKSTOPS.logins,
  ]);

  const rejection = new AppError(
    "Property code, username or password is incorrect.",
    401,
  );
  const property = await store().first<PropertyRecord>("properties", {
    where: [["loginCode", "==", propertyCode]],
  });
  if (!property) throw rejection;
  const membership = await store().first<MembershipRecord>("memberships", {
    where: [
      ["propertyId", "==", property.id],
      ["usernameKey", "==", username],
      ["role", "==", "tenant"],
    ],
  });
  if (!membership) throw rejection;
  const credential = await identity().verifyPassword(
    membership.userEmail,
    supplied,
  );
  if (!credential || credential.id !== membership.userId) throw rejection;
  return {
    token: await createSession(membership.userId),
    orgId: membership.orgId,
  };
}

/** Removes elapsed sessions and reset tokens. Called by maintenance. */
export async function sweepSessions() {
  const cutoff = now();
  const sessions = await store().removeWhere("sessions", {
    where: [["expiresAt", "<", cutoff]],
  });
  const resets = await store().removeWhere("resetTokens", {
    where: [["expiresAt", "<", cutoff]],
  });
  return { sessions, resets };
}
