/**
 * Phone numbers, in the shape an SMS gateway will accept.
 *
 * Residents type a number the way they say it: 082 123 4567, 0821234567,
 * (082) 123-4567, +27 82 123 4567. Every one of those is the same person, and
 * every SMS provider wants E.164 - a leading plus, country code, no spaces.
 *
 * This does not replace the visitor form's own validation, which stays
 * deliberately permissive so a foreign guest's number is never rejected at the
 * gate for looking unfamiliar. It answers a narrower question: can this number
 * be texted, and if so, at what address.
 */

/** South Africa. The product is South African; a plain 0 prefix means +27. */
const DEFAULT_DIALLING_CODE = "27";

/** A national number in South Africa is nine digits after the leading zero. */
const ZA_NATIONAL_LENGTH = 9;

/**
 * Returns the number in E.164, or null when it cannot be one.
 *
 * A number already written internationally is trusted as it stands, so a
 * visitor from anywhere still gets their code. A local number is expanded
 * against South Africa, because that is where the resident typing it is.
 */
export function toE164(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Everything a person might use as a separator, and the 00 international
  // prefix dialled from a landline.
  const digits = trimmed.replace(/[\s()\-.]/g, "");
  const international = digits.startsWith("+")
    ? digits.slice(1)
    : digits.startsWith("00")
      ? digits.slice(2)
      : "";

  if (international) return e164(international);

  if (!/^\d+$/.test(digits)) return null;

  // 0821234567 - the way almost every South African writes their own number.
  if (digits.startsWith("0") && digits.length === ZA_NATIONAL_LENGTH + 1)
    return e164(DEFAULT_DIALLING_CODE + digits.slice(1));

  // 27821234567 - the country code without its plus.
  if (
    digits.startsWith(DEFAULT_DIALLING_CODE) &&
    digits.length === DEFAULT_DIALLING_CODE.length + ZA_NATIONAL_LENGTH
  )
    return e164(digits);

  // A bare 821234567, which is what a form autofill sometimes leaves behind.
  if (digits.length === ZA_NATIONAL_LENGTH && !digits.startsWith("0"))
    return e164(DEFAULT_DIALLING_CODE + digits);

  return null;
}

/** E.164 allows at most fifteen digits, and never a leading zero. */
function e164(digits: string): string | null {
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
}

/**
 * The number as it should be shown back to a person: +27 82 123 4567. Falls
 * back to whatever was stored when it is not a number this understands, so a
 * record entered before any of this still displays.
 */
export function displayPhone(value: string): string {
  const e = toE164(value);
  if (!e || !e.startsWith(`+${DEFAULT_DIALLING_CODE}`)) return value;
  const national = e.slice(1 + DEFAULT_DIALLING_CODE.length);
  return `+${DEFAULT_DIALLING_CODE} ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
}
