// Shared by the server (validation, ranking) and the workspace UI (labels,
// pickers). Kept out of lib/server so the browser bundle never reaches into a
// server-only module for a list of trades.
export const URGENCIES = ["low", "normal", "urgent", "emergency"] as const;
export type Urgency = (typeof URGENCIES)[number];

/** Highest first: this is the order a manager's queue is worked in. */
export const URGENCY_RANK: Record<Urgency, number> = {
  emergency: 0,
  urgent: 1,
  normal: 2,
  low: 3,
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  emergency: "Emergency",
  urgent: "Urgent",
  normal: "Normal",
  low: "Low",
};

export const URGENCY_HELP: Record<Urgency, string> = {
  emergency:
    "Someone is unsafe, or the building is: burst pipe, no power, a gate stuck open.",
  urgent: "Needs attention within a day: no hot water, a broken lock, a leak.",
  normal: "Needs fixing, but it can be scheduled.",
  low: "Cosmetic or minor. Whenever there is time.",
};

/** Emergency and urgent are what raise an alert on the manager's dashboard. */
export const ALERTING: readonly Urgency[] = ["emergency", "urgent"];

export const rank = (value: string): number =>
  URGENCY_RANK[value as Urgency] ?? URGENCY_RANK.normal;

export const alerting = (value: string) =>
  ALERTING.includes(value as Urgency);

export const TRADES = [
  "Plumbing",
  "Electrical",
  "Locksmith",
  "Appliances",
  "Gate & access",
  "Gardening",
  "Cleaning",
  "Pest control",
  "Painting",
  "Building & general",
  "Security systems",
  "Other",
] as const;

export const CONTRACTOR_KINDS = ["in_house", "contractor"] as const;
export type ContractorKind = (typeof CONTRACTOR_KINDS)[number];
