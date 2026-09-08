import { firebase } from "../config";
import { firebaseApp } from "../firebaseApp";
import type { Credential, Identity } from "./types";

async function auth() {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(await firebaseApp());
}

function identityToolkit(path: string) {
  const host = firebase().authEmulator;
  const base = host
    ? `http://${host}/identitytoolkit.googleapis.com/v1`
    : "https://identitytoolkit.googleapis.com/v1";
  return `${base}/${path}?key=${encodeURIComponent(firebase().apiKey || "emulator")}`;
}

// Password verification is the one operation the Admin SDK deliberately does
// not expose, so it goes through the Identity Toolkit REST endpoint with the
// project's Web API key. Every other credential operation is Admin-side.
const CREDENTIAL_FAILURES = new Set([
  "EMAIL_NOT_FOUND",
  "INVALID_PASSWORD",
  "INVALID_LOGIN_CREDENTIALS",
  "USER_DISABLED",
  "INVALID_EMAIL",
]);

export class FirebaseIdentity implements Identity {
  readonly name = "firebase" as const;

  constructor(private send: typeof fetch = fetch) {}

  async createUser(input: {
    id: string;
    email: string;
    name: string;
    password: string;
  }): Promise<Credential> {
    const client = await auth();
    await client.createUser({
      uid: input.id,
      email: input.email,
      displayName: input.name,
      password: input.password,
      emailVerified: false,
    });
    return { id: input.id, email: input.email, name: input.name };
  }

  async secret() {
    // Firebase Authentication holds the credential; nothing is stored locally.
    return "";
  }

  async verifyPassword(email: string, password: string) {
    if (!firebase().apiKey && !firebase().authEmulator)
      throw new Error(
        "FIREBASE_API_KEY is required to verify passwords through Firebase Authentication.",
      );
    const response = await this.send(
      identityToolkit("accounts:signInWithPassword"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: false,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      localId?: string;
      displayName?: string;
      email?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      const reason = (payload.error?.message || "").split(" ")[0];
      if (CREDENTIAL_FAILURES.has(reason)) return undefined;
      throw new Error(`Firebase sign-in failed: ${reason || response.status}`);
    }
    if (!payload.localId) return undefined;
    return {
      id: payload.localId,
      email: payload.email || email,
      name: payload.displayName || "",
    };
  }

  async setPassword(id: string, password: string) {
    const client = await auth();
    await client.updateUser(id, { password });
    // New password, no surviving refresh tokens.
    await client.revokeRefreshTokens(id);
  }

  async deleteUser(id: string) {
    const client = await auth();
    await client.deleteUser(id).catch((error: { code?: string }) => {
      if (error?.code !== "auth/user-not-found") throw error;
    });
  }

  async revoke(id: string) {
    const client = await auth();
    await client.revokeRefreshTokens(id).catch(() => undefined);
  }
}
