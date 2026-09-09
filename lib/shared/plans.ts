// Single source of truth for pricing and entitlements.
//
// Enforcement (workspace limits, checkout guards) and presentation (the
// pricing page, the billing screen) both read from here, so a cap can never be
// advertised at one number and enforced at another.
//
// Every price is in cents and VAT-inclusive. South African VAT registration is
// compulsory above R1m of turnover in twelve months, which this reaches at
// around seventy paying organisations, so the published price is the price a
// customer pays and the VAT inside it was never the seller's to keep. Deciding
// this now matters: moving from exclusive to inclusive later is a 15% price
// rise to every existing customer.
export const PLAN_IDS = ["starter", "growth", "premium"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** South African VAT, included in every published price. */
export const VAT_RATE = 0.15;

export interface Plan {
  id: PlanId;
  name: string;
  /** VAT-inclusive, in cents. */
  priceCents: number;
  units: number;
  managers: number;
  /**
   * Gate-code text messages included each month, per unit.
   *
   * SMS is the only cost that scales with how hard a customer uses the
   * product rather than with how many customers there are, so it is the one
   * thing that carries a stated allowance. Three per unit covers ordinary
   * visiting comfortably; the allowance exists so that heavy use is a
   * conversation rather than a silent loss.
   */
  smsPerUnit: number;
  /** Who the tier is for, in one line. */
  audience: string;
  /** What a manager on this tier gets, in the order they would ask. */
  rules: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceCents: 69900,
    units: 25,
    managers: 1,
    smsPerUnit: 3,
    audience:
      "One block, one person running it. A landlord or a small managing agent.",
    rules: [
      "Up to 25 units in use at once",
      "One property manager sign-in",
      "Unlimited properties, residents, security accounts and guest passes",
      "75 gate-code texts a month included",
      "Email support",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceCents: 149900,
    units: 150,
    managers: 5,
    smsPerUnit: 3,
    audience:
      "A managing agent with several buildings, or one estate with a team.",
    rules: [
      "Up to 150 units in use at once",
      "Five property manager sign-ins",
      "Unlimited properties, residents, security accounts and guest passes",
      "450 gate-code texts a month included",
      "Priority email support",
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    priceCents: 289900,
    units: 300,
    managers: 10,
    smsPerUnit: 3,
    audience:
      "A larger estate or a full agency, with an office team and night security.",
    rules: [
      "Up to 300 units in use at once",
      "Ten property manager sign-ins",
      "Unlimited properties, residents, security accounts and guest passes",
      "900 gate-code texts a month included",
      "Priority email and phone support",
    ],
  },
};

export const DEFAULT_PLAN: PlanId = "starter";

export function plan(value: string | null | undefined): Plan {
  return PLANS[(value || "") as PlanId] || PLANS[DEFAULT_PLAN];
}

/** Kept for callers that only need the amount, e.g. the PayFast field set. */
export const PRICES: Record<PlanId, number> = {
  starter: PLANS.starter.priceCents,
  growth: PLANS.growth.priceCents,
  premium: PLANS.premium.priceCents,
};

/** The VAT inside a published price, for an invoice line. */
export const vatPortionCents = (inclusiveCents: number) =>
  Math.round(inclusiveCents - inclusiveCents / (1 + VAT_RATE));

/** What the price would be written as before VAT. */
export const exVatCents = (inclusiveCents: number) =>
  inclusiveCents - vatPortionCents(inclusiveCents);

/**
 * Gate-code texts included for an organisation of this size.
 *
 * Counted against units in use, so a manager who archives a closed wing stops
 * paying for it and stops being allowed for it in the same breath.
 */
export const includedSms = (planId: string, unitsInUse: number) =>
  plan(planId).smsPerUnit * unitsInUse;

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export type PlanTier = PlanId | "portfolio";

export interface PlanCard {
  id: PlanTier;
  name: string;
  priceLabel: string;
  unitCap: number | null;
  seatCap: number | null;
  audience: string;
  rules: string[];
  support: string;
}

const priceLabel = (cents: number) =>
  "R" + new Intl.NumberFormat("en-ZA").format(cents / 100) + "/mo";

/**
 * The published pricing table. Portfolio is quoted directly rather than sold
 * self-serve, so it has no caps and no checkout.
 */
export const PLAN_CARDS: PlanCard[] = [
  ...PLAN_IDS.map((id): PlanCard => ({
    id,
    name: PLANS[id].name,
    priceLabel: priceLabel(PLANS[id].priceCents),
    unitCap: PLANS[id].units,
    seatCap: PLANS[id].managers,
    audience: PLANS[id].audience,
    rules: PLANS[id].rules,
    support: PLANS[id].rules[PLANS[id].rules.length - 1],
  })),
  {
    id: "portfolio",
    name: "Portfolio",
    priceLabel: "Custom",
    unitCap: null,
    seatCap: null,
    audience:
      "More than 300 units, or a portfolio that needs its own terms and an SLA.",
    rules: [
      "Unit capacity to fit the portfolio",
      "As many manager sign-ins as the team needs",
      "Gate-code texts included to suit the volume",
      "Dedicated support with an agreed response time",
    ],
    support: "Dedicated support with an agreed response time",
  },
];

/**
 * The rules that hold on every tier, paid or not. Stated once here so the
 * pricing page and the billing screen cannot describe them differently.
 */
export const UNIVERSAL_RULES = [
  "Every price includes 15% VAT. What is shown is what is paid.",
  "A 14-day Starter trial, with no card and nothing to cancel.",
  "Paid access runs for a month and is renewed by hand. Nothing recurs on a card without you.",
  "Units are counted while they are in use. Archive a unit and it stops counting the same day.",
  "When access lapses, everything already recorded stays readable and the gate keeps working. Only new properties, units, enrolments and guest passes wait for renewal.",
  "Your data is yours: export the whole organisation at any time.",
] as const;
