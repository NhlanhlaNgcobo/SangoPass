import type { Role } from "@/types";

/**
 * Temporary stand-in for real authentication.
 * Phase 3 replaces this with Supabase Auth + real sessions.
 */

const STORAGE_KEY = "gatepass_demo_role";

const ROLES: Role[] = ["tenant", "security", "manager", "admin"];

export const ROLE_LABELS: Record<Role, string> = {
  tenant: "Tenant",
  security: "Security",
  manager: "Property Manager",
  admin: "Super Admin",
};

export function getDashboardPath(role: Role): string {
  return `/dashboard/${role}`;
}

export function getDemoRole(): Role | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(STORAGE_KEY);
  return ROLES.includes(value as Role) ? (value as Role) : null;
}

export function setDemoRole(role: Role): void {
  window.localStorage.setItem(STORAGE_KEY, role);
}

export function clearDemoRole(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
