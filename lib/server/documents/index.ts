/**
 * Where a tenant's documents actually live.
 *
 * The record store holds scalars and caps a document far below the size of a
 * scanned lease, so the bytes need somewhere else to go. This is the seam:
 * business code asks for a key and gets bytes back, and never learns whether
 * they came off a disk or out of a bucket.
 *
 * Which one is in use follows the record backend, because the two have to
 * survive the same deployment: SQLite means one server with a persistent
 * disk, and files go beside the database; Firebase means a serverless host
 * with no disk worth writing to, and files go in the project's bucket.
 * Nothing above this line knows which.
 */
import { backend } from "../config";
import { bucketDocuments } from "./bucket";
import { diskDocuments } from "./disk";

export interface DocumentStorage {
  readonly name: string;
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  remove(key: string): Promise<void>;
}

/**
 * What a document may be. Deliberately short: every entry is a format the
 * office actually receives a lease or an inspection in, and each one is inert
 * in a browser.
 *
 * SVG is missing on purpose. It is an image everywhere else in the world and a
 * script here - it would run in the origin serving it, against a manager's own
 * session - so it is not accepted no matter how a file is labelled.
 */
export const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** A scanned multi-page lease is large; a phone photograph of one, larger. */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

/**
 * A company logo, which is a small image and nothing else.
 *
 * PDF is missing on purpose: this one gets rendered into an <img> on every
 * dashboard, so it has to be something a browser will actually draw. SVG stays
 * out for the same reason it does above - it would run as script in the origin
 * serving it.
 */
export const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Generous for a logo, and far too small to be anything else. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Keys are built from ids this application generated, never from anything a
 * person typed. Checked anyway: a storage key becomes a filesystem path, and
 * the one thing that must never reach it is a caller's idea of "..".
 */
const KEY = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;

export function assertKey(key: string) {
  if (!KEY.test(key)) throw new Error("Unsafe document key.");
  return key;
}

export const documentKey = (orgId: string, documentId: string) =>
  assertKey(`${orgId}/${documentId}`);

let active: DocumentStorage | undefined;

export function documentStorage(): DocumentStorage {
  if (!active)
    active = backend() === "firebase" ? bucketDocuments() : diskDocuments();
  return active;
}

/** Test seam, so a suite can hold documents in memory. */
export function useDocumentStorage(storage: DocumentStorage | undefined) {
  active = storage;
}
