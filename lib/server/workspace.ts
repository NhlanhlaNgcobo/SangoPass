import { randomBytes, randomUUID } from "node:crypto";
import {
  createSession,
  hashToken,
  membershipId,
  memberships,
  newToken,
  now,
  prepareAccount,
  rollbackAccount,
  toMembership,
  type RequestContext,
} from "./auth";
import { billingConfigured, emailConfigured } from "./config";
import { identity } from "./identity";
import { plan as planFor } from "./plans";
import { bucket, throttle } from "./ratelimit";
import { store } from "./store";
import type {
  ContractorRecord,
  InvitationRecord,
  InvoiceRecord,
  LedgerRecord,
  MembershipRecord,
  OrganisationRecord,
  PropertyRecord,
  Reader,
  ReportRecord,
  UnitRecord,
  UserRecord,
  VisitorRecord,
} from "./store";
import { parseContractor, parseUrgency, rank } from "./maintenance";
import {
  DEFAULT_LIMITS,
  endsAt,
  limitsOf,
  maskIdNumber,
  monthBounds,
  nightsUsed,
  parseLimits,
  sastToday,
  startsAt,
  visitWindow,
  visitorIdentity,
} from "./visits";
import {
  AppError,
  choice,
  colour,
  email,
  money,
  password,
  text,
} from "./validation";
import { resolveTheme, themeReadable } from "@/lib/shared/theme";
import { ENTRY_CODE_BYTES, encodeEntryCode } from "@/lib/shared/passcode";
import { currentPeriod } from "@/lib/shared/money";
import { LEDGER_LIMIT, parseLedgerEntry } from "./finance";
import type {
  Account,
  LiveInvoice,
  LiveLedgerEntry,
  LiveMember,
  LiveProperty,
  LiveReport,
  LiveUnit,
  LiveVisitor,
  Membership,
  WorkspaceState,
} from "@/types/workspace";

const LIST_LIMIT = 500;

/* ------------------------------------------------------------------ */
/* Access                                                              */
/* ------------------------------------------------------------------ */

export async function membershipFor(
  reader: Reader,
  userId: string,
  orgId: string,
) {
  if (!orgId) return undefined;
  return reader.get<MembershipRecord>("memberships", membershipId(userId, orgId));
}

export async function access(
  user: Account,
  orgId: string,
  reader: Reader = store(),
): Promise<MembershipRecord> {
  const membership = await membershipFor(reader, user.id, orgId);
  if (!membership)
    throw new AppError("You do not have access to this organisation.", 403);
  return membership;
}

function manager(m: MembershipRecord) {
  if (m.role !== "manager")
    throw new AppError("A manager account is required.", 403);
}

/**
 * A property this member may act on. Archived ones are still returned: a
 * guard must be able to check out a guest who is already inside a building
 * that was archived this morning, and a manager must be able to restore it.
 * Anything that creates something new uses requireOpenProperty instead.
 */
async function requireProperty(
  reader: Reader,
  m: MembershipRecord,
  id: unknown,
): Promise<PropertyRecord> {
  const property = await reader.get<PropertyRecord>(
    "properties",
    text(id, "property"),
  );
  if (
    !property ||
    property.orgId !== m.orgId ||
    (m.role !== "manager" && m.propertyId !== property.id)
  )
    throw new AppError("Property not available.", 404);
  return property;
}

/** A property still in use, for anything that adds a record to it. */
async function requireOpenProperty(
  reader: Reader,
  m: MembershipRecord,
  id: unknown,
): Promise<PropertyRecord> {
  const property = await requireProperty(reader, m, id);
  if (property.archivedAt)
    throw new AppError(
      `${property.name} is archived. Restore it from Properties before adding anything to it.`,
      409,
    );
  return property;
}

function entitled(org: OrganisationRecord) {
  return (org.paidUntil || "") > now() || org.trialUntil > now();
}

/* ------------------------------------------------------------------ */
/* Read model                                                          */
/* ------------------------------------------------------------------ */

