import { useSyncExternalStore } from "react";
import type { PlanTier } from "@/types";
import { PLANS } from "@/lib/mock/plans";
import { DEMO_ORGANIZATION } from "@/lib/mock/sampleOrganizations";
const key = "sangopass_demo_plan_" + DEMO_ORGANIZATION.id;
export function getDemoPlan(): PlanTier {
  if (typeof window === "undefined") return DEMO_ORGANIZATION.plan;
  const value = window.localStorage.getItem(key);
  return PLANS.some((plan) => plan.id === value)
    ? (value as PlanTier)
    : DEMO_ORGANIZATION.plan;
}
export function changeDemoPlan(plan: PlanTier) {
  if (!PLANS.some((item) => item.id === plan))
    throw new Error("Choose a valid plan.");
  window.localStorage.setItem(key, plan);
  window.dispatchEvent(new Event("sangopass:plan"));
}
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("sangopass:plan", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("sangopass:plan", callback);
  };
}
export function useDemoPlan() {
  return useSyncExternalStore(
    subscribe,
    getDemoPlan,
    () => DEMO_ORGANIZATION.plan,
  );
}
