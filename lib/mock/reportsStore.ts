import type { ReportCategory, ReportEntry, ReportStatus, Role } from "@/types";

/**
 * Temporary stand-in for a real reports table.
 * Phase 2 replaces this with Supabase so reports persist for everyone, not just this browser.
 */

const STORAGE_KEY = "gatepass_demo_reports";

const SEED_REPORTS: ReportEntry[] = [
  {
    id: "seed-1",
    category: "maintenance",
    description: "Leaking tap in the shared bathroom.",
    submittedBy: "Thabo M.",
    role: "tenant",
    location: "Room 101, Riverside Student Residence",
    status: "open",
    createdAt: "2026-09-01T09:00:00.000Z",
  },
  {
    id: "seed-2",
    category: "maintenance",
    description: "Elevator stuck between floors 2 and 3.",
    submittedBy: "Mark R.",
    role: "tenant",
    location: "Oakwood Apartments",
    status: "in_progress",
    createdAt: "2026-09-02T14:30:00.000Z",
  },
  {
    id: "seed-3",
    category: "suggestion",
    description: "Could we add more visitor parking bays near the entrance?",
    submittedBy: "Jane D.",
    role: "tenant",
    location: "Oakwood Apartments",
    status: "open",
    createdAt: "2026-09-03T11:15:00.000Z",
  },
  {
    id: "seed-4",
    category: "complaint",
    description: "Noise complaint about a late-night gathering.",
    submittedBy: "Grace P.",
    role: "security",
    location: "Riverside Student Residence",
    status: "resolved",
    createdAt: "2026-08-28T22:00:00.000Z",
  },
];

function readStore(): ReportEntry[] {
  if (typeof window === "undefined") return SEED_REPORTS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return SEED_REPORTS;
  try {
    return JSON.parse(raw) as ReportEntry[];
  } catch {
    return SEED_REPORTS;
  }
}

function writeStore(reports: ReportEntry[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

export function getReports(): ReportEntry[] {
  return readStore();
}

export function addReport(input: {
  category: ReportCategory;
  description: string;
  submittedBy: string;
  role: Role;
  location?: string;
}): ReportEntry {
  const newReport: ReportEntry = {
    id: `report-${Date.now()}`,
    status: "open",
    createdAt: new Date().toISOString(),
    ...input,
  };
  writeStore([newReport, ...readStore()]);
  return newReport;
}

export function updateReportStatus(
  id: string,
  status: ReportStatus,
): ReportEntry[] {
  const reports = readStore().map((report) =>
    report.id === id ? { ...report, status } : report,
  );
  writeStore(reports);
  return reports;
}