export async function workspace(
  user: Account,
  orgId?: string,
): Promise<WorkspaceState> {
  const list = await memberships(user.id);
  const m = await access(user, orgId || list[0]?.orgId || "");
  const database = store();
  const organisation = (await database.get<OrganisationRecord>(
    "organisations",
    m.orgId,
  ))!;

  const scopedProperties =
    m.role === "manager"
      ? { where: [["orgId", "==", m.orgId]] as never }
      : { where: [["id", "==", m.propertyId]] as never };

  const visitorScope =
    m.role === "manager"
      ? [["orgId", "==", m.orgId]]
      : m.role === "security"
        ? [
            ["orgId", "==", m.orgId],
            ["propertyId", "==", m.propertyId],
          ]
        : [
            ["orgId", "==", m.orgId],
            ["hostId", "==", user.id],
          ];

  const reportScope =
    m.role === "manager"
      ? [["orgId", "==", m.orgId]]
      : m.role === "security"
        ? [
            ["orgId", "==", m.orgId],
            ["propertyId", "==", m.propertyId],
          ]
        : [
            ["orgId", "==", m.orgId],
            ["authorId", "==", user.id],
          ];

  const [
    properties,
    units,
    members,
    visitors,
    reports,
    invoices,
    invitations,
    contractors,
    ledger,
  ] = await Promise.all([
      m.role === "manager" || m.propertyId
        ? database.find<PropertyRecord>("properties", {
            ...scopedProperties,
            orderBy: [{ field: "name" }],
          })
        : Promise.resolve([]),
      m.role === "security"
        ? Promise.resolve([])
        : m.role === "tenant"
          ? m.unitId
            ? database.find<UnitRecord>("units", {
                where: [["id", "==", m.unitId]],
              })
            : Promise.resolve([])
          : database.find<UnitRecord>("units", {
              where: [["orgId", "==", m.orgId]],
              orderBy: [{ field: "label" }],
            }),
      m.role === "manager"
        ? database.find<MembershipRecord>("memberships", {
            where: [["orgId", "==", m.orgId]],
          })
        : Promise.resolve([]),
      database.find<VisitorRecord>("visitors", {
        where: visitorScope as never,
        orderBy: [
          { field: "visitDate", direction: "desc" },
          { field: "arrival", direction: "desc" },
        ],
        limit: LIST_LIMIT,
      }),
      // Worked in urgency order, newest first within a level. urgencyRank is
      // stored so one ORDER BY does this on both backends.
      database.find<ReportRecord>("reports", {
        where: reportScope as never,
        orderBy: [
          { field: "urgencyRank" },
          { field: "createdAt", direction: "desc" },
        ],
        limit: LIST_LIMIT,
      }),
      m.role === "manager"
        ? database.find<InvoiceRecord>("invoices", {
            where: [["orgId", "==", m.orgId]],
            orderBy: [{ field: "createdAt", direction: "desc" }],
            limit: 100,
          })
        : Promise.resolve([]),
      m.role === "manager"
        ? database.find<InvitationRecord>("invitations", {
            where: [
              ["orgId", "==", m.orgId],
              ["acceptedAt", "==", null],
              ["expiresAt", ">", now()],
            ],
          })
        : Promise.resolve([]),
      m.role === "manager"
        ? database.find<ContractorRecord>("contractors", {
            where: [["orgId", "==", m.orgId]],
            orderBy: [{ field: "name" }],
          })
        : Promise.resolve([]),
      // The organisation's own money. Managers only: a resident has no
      // business seeing what the building costs to run, and neither has a
      // guard. Newest month first, so the screen opens on the current one.
      m.role === "manager"
        ? database.find<LedgerRecord>("ledger", {
            where: [["orgId", "==", m.orgId]],
            orderBy: [
              { field: "period", direction: "desc" },
              { field: "createdAt", direction: "desc" },
            ],
            limit: LEDGER_LIMIT,
          })
        : Promise.resolve([]),
    ]);

  // What this resident has left this month, so the form can say so before they
  // fill it in rather than rejecting them after.
  let allowance: WorkspaceState["allowance"] = null;
  if (m.role === "tenant" && m.unitId && m.propertyId) {
    const limits = limitsOf(
      properties.find((p) => p.id === m.propertyId) || {},
    );
    const month = monthBounds(sastToday());
    const [active, booked] = await Promise.all([
      database.count("visitors", {
        where: [
          ["unitId", "==", m.unitId],
          ["active", "==", 1],
        ],
      }),
      database.find<VisitorRecord>("visitors", {
        where: [
          ["unitId", "==", m.unitId],
          ["visitDate", ">=", month.start],
          ["visitDate", "<=", month.end],
        ],
      }),
    ]);
    allowance = {
      month: month.start.slice(0, 7),
      activeGuests: active,
      nightsUsed: nightsUsed(booked),
      ...limits,
    };
  }

  return {
    asOf: now(),
    user,
    memberships: list,
    membership: toMembership(m),
    organisation: {
      id: organisation.id,
      name: organisation.name,
      plan: organisation.plan,
      trialUntil: organisation.trialUntil,
      paidUntil: organisation.paidUntil,
      active: entitled(organisation),
      // Sent to every role, not just managers: this is what makes a manager's
      // choice show up on their tenants' and security's dashboards.
      theme: resolveTheme({
        primary: organisation.brandPrimary,
        accent: organisation.brandAccent,
      }),
    },
    properties: properties.map(
      (p): LiveProperty => ({
        id: p.id,
        orgId: p.orgId,
        name: p.name,
        address: p.address,
        type: p.type,
        loginCode: p.loginCode,
        archivedAt: p.archivedAt ?? null,
        ...limitsOf(p),
      }),
    ),
    units: units
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(
        (u): LiveUnit => ({
          id: u.id,
          propertyId: u.propertyId,
          label: u.label,
          rentCents: u.rentCents,
          rentPaid: u.rentPaid,
          rentPaidPeriod: u.rentPaidPeriod || "",
          archivedAt: u.archivedAt ?? null,
          archivedWithProperty: Boolean(u.archivedWithProperty),
          frequency: u.frequency,
          residentName: u.residentName,
        }),
      ),
    members: members
      .slice()
      .sort((a, b) => a.memberName.localeCompare(b.memberName))
      .map(
        (member): LiveMember => ({
          id: member.userId,
          name: member.memberName,
          email: member.userEmail,
          role: member.role,
          propertyId: member.propertyId,
          unitId: member.unitId,
          username: member.username,
        }),
      ),
    visitors: visitors.map(
      (v): LiveVisitor => ({
        id: v.id,
        propertyId: v.propertyId,
        unitId: v.unitId ?? null,
        hostId: v.hostId,
        visitorName: v.visitorName,
        phone: v.phone,
        visitorEmail: v.visitorEmail ?? null,
        idType: v.idType,
        // Never leave a full identity number sitting in a client payload.
        idNumber: v.idNumber ? maskIdNumber(v.idNumber) : "",
        reference: v.reference,
        token: v.token,
        entryCode: v.entryCode || "",
        visitType: v.visitType || "daily",
        visitDate: v.visitDate,
        endDate: v.endDate || v.visitDate,
        arrival: v.arrival,
        departure: v.departure,
        nights: v.nights || 0,
        status: v.status,
        createdAt: v.createdAt,
        checkedInAt: v.checkedInAt,
        checkedOutAt: v.checkedOutAt,
        propertyName: v.propertyName,
        hostName: v.hostName,
        unitLabel: v.unitLabel,
      }),
    ),
    allowance,
    reports: reports.map(
      (r): LiveReport => ({
        id: r.id,
        propertyId: r.propertyId,
        authorId: r.authorId,
        authorName: r.authorName,
        category: r.category,
        description: r.description,
        urgency: (r.urgency || "normal") as LiveReport["urgency"],
        status: r.status,
        createdAt: r.createdAt,
        unitLabel: r.unitLabel ?? null,
      }),
    ),
    ledger: ledger.map(
      (entry): LiveLedgerEntry => ({
        id: entry.id,
        period: entry.period,
        kind: entry.kind,
        category: entry.category as LiveLedgerEntry["category"],
        nature: entry.nature,
        amountCents: entry.amountCents,
        description: entry.description,
        propertyId: entry.propertyId ?? null,
        propertyName: entry.propertyName || "",
        unitId: entry.unitId ?? null,
        unitLabel: entry.unitLabel ?? null,
        recordedBy: entry.recordedBy || "",
        createdAt: entry.createdAt,
      }),
    ),
    contractors: contractors.map((c) => ({
      id: c.id,
      name: c.name,
      trade: c.trade,
      company: c.company,
      phone: c.phone,
      email: c.email,
      kind: c.kind,
      notes: c.notes,
    })),
    invoices: invoices.map(
      (i): LiveInvoice => ({
        id: i.id,
        plan: i.plan,
        amountCents: i.amountCents,
        status: i.status,
        createdAt: i.createdAt,
      }),
    ),
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      username: i.username,
      emailStatus: i.emailStatus,
      emailSentAt: i.emailSentAt,
      propertyId: i.propertyId,
      unitId: i.unitId,
    })),
    billingConfigured: billingConfigured(),
    billingMode: process.env.PAYFAST_MODE === "live" ? "live" : "sandbox",
    emailConfigured: emailConfigured(),
    backend: database.name,
  };
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

