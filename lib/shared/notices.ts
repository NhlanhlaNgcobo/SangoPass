/**
 * Resident notices: a resident telling the office something is about to
 * change, before it changes.
 *
 * Deliberately separate from a maintenance report. A report says something is
 * broken and someone should come and fix it. A notice says the resident is
 * leaving, or wants a different unit - nothing is broken, and the answer is a
 * decision rather than a repair. Filing them in one queue would bury the
 * notice that needs a month's warning under the taps that need a plumber.
 */

export const REQUEST_KINDS = [
  "move_out",
  "unit_change",
  "property_change",
  "household_pass",
] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_LABELS: Record<RequestKind, string> = {
  move_out: "Moving out",
  unit_change: "Change of unit",
  property_change: "Change of property",
  household_pass: "Pass for a household worker",
};

/**
 * A standing gate pass is the office's to issue, so a resident asks for one
 * here rather than holding a screen of their own. The office is the one that
 * checks the identity document, and a tenancy that could mint a standing key
 * to the gate would not be a tenancy for long.
 */
export const HOUSEHOLD_PASS: RequestKind = "household_pass";

/**
 * The hint under the notice type. Addressed to the resident, because the only
 * place it appears is the form they fill in.
 */
export const REQUEST_DESCRIPTIONS: Record<RequestKind, string> = {
  move_out: "You are giving notice that you intend to leave.",
  unit_change: "You would like a different unit in the same property.",
  property_change: "You would like to move to a different property.",
  household_pass:
    "You are asking the office for a standing gate pass for somebody who works at your home — a domestic worker, a nanny, a carer. Reception issues it once they have seen their identity document.",
};

export const REQUEST_STATUSES = [
  "open",
  "acknowledged",
  "approved",
  "declined",
  "withdrawn",
  "completed",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  open: "Awaiting the office",
  acknowledged: "Seen by the office",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn by resident",
  completed: "Completed",
};

/**
 * The statuses the office may move a notice to. "withdrawn" is missing on
 * purpose: only the resident who raised a notice may take it back, and the
 * office declining something is not the same as the resident never having
 * asked. The record should say which of those happened.
 */
export const OFFICE_STATUSES: RequestStatus[] = [
  "acknowledged",
  "approved",
  "declined",
  "completed",
];

/** A notice still waiting on the office is one it has not answered yet. */
export const stillOpen = (status: string) =>
  status === "open" || status === "acknowledged";
