/**
 * Documents in Firebase Storage, for a deployment with no disk of its own.
 *
 * The bucket is reached through the Admin SDK on this server and never from a
 * browser: a manager asking for a lease goes through /api/documents/[id],
 * which checks their membership first. No signed URL is ever handed out, so
 * storage.rules can stay a total denial exactly as firestore.rules is.
 *
 * firebase-admin is imported lazily, so a SQLite deployment writing to disk
 * never loads the SDK.
 */
import type { Bucket } from "@google-cloud/storage";
import { firebase } from "../config";
import { firebaseApp } from "../firebaseApp";
import { assertKey, type DocumentStorage } from "./index";

let handle: Promise<Bucket> | undefined;

async function bucket(): Promise<Bucket> {
  if (handle) return handle;
  handle = (async () => {
    const { getStorage } = await import("firebase-admin/storage");
    const name = firebase().storageBucket;
    if (!name)
      throw new Error(
        "FIREBASE_STORAGE_BUCKET is not set, so there is nowhere to keep tenant documents. See docs/FIREBASE.md.",
      );
    return getStorage(await firebaseApp()).bucket(name);
  })();
  return handle;
}

/** Test seam: drops the memoised handle so another project can be attached. */
export function resetDocumentBucket() {
  handle = undefined;
}

export function bucketDocuments(): DocumentStorage {
  return {
    name: "firebase",
    async put(key, data) {
      await (await bucket())
        .file(assertKey(key))
        .save(Buffer.from(data), { resumable: false });
    },
    async get(key) {
      const file = (await bucket()).file(assertKey(key));
      try {
        const [contents] = await file.download();
        return new Uint8Array(contents);
      } catch (error) {
        // A record whose file is gone reads as absent, so the caller can turn
        // it into an honest 404 rather than a 500.
        if ((error as { code?: number })?.code === 404) return undefined;
        throw error;
      }
    },
    async remove(key) {
      await (await bucket())
        .file(assertKey(key))
        .delete({ ignoreNotFound: true });
    },
  };
}