const GATED = new Set(["property", "unit", "invite", "visitor"]);

/**
 * Re-authenticates the caller for an action that must be provably theirs.
 *
 * The session cookie proves who signed in; it does not prove who is at the
 * keyboard now. A guest request admits a stranger to the building in the
 * resident's name, so the resident confirms it with their password. This runs
 * before the transaction: verification is a network call on the Firebase
 * backend, and a transaction may be retried.
 */
async function reauthenticate(user: Account, input: Record<string, unknown>) {
  const supplied =
    typeof input.password === "string" && input.password.length <= 128
      ? input.password
      : "";
  await throttle([bucket(`reauth:${user.id}`, 10)]);
  const credential = await identity().verifyPassword(user.email, supplied);
  if (!credential || credential.id !== user.id)
    throw new AppError(
      "That password is not correct. Confirm the request with your own SangoPass password.",
      401,
    );
}

export async function command(
  user: Account,
  orgId: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const action = String(input.action);
  if (action === "visitor") await reauthenticate(user, input);
  return store().tx(async (t) => {
    const m = await access(user, orgId, t);
    const org = (await t.get<OrganisationRecord>("organisations", orgId))!;
    if (GATED.has(action) && !entitled(org))
      throw new AppError(
        "Your trial or paid month has ended. Ask a manager to renew from Billing.",
        402,
      );

    let result: Record<string, unknown> = {};
    let subject: string | null = null;

    switch (action) {
      case "property": {
        manager(m);
        const name = text(input.name, "property name", 100);
        const addressLine = text(input.address, "address", 250);
        const type = choice(
          input.type,
          ["apartment", "student_accommodation"] as const,
          "property type",
        );
        const id = randomUUID();
        const loginCode = newToken().slice(0, 12);
        t.reserve(`property:${orgId}:${name.toLowerCase()}`, id);
        t.reserve(`loginCode:${loginCode}`, id);
        t.create("properties", id, {
          orgId,
          name,
          address: addressLine,
          type,
          loginCode,
          ...DEFAULT_LIMITS,
          archivedAt: null,
        });
        result = { id };
        subject = id;
        break;
      }

      /**
       * The organisation's brand colours. Stored once on the organisation
       * rather than per member, so a manager saving here re-themes the
       * dashboards of every tenant and security account in the company on
       * their next load. Not gated on billing: colours add no data, and
       * locking a company out of its own branding at trial's end reads as a
       * fault rather than a prompt to pay.
       */
      case "branding": {
        manager(m);
        const theme = {
          primary: colour(input.primary, "primary colour"),
          accent: colour(input.accent, "accent colour"),
        };
        if (!themeReadable(theme))
          throw new AppError(
            "Those colours would leave text hard to read. Use a darker primary, a lighter accent, or a stronger contrast between the two.",
          );
        t.update("organisations", orgId, {
          brandPrimary: theme.primary,
          brandAccent: theme.accent,
        });
        result = { ...theme };
        subject = orgId;
        break;
      }

      /**
       * Renaming a unit, or repricing it.
       *
       * Rent changes every year, and until now the only way to reflect that
       * was to create a second unit and abandon the first - which would leave
       * the abandoned one showing as vacant potential income forever. The rent
       * that has already been received is not touched: those receipts record
       * what was actually paid, at the price that applied when it was paid.
       */
      case "unitUpdate": {
        manager(m);
        const unit = await t.get<UnitRecord>("units", text(input.id, "unit"));
        if (!unit || unit.orgId !== orgId)
          throw new AppError("Unit not found.", 404);
        await requireProperty(t, m, unit.propertyId);
        const label = text(input.label, "unit label", 50);
        const rentCents = money(input.rent);
        const renamed = label.toLowerCase() !== unit.label.toLowerCase();
        // A pass that has not been used yet names the door a guard will send
        // the visitor to, so a rename has to reach it. Passes already closed
        // keep the label the unit had at the time, which is what history means.
        const live = renamed
          ? await t.find<VisitorRecord>("visitors", {
              where: [
                ["unitId", "==", unit.id],
                ["active", "==", 1],
              ],
            })
          : [];
        if (renamed) {
          t.reserve(`unit:${unit.propertyId}:${label.toLowerCase()}`, unit.id);
          t.release(`unit:${unit.propertyId}:${unit.label.toLowerCase()}`);
        }
        t.update("units", unit.id, { label, rentCents });
        for (const visit of live) t.update("visitors", visit.id, { unitLabel: label });
        result = { id: unit.id, label, rentCents };
        subject = unit.id;
        break;
      }

      /**
       * Taking a unit out of use, or bringing it back.
       *
       * Never deleted: the unit appears in last month's books, in the visitor
       * register and in the audit trail, and those have to keep reading
       * correctly. Archived, it stops counting towards the plan's unit limit,
       * stops being offered when enrolling a resident, and stops appearing as
       * vacant income the property is failing to earn.
       */
      case "unitArchive": {
        manager(m);
        const unit = await t.get<UnitRecord>("units", text(input.id, "unit"));
        if (!unit || unit.orgId !== orgId)
          throw new AppError("Unit not found.", 404);
        await requireProperty(t, m, unit.propertyId);
        const archive = input.archived !== false;
        // Somebody lives there. Archiving it would hide a real tenancy.
        if (archive && unit.residentId)
          throw new AppError(
            `${unit.residentName || "A resident"} still lives in ${unit.label}. Remove them from People first.`,
            409,
          );
        if (!archive) {
          const property = await t.get<PropertyRecord>(
            "properties",
            unit.propertyId,
          );
          if (property?.archivedAt)
            throw new AppError(
              "Restore the property first: a unit cannot be in use inside an archived property.",
              409,
            );
          const limit = planFor(org.plan).units;
          const units = await t.find<UnitRecord>("units", {
            where: [["orgId", "==", orgId]],
          });
          if (units.filter((u) => !u.archivedAt).length >= limit)
            throw new AppError(
              "Your plan's unit limit has been reached. Upgrade from Billing, or archive another unit first.",
              409,
            );
        }
        t.update("units", unit.id, {
          archivedAt: archive ? now() : null,
          // Archived on its own, so restoring its property must not undo it.
          archivedWithProperty: 0,
          // An archived unit is not owed rent, so it carries no stale flag
          // back with it if it is ever restored.
          ...(archive ? { rentPaid: 0, rentPaidPeriod: "" } : {}),
        });
        result = { id: unit.id, archived: archive };
        subject = unit.id;
        break;
      }

      /** The property's own details. Its login code and limits are unchanged. */
      case "propertyUpdate": {
        manager(m);
        const property = await requireProperty(t, m, input.id);
        const name = text(input.name, "property name", 100);
        const addressLine = text(input.address, "address", 250);
        const type = choice(
          input.type,
          ["apartment", "student_accommodation"] as const,
          "property type",
        );
        if (name.toLowerCase() !== property.name.toLowerCase()) {
          t.reserve(`property:${orgId}:${name.toLowerCase()}`, property.id);
          t.release(`property:${orgId}:${property.name.toLowerCase()}`);
        }
        t.update("properties", property.id, {
          name,
          address: addressLine,
          type,
        });
        result = { id: property.id, name };
        subject = property.id;
        break;
      }

      /**
       * Taking a whole property out of use, or bringing it back.
       *
       * A sold or handed-back building. Its vacant units go with it, so a
       * manager does not have to archive twenty units by hand, but a property
       * with residents still in it is refused: that is a tenancy question, not
       * a filing one, and it has to be answered in People first.
       */
      case "propertyArchive": {
        manager(m);
        const property = await requireProperty(t, m, input.id);
        const archive = input.archived !== false;
        // The whole organisation's units: the plan cap is counted across
        // every property, not within the one being restored.
        const orgUnits = await t.find<UnitRecord>("units", {
          where: [["orgId", "==", orgId]],
        });
        const units = orgUnits.filter((u) => u.propertyId === property.id);
        if (archive) {
          const occupied = units.filter((u) => !u.archivedAt && u.residentId);
          if (occupied.length)
            throw new AppError(
              `${occupied.length} ${occupied.length === 1 ? "unit is" : "units are"} still occupied at ${property.name}. Remove those residents from People first.`,
              409,
            );
        }
        const stamp = now();
        // Only the units this building took with it come back with it. A unit
        // a manager archived by hand beforehand stays archived, because that
        // was a separate decision about that unit.
        const following = units.filter((u) =>
          archive ? !u.archivedAt : u.archivedAt && u.archivedWithProperty,
        );
        if (!archive) {
          const limit = planFor(org.plan).units;
          const inUse = orgUnits.filter((u) => !u.archivedAt).length;
          if (inUse + following.length > limit)
            throw new AppError(
              `Restoring ${property.name} would put you at ${inUse + following.length} units, past your plan's limit of ${limit}. Upgrade from Billing first.`,
              409,
            );
        }
        t.update("properties", property.id, {
          archivedAt: archive ? stamp : null,
        });
        for (const unit of following)
          t.update("units", unit.id, {
            archivedAt: archive ? stamp : null,
            archivedWithProperty: archive ? 1 : 0,
            ...(archive ? { rentPaid: 0, rentPaidPeriod: "" } : {}),
          });
        result = { id: property.id, archived: archive };
        subject = property.id;
        break;
      }

      case "propertyLimits": {
        manager(m);
        const property = await requireProperty(t, m, input.propertyId);
        const limits = parseLimits(input);
        t.update("properties", property.id, { ...limits });
        result = { ...limits };
        subject = property.id;
        break;
      }

      case "unit": {
        manager(m);
        const property = await requireOpenProperty(t, m, input.propertyId);
        const label = text(input.label, "unit label", 50);
        const rentCents = money(input.rent);
        const limit = planFor(org.plan).units;
        // Archived units do not occupy a paid slot: a manager who has closed
        // a wing should not be paying for it. Counted in memory rather than
        // queried, because a missing field is not null in Firestore and the
        // two backends must agree.
        const all = await t.find<UnitRecord>("units", {
          where: [["orgId", "==", orgId]],
        });
        if (all.filter((u) => !u.archivedAt).length >= limit)
          throw new AppError(
            "Your plan's unit limit has been reached. Upgrade from Billing.",
            409,
          );
        const id = randomUUID();
        t.reserve(`unit:${property.id}:${label.toLowerCase()}`, id);
        t.create("units", id, {
          orgId,
          propertyId: property.id,
          label,
          rentCents,
          rentPaid: 0,
          rentPaidPeriod: "",
          frequency: "monthly",
          residentId: null,
          residentName: null,
          archivedAt: null,
          archivedWithProperty: 0,
        });
        result = { id };
        subject = id;
        break;
      }

      /**
       * Marking a unit's rent paid, or unmarking it.
       *
       * This also writes the receipt into the books, so a manager records rent
       * once rather than twice and the register and the ledger can never
       * disagree. Unmarking removes that month's receipt again — a mis-click
       * must not leave money in the accounts that was never received.
       *
       * The flag now carries the month it refers to. Before that a unit marked
       * paid in September still read as paid in October, which made "rent
       * outstanding" meaningless the moment a month turned over.
       */
      case "rent": {
        manager(m);
        const unit = await t.get<UnitRecord>("units", text(input.unitId, "unit"));
        if (!unit || unit.orgId !== orgId)
          throw new AppError("Unit not found.", 404);
        const property = await requireProperty(t, m, unit.propertyId);
        const period = currentPeriod();
        const paid = input.paid === true;
        // Whatever this unit already has on the books for this month, so the
        // receipt is replaced rather than duplicated by a second click.
        const existing = await t.find<LedgerRecord>("ledger", {
          where: [
            ["unitId", "==", unit.id],
            ["period", "==", period],
          ],
        });
        for (const receipt of existing)
          if (receipt.category === "rent") t.remove("ledger", receipt.id);
        t.update("units", unit.id, {
          rentPaid: paid ? 1 : 0,
          rentPaidPeriod: paid ? period : "",
        });
        if (paid && unit.rentCents > 0)
          t.create("ledger", randomUUID(), {
            orgId,
            period,
            kind: "income",
            category: "rent",
            nature: "fixed",
            amountCents: unit.rentCents,
            description: `Rent received — ${unit.label}`,
            propertyId: property.id,
            propertyName: property.name,
            unitId: unit.id,
            unitLabel: unit.label,
            recordedBy: user.name,
            createdAt: now(),
          });
        subject = unit.id;
        break;
      }

      /**
       * A line in the organisation's own books: a cost paid, or income that
       * did not come through the rent register.
       *
       * Not gated on billing. The gate exists to stop an unpaid organisation
       * growing — more properties, units, people, passes — and blocking a
       * manager from recording money that has already moved would not prompt
       * payment, it would corrupt their records.
       */
      case "ledgerEntry": {
        manager(m);
        const entry = parseLedgerEntry(input);
        const property = input.propertyId
          ? await requireProperty(t, m, input.propertyId)
          : undefined;
        const id = randomUUID();
        t.create("ledger", id, {
          orgId,
          period: entry.period,
          kind: entry.kind,
          category: entry.category,
          nature: entry.nature,
          amountCents: entry.amountCents,
          description: entry.description,
          propertyId: property?.id ?? null,
          propertyName: property?.name ?? "",
          unitId: null,
          unitLabel: null,
          recordedBy: user.name,
          createdAt: now(),
        });
        result = { id };
        subject = id;
        break;
      }

      case "ledgerRemove": {
        manager(m);
        const entry = await t.get<LedgerRecord>(
          "ledger",
          text(input.id, "entry"),
        );
        if (!entry || entry.orgId !== orgId)
          throw new AppError("Entry not found.", 404);
        // A rent receipt belongs to the register that created it, so it is
        // taken off by unmarking the unit, not deleted from behind it.
        if (entry.unitId)
          throw new AppError(
            "This is a rent receipt. Unmark the unit in Properties to take it off the books.",
            409,
          );
        t.remove("ledger", entry.id);
        subject = entry.id;
        break;
      }

      case "invite": {
        manager(m);
        const role = choice(
          input.role,
          ["manager", "tenant", "security"] as const,
          "role",
        );
        const invitee = email(input.email);
        let propertyId: string | null = null;
        let unitId: string | null = null;
        let username: string | null = null;
        let property: PropertyRecord | undefined;

        if (role !== "manager") {
          property = await requireOpenProperty(t, m, input.propertyId);
          propertyId = property.id;
        }

        if (role === "manager") {
          const limit = planFor(org.plan).managers;
          const seats = await t.count("memberships", {
            where: [
              ["orgId", "==", orgId],
              ["role", "==", "manager"],
            ],
          });
          const pending = (
            await t.find<InvitationRecord>("invitations", {
              where: [
                ["orgId", "==", orgId],
                ["role", "==", "manager"],
                ["acceptedAt", "==", null],
                ["expiresAt", ">", now()],
              ],
            })
          ).length;
          if (seats + pending >= limit)
            throw new AppError(
              "Your plan's manager limit has been reached.",
              409,
            );
        }

        if (role === "tenant") {
          const unit = await t.get<UnitRecord>(
            "units",
            text(input.unitId, "unit"),
          );
          if (!unit || unit.propertyId !== propertyId || unit.archivedAt)
            throw new AppError(
              "Choose a vacant unit without a pending invitation.",
              409,
            );
          const pendingForUnit = await t.find<InvitationRecord>("invitations", {
            where: [
              ["unitId", "==", unit.id],
              ["acceptedAt", "==", null],
              ["expiresAt", ">", now()],
            ],
          });
          if (unit.residentId || pendingForUnit.length)
            throw new AppError(
              "Choose a vacant unit without a pending invitation.",
              409,
            );
          unitId = unit.id;
          username =
            property!.type === "student_accommodation"
              ? text(input.studentNumber, "student number", 80)
              : "SP-" +
                (unit.label.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) ||
                  "UNIT") +
                "-" +
                newToken().slice(0, 8).toUpperCase();
          if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$/.test(username))
            throw new AppError(
              "Student numbers must be 2-80 letters, digits, dots, hyphens or underscores. Leading zeroes are preserved.",
            );
          const key = username.toLowerCase();
          const taken = await t.first<MembershipRecord>("memberships", {
            where: [
              ["propertyId", "==", propertyId],
              ["usernameKey", "==", key],
            ],
          });
          const reserved = await t.find<InvitationRecord>("invitations", {
            where: [
              ["propertyId", "==", propertyId],
              ["usernameKey", "==", key],
              ["acceptedAt", "==", null],
              ["expiresAt", ">", now()],
            ],
          });
          if (taken || reserved.length)
            throw new AppError(
              "That username or student number is already enrolled at this property.",
              409,
            );
        }

        const already = await t.first<MembershipRecord>("memberships", {
          where: [
            ["orgId", "==", orgId],
            ["userEmail", "==", invitee],
          ],
        });
        if (already)
          throw new AppError(
            "This person already belongs to the organisation.",
            409,
          );

        const token = newToken();
        const id = randomUUID();
        t.create("invitations", id, {
          orgId,
          email: invitee,
          role,
          propertyId,
          unitId,
          hash: hashToken(token),
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          acceptedAt: null,
          username,
          usernameKey: username ? username.toLowerCase() : null,
          emailStatus: "not_sent",
          emailSentAt: null,
        });
        result = { token, invitationId: id, username };
        subject = id;
        break;
      }

      case "resendInvitation": {
        manager(m);
        const invitation = await t.get<InvitationRecord>(
          "invitations",
          text(input.id, "invitation"),
        );
        if (
          !invitation ||
          invitation.orgId !== orgId ||
          invitation.acceptedAt ||
          invitation.expiresAt <= now()
        )
          throw new AppError(
            "Invitation is expired or no longer available. Revoke it and enrol the person again.",
            409,
          );
        const token = newToken();
        t.update("invitations", invitation.id, {
          hash: hashToken(token),
          emailStatus: "not_sent",
          emailSentAt: null,
        });
        result = {
          token,
          invitationId: invitation.id,
          username: invitation.username,
        };
        subject = invitation.id;
        break;
      }

      case "revokeInvitation": {
        manager(m);
        const invitation = await t.get<InvitationRecord>(
          "invitations",
          text(input.id, "invitation"),
        );
        if (invitation && invitation.orgId === orgId && !invitation.acceptedAt) {
          t.remove("invitations", invitation.id);
          subject = invitation.id;
        }
        break;
      }

      case "removeMember": {
        manager(m);
        const id = text(input.id, "member");
        if (id === user.id)
          throw new AppError("You cannot remove your own access.", 409);
        const target = await t.get<MembershipRecord>(
          "memberships",
          membershipId(id, orgId),
        );
        if (!target) throw new AppError("Member not found.", 404);
        const upcoming = await t.find<VisitorRecord>("visitors", {
          where: [
            ["orgId", "==", orgId],
            ["hostId", "==", id],
            ["status", "==", "upcoming"],
          ],
        });
        t.remove("memberships", target.id);
        if (target.role === "tenant" && target.unitId) {
          t.release(`unitResident:${target.unitId}`);
          // The rent flag belongs to the resident who was living there, not to
          // the unit. Left set, the next tenant would move in already marked
          // paid for the month. Their predecessor keeps the receipt they
          // earned: the money was received, and the books say so.
          t.update("units", target.unitId, {
            residentId: null,
            residentName: null,
            rentPaid: 0,
            rentPaidPeriod: "",
          });
        }
        if (target.role === "tenant" && target.propertyId && target.usernameKey)
          t.release(`username:${target.propertyId}:${target.usernameKey}`);
        for (const visit of upcoming)
          t.update("visitors", visit.id, { status: "cancelled", active: 0 });
        subject = id;
        break;
      }

      case "visitor": {
        // Hosting a guest is a resident's right and a resident's
        // responsibility. Managers set the limits; they do not book guests.
        if (m.role !== "tenant")
          throw new AppError(
            "Only a resident can request a guest visit. Managers set the visitor limits for each property.",
            403,
          );
        if (!m.unitId)
          throw new AppError(
            "Your account is not linked to a unit yet. Ask your property manager to complete your enrolment.",
            409,
          );

        const property = await requireOpenProperty(t, m, input.propertyId);
        const limits = limitsOf(property);
        const identity = visitorIdentity(property.type, input);
        const window = visitWindow(input, limits.maxConsecutiveNights);

        const phone = text(input.phone, "phone", 30);
        if (!/^\+?[\d ()-]{9,25}$/.test(phone))
          throw new AppError("Enter a valid phone number.");
        // Optional: a visitor who has an address gets their own copy of the
        // pass. A visitor without one still gets in, because the resident has
        // a copy too.
        const visitorEmail =
          typeof input.visitorEmail === "string" && input.visitorEmail.trim()
            ? email(input.visitorEmail)
            : null;

        const unit = await t.get<UnitRecord>("units", m.unitId);

        // Limit 1: how many passes this unit may hold at once.
        const activeGuests = await t.count("visitors", {
          where: [
            ["unitId", "==", m.unitId],
            ["active", "==", 1],
          ],
        });
        if (activeGuests >= limits.maxActiveGuests)
          throw new AppError(
            `Your unit already has ${activeGuests} active guest ${
              activeGuests === 1 ? "pass" : "passes"
            }, which is the limit set for this property. Cancel or check out a guest first.`,
            409,
          );

        // Limit 2: the unit's monthly sleepover budget, counted against the
        // month the stay begins in so one booking is never split in two.
        if (window.nights > 0) {
          const month = monthBounds(window.visitDate);
          const booked = await t.find<VisitorRecord>("visitors", {
            where: [
              ["unitId", "==", m.unitId],
              ["visitDate", ">=", month.start],
              ["visitDate", "<=", month.end],
            ],
          });
          const used = nightsUsed(booked);
          if (used + window.nights > limits.sleepoverNightsPerMonth)
            throw new AppError(
              `This property allows ${limits.sleepoverNightsPerMonth} sleepover nights per unit each month. Your unit has used ${used} and this request needs ${window.nights}.`,
              409,
            );
        }

        const id = randomUUID();
        const token = newToken();
        const reference = "SP-" + newToken().slice(0, 10).toUpperCase();
        // The gate code. Separate from the reference on purpose: the reference
        // is printed in every register listing and is the search key security
        // already use, so a visitor reciting it would prove nothing.
        const entryCode = encodeEntryCode(randomBytes(ENTRY_CODE_BYTES));
        t.reserve(`visitorRef:${reference}`, id);
        t.reserve(`visitorToken:${token}`, id);
        t.reserve(`visitorCode:${entryCode}`, id);
        t.create("visitors", id, {
          orgId,
          propertyId: property.id,
          unitId: m.unitId,
          hostId: user.id,
          visitorName: text(input.visitorName, "visitor name", 100),
          phone,
          visitorEmail,
          idType: identity.idType,
          idNumber: identity.idNumber,
          reference,
          token,
          entryCode,
          visitType: window.visitType,
          visitDate: window.visitDate,
          endDate: window.endDate,
          arrival: window.arrival,
          departure: window.departure,
          nights: window.nights,
          status: "upcoming",
          active: 1,
          createdAt: now(),
          checkedInAt: null,
          checkedOutAt: null,
          propertyName: property.name,
          hostName: user.name,
          unitLabel: unit?.label ?? null,
        });
        result = { id, token, reference, entryCode };
        subject = id;
        break;
      }

      case "visitorStatus": {
        const visit = await t.get<VisitorRecord>(
          "visitors",
          text(input.id, "visitor"),
        );
        if (!visit || visit.orgId !== orgId)
          throw new AppError("Pass not found.", 404);
        await requireProperty(t, m, visit.propertyId);
        const status = choice(
          input.status,
          ["checked_in", "checked_out", "cancelled"] as const,
          "status",
        );
        // Arrivals are recorded at the gate or reception, by the guard or a
        // manager scanning the pass. A resident holds a copy so a guest with
        // no phone still has something to present, but the resident never
        // records the arrival themselves: they can only cancel their own pass.
        if (
          m.role === "tenant" &&
          (visit.hostId !== user.id || status !== "cancelled")
        )
          throw new AppError(
            "Only the guard or reception can check a guest in or out. You can cancel a pass you created.",
            403,
          );
        if (
          (status === "checked_out" && visit.status !== "checked_in") ||
          (status !== "checked_out" && visit.status !== "upcoming")
        )
          throw new AppError(
            "This pass has already changed. Refresh and try again.",
            409,
          );
        // A sleepover's departure belongs to a later date, so the window runs
        // from the arrival on visitDate to the departure on endDate.
        if (
          status === "checked_in" &&
          (Date.now() < startsAt(visit) ||
            Date.now() >= endsAt({ ...visit, endDate: visit.endDate || visit.visitDate }))
        )
          throw new AppError("This pass is outside its arrival window.", 409);
        const stamp = now();
        t.update("visitors", visit.id, {
          status,
          // The pass stops occupying one of the unit's guest slots.
          active: status === "checked_in" ? 1 : 0,
          ...(status === "checked_in" ? { checkedInAt: stamp } : {}),
          ...(status === "checked_out" ? { checkedOutAt: stamp } : {}),
        });
        subject = visit.id;
        break;
      }

      case "report": {
        const property = await requireProperty(t, m, input.propertyId);
        const urgency = parseUrgency(input.urgency);
        // The manager's queue needs to know which door to knock on.
        const unit = m.unitId
          ? await t.get<UnitRecord>("units", m.unitId)
          : undefined;
        const id = randomUUID();
        t.create("reports", id, {
          orgId,
          propertyId: property.id,
          authorId: user.id,
          authorName: user.name,
          category: choice(
            input.category,
            ["Maintenance", "Security", "Noise", "Other"] as const,
            "category",
          ),
          description: text(input.description, "description", 3000),
          urgency,
          urgencyRank: rank(urgency),
          status: "open",
          createdAt: now(),
          unitLabel: unit?.label ?? null,
        });
        result = { id, urgency };
        subject = id;
        break;
      }

      case "reportStatus": {
        manager(m);
        const report = await t.get<ReportRecord>(
          "reports",
          text(input.id, "report"),
        );
        if (!report || report.orgId !== orgId)
          throw new AppError("Report not found.", 404);
        t.update("reports", report.id, {
          status: choice(
            input.status,
            ["open", "in_progress", "resolved"] as const,
            "status",
          ),
        });
        subject = report.id;
        break;
      }

      case "reportUrgency": {
        // Residents say how bad it feels; the manager triages what it is.
        manager(m);
        const report = await t.get<ReportRecord>(
          "reports",
          text(input.id, "report"),
        );
        if (!report || report.orgId !== orgId)
          throw new AppError("Report not found.", 404);
        const urgency = parseUrgency(input.urgency);
        t.update("reports", report.id, { urgency, urgencyRank: rank(urgency) });
        subject = report.id;
        break;
      }

      case "contractor": {
        manager(m);
        const details = parseContractor(input);
        const id = randomUUID();
        t.create("contractors", id, {
          orgId,
          ...details,
          createdAt: now(),
        });
        result = { id };
        subject = id;
        break;
      }

      case "contractorUpdate": {
        manager(m);
        const existing = await t.get<ContractorRecord>(
          "contractors",
          text(input.id, "contact"),
        );
        if (!existing || existing.orgId !== orgId)
          throw new AppError("Contact not found.", 404);
        t.update("contractors", existing.id, { ...parseContractor(input) });
        subject = existing.id;
        break;
      }

      case "contractorRemove": {
        manager(m);
        const existing = await t.get<ContractorRecord>(
          "contractors",
          text(input.id, "contact"),
        );
        if (!existing || existing.orgId !== orgId)
          throw new AppError("Contact not found.", 404);
        t.remove("contractors", existing.id);
        subject = existing.id;
        break;
      }

      default:
        throw new AppError("Unknown action.");
    }

    t.create("audit", randomUUID(), {
      orgId,
      userId: user.id,
      userName: user.name,
      action,
      subject,
      createdAt: now(),
    });
    return result;
  });
}

