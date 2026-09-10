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
  "tenancies",
  "documents",
  "requests",
  "announcements",
  "regulars",
  "movements",
  "invoices",
  "audit",
  "contractors",
  "ledger",
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
  create(
    collection: Collection,
    id: string,
    data: Record<string, unknown>,
  ): void;
  set(collection: Collection, id: string, data: Record<string, unknown>): void;
  update(
    collection: Collection,
    id: string,
    patch: Record<string, unknown>,
  ): void;
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
  /**
   * The company's brand colours, shared by every member of the organisation so
   * a manager's choice reaches their tenants and security without a second
   * setting. See lib/shared/theme.ts for what is derived from the pair.
   */
  brandPrimary: string;
  brandAccent: string;
  /**
   * The company's own logo, shown in place of the SangoPass mark on every
   * dashboard in the organisation.
   *
   * Only where to find the file is kept here - the bytes live in the storage
   * port, the same one the tenant documents use. Empty when the organisation
   * has not uploaded one, which is when the SangoPass mark is shown instead.
   */
  logoKey: string;
  logoMime: string;
  /** Changes on every upload, so a replaced logo is never served from cache. */
  logoUpdatedAt: string;
  createdAt: string;
}

export interface MembershipRecord {
  id: string;
  userId: string;
  orgId: string;
  role: "manager" | "reception" | "tenant" | "security";
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
  /**
   * When the property was archived, or null while it is in use.
   *
   * Archived rather than deleted: a sold building still has to appear in last
   * year's books, in the visitor register and in the audit trail. It drops out
   * of everywhere a manager picks a property, and out of the money screen, and
   * it can be restored.
   */
  archivedAt: string | null;
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
  /** When the unit was archived, or null while it is in use. */
  archivedAt: string | null;
  /**
   * 1 when this unit was archived by its property being archived, rather than
   * on its own. Restoring the property brings back only these.
   *
   * Recorded rather than inferred: matching units to their property by a
   * shared timestamp looks equivalent and is not, because two archivings a
   * millisecond apart collide and a unit filed away on its own quietly comes
   * back with the building.
   */
  archivedWithProperty: number;
  /**
   * The month rentPaid refers to, YYYY-MM. Without it a unit marked paid in
   * September still reads as paid in October — exactly the quiet wrongness a
   * rent register must not have.
   */
  rentPaidPeriod: string;
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
  /**
   * The short code a guest recites at the gate when they have no smartphone,
   * texted to them when SMS is configured. Empty on passes issued before the
   * v7 migration, which still work by QR and reference.
   * See lib/shared/passcode.ts.
   */
  entryCode: string;
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

/**
 * Who occupied a unit, and when.
 *
 * A membership says who lives there now and is deleted the day they leave, so
 * on its own the register can only ever answer "who is in A1 today". A lease
 * outlives the tenancy it belongs to and a deposit dispute arrives months
 * after the keys came back, so occupancy is recorded as history: one row per
 * stay, closed rather than removed when the resident moves out.
 */
export interface TenancyRecord {
  id: string;
  orgId: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitLabel: string;
  residentId: string;
  residentName: string;
  residentEmail: string;
  /** The unit-linked username or student number they signed in with. */
  username: string | null;
  startedAt: string;
  /** Null while they are still living there. */
  endedAt: string | null;
  /** Why the stay ended: moved_out | removed | transferred. */
  endedReason: string;
  /** 1 while this is the current stay, so neither backend needs a null test. */
  current: number;
}

/**
 * A file kept against a tenancy: the signed lease, an inspection, a notice.
 *
 * The bytes live in the storage port (lib/server/documents), never in the
 * record - the store holds scalars only, and both backends cap a document
 * far below the size of a scanned agreement. What is kept here is where to
 * find the file and who it belongs to.
 *
 * It is filed against the tenancy rather than the membership, so a lease is
 * still there long after the resident's account has gone.
 */
export interface DocumentRecord {
  id: string;
  orgId: string;
  propertyId: string;
  propertyName: string;
  unitId: string | null;
  unitLabel: string | null;
  tenancyId: string | null;
  residentId: string | null;
  residentName: string;
  title: string;
  /** lease | notice | identity | proof_of_payment | inspection | other. */
  kind: string;
  filename: string;
  mime: string;
  bytes: number;
  /** What the storage port was given to write, and needs back to read. */
  storageKey: string;
  uploadedAt: string;
  uploadedBy: string;
  uploadedByName: string;
}

/**
 * A resident telling the office something is about to change: they are moving
 * out, they want a different unit, or a different property.
 *
 * A notice is a statement of intent, not a decision. It is raised by the
 * resident, and a manager or reception answers it - which is why it is its own
 * queue rather than a maintenance report: nothing here is broken.
 */
export interface RequestRecord {
  id: string;
  orgId: string;
  propertyId: string;
  propertyName: string;
  unitId: string | null;
  unitLabel: string | null;
  residentId: string;
  residentName: string;
  /** move_out | unit_change | property_change. */
  kind: string;
  /** The date the resident intends the change to take effect. */
  effectiveDate: string;
  details: string;
  /** open | acknowledged | approved | declined | withdrawn | completed. */
  status: string;
  /** 1 while the office still owes an answer, for counting without a scan. */
  open: number;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decidedByName: string;
  decisionNote: string;
}

/**
 * The office telling the building something: a scheduled water outage, the
 * AGM date, a gate that has failed.
 *
 * The opposite direction to a RequestRecord above, and kept apart from it for
 * that reason. A notice is raised by one resident and ends in a decision about
 * them; an announcement is raised by the office, addressed to everybody, and
 * nobody answers it.
 *
 * Whether it is still on anyone's dashboard is worked out from showUntil and
 * archivedAt rather than stored, because a stored flag would be correct on the
 * day it was written and wrong the morning after. See lib/shared/announcements.
 */
export interface AnnouncementRecord {
  id: string;
  orgId: string;
  /**
   * The building it is about, or null for the whole organisation.
   *
   * Reception can only ever write its own building's id here: the front desk
   * of one block does not get to address an estate it does not sit in.
   */
  propertyId: string | null;
  /** Denormalised, and empty on an organisation-wide announcement. */
  propertyName: string;
  title: string;
  body: string;
  /** routine | important | urgent. See lib/shared/announcements.ts. */
  level: string;
  /** Sort key: 0 is loudest, so one ORDER BY works on both backends. */
  levelRank: number;
  /** everyone | residents | security. */
  audience: string;
  /**
   * The last SAST date it shows on a dashboard, or empty for no end date.
   * An outage notice is stale the day after the outage, and a manager should
   * not have to remember to come back and clear it.
   */
  showUntil: string;
  publishedAt: string;
  /**
   * When it was last corrected, or null. Recorded rather than hidden: people
   * act on these, and someone who read "Tuesday" yesterday is owed the fact
   * that it does not say Tuesday any more.
   */
  editedAt: string | null;
  authorId: string;
  authorName: string;
  /** When the office took it down early, or null. Never deleted: it was said. */
  archivedAt: string | null;
}

/**
 * A standing authorisation for somebody who works here: the cleaner who comes
 * every weekday, the gardening contractor on Tuesdays, a roofer for a month.
 *
 * Not a VisitorRecord with a longer window. A guest pass authorises one
 * arrival and holds one status; this authorises an arrival on every allowed
 * day for months, and the arrivals themselves are MovementRecords below. The
 * two were kept apart rather than bent together because bending them would
 * have meant a pass whose "checkedInAt" is whichever of ninety mornings was
 * written last, which answers no question anybody has.
 *
 * Issued only by the office. A resident hosts guests; who works on the
 * property is the office's decision, and a standing key to the gate is not
 * something a tenancy should be able to mint.
 */
export interface RegularRecord {
  id: string;
  orgId: string;
  propertyId: string;
  propertyName: string;
  /** The unit they work at, or null when they work for the property itself. */
  unitId: string | null;
  unitLabel: string | null;
  personName: string;
  /** What they do here: "Cleaner", "Gardener", "Site foreman". */
  occupation: string;
  /** Who they work for, when that is a company rather than the estate. */
  employer: string;
  phone: string;
  /** staff | contractor | household. See lib/shared/regulars.ts. */
  kind: string;
  idType: string;
  idNumber: string;
  reference: string;
  token: string;
  entryCode: string;
  /**
   * Which weekdays they may come, as seven characters of 0 or 1 starting on
   * Monday: "1111100" is a weekday cleaner. A string rather than a bitmask so
   * that a person reading the row in either database can see what it means.
   */
  days: string;
  /** The hours they may be admitted, SAST, as HH:MM. */
  fromTime: string;
  toTime: string;
  startDate: string;
  /**
   * The last day it works. Required, and capped: a standing authorisation
   * with no end is a key nobody ever takes back.
   */
  endDate: string;
  /** When the office withdrew it early, or null. Never deleted: it was used. */
  revokedAt: string | null;
  revokedByName: string;
  createdAt: string;
  issuedBy: string;
  issuedByName: string;
}

/**
 * One arrival by a regular: in at 07:04, out at 17:12.
 *
 * The row the register is actually made of. Without it a regular pass is a
 * laminated card the system knows nothing about, and "who is on site right
 * now" - the question a gate exists to answer - has no answer at all.
 */
export interface MovementRecord {
  id: string;
  orgId: string;
  propertyId: string;
  regularId: string;
  /** Denormalised, so the register needs no join. Firestore cannot do one. */
  personName: string;
  occupation: string;
  unitLabel: string | null;
  /** The SAST date of the arrival, so a night shift stays on one day. */
  date: string;
  inAt: string;
  outAt: string | null;
  /** 1 while they are inside, so "on site" is a query rather than a scan. */
  open: number;
  inByName: string;
  outByName: string;
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

/**
 * One movement of the organisation's own money: rent received, or a cost paid.
 *
 * Rent receipts are written by the rent register rather than typed a second
 * time — a manager marking a unit paid records the receipt — so the books and
 * the register can never disagree with each other. Costs are entered directly.
 *
 * Not to be confused with InvoiceRecord below, which is what the organisation
 * pays SangoPass.
 */
export interface LedgerRecord {
  id: string;
  orgId: string;
  /** The month it belongs to, YYYY-MM. See lib/shared/money.ts. */
  period: string;
  kind: "income" | "expense";
  category: string;
  nature: "fixed" | "variable";
  amountCents: number;
  description: string;
  propertyId: string | null;
  /** Denormalised so the spreadsheet needs no join, as Firestore cannot. */
  propertyName: string;
  unitId: string | null;
  unitLabel: string | null;
  /** Who recorded it, so a shared manager login is still accountable. */
  recordedBy: string;
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
