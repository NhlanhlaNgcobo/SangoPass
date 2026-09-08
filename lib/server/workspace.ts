import { randomUUID } from "node:crypto";
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
import { AppError, choice, email, money, password, text } from "./validation";
import type {
  Account,
  LiveInvoice,
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
    },
    properties: properties.map(
      (p): LiveProperty => ({
        id: p.id,
        orgId: p.orgId,
        name: p.name,
        address: p.address,
        type: p.type,
        loginCode: p.loginCode,
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
        });
        result = { id };
        subject = id;
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
        const property = await requireProperty(t, m, input.propertyId);
        const label = text(input.label, "unit label", 50);
        const rentCents = money(input.rent);
        const limit = planFor(org.plan).units;
        const count = await t.count("units", {
          where: [["orgId", "==", orgId]],
        });
        if (count >= limit)
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
          frequency: "monthly",
          residentId: null,
          residentName: null,
        });
        result = { id };
        subject = id;
        break;
      }

      case "rent": {
        manager(m);
        const unit = await t.get<UnitRecord>("units", text(input.unitId, "unit"));
        if (!unit || unit.orgId !== orgId)
          throw new AppError("Unit not found.", 404);
        await requireProperty(t, m, unit.propertyId);
        t.update("units", unit.id, { rentPaid: input.paid === true ? 1 : 0 });
        subject = unit.id;
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
          property = await requireProperty(t, m, input.propertyId);
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
          if (!unit || unit.propertyId !== propertyId)
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
          t.update("units", target.unitId, {
            residentId: null,
            residentName: null,
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

        const property = await requireProperty(t, m, input.propertyId);
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
        t.reserve(`visitorRef:${reference}`, id);
        t.reserve(`visitorToken:${token}`, id);
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
        result = { id, token, reference };
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
