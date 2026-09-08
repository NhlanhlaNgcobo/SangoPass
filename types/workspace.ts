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
}
export interface LiveUnit {
  id: string;
  propertyId: string;
  label: string;
  rentCents: number;
  rentPaid: number;
  frequency: string;
  residentName: string | null;
}
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
  };
  properties: LiveProperty[];
  units: LiveUnit[];
  members: LiveMember[];
  visitors: LiveVisitor[];
  reports: LiveReport[];
  /** Maintenance contacts. Managers only; empty for everyone else. */
  contractors: LiveContractor[];
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
