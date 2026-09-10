/**
 * Documents on a persistent disk, beside the SQLite database.
 *
 * Files are written under one directory per organisation, so a tenant export
 * or an organisation's erasure is a single subtree, and one customer's papers
 * are never interleaved with another's on disk.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { ephemeralHost } from "../config";
import { assertKey, type DocumentStorage } from "./index";

function root() {
  return (
    process.env.SANGOPASS_DOCUMENT_PATH || resolve("data/documents")
  );
}

/**
 * Resolves a key under the document root and proves it stayed there.
 *
 * assertKey has already rejected anything that is not two plain id segments,
 * so this cannot currently fail. It is here because the cost of being wrong
 * about that - a key that escapes the root writes over an arbitrary file - is
 * far higher than the cost of checking twice.
 */
function pathFor(key: string) {
  const base = root();
  const full = resolve(join(base, assertKey(key)));
  if (full !== resolve(base) && !full.startsWith(resolve(base) + sep))
    throw new Error("Unsafe document key.");
  return full;
}

export function diskDocuments(): DocumentStorage {
  return {
    name: "disk",
    async put(key, data) {
      if (ephemeralHost())
        throw new Error(
          `Documents need a persistent disk, but this looks like ${ephemeralHost()}, where each invocation gets its own throwaway filesystem: an uploaded lease would vanish between requests. Deploy to a host with a persistent volume, or set SANGOPASS_DOCUMENT_PATH to one.`,
        );
      const file = pathFor(key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, data);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(pathFor(key)));
      } catch (error) {
        // A record whose file is missing reads as absent rather than throwing:
        // the caller turns that into an honest 404, which is what it is.
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return undefined;
        throw error;
      }
    },
    async remove(key) {
      await rm(pathFor(key), { force: true });
    },
  };
}
