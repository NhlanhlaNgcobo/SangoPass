// A small document-store contract shared by the SQLite and Firestore backends.
//
// Deliberately collection-shaped rather than SQL-shaped: Firestore has no
// joins, so every record carries the handful of display fields it needs and
// both backends answer identical queries. That keeps one copy of the business
// rules in the service layer instead of one per database.
export type Scalar = string | number | boolean | null;

export type Operator = "==" | "!=" | "<" | "<=" | ">" | ">=";

export type Where = [field: string, op: Operator, value: Scalar];

export interface Query {
  where?: Where[];
  orderBy?: { field: string; direction?: "asc" | "desc" }[];
  limit?: number;
}

export const COLLECTIONS = [
  "users",
  "organisations",
  "memberships",
  "properties",
  "units",
  "invitations",
  "visitors",
  "reports",
  "invoices",
  "audit",
  "contractors",
  "sessions",
  "resetTokens",
  "rateLimits",
  "reservations",
] as const;

export type Collection = (typeof COLLECTIONS)[number];

/** Raised when a uniqueness reservation or a create() hits an existing key. */
export class ConflictError extends Error {
  constructor(message = "That record already exists.") {
    super(message);
    this.name = "ConflictError";
  }
}

export interface Reader {
  get<T>(collection: Collection, id: string): Promise<T | undefined>;
  find<T>(collection: Collection, query?: Query): Promise<T[]>;
  first<T>(collection: Collection, query?: Query): Promise<T | undefined>;
  count(collection: Collection, query?: Query): Promise<number>;
}

/**
 * Inside a transaction every read must happen before the first write: that is
 * a hard Firestore rule, and the SQLite backend follows it so the two cannot
 * diverge in production.
 */
export interface Tx extends Reader {
  create(collection: Collection, id: string, data: Record<string, unknown>): void;
  set(collection: Collection, id: string, data: Record<string, unknown>): void;
  update(collection: Collection, id: string, patch: Record<string, unknown>): void;
  remove(collection: Collection, id: string): void;
  /** Claim a uniqueness key; throws ConflictError when already held. */
  reserve(key: string, owner: string): void;
  release(key: string): void;
}

export interface Store {
  readonly name: "sqlite" | "firebase";
  get<T>(collection: Collection, id: string): Promise<T | undefined>;
  find<T>(collection: Collection, query?: Query): Promise<T[]>;
  first<T>(collection: Collection, query?: Query): Promise<T | undefined>;
  count(collection: Collection, query?: Query): Promise<number>;
  tx<T>(work: (t: Tx) => Promise<T>): Promise<T>;
  /** Bulk maintenance paths that are not part of a business transaction. */
  updateWhere(
    collection: Collection,
    query: Query,
    patch: Record<string, unknown>,
  ): Promise<number>;
  removeWhere(collection: Collection, query: Query): Promise<number>;
  close(): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Records                                                             */
/* ------------------------------------------------------------------ */

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  /** Empty when Firebase Authentication owns the credential. */
  password: string;
  createdAt: string;
}

export interface OrganisationRecord {
  id: string;
  name: string;
  plan: string;
  trialUntil: string;
  paidUntil: string | null;
  createdAt: string;
}

export interface MembershipRecord {
  id: string;
  userId: string;
  orgId: string;
  role: "manager" | "tenant" | "security";
  propertyId: string | null;
  unitId: string | null;
  username: string | null;
  usernameKey: string | null;
  orgName: string;
  memberName: string;
  userEmail: string;
}

export interface PropertyRecord {
  id: string;
  orgId: string;
  name: string;
  address: string;
  type: "apartment" | "student_accommodation";
  loginCode: string;
  /** Visitor limits, set by the property manager. See lib/server/visits.ts. */
  sleepoverNightsPerMonth: number;
  maxConsecutiveNights: number;
  maxActiveGuests: number;
}

export interface UnitRecord {
  id: string;
  orgId: string;
  propertyId: string;
  label: string;
  rentCents: number;
  rentPaid: number;
  frequency: string;
  residentId: string | null;
  residentName: string | null;
}

export interface InvitationRecord {
  id: string;
  orgId: string;
  email: string;
  role: string;
  propertyId: string | null;
  unitId: string | null;
  hash: string;
  expiresAt: string;
  acceptedAt: string | null;
  username: string | null;
  /** Lower-cased username, used for case-insensitive uniqueness and lookup. */
  usernameKey: string | null;
  emailStatus: string;
  emailSentAt: string | null;
}

export interface VisitorRecord {
  id: string;
  orgId: string;
  propertyId: string;
  /** The host's unit. Visitor limits are counted per unit, not per person. */
  unitId: string | null;
  hostId: string;
  visitorName: string;
  phone: string;
  /** Optional: when given, the visitor receives their own copy of the pass. */
  visitorEmail: string | null;
  /** The visitor's own identity document, required on every request. */
  idType: "sa_id" | "passport" | "student_number";
  idNumber: string;
  reference: string;
  token: string;
  visitType: "daily" | "sleepover" | "extended_sleepover";
  /** Arrival date; for a sleepover the departure falls on endDate instead. */
  visitDate: string;
  endDate: string;
  arrival: string;
  departure: string;
  nights: number;
  status: "upcoming" | "checked_in" | "checked_out" | "cancelled";
  /** 1 while the pass occupies a guest slot (upcoming or checked in). */
  active: number;
  createdAt: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  propertyName: string;
  hostName: string;
  unitLabel: string | null;
}

export interface ReportRecord {
  id: string;
  orgId: string;
  propertyId: string;
  authorId: string;
  authorName: string;
  category: string;
  description: string;
  /** low | normal | urgent | emergency. See lib/server/maintenance.ts. */
  urgency: string;
  /** Sort key: 0 is the most urgent, so one ORDER BY works on both backends. */
  urgencyRank: number;
  status: string;
  createdAt: string;
  unitLabel: string | null;
}

/** A maintenance contact: a directory entry, never an account. */
export interface ContractorRecord {
  id: string;
  orgId: string;
  name: string;
  trade: string;
  company: string | null;
  phone: string;
  email: string | null;
  kind: "in_house" | "contractor";
  notes: string | null;
  createdAt: string;
}

export interface InvoiceRecord {
  id: string;
  orgId: string;
  plan: string;
  amountCents: number;
  status: string;
  paymentId: string | null;
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  orgId: string | null;
  userId: string | null;
  userName: string;
  action: string;
  subject: string | null;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: string;
}

export interface ResetTokenRecord {
  id: string;
  userId: string;
  expiresAt: string;
}

export interface RateLimitRecord {
  id: string;
  count: number;
  resetsAt: number;
}
