import type { BrandTheme } from "@/lib/shared/theme";
import type { LedgerEntry } from "@/lib/shared/money";
/**
 * "reception" is the front desk: everything a manager does to a building, its
 * people and its paperwork, for the one property they sit in, and nothing at
 * all to do with money - no books, no rent receipts, no subscription.
 */
export type MemberRole = "manager" | "reception" | "tenant" | "security";
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
/** One stay in one unit. Ended stays are kept, which is the whole point. */
export interface LiveTenancy {
  id: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitLabel: string;
  residentId: string;
  residentName: string;
  residentEmail: string;
  username: string | null;
  startedAt: string;
  /** Null while they still live there. */
  endedAt: string | null;
  endedReason: string;
  current: boolean;
}

export type DocumentKind =
  "lease" | "notice" | "identity" | "proof_of_payment" | "inspection" | "other";

/**
 * A filed document. The bytes are never here - only what it is and where to
 * ask for it, which is /api/documents/[id].
 */
export interface LiveDocument {
  id: string;
  propertyId: string;
  propertyName: string;
  unitId: string | null;
  unitLabel: string | null;
  tenancyId: string | null;
  residentId: string | null;
  residentName: string;
  title: string;
  kind: DocumentKind;
  filename: string;
  mime: string;
  bytes: number;
  uploadedAt: string;
  uploadedByName: string;
}

export type RequestKind = "move_out" | "unit_change" | "property_change";
export type RequestStatus =
  "open" | "acknowledged" | "approved" | "declined" | "withdrawn" | "completed";

/** A resident telling the office something is about to change. */
export interface LiveRequest {
  id: string;
  propertyId: string;
  propertyName: string;
  unitId: string | null;
  unitLabel: string | null;
  residentId: string;
  residentName: string;
  kind: RequestKind;
  effectiveDate: string;
  details: string;
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedByName: string;
  decisionNote: string;
}

export type AnnouncementLevel = "routine" | "important" | "urgent";
export type Audience = "everyone" | "residents" | "security";

/**
 * The office telling the building something. The opposite direction to a
 * LiveRequest above: nobody answers an announcement.
 */
export interface LiveAnnouncement {
  id: string;
  /** Null when it is addressed to the whole organisation. */
  propertyId: string | null;
  /** Empty on an organisation-wide announcement. */
  propertyName: string;
  title: string;
  body: string;
  level: AnnouncementLevel;
  audience: Audience;
  /** Last SAST date it shows, or empty for no end date. */
  showUntil: string;
  publishedAt: string;
  /** Set once it has been corrected, so a reader is told it changed. */
  editedAt: string | null;
  authorName: string;
  /** Set when the office took it down early. */
  archivedAt: string | null;
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
    /**
     * When the company logo was last uploaded, or empty when there is none.
     *
     * The bytes are never here: the dashboard asks /api/branding/logo for them
     * and this stamp goes in the query string, so replacing a logo replaces
     * the URL too and no member is left looking at the old one from cache.
     */
    logoUpdatedAt: string;
  };
  properties: LiveProperty[];
  units: LiveUnit[];
  members: LiveMember[];
  visitors: LiveVisitor[];
  reports: LiveReport[];
  /** Maintenance contacts. The office only; empty for everyone else. */
  contractors: LiveContractor[];
  /** Who lived where, current stays and finished ones. Empty for security. */
  tenancies: LiveTenancy[];
  /** The tenant filing cabinet. Empty for security. */
  documents: LiveDocument[];
  /** Resident notices: moving out, changing unit, changing property. */
  requests: LiveRequest[];
  /**
   * What the office has told this reader's building. A resident and a guard
   * receive only the ones still showing and addressed to them; the office
   * receives its own, expired and taken-down ones included, because that list
   * is the record of what it has said.
   */
  announcements: LiveAnnouncement[];
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
