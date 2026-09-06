import type { StaffSummary, TenantSummary } from "@/types";

/**
 * Sample data for previewing the Tenants & Staff screen.
 * Phase 2 replaces this with real Supabase queries — nothing here is persisted.
 */
export const SAMPLE_TENANTS: TenantSummary[] = [
  {
    id: "t-1",
    name: "Thabo M.",
    propertyName: "Riverside Student Residence",
    unitNumber: "Room 101",
  },
  {
    id: "t-2",
    name: "Lindiwe K.",
    propertyName: "Riverside Student Residence",
    unitNumber: "Room 103",
  },
  {
    id: "t-3",
    name: "Sipho N.",
    propertyName: "Riverside Student Residence",
    unitNumber: "Room 104",
  },
  {
    id: "t-4",
    name: "Jane D.",
    propertyName: "Oakwood Apartments",
    unitNumber: "Unit 4B",
  },
  {
    id: "t-5",
    name: "Mark R.",
    propertyName: "Oakwood Apartments",
    unitNumber: "Unit 5A",
  },
];

export const SAMPLE_STAFF: StaffSummary[] = [
  {
    id: "s-1",
    name: "Grace P.",
    roleLabel: "Security",
    assignedPropertyName: "Riverside Student Residence",
  },
  {
    id: "s-2",
    name: "Sam K.",
    roleLabel: "Security",
    assignedPropertyName: "Oakwood Apartments",
  },
];
