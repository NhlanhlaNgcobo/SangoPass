import { localDate, localTime } from "@/lib/utils/locale";
import type { VisitorInvitation, VisitorInvitationStatus } from "@/types";

/**
 * Temporary stand-in for the real visitor invitations table.
 * Phase 2 replaces this with Supabase so invitations persist for everyone
 * (and are scoped per tenant/property) instead of living in one browser.
 */

const STORAGE_KEY = "gatepass_demo_visitors";

// The demo login has no real per-user identity yet, so every "Tenant" is
// treated as this sample tenant — matches the sample data used elsewhere.
export const DEMO_TENANT = {
  tenantName: "Thabo M.",
  propertyName: "Riverside Student Residence",
  unitNumber: "Room 101",
};

function formatDate(date: Date): string {
  return localDate(date);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

function getSeedInvitations(): VisitorInvitation[] {
  const today = daysAgo(0);
  const yesterday = daysAgo(1);
  const threeDaysAgo = daysAgo(3);

  return [
    {
      id: "seed-v1",
      referenceNumber: "SP-482913",
      secureToken: "seed-token-1",
      visitorName: "Karabo S.",
      visitorPhone: "082 123 4567",
      ...DEMO_TENANT,
      visitDate: today,
      expectedArrival: "14:00",
      expectedDeparture: "18:00",
      status: "upcoming",
      createdAt: `${today}T08:00:00.000Z`,
    },
    {
      id: "seed-v2",
      referenceNumber: "SP-118820",
      secureToken: "seed-token-2",
      visitorName: "Nomvula T.",
      visitorPhone: "083 555 1212",
      ...DEMO_TENANT,
      visitDate: today,
      expectedArrival: "10:00",
      expectedDeparture: "13:00",
      status: "checked_in",
      checkedInAt: `${today}T10:05:00.000Z`,
      createdAt: `${today}T07:30:00.000Z`,
    },
    {
      id: "seed-v3",
      referenceNumber: "SP-903471",
      secureToken: "seed-token-3",
      visitorName: "Sipho D.",
      visitorPhone: "084 222 9911",
      ...DEMO_TENANT,
      visitDate: yesterday,
      expectedArrival: "16:00",
      expectedDeparture: "19:00",
      status: "checked_out",
      checkedInAt: `${yesterday}T16:10:00.000Z`,
      checkedOutAt: `${yesterday}T18:45:00.000Z`,
      createdAt: `${yesterday}T08:00:00.000Z`,
    },
    {
      id: "seed-v4",
      referenceNumber: "SP-660214",
      secureToken: "seed-token-4",
      visitorName: "Ayanda P.",
      visitorPhone: "071 888 3344",
      ...DEMO_TENANT,
      visitDate: threeDaysAgo,
      expectedArrival: "12:00",
      expectedDeparture: "15:00",
      status: "cancelled",
      createdAt: `${threeDaysAgo}T09:00:00.000Z`,
    },
  ];
}

function readStore(): VisitorInvitation[] {
  if (typeof window === "undefined") return getSeedInvitations();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return getSeedInvitations();
  try {
    return JSON.parse(raw) as VisitorInvitation[];
  } catch {
    return getSeedInvitations();
  }
}

function writeStore(invitations: VisitorInvitation[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(invitations));
}

export function getInvitations(): VisitorInvitation[] {
  return readStore();
}

function generateReferenceNumber(): string {
  const references = new Set(
    readStore().map((invitation) => invitation.referenceNumber),
  );
  let reference: string;
  do {
    reference = `SP-${Math.floor(100000 + Math.random() * 900000)}`;
  } while (references.has(reference));
  return reference;
}

function generateSecureToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function addInvitation(input: {
  visitorName: string;
  visitorPhone: string;
  visitorEmail?: string;
  vehicleRegistration?: string;
  reasonForVisit?: string;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  visitDate: string;
  expectedArrival: string;
  expectedDeparture: string;
}): VisitorInvitation {
  if (!input.visitorName.trim() || !input.visitorPhone.trim())
    throw new Error("Enter the visitor’s name and phone number.");
  if (!/^\+?[\d\s()-]{7,20}$/.test(input.visitorPhone))
    throw new Error(
      "Enter a valid phone number, for example 082 123 4567 or +27 82 123 4567.",
    );
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.visitDate) ||
    input.visitDate < localDate() ||
    Number.isNaN(Date.parse(`${input.visitDate}T00:00:00Z`)) ||
    new Date(`${input.visitDate}T00:00:00Z`).toISOString().slice(0, 10) !==
      input.visitDate
  )
    throw new Error("Choose today or a future visit date.");
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.expectedArrival) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.expectedDeparture) ||
    input.expectedDeparture <= input.expectedArrival
  )
    throw new Error("Departure must be later than arrival on the same day.");
  const newInvitation: VisitorInvitation = {
    id: `visitor-${crypto.randomUUID()}`,
    referenceNumber: generateReferenceNumber(),
    secureToken: generateSecureToken(),
    status: "upcoming",
    createdAt: new Date().toISOString(),
    ...input,
  };
  writeStore([newInvitation, ...readStore()]);
  return newInvitation;
}

export function cancelInvitation(id: string): VisitorInvitation[] {
  const invitations = readStore().map((invitation) =>
    invitation.id === id && invitation.status === "upcoming"
      ? { ...invitation, status: "cancelled" as VisitorInvitationStatus }
      : invitation,
  );
  writeStore(invitations);
  return invitations;
}

export function checkInInvitation(id: string): VisitorInvitation[] {
  const invitations = readStore().map((invitation) =>
    invitation.id === id && canCheckIn(invitation)
      ? {
          ...invitation,
          status: "checked_in" as VisitorInvitationStatus,
          checkedInAt: new Date().toISOString(),
        }
      : invitation,
  );
  writeStore(invitations);
  return invitations;
}

export function checkOutInvitation(id: string): VisitorInvitation[] {
  const invitations = readStore().map((invitation) =>
    invitation.id === id && invitation.status === "checked_in"
      ? {
          ...invitation,
          status: "checked_out" as VisitorInvitationStatus,
          checkedOutAt: new Date().toISOString(),
        }
      : invitation,
  );
  writeStore(invitations);
  return invitations;
}

export function getDisplayStatus(
  invitation: VisitorInvitation,
): VisitorInvitationStatus {
  if (
    invitation.status === "upcoming" &&
    (invitation.visitDate < localDate() ||
      (invitation.visitDate === localDate() &&
        invitation.expectedDeparture < localTime()))
  ) {
    return "expired";
  }
  return invitation.status;
}

export function canCheckIn(invitation: VisitorInvitation): boolean {
  return (
    getDisplayStatus(invitation) === "upcoming" &&
    invitation.visitDate === localDate() &&
    invitation.expectedArrival <= localTime() &&
    invitation.expectedDeparture >= localTime()
  );
}

export function searchInvitations(query: string): VisitorInvitation[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const qDigits = q.replace(/\s+/g, "");
  return readStore().filter(
    (invitation) =>
      invitation.visitorName.toLowerCase().includes(q) ||
      invitation.visitorPhone.replace(/\s+/g, "").includes(qDigits) ||
      invitation.referenceNumber.toLowerCase().includes(q),
  );
}
