import type { Organization } from "@/types";

/**
 * Sample data for previewing the Super Admin screens.
 * Phase 2 replaces this with real Supabase queries — nothing here is persisted.
 */
export const SAMPLE_ORGANIZATIONS: Organization[] = [
  {
    id: "riverside-properties-ltd",
    name: "Riverside Properties Ltd",
    createdAt: "2025-11-03T09:00:00.000Z",
    plan: "growth",
  },
  {
    id: "oakwood-living-pty-ltd",
    name: "Oakwood Living (Pty) Ltd",
    createdAt: "2026-01-20T09:00:00.000Z",
    plan: "starter",
  },
];

// The demo login has no real per-user organization yet, so the Manager
// role is treated as belonging to this organization throughout the app.
export const DEMO_ORGANIZATION = SAMPLE_ORGANIZATIONS[0];
