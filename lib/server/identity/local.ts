import { randomBytes, scrypt as derive, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { store } from "../store";
import type { UserRecord } from "../store";
import type { Credential, Identity } from "./types";

const scrypt = promisify(derive);

export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(value, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyHash(value: string, stored: string) {
  const [salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = (await scrypt(value, salt, 64)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const DUMMY = "00000000000000000000000000000000:" + "00".repeat(64);

/** Salted scrypt digests held on the user record itself. */
export class LocalIdentity implements Identity {
  readonly name = "local" as const;

  async createUser(input: {
    id: string;
    email: string;
    name: string;
  }): Promise<Credential> {
    return { id: input.id, email: input.email, name: input.name };
  }

  async secret(password: string) {
    return hashPassword(password);
  }

  async verifyPassword(email: string, password: string) {
    const user = await store().first<UserRecord>("users", {
      where: [["email", "==", email.toLowerCase()]],
    });
    // Always derive, so an unknown address costs the same as a wrong password.
    const ok = await verifyHash(password, user?.password || DUMMY);
    if (!ok || !user) return undefined;
    return { id: user.id, email: user.email, name: user.name };
  }

  async setPassword(id: string, password: string) {
    const digest = await hashPassword(password);
    await store().tx(async (t) => {
      t.update("users", id, { password: digest });
    });
  }

  async deleteUser() {
    // The digest lives on the user record, which the caller removes.
  }

  async revoke() {
    // Local credentials issue nothing beyond the application's own sessions.
  }
}
