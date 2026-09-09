import type { BrandTheme } from "@/lib/shared/theme";
import type { LedgerEntry } from "@/lib/shared/money";
export type MemberRole = "manager" | "tenant" | "security";
export interface Account {
  id: string;
  name: string;
  email: string;
}
export interface Membership {
  username: string | null;
  orgId: string;
  orgName: string;
  role: MemberRole;
  propertyId: string | null;
  unitId: string | null;
}
export type VisitType = "daily" | "sleepover" | "extended_sleepover";
export type IdType = "sa_id" | "passport" | "student_number";

/** Visitor limits a property manager sets for each property. */
export interface VisitLimits {
  sleepoverNightsPerMonth: number;
  maxConsecutiveNights: number;
  maxActiveGuests: number;
}

export interface LiveProperty extends VisitLimits {
  loginCode: string;
  id: string;
  orgId: string;
  name: string;
  address: string;
  type: "apartment" | "student_accommodation";
  /**
   * Set once the property is out of use. Archived properties are still sent,
   * so a visitor row or a report can still name the building it happened at;
   * the interface hides them everywhere a manager picks one.
   */
  archivedAt: string | null;
}
export interface LiveUnit {
  id: string;
  propertyId: string;
  label: string;
  rentCents: number;
  rentPaid: number;
  /** The month rentPaid refers to, YYYY-MM; empty when never marked. */
  rentPaidPeriod: string;
  frequency: string;
  residentName: string | null;
  /** Set once the unit is out of use. Still sent, so history reads. */
  archivedAt: string | null;
  /** True when the unit was archived by its property, not on its own. */
  archivedWithProperty: boolean;
}
/**
 * A line in the organisation's own books. Managers only: it never reaches a
 * resident or a guard, because the read model does not send it to them.
 */
export type LiveLedgerEntry = LedgerEntry;

export interface LiveMember {
  username: string | null;
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  propertyId: string | null;
  unitId: string | null;
}
export interface LiveVisitor {
  id: string;
  propertyId: string;
  unitId: string | null;
  hostId: string;
  visitorName: string;
  phone: string;
  /** Present when the visitor was given their own copy of the pass. */
  visitorEmail: string | null;
  idType: IdType;
  /** Masked for transport: only the last four characters are ever sent. */
  idNumber: string;
  reference: string;
  token: string;
  /**
   * The gate code the visitor presents when they have no smartphone. Held by
   * the people who can already open this pass, so security can confirm a
   * recited code offline the same way they confirm a scanned QR. Empty on a
   * pass issued before entry codes existed.
   */
  entryCode: string;
  visitType: VisitType;
  /** Arrival date. A sleepover departs on endDate instead. */
  visitDate: string;
  endDate: string;
  arrival: string;
  departure: string;
  nights: number;
  status: "upcoming" | "checked_in" | "checked_out" | "cancelled";
  createdAt: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  propertyName: string;
  hostName: string;
  unitLabel: string | null;
}
export type Urgency = "low" | "normal" | "urgent" | "emergency";

export interface LiveReport {
  id: string;
  propertyId: string;
  authorId: string;
  authorName: string;
  category: string;
  description: string;
  urgency: Urgency;
  status: string;
  createdAt: string;
  unitLabel: string | null;
}

/** A maintenance contact in the property manager's directory. */
export interface LiveContractor {
  id: string;
  name: string;
  trade: string;
  company: string | null;
  phone: string;
  email: string | null;
  kind: "in_house" | "contractor";
  notes: string | null;
}
export interface LiveInvoice {
  id: string;
  plan: string;
  amountCents: number;
  status: string;
  createdAt: string;
}
export interface WorkspaceState {
  asOf: string;
  user: Account;
  memberships: Membership[];
  membership: Membership;
  organisation: {
    id: string;
    name: string;
    plan: string;
    trialUntil: string;
    paidUntil: string | null;
    active: boolean;
    /**
     * The company's brand colours. Set by a manager and sent to every role, so
     * a tenant's dashboard carries the same colours as their manager's.
     */
    theme: BrandTheme;
  };
  properties: LiveProperty[];
  units: LiveUnit[];
  members: LiveMember[];
  visitors: LiveVisitor[];
  reports: LiveReport[];
  /** Maintenance contacts. Managers only; empty for everyone else. */
  contractors: LiveContractor[];
  /** The organisation's own money. Empty for every role but manager. */
  ledger: LiveLedgerEntry[];
  invoices: LiveInvoice[];
  invitations: {
    id: string;
    email: string;
    role: string;
    expiresAt: string;
    username: string | null;
    emailStatus: string;
    emailSentAt: string | null;
    propertyId: string | null;
    unitId: string | null;
  }[];
  /**
   * What this resident's unit has left this month. Null for managers and
   * security, who do not host guests.
   */
  allowance:
    | (VisitLimits & {
        /** YYYY-MM in SAST. */
        month: string;
        activeGuests: number;
        nightsUsed: number;
      })
    | null;
  billingConfigured: boolean;
  billingMode: "sandbox" | "live";
  emailConfigured: boolean;
  /** Which storage backend answered this request. */
  backend: "sqlite" | "firebase";
}
