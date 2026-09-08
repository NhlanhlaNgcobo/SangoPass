import { useMemo, useSyncExternalStore } from "react";
import { SAMPLE_PROPERTIES } from "@/lib/mock/sampleProperties";
import type { UnitSummary } from "@/types";
const key = "sangopass_demo_units";
function snapshot() {
  return typeof window === "undefined"
    ? "{}"
    : window.localStorage.getItem(key) || "{}";
}
function parse(raw: string): Record<string, Partial<UnitSummary>> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function subscribe(callback: () => void) {
  window.addEventListener("sangopass:properties", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("sangopass:properties", callback);
    window.removeEventListener("storage", callback);
  };
}
function properties(raw: string) {
  const changes = parse(raw);
  return SAMPLE_PROPERTIES.map((property) => ({
    ...property,
    units: property.units.map((unit) => ({ ...unit, ...changes[unit.id] })),
  }));
}
export function getDemoProperties() {
  return properties(snapshot());
}
export function updateDemoUnit(id: string, patch: Partial<UnitSummary>) {
  if (
    !SAMPLE_PROPERTIES.some((property) =>
      property.units.some((unit) => unit.id === id),
    )
  )
    throw new Error("Unit not found.");
  const changes = parse(snapshot());
  changes[id] = { ...changes[id], ...patch };
  window.localStorage.setItem(key, JSON.stringify(changes));
  window.dispatchEvent(new Event("sangopass:properties"));
}
export function useDemoProperties() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "{}");
  return useMemo(() => properties(raw), [raw]);
}
