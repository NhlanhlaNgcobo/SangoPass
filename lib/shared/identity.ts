/**
 * The visitor's identity document, and how little of it travels.
 *
 * A full ID number is never sent to a browser: the workspace and the guest
 * pass both receive a masked value, so what the gate can compare against is
 * only the tail the mask leaves readable. The mask and the matcher live in
 * the same file for that reason - widen one without the other and searching
 * by ID silently stops finding anyone.
 */

/** Characters the mask leaves readable, and so the most a search can match. */
export const ID_VISIBLE = 4;

/**
 * The stored form: what an identity number is reduced to before it is written
 * down, and what anyone typing one has to be reduced to before comparing.
 */
export const normaliseIdNumber = (value: string) =>
  value.replace(/[\s-]/g, "").toUpperCase();

/** Shows enough to confirm the right person, never the whole document. */
export function maskIdNumber(value: string) {
  if (value.length <= ID_VISIBLE) return "•".repeat(ID_VISIBLE);
  return (
    "•".repeat(Math.max(ID_VISIBLE, value.length - ID_VISIBLE)) +
    value.slice(-ID_VISIBLE)
  );
}

/**
 * True when what someone typed identifies this masked document.
 *
 * A guard holding the visitor's card types the whole number; a manager on the
 * phone may have been read only the last few digits. Both end in the same
 * characters, and that ending is all the mask leaves to compare, so the full
 * number and its tail match equally well without the real one ever reaching
 * the browser.
 *
 * Four characters narrow a register rather than settle it: the match returns a
 * list, and the name, host and unit beside each row are what pick the person.
 * Anything shorter is not a search, so it matches nothing.
 */
export function matchesMaskedId(masked: string, query: string): boolean {
  const visible = normaliseIdNumber(masked.replace(/•/g, ""));
  const typed = normaliseIdNumber(query);
  if (visible.length < ID_VISIBLE || typed.length < ID_VISIBLE) return false;
  return typed.slice(-ID_VISIBLE) === visible.slice(-ID_VISIBLE);
}
