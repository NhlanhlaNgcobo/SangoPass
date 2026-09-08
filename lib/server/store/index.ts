import { backend } from "../config";
import { FirestoreStore } from "./firestore";
import { SqliteStore } from "./sqlite";
import type { Store } from "./types";

export * from "./types";

let instance: Store | undefined;

/**
 * The active storage backend. SQLite is the default so a checkout with no
 * cloud credentials still runs; setting SANGOPASS_BACKEND=firebase (or simply
 * providing Firebase credentials) switches every caller to Firestore.
 *
 * FirestoreStore only imports firebase-admin types at module scope and pulls
 * the runtime in through a dynamic import, so a SQLite deployment never loads
 * the SDK.
 */
export function store(): Store {
  if (!instance)
    instance =
      backend() === "firebase" ? new FirestoreStore() : new SqliteStore();
  return instance;
}

/** Test seam: drop the memoised backend, optionally closing it first. */
export async function resetStore(close = true) {
  if (instance && close) await instance.close().catch(() => undefined);
  instance = undefined;
}

export function useStore(replacement: Store | undefined) {
  instance = replacement;
}