/* ------------------------------------------------------------------ */
/* Invitation redemption                                               */
/* ------------------------------------------------------------------ */

export async function join(
  input: Record<string, unknown>,
  context?: RequestContext,
) {
  const token = text(input.token, "invitation token", 128);
  const invitee = email(input.email);
  await throttle([
    bucket(`join:${invitee}`, 10),
    bucket(`join:ip:${context?.ip || "unknown"}`, 20),
  ]);

  const invitation = await store().first<InvitationRecord>("invitations", {
    where: [["hash", "==", hashToken(token)]],
  });
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.expiresAt <= now() ||
    invitation.email.toLowerCase() !== invitee
  )
    throw new AppError(
      "Invitation is invalid, expired, or belongs to another email.",
      400,
    );

  const existing = await store().first<UserRecord>("users", {
    where: [["email", "==", invitee]],
  });
  const supplied = password(input.password);
  if (existing) {
    const confirmed = await identity().verifyPassword(invitee, supplied);
    if (!confirmed || confirmed.id !== existing.id)
      throw new AppError(
        "Enter the password for your existing SangoPass account.",
        401,
      );
  }

  const userId = existing?.id || randomUUID();
  const name = existing?.name || text(input.name, "name", 100);
  const created = !existing;
  let secret = existing?.password ?? "";
  if (created) {
    const account = await prepareAccount({
      id: userId,
      email: invitee,
      name,
      password: supplied,
    });
    secret = account.secret;
  }

  const organisation = await store().get<OrganisationRecord>(
    "organisations",
    invitation.orgId,
  );
  if (!organisation) throw new AppError("Invitation is no longer available.", 409);

  try {
    await store().tx(async (t) => {
      const live = await t.get<InvitationRecord>("invitations", invitation.id);
      if (!live || live.acceptedAt || live.expiresAt <= now())
        throw new AppError("Invitation is no longer available.", 409);
      const already = await t.get<MembershipRecord>(
        "memberships",
        membershipId(userId, invitation.orgId),
      );
      if (already)
        throw new AppError("You already belong to this organisation.", 409);
      const unit = invitation.unitId
        ? await t.get<UnitRecord>("units", invitation.unitId)
        : undefined;
      if (invitation.unitId && (!unit || unit.residentId))
        throw new AppError(
          "This unit is already occupied. Ask your manager for a new invitation.",
          409,
        );

      if (created) {
        t.reserve(`userEmail:${invitee}`, userId);
        t.create("users", userId, {
          email: invitee,
          name,
          password: secret,
          createdAt: now(),
        });
      }
      if (invitation.unitId) t.reserve(`unitResident:${invitation.unitId}`, userId);
      if (invitation.role === "tenant" && invitation.propertyId && invitation.usernameKey)
        t.reserve(
          `username:${invitation.propertyId}:${invitation.usernameKey}`,
          userId,
        );
      t.create("memberships", membershipId(userId, invitation.orgId), {
        userId,
        orgId: invitation.orgId,
        role: invitation.role,
        propertyId: invitation.propertyId,
        unitId: invitation.unitId,
        username: invitation.username,
        usernameKey: invitation.usernameKey,
        orgName: organisation.name,
        memberName: name,
        userEmail: invitee,
      });
      if (unit)
        t.update("units", unit.id, {
          residentId: userId,
          residentName: name,
        });
      t.update("invitations", invitation.id, { acceptedAt: now() });
      t.create("audit", randomUUID(), {
        orgId: invitation.orgId,
        userId,
        userName: name,
        action: "join",
        subject: invitation.id,
        createdAt: now(),
      });
    });
  } catch (error) {
    if (created) await rollbackAccount(userId);
    throw error;
  }

  return { token: await createSession(userId), orgId: invitation.orgId };
}

export type { Membership };
