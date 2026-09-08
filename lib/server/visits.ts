import { AppError, choice, text } from "./validation";

/* ------------------------------------------------------------------ */
/* Visit types                                                         */
/* ------------------------------------------------------------------ */

export const VISIT_TYPES = ["daily", "sleepover", "extended_sleepover"] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  daily: "Day visit",
  sleepover: "Sleepover (one night)",
  extended_sleepover: "Extended sleepover",
};

/* ------------------------------------------------------------------ */
/* Visitor identity                                                    */
/* ------------------------------------------------------------------ */

export const ID_TYPES = ["sa_id", "passport", "student_number"] as const;
export type IdType = (typeof ID_TYPES)[number];

export const ID_TYPE_LABELS: Record<IdType, string> = {
  sa_id: "South African ID number",
  passport: "Passport number",
  student_number: "Student number",
};

/**
 * South African ID numbers are YYMMDD SSSS C A Z, where the final digit is a
 * Luhn check over the preceding twelve.
 */
export function validSaId(value: string) {
  if (!/^\d{13}$/.test(value)) return false;
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // A two-digit year is ambiguous, so accept any century but reject an
  // impossible day for the given month using the later, leap-tolerant year.
  const year = 2000 + Number(value.slice(0, 2));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > Math.max(days, 29)) return false;
  let sum = 0;
  for (let index = 0; index < 13; index += 1) {
    const fromRight = 12 - index;
    let digit = Number(value[index]);
    if (fromRight % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export const validPassport = (value: string) =>
  /^[A-Za-z0-9]{6,15}$/.test(value);

export const validStudentNumber = (value: string) =>
  /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$/.test(value);

export interface VisitorIdentity {
  idType: IdType;
  idNumber: string;
}

/**
 * The visitor's own identity document, required on every request.
 *
 * A student residence may accept a student number, because most guests there
 * are students, but a visitor who is not a student still needs an ID or a
 * passport. An apartment always requires an ID or a passport - a student
 * number identifies nobody to the people at the gate.
 */
export function visitorIdentity(
  propertyType: "apartment" | "student_accommodation",
  input: Record<string, unknown>,
): VisitorIdentity {
  const allowed: IdType[] =
    propertyType === "student_accommodation"
      ? ["student_number", "sa_id", "passport"]
      : ["sa_id", "passport"];
  const idType = choice(input.idType, allowed, "visitor identity type");
  const idNumber = text(input.idNumber, "visitor identity number", 80)
    .replace(/[\s-]/g, "")
    .toUpperCase();

  if (idType === "sa_id" && !validSaId(idNumber))
    throw new AppError(
      "Enter a valid 13-digit South African ID number. Check the digits: the last one is a checksum and did not match.",
    );
  if (idType === "passport" && !validPassport(idNumber))
    throw new AppError(
      "Enter a valid passport number: 6 to 15 letters and digits.",
    );
  if (idType === "student_number" && !validStudentNumber(idNumber))
    throw new AppError(
      "Enter a valid student number: 2 to 80 letters, digits, dots, hyphens or underscores.",
    );
  return { idType, idNumber };
}

/** Shows enough to confirm the right person, never the whole document. */
export function maskIdNumber(value: string) {
  if (value.length <= 4) return "••••";
  return "•".repeat(Math.max(4, value.length - 4)) + value.slice(-4);
}

/* ------------------------------------------------------------------ */
/* Visit window                                                        */
/* ------------------------------------------------------------------ */

export const SAST = "+02:00";

export const sastToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
  }).format(new Date());

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);

export const nightsBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
  );

export const startsAt = (visit: { visitDate: string; arrival: string }) =>
  Date.parse(`${visit.visitDate}T${visit.arrival}:00${SAST}`);

export const endsAt = (visit: { endDate: string; departure: string }) =>
  Date.parse(`${visit.endDate}T${visit.departure}:00${SAST}`);

export interface VisitWindow {
  visitType: VisitType;
  visitDate: string;
  endDate: string;
  arrival: string;
  departure: string;
  nights: number;
}

