import { backend } from "../config";
import { FirebaseIdentity } from "./firebase";
import { LocalIdentity } from "./local";
import type { Identity } from "./types";

export * from "./types";
export { hashPassword, verifyHash } from "./local";

let instance: Identity | undefined;

/** Firebase Authentication when the backend is Firebase, scrypt otherwise. */
export function identity(): Identity {
  if (!instance)
    instance =
      backend() === "firebase" ? new FirebaseIdentity() : new LocalIdentity();
  return instance;
}

export function useIdentity(replacement: Identity | undefined) {
  instance = replacement;
}
