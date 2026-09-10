import {
  ANNOUNCEMENT_LEVELS,
  AUDIENCES,
  levelRank,
  type AnnouncementLevel,
  type Audience,
} from "@/lib/shared/announcements";
import { AppError, choice, text } from "./validation";

export * from "@/lib/shared/announcements";

export interface AnnouncementInput {
  title: string;
  body: string;
  level: AnnouncementLevel;
  levelRank: number;
  audience: Audience;
  /** A SAST date, or empty for an announcement with no end date. */
  showUntil: string;
}

/** How far ahead an end date may be set. A year is already generous. */
const MAX_DAYS_AHEAD = 365;

const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);

/**
 * Reads an announcement off a submitted form.
 *
 * `today` is the SAST date, passed in rather than read here so the caller and
 * the visitor limits agree on which day it is: the building lives in one
 * timezone and the server may not.
 */
export function parseAnnouncement(
  input: Record<string, unknown>,
  today: string,
): AnnouncementInput {
  const level = choice(input.level, ANNOUNCEMENT_LEVELS, "level");
  const audience = choice(input.audience, AUDIENCES, "audience");
  const showUntil =
    typeof input.showUntil === "string" && input.showUntil.trim()
      ? text(input.showUntil, "end date", 10)
      : "";
  if (showUntil) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(showUntil))
      throw new AppError("Enter the end date as YYYY-MM-DD.");
    // An end date already in the past would publish something that is hidden
    // the moment it is saved. Nobody means that, so it is refused rather than
    // accepted into a silence the author would have to go looking for.
    if (showUntil < today)
      throw new AppError(
        "That end date has already passed, so nobody would ever see this. Leave it empty for an announcement with no end date.",
      );
    if (showUntil > addDays(today, MAX_DAYS_AHEAD))
      throw new AppError(
        "Choose an end date within the next year, or leave it empty.",
      );
  }
  return {
    title: text(input.title, "title", 120),
    body: text(input.body, "announcement", 4000),
    level,
    levelRank: levelRank(level),
    audience,
    showUntil,
  };
}
