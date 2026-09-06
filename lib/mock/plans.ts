import type { PlanTier } from "@/types";

export interface PlanDetails {
  id: PlanTier;
  name: string;
  priceLabel: string;
  unitCap: number | null;
  seatCap: number | null;
  support: string;
}

/**
 * Matches the pricing strategy: Starter/Growth/Premium published,
 * Portfolio quoted directly by the team rather than self-serve.
 */
export const PLANS: PlanDetails[] = [
  {
    id: "starter",
    name: "Starter",
    priceLabel: "R499/mo",
    unitCap: 25,
    seatCap: 1,
    support: "Email",
  },
  {
    id: "growth",
    name: "Growth",
    priceLabel: "R1,299/mo",
    unitCap: 150,
    seatCap: 5,
    support: "Priority email",
  },
  {
    id: "premium",
    name: "Premium",
    priceLabel: "R2,499/mo",
    unitCap: 300,
    seatCap: 10,
    support: "Priority + phone",
  },
  {
    id: "portfolio",
    name: "Portfolio",
    priceLabel: "Custom",
    unitCap: null,
    seatCap: null,
    support: "Dedicated + SLA",
  },
];

export function getPlan(id: PlanTier): PlanDetails {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0];
}
