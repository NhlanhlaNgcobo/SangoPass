import type { TenantSummary } from "@/types";
import { SAMPLE_TENANTS } from "@/lib/mock/sampleTenantsStaff";
import { getDemoProperties, updateDemoUnit } from "@/lib/mock/propertiesStore";

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
  const property = getDemoProperties().find(
    (item) => item.name === input.propertyName,
  );
  const unit = property?.units.find(
    (item) => item.unitNumber === input.unitNumber,
  );
  if (!property || !unit) throw new Error("Choose an existing vacant unit.");
  if (
    unit.status === "occupied" ||
    readStore().some(
      (item) =>
        item.propertyName === input.propertyName &&
        item.unitNumber === input.unitNumber,
    )
  )
    throw new Error("This unit already has a resident. Choose a vacant unit.");
  if (!input.name.trim()) throw new Error("Enter the resident’s name.");
  if (
    property.propertyType === "student_accommodation" &&
    !input.studentNumber?.trim()
  )
    throw new Error("Enter the student number for this residence.");
  const newTenant: TenantSummary = {
    id: `tenant-${crypto.randomUUID()}`,
    ...input,
  };
  writeStore([newTenant, ...readStore()]);
  updateDemoUnit(unit.id, { status: "occupied", tenantName: input.name });
  return newTenant;
}
