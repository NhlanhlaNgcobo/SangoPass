import type { App } from "firebase-admin/app";
import { firebase } from "./config";

// firebase-admin is imported dynamically so a SQLite deployment never loads
// the SDK, and a checkout with no Firebase credentials still builds and runs.
let initialised: Promise<App> | undefined;

export async function firebaseApp(): Promise<App> {
  if (initialised) return initialised;
  initialised = (async () => {
    const { applicationDefault, cert, getApps, initializeApp } = await import(
      "firebase-admin/app"
    );
    const existing = getApps();
    if (existing.length) return existing[0];
    const config = firebase();
    if (!config.projectId)
      throw new Error(
        "FIREBASE_PROJECT_ID is not set. See docs/FIREBASE.md for the required environment.",
      );
    const credential =
      config.clientEmail && config.privateKey
        ? cert({
            projectId: config.projectId,
            clientEmail: config.clientEmail,
            privateKey: config.privateKey,
          })
        : config.emulator || config.authEmulator
          ? undefined
          : applicationDefault();
    return initializeApp({ projectId: config.projectId, credential });
  })();
  return initialised;
}

export function resetFirebaseApp() {
  initialised = undefined;
}
