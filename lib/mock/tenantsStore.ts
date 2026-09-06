import type { TenantSummary } from "@/types";
import { SAMPLE_TENANTS } from "@/lib/mock/sampleTenantsStaff";

/**
 * Temporary stand-in for the real tenants table.
 * Phase 2 replaces this with Supabase so tenants persist for everyone,
 * not just this browser.
 */

const STORAGE_KEY = "gatepass_demo_tenants";

function readStore(): TenantSummary[] {
  if (typeof window === "undefined") return SAMPLE_TENANTS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return SAMPLE_TENANTS;
  try {
    return JSON.parse(raw) as TenantSummary[];
  } catch {
    return SAMPLE_TENANTS;
  }
}

function writeStore(tenants: TenantSummary[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tenants));
}

export function getTenants(): TenantSummary[] {
  return readStore();
}

export function addTenant(input: {
  name: string;
  propertyName: string;
  unitNumber: string;
  studentNumber?: string;
}): TenantSummary {
  const newTenant: TenantSummary = {
    id: `tenant-${Date.now()}`,
    ...input,
  };
  writeStore([newTenant, ...readStore()]);
  return newTenant;
}