function realDate(value: string) {
  return (
    DATE.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

/**
 * Turns the requested visit into a concrete window.
 *
 * A day visit starts and ends on one date. A sleepover always crosses at least
 * one midnight, so the departure time belongs to a later date and the old
 * "departure must be after arrival" rule does not apply to it.
 */
export function visitWindow(
  input: Record<string, unknown>,
  maxConsecutiveNights: number,
): VisitWindow {
  const visitType = choice(input.visitType, VISIT_TYPES, "visit type");
  const visitDate = text(input.visitDate, "visit date", 10);
  const arrival = text(input.arrival, "arrival time", 5);
  const departure = text(input.departure, "departure time", 5);

  if (!realDate(visitDate))
    throw new AppError("Choose a valid visit date.");
  if (!TIME.test(arrival) || !TIME.test(departure))
    throw new AppError("Choose valid arrival and departure times.");
  if (visitDate < sastToday())
    throw new AppError("Choose a visit date that is not in the past.");

  let nights = 0;
  if (visitType === "sleepover") nights = 1;
  if (visitType === "extended_sleepover") {
    const requested = Number(input.nights);
    if (!Number.isInteger(requested) || requested < 2)
      throw new AppError(
        "An extended sleepover is two or more nights. Choose a single sleepover for one night.",
      );
    nights = requested;
  }
  if (nights > maxConsecutiveNights)
    throw new AppError(
      `This property allows at most ${maxConsecutiveNights} consecutive ${
        maxConsecutiveNights === 1 ? "night" : "nights"
      } per sleepover. Ask your property manager to raise the limit.`,
      409,
    );

  const endDate = addDays(visitDate, nights);
  if (visitType === "daily" && arrival >= departure)
    throw new AppError(
      "A day visit must end after it starts. Choose a sleepover for a guest staying the night.",
    );
  if (Date.parse(`${endDate}T${departure}:00${SAST}`) <= Date.now())
    throw new AppError("Choose a visit window that has not already passed.");

  return { visitType, visitDate, endDate, arrival, departure, nights };
}

/* ------------------------------------------------------------------ */
/* Property limits                                                     */
/* ------------------------------------------------------------------ */

export interface VisitLimits {
  sleepoverNightsPerMonth: number;
  maxConsecutiveNights: number;
  maxActiveGuests: number;
}

export const DEFAULT_LIMITS: VisitLimits = {
  sleepoverNightsPerMonth: 8,
  maxConsecutiveNights: 3,
  maxActiveGuests: 2,
};

export const LIMIT_BOUNDS: Record<keyof VisitLimits, [number, number]> = {
  sleepoverNightsPerMonth: [0, 31],
  maxConsecutiveNights: [0, 31],
  maxActiveGuests: [1, 20],
};

export function limitsOf(property: Partial<VisitLimits>): VisitLimits {
  return {
    sleepoverNightsPerMonth:
      property.sleepoverNightsPerMonth ?? DEFAULT_LIMITS.sleepoverNightsPerMonth,
    maxConsecutiveNights:
      property.maxConsecutiveNights ?? DEFAULT_LIMITS.maxConsecutiveNights,
    maxActiveGuests: property.maxActiveGuests ?? DEFAULT_LIMITS.maxActiveGuests,
  };
}

/** Validates a manager's limit change. */
export function parseLimits(input: Record<string, unknown>): VisitLimits {
  const read = (key: keyof VisitLimits) => {
    const [low, high] = LIMIT_BOUNDS[key];
    const value = Number(input[key]);
    if (!Number.isInteger(value) || value < low || value > high)
      throw new AppError(
        `Enter a whole number between ${low} and ${high} for ${key.replace(/([A-Z])/g, " $1").toLowerCase()}.`,
      );
    return value;
  };
  return {
    sleepoverNightsPerMonth: read("sleepoverNightsPerMonth"),
    maxConsecutiveNights: read("maxConsecutiveNights"),
    maxActiveGuests: read("maxActiveGuests"),
  };
}

/** Calendar month containing the arrival date, in SAST terms. */
export function monthBounds(date: string) {
  const start = date.slice(0, 7) + "-01";
  const [year, month] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start, end: `${date.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}

/**
 * A sleepover is counted against the month it starts in, even when it runs
 * past the month end. One booking is never split across two budgets.
 */
export function nightsUsed(
  visits: { visitType: string; nights: number; status: string }[],
) {
  return visits
    .filter(
      (visit) => visit.visitType !== "daily" && visit.status !== "cancelled",
    )
    .reduce((total, visit) => total + (visit.nights || 0), 0);
}
