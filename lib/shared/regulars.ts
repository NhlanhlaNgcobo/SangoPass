/**
 * Regular passes: the people who work here.
 *
 * A guest pass answers "may this person come on Saturday". This answers "may
 * this person come every weekday until March", which is a different question
 * and, at the gate, a different piece of paper. The cleaner, the gardening
 * contractor, the roofer on a four-week job and a resident's domestic worker
 * are all standing arrangements the office has agreed to, and putting them
 * through the guest register would have meant a resident booking their helper
 * afresh every Tuesday and burning the unit's two guest slots doing it.
 */

/**
 * Who the person is here for.
 *
 * It decides the shape of the pass as much as it describes it: staff and
 * contractors work for the property and carry no unit, a household worker
 * works at one door and carries it.
 */
export const REGULAR_KINDS = ["staff", "contractor", "household"] as const;
export type RegularKind = (typeof REGULAR_KINDS)[number];

export const KIND_LABELS: Record<RegularKind, string> = {
  staff: "Property staff",
  contractor: "Contractor",
  household: "Household worker",
};

export const KIND_HELP: Record<RegularKind, string> = {
  staff:
    "Employed by the property: cleaners, gardeners, the caretaker. Works across the building.",
  contractor:
    "An outside company on a job here: painters, a roofer, the lift service. Works across the building.",
  household:
    "Works at one unit for the people who live there: a domestic worker, a nanny, a carer.",
};

/** A household worker belongs to a door; the other two belong to the building. */
export const needsUnit = (kind: string) => kind === "household";

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

/**
 * Monday first, because that is how a working week is written down here and
 * how every roster a manager already keeps is laid out.
 */
export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Seven characters of 0 or 1, Monday first. */
export const DAYS_PATTERN = /^[01]{7}$/;

export const EVERY_DAY = "1111111";
export const WEEKDAYS_ONLY = "1111100";

/**
 * Which slot of the days string a SAST date falls in.
 *
 * getUTCDay() counts from Sunday, and this string counts from Monday, so
 * Sunday moves from 0 to 6 and everything else shifts down one. Done here
 * once rather than at each call site, because getting it wrong lets somebody
 * in on the wrong day and nothing would look wrong.
 */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export const allowsDay = (days: string, date: string) =>
  days[weekdayIndex(date)] === "1";

/** "Mon-Fri", "Mon, Wed, Fri", "Every day" - whichever reads shortest. */
export function describeDays(days: string): string {
  if (!DAYS_PATTERN.test(days)) return "";
  if (days === EVERY_DAY) return "Every day";
  if (days === WEEKDAYS_ONLY) return "Mon to Fri";
  const on = [...days]
    .map((flag, index) => (flag === "1" ? index : -1))
    .filter((index) => index >= 0);
  if (!on.length) return "No days";
  // A single unbroken run reads better as a range than as a list.
  const contiguous = on.every(
    (day, index) => index === 0 || day === on[index - 1] + 1,
  );
  if (contiguous && on.length > 2)
    return `${WEEKDAY_SHORT[on[0]]} to ${WEEKDAY_SHORT[on[on.length - 1]]}`;
  return on.map((index) => WEEKDAY_SHORT[index]).join(", ");
}

/* ------------------------------------------------------------------ */
/* Standing                                                            */
/* ------------------------------------------------------------------ */

export interface Standing {
  startDate: string;
  endDate: string;
  revokedAt: string | null;
}

/**
 * Where a pass stands today.
 *
 * Worked out from the dates on every read rather than stored, for the reason
 * an announcement's is: a stored "expired" flag is correct the day it is
 * written and wrong the morning after, and nothing would be there to correct
 * it. Revoking is the one thing the office does explicitly, so that is the
 * one thing recorded.
 */
export function standing(
  pass: Standing,
  today: string,
): "active" | "pending" | "expired" | "revoked" {
  if (pass.revokedAt) return "revoked";
  if (today < pass.startDate) return "pending";
  if (today > pass.endDate) return "expired";
  return "active";
}

export const STANDING_LABELS: Record<ReturnType<typeof standing>, string> = {
  active: "In force",
  pending: "Starts later",
  expired: "Expired",
  revoked: "Revoked",
};

/** True when the pass authorises an arrival at this date and time. */
export function admits(
  pass: Standing & { days: string; fromTime: string; toTime: string },
  date: string,
  time: string,
): boolean {
  return (
    standing(pass, date) === "active" &&
    allowsDay(pass.days, date) &&
    time >= pass.fromTime &&
    time <= pass.toTime
  );
}

/** How far ahead an end date may be set. A year of standing access is plenty. */
export const MAX_REGULAR_DAYS = 366;
