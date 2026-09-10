import {
  DAYS_PATTERN,
  MAX_REGULAR_DAYS,
  REGULAR_KINDS,
  needsUnit,
  type RegularKind,
} from "@/lib/shared/regulars";
import { AppError, choice, text } from "./validation";
import { addDays, sastToday } from "./visits";

export * from "@/lib/shared/regulars";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface RegularInput {
  personName: string;
  occupation: string;
  employer: string;
  phone: string;
  kind: RegularKind;
  days: string;
  fromTime: string;
  toTime: string;
  startDate: string;
  endDate: string;
}

/**
 * Reads a standing authorisation off the office's form.
 *
 * `today` is passed in rather than read here so that this and the visitor
 * limits agree on which day it is: the building lives in SAST and the server
 * may not.
 */
export function parseRegular(
  input: Record<string, unknown>,
  today: string = sastToday(),
): RegularInput {
  const kind = choice(input.kind, REGULAR_KINDS, "type of worker");

  const days = text(input.days, "days", 7);
  if (!DAYS_PATTERN.test(days))
    throw new AppError("Choose which days of the week they may come.");
  if (!days.includes("1"))
    throw new AppError(
      "Choose at least one day. A pass good on no day admits nobody.",
    );

  const fromTime = text(input.fromTime, "start of the daily window", 5);
  const toTime = text(input.toTime, "end of the daily window", 5);
  if (!TIME.test(fromTime) || !TIME.test(toTime))
    throw new AppError("Enter the hours they may arrive as HH:MM.");
  if (fromTime >= toTime)
    throw new AppError(
      "The daily window has to end after it starts. A shift running past midnight needs two passes.",
    );

  const startDate = text(input.startDate, "start date", 10);
  const endDate = text(input.endDate, "end date", 10);
  if (!DATE.test(startDate) || !DATE.test(endDate))
    throw new AppError("Enter both dates as YYYY-MM-DD.");
  if (endDate < startDate)
    throw new AppError("The pass has to end on or after the day it starts.");
  // An end date already gone would issue something that admits nobody, and a
  // start date long past would backdate an authorisation nobody granted then.
  if (endDate < today)
    throw new AppError(
      "That end date has already passed, so this pass would admit nobody.",
    );
  if (endDate > addDays(today, MAX_REGULAR_DAYS))
    throw new AppError(
      "A regular pass runs for at most a year. Renew it when it ends, so somebody has to look at it again.",
    );

  const phone = text(input.phone, "phone number", 30);
  if (!/^\+?[\d ()-]{9,25}$/.test(phone))
    throw new AppError("Enter a valid phone number.");

  return {
    personName: text(input.personName, "name", 100),
    occupation: text(input.occupation, "what they do here", 60),
    employer:
      typeof input.employer === "string" && input.employer.trim()
        ? text(input.employer, "employer", 120)
        : "",
    phone,
    kind,
    days,
    fromTime,
    toTime,
    startDate,
    endDate,
  };
}

/** The SAST wall-clock time, HH:MM, which is what a daily window is in. */
export const sastTime = () =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

export { needsUnit };
