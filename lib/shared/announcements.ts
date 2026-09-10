/**
 * Announcements: the office telling the building something, before anyone has
 * to ask.
 *
 * The mirror image of a resident notice, and deliberately its own thing. A
 * notice is one resident's business, addressed to the office, and it ends in a
 * decision about them. An announcement is the office's business, addressed to
 * everybody, and nobody answers it - the water is off on Tuesday whether or
 * not you reply. Filing the two in one queue would bury a decision somebody is
 * waiting on under a fortnight of reminders about the AGM.
 *
 * Also not a maintenance report, for the same reason in the other direction: a
 * report is a resident saying something is broken. An announcement may well be
 * about the same broken thing, but it is the answer rather than the question.
 */

/** How loudly the announcement is shown. Not how bad the news is. */
export const ANNOUNCEMENT_LEVELS = ["routine", "important", "urgent"] as const;
export type AnnouncementLevel = (typeof ANNOUNCEMENT_LEVELS)[number];

/** 0 is loudest, so one ORDER BY sorts identically on SQLite and Firestore. */
export const LEVEL_RANK: Record<AnnouncementLevel, number> = {
  urgent: 0,
  important: 1,
  routine: 2,
};

export const LEVEL_LABELS: Record<AnnouncementLevel, string> = {
  urgent: "Urgent",
  important: "Important",
  routine: "Routine",
};

/**
 * Addressed to the person writing it, because the only place it appears is the
 * form they fill in. Three levels rather than ten: a manager choosing from
 * three chooses consistently, and "urgent" keeps meaning urgent.
 */
export const LEVEL_HELP: Record<AnnouncementLevel, string> = {
  urgent:
    "Something is happening now and people must act: the main gate is out, the water is off, evacuate the east wing.",
  important:
    "People need to plan around it: a scheduled outage, a rates increase, the AGM date.",
  routine: "Worth knowing, and nothing changes today.",
};

/** Urgent is the one that raises a banner on a dashboard. */
export const ANNOUNCEMENT_ALERTING: readonly AnnouncementLevel[] = ["urgent"];

export const levelRank = (value: string): number =>
  LEVEL_RANK[value as AnnouncementLevel] ?? LEVEL_RANK.routine;

export const levelAlerting = (value: string) =>
  ANNOUNCEMENT_ALERTING.includes(value as AnnouncementLevel);

/**
 * Who it is addressed to.
 *
 * "The gate motor is being replaced on Thursday, admit the contractor" is an
 * instruction to a guard and noise to everybody else; "the water is off on
 * Tuesday" is for the whole building. Being able to say which is what stops a
 * manager writing only the ones that are safe to send to everyone.
 */
export const AUDIENCES = ["everyone", "residents", "security"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  everyone: "Everyone",
  residents: "Residents",
  security: "Security",
};

export const AUDIENCE_HELP: Record<Audience, string> = {
  everyone: "Residents and security both see it.",
  residents: "Only residents. Security sees nothing.",
  security: "Only the gate. Residents see nothing.",
};

/** True when an announcement for this audience reaches this role. */
export function addresses(audience: string, role: string): boolean {
  if (audience === "everyone") return true;
  if (audience === "residents") return role === "tenant";
  if (audience === "security") return role === "security";
  return false;
}

/**
 * Whether an announcement is still on the dashboards.
 *
 * Worked out from the dates every time rather than stored as a flag. A stored
 * "showing" column is right on the day it is written and wrong the morning
 * after the announcement expires, and nothing would be there to correct it -
 * the same quiet wrongness that made a rent flag without its month useless.
 * The office takes one down explicitly; the clock takes it down on its own.
 *
 * `today` is a SAST date, because that is the day the building is living in.
 */
export function showing(
  announcement: { showUntil: string; archivedAt: string | null },
  today: string,
): boolean {
  if (announcement.archivedAt) return false;
  if (!announcement.showUntil) return true;
  return announcement.showUntil >= today;
}

/** Why an announcement is no longer showing, for the office's own list. */
export function standing(
  announcement: { showUntil: string; archivedAt: string | null },
  today: string,
): "showing" | "expired" | "taken_down" {
  if (announcement.archivedAt) return "taken_down";
  if (announcement.showUntil && announcement.showUntil < today)
    return "expired";
  return "showing";
}

export const STANDING_LABELS: Record<ReturnType<typeof standing>, string> = {
  showing: "Showing",
  expired: "Expired",
  taken_down: "Taken down",
};
