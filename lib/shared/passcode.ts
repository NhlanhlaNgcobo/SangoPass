/**
 * The visitor's entry code.
 *
 * Plenty of guests arrive without a smartphone, so every pass carries a short
 * code alongside its QR: eight characters the resident can text, read down a
 * phone line or write on a piece of paper, and the guard can type at the gate.
 *
 * The pass reference (SP-XXXXXXXXXX) cannot do this job. It is printed in
 * every register listing and is the search key managers and security already
 * use, so a visitor reciting it proves nothing. The entry code goes only to
 * the people who hold the pass.
 *
 * The alphabet is Crockford's base32: no I, L, O or U. That matters more here
 * than anywhere else in the product, because this code is transcribed by hand
 * from an SMS to a keypad, out loud, at a gate, at night. A zero cannot be
 * read as an O and a one cannot be read as an I, because neither letter is in
 * the alphabet - and if someone types one anyway, `normaliseEntryCode` folds
 * it back to the digit it was always meant to be. U is left out so a random
 * code cannot spell something a guard would rather not read aloud.
 *
 * Eight characters is 40 bits: far beyond guessing at a gate, and still short
 * enough to dictate in one breath.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Characters in the code, excluding the hyphen that only aids reading. */
export const ENTRY_CODE_LENGTH = 8;

/** The bytes of entropy one code carries. */
export const ENTRY_CODE_BYTES = 5;

/**
 * Turns random bytes into a code. Five bytes is exactly eight characters with
 * nothing left over, so no padding is needed and every code is the same
 * length. The caller supplies the randomness: the server uses node:crypto and
 * the demo a deterministic sequence, so a sample world reads the same on
 * every visit.
 */
export function encodeEntryCode(bytes: Uint8Array | number[]): string {
  let value = 0;
  let bits = 0;
  let code = "";
  for (const byte of bytes) {
    value = (value << 8) | (byte & 255);
    bits += 8;
    while (bits >= 5) {
      code += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) code += ALPHABET[(value << (5 - bits)) & 31];
  return code.slice(0, ENTRY_CODE_LENGTH).padEnd(ENTRY_CODE_LENGTH, "0");
}

/**
 * Groups the code for reading: ABCD-EFGH. Stored and compared without the
 * hyphen, so nothing depends on how it happens to be displayed.
 */
export function formatEntryCode(code: string): string {
  const canonical = normaliseEntryCode(code);
  if (!canonical) return "";
  return `${canonical.slice(0, 4)}-${canonical.slice(4)}`;
}

/**
 * Accepts whatever a guard actually types - lower case, spaces, hyphens, an
 * O for a zero, an I or an l for a one - and returns the one canonical form,
 * or null when it is not a code at all.
 */
export function normaliseEntryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (cleaned.length !== ENTRY_CODE_LENGTH) return null;
  for (const character of cleaned)
    if (!ALPHABET.includes(character)) return null;
  return cleaned;
}

/** True when two codes are the same code, however either was typed. */
export function sameEntryCode(a: unknown, b: unknown): boolean {
  const left = normaliseEntryCode(a);
  const right = normaliseEntryCode(b);
  return left !== null && left === right;
}
