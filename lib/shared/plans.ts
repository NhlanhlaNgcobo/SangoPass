// Single source of truth for pricing and entitlements.
//
// Enforcement (workspace limits, checkout guards) and presentation (the
// pricing page, the billing screen) both read from here, so a cap can never be
// advertised at one number and enforced at another.
export const PLAN_IDS = ["starter", "growth", "premium"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface Plan {
  id: PlanId;
  name: string;
  priceCents: number;
  units: number;
  managers: number;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceCents: 49900,
    units: 25,
    managers: 1,
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceCents: 129900,
    units: 150,
    managers: 5,
  },
  premium: {
    id: "premium",
    name: "Premium",
    priceCents: 249900,
    units: 300,
    managers: 10,
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
  support: string;
}

const SUPPORT: Record<PlanId, string> = {
  starter: "Email",
  growth: "Priority email",
  premium: "Priority + phone",
};

const priceLabel = (cents: number) =>
  "R" + new Intl.NumberFormat("en-ZA").format(cents / 100) + "/mo";

/**
 * The published pricing table. Portfolio is quoted directly by the team rather
 * than sold self-serve, so it has no caps and no checkout.
 */
export const PLAN_CARDS: PlanCard[] = [
  ...PLAN_IDS.map(
    (id): PlanCard => ({
      id,
      name: PLANS[id].name,
      priceLabel: priceLabel(PLANS[id].priceCents),
      unitCap: PLANS[id].units,
      seatCap: PLANS[id].managers,
      support: SUPPORT[id],
    }),
  ),
  {
    id: "portfolio",
    name: "Portfolio",
    priceLabel: "Custom",
    unitCap: null,
    seatCap: null,
    support: "Dedicated + SLA",
  },
];
