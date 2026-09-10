import { parseContractor, parseUrgency } from "@/lib/server/maintenance";
import { rank } from "@/lib/shared/maintenance";
import { maskIdNumber } from "@/lib/shared/identity";
import {
  OFFICE_STATUSES,
  REQUEST_KINDS,
  stillOpen,
} from "@/lib/shared/notices";
import { AppError, choice, colour, money, text } from "@/lib/server/validation";
import { themeReadable } from "@/lib/shared/theme";
import { currentPeriod } from "@/lib/shared/money";
import { parseLedgerEntry } from "@/lib/server/finance";
import { parseAnnouncement } from "@/lib/server/announcements";
import {
  allowsDay,
  describeDays,
  needsUnit,
  parseRegular,
  sastTime,
} from "@/lib/server/regulars";
import {
  DEFAULT_LIMITS,
  endsAt,
  limitsOf,
  monthBounds,
  nightsUsed,
  parseLimits,
  sastToday,
  startsAt,
  visitWindow,
  visitorIdentity,
} from "@/lib/server/visits";
import type {
  LiveContractor,
  LiveProperty,
  LiveReport,
  LiveUnit,
  LiveVisitor,
} from "@/types/workspace";
import {
  DEMO_ORG_ID,
  demoGateCode,
  DEMO_PASSWORD,
  type DemoPersona,
  type DemoWorld,
} from "./world";

/**
 * Applies a workspace command to the in-browser demo world.
 *
 * The validation, the visitor limits, the visit window and the role rules are
 * the same functions the server runs, imported directly rather than copied, so
 * the demo cannot drift into promising behaviour the product does not have.
 * What is simulated is only persistence and identity.
 */
export interface DemoResult {
  world: DemoWorld;
  result: Record<string, unknown>;
}

const now = () => new Date().toISOString();

function next(world: DemoWorld, prefix: string) {
  world.seq += 1;
  return `${prefix}-${world.seq}`;
}

const reference = (n: number) =>
  "SP-" +
  (n * 2654435761).toString(36).toUpperCase().padStart(10, "X").slice(0, 10);

const passToken = (n: number) =>
  (n.toString(16).padStart(4, "0") + "d3m0").repeat(8).slice(0, 64);

/**
 * The gate code for a pass booked inside the demo.
 *
 * The server claims every code with a uniqueness reservation, so no two passes
 * can ever carry the same one. The demo has no reservations, so it walks to
 * the next free code instead - the guarantee a prospect sees is the guarantee
 * the product makes.
 */
function gateCode(world: DemoWorld, seq: number): string {
  let code = demoGateCode(seq);
  for (
    let step = 1;
    step < 64 && world.visitors.some((v) => v.entryCode === code);
    step += 1
  )
    code = demoGateCode(seq + step * 97);
  return code;
}

function requireManager(persona: DemoPersona) {
  if (persona.role !== "manager")
    throw new AppError("A manager account is required.", 403);
}

/** The office: a manager, or reception acting for them. Mirrors office(). */
function requireOffice(persona: DemoPersona) {
  if (persona.role !== "manager" && persona.role !== "reception")
    throw new AppError("A manager or reception account is required.", 403);
}

function requireProperty(
  world: DemoWorld,
  persona: DemoPersona,
  id: unknown,
): LiveProperty {
  const property = world.properties.find((p) => p.id === text(id, "property"));
  if (
    !property ||
    (persona.role !== "manager" && persona.propertyId !== property.id)
  )
    throw new AppError("Property not available.", 404);
  return property;
}

export function apply(
  world: DemoWorld,
  persona: DemoPersona,
  input: Record<string, unknown>,
): DemoResult {
  // Work on a copy so a rejected command changes nothing, exactly as a rolled
  // back transaction would.
  const draft: DemoWorld = {
    ...world,
    properties: [...world.properties],
    units: [...world.units],
    ledger: [...world.ledger],
    members: [...world.members],
    visitors: [...world.visitors],
    reports: [...world.reports],
    contractors: [...world.contractors],
    tenancies: [...world.tenancies],
    documents: [...world.documents],
    requests: [...world.requests],
    announcements: [...world.announcements],
    regulars: [...world.regulars],
    movements: [...world.movements],
    invoices: [...world.invoices],
    invitations: [...world.invitations],
  };
  const action = String(input.action);
  let result: Record<string, unknown> = {};

  switch (action) {
    case "property": {
      requireOffice(persona);
      const name = text(input.name, "property name", 100);
      if (
        draft.properties.some(
          (p) => p.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw new AppError("That record already exists.", 409);
      const id = next(draft, "property");
      draft.properties = [
        ...draft.properties,
        {
          id,
          orgId: DEMO_ORG_ID,
          name,
          address: text(input.address, "address", 250),
          type: choice(
            input.type,
            ["apartment", "student_accommodation"] as const,
            "property type",
          ),
          loginCode: `demo${draft.seq}code`,
          ...DEFAULT_LIMITS,
          archivedAt: null,
        },
      ];
      result = { id };
      break;
    }

    // Held on the demo organisation exactly as the server holds it, so
    // switching to the tenant or security persona shows the manager's colours
    // already applied - which is the whole point of the feature.
    case "branding": {
      requireOffice(persona);
      const theme = {
        primary: colour(input.primary, "primary colour"),
        accent: colour(input.accent, "accent colour"),
      };
      if (!themeReadable(theme))
        throw new AppError(
          "Those colours would leave text hard to read. Use a darker primary, a lighter accent, or a stronger contrast between the two.",
        );
      draft.organisation = { ...draft.organisation, theme };
      result = { ...theme };
      break;
    }

    case "unitUpdate": {
      requireOffice(persona);
      const id = text(input.id, "unit");
      const target = draft.units.find((u) => u.id === id);
      if (!target) throw new AppError("Unit not found.", 404);
      const label = text(input.label, "unit label", 50);
      const rentCents = money(input.rent);
      if (
        draft.units.some(
          (u) =>
            u.id !== id &&
            u.propertyId === target.propertyId &&
            u.label.toLowerCase() === label.toLowerCase(),
        )
      )
        throw new AppError("That record already exists.", 409);
      draft.units = draft.units.map((u) =>
        u.id === id ? { ...u, label, rentCents } : u,
      );
      // A pass not yet used names the door a guard sends the visitor to.
      draft.visitors = draft.visitors.map((v) =>
        v.unitId === id &&
        (v.status === "upcoming" || v.status === "checked_in")
          ? { ...v, unitLabel: label }
          : v,
      );
      result = { id, label, rentCents };
      break;
    }

    case "unitArchive": {
      requireOffice(persona);
      const id = text(input.id, "unit");
      const target = draft.units.find((u) => u.id === id);
      if (!target) throw new AppError("Unit not found.", 404);
      const archive = input.archived !== false;
      if (archive && target.residentName)
        throw new AppError(
          `${target.residentName} still lives in ${target.label}. Remove them from People first.`,
          409,
        );
      draft.units = draft.units.map((u) =>
        u.id === id
          ? {
              ...u,
              archivedAt: archive ? now() : null,
              archivedWithProperty: false,
              ...(archive ? { rentPaid: 0, rentPaidPeriod: "" } : {}),
            }
          : u,
      );
      result = { id, archived: archive };
      break;
    }

    case "propertyUpdate": {
      requireOffice(persona);
      const property = requireProperty(draft, persona, input.id);
      const name = text(input.name, "property name", 100);
      if (
        draft.properties.some(
          (p) =>
            p.id !== property.id && p.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw new AppError("That record already exists.", 409);
      const type = choice(
        input.type,
        ["apartment", "student_accommodation"] as const,
        "property type",
      );
      const address = text(input.address, "address", 250);
      draft.properties = draft.properties.map((p) =>
        p.id === property.id ? { ...p, name, address, type } : p,
      );
      result = { id: property.id, name };
      break;
    }

    case "propertyArchive": {
      requireOffice(persona);
      const property = requireProperty(draft, persona, input.id);
      const archive = input.archived !== false;
      const units = draft.units.filter((u) => u.propertyId === property.id);
      if (archive) {
        const occupied = units.filter((u) => !u.archivedAt && u.residentName);
        if (occupied.length)
          throw new AppError(
            `${occupied.length} ${occupied.length === 1 ? "unit is" : "units are"} still occupied at ${property.name}. Remove those residents from People first.`,
            409,
          );
      }
      const stamp = now();
      // Only the units this building took with it come back with it, matched
      // by the timestamp they were archived under.
      const follows = (u: LiveUnit) =>
        u.propertyId === property.id &&
        (archive ? !u.archivedAt : u.archivedAt && u.archivedWithProperty);
      draft.units = draft.units.map((u) =>
        follows(u)
          ? {
              ...u,
              archivedAt: archive ? stamp : null,
              archivedWithProperty: archive,
              ...(archive ? { rentPaid: 0, rentPaidPeriod: "" } : {}),
            }
          : u,
      );
      draft.properties = draft.properties.map((p) =>
        p.id === property.id ? { ...p, archivedAt: archive ? stamp : null } : p,
      );
      result = { id: property.id, archived: archive };
      break;
    }

    case "propertyLimits": {
      requireOffice(persona);
      const property = requireProperty(draft, persona, input.propertyId);
      const limits = parseLimits(input);
      draft.properties = draft.properties.map((p) =>
        p.id === property.id ? { ...p, ...limits } : p,
      );
      result = { ...limits };
      break;
    }

    case "unit": {
      requireOffice(persona);
      const property = requireProperty(draft, persona, input.propertyId);
      const label = text(input.label, "unit label", 50);
      if (
        draft.units.some(
          (u) =>
            u.propertyId === property.id &&
            u.label.toLowerCase() === label.toLowerCase(),
        )
      )
        throw new AppError("That record already exists.", 409);
      const id = next(draft, "unit");
      draft.units = [
        ...draft.units,
        {
          id,
          propertyId: property.id,
          label,
          rentCents: money(input.rent),
          rentPaid: 0,
          rentPaidPeriod: "",
          archivedAt: null,
          archivedWithProperty: false,
          frequency: "monthly",
          residentName: null,
        },
      ];
      result = { id };
      break;
    }

    /**
     * Marking rent paid also writes the receipt into the books, exactly as the
     * server does, so a prospect who marks a unit paid watches the money
     * screen move. Unmarking takes it off again.
     */
    case "rent": {
      requireManager(persona);
      const id = text(input.unitId, "unit");
      const target = draft.units.find((u) => u.id === id);
      if (!target) throw new AppError("Unit not found.", 404);
      const period = currentPeriod();
      const paid = input.paid === true;
      draft.units = draft.units.map((u) =>
        u.id === id
          ? { ...u, rentPaid: paid ? 1 : 0, rentPaidPeriod: paid ? period : "" }
          : u,
      );
      draft.ledger = draft.ledger.filter(
        (entry) =>
          !(
            entry.unitId === id &&
            entry.period === period &&
            entry.category === "rent"
          ),
      );
      if (paid && target.rentCents > 0) {
        const property = draft.properties.find(
          (p) => p.id === target.propertyId,
        );
        draft.ledger = [
          {
            id: next(draft, "ledger"),
            period,
            kind: "income",
            category: "rent",
            nature: "fixed",
            amountCents: target.rentCents,
            description: `Rent received — ${target.label}`,
            propertyId: target.propertyId,
            propertyName: property?.name ?? "",
            unitId: target.id,
            unitLabel: target.label,
            recordedBy: persona.name,
            createdAt: now(),
          },
          ...draft.ledger,
        ];
      }
      break;
    }

    case "ledgerEntry": {
      requireManager(persona);
      const entry = parseLedgerEntry(input);
      const property = input.propertyId
        ? requireProperty(draft, persona, input.propertyId)
        : undefined;
      const id = next(draft, "ledger");
      draft.ledger = [
        {
          id,
          ...entry,
          propertyId: property?.id ?? null,
          propertyName: property?.name ?? "",
          unitId: null,
          unitLabel: null,
          recordedBy: persona.name,
          createdAt: now(),
        },
        ...draft.ledger,
      ];
      result = { id };
      break;
    }

    case "ledgerRemove": {
      requireManager(persona);
      const id = text(input.id, "entry");
      const entry = draft.ledger.find((e) => e.id === id);
      if (!entry) throw new AppError("Entry not found.", 404);
      if (entry.unitId)
        throw new AppError(
          "This is a rent receipt. Unmark the unit in Properties to take it off the books.",
          409,
        );
      draft.ledger = draft.ledger.filter((e) => e.id !== id);
      break;
    }

    case "invite": {
      requireOffice(persona);
      const role = choice(
        input.role,
        ["manager", "tenant", "security"] as const,
        "role",
      );
      const address = text(input.email, "email address", 254).toLowerCase();
      let propertyId: string | null = null;
      let unitId: string | null = null;
      let username: string | null = null;
      if (role !== "manager")
        propertyId = requireProperty(draft, persona, input.propertyId).id;
      if (role === "tenant") {
        const chosen = draft.units.find(
          (u) => u.id === text(input.unitId, "unit"),
        );
        if (!chosen || chosen.residentName)
          throw new AppError(
            "Choose a vacant unit without a pending invitation.",
            409,
          );
        unitId = chosen.id;
        const property = draft.properties.find((p) => p.id === propertyId)!;
        username =
          property.type === "student_accommodation"
            ? text(input.studentNumber, "student number", 80)
            : `SP-${chosen.label.replace(/[^a-zA-Z0-9]/g, "")}-DEMO${draft.seq}`;
      }
      const id = next(draft, "invitation");
      draft.invitations = [
        ...draft.invitations,
        {
          id,
          email: address,
          role,
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          username,
          emailStatus: "not_configured",
          emailSentAt: null,
          propertyId,
          unitId,
        },
      ];
      result = {
        invitationId: id,
        username,
        token: passToken(draft.seq),
        emailStatus: "not_configured",
      };
      break;
    }

    case "resendInvitation": {
      requireOffice(persona);
      const id = text(input.id, "invitation");
      const invitation = draft.invitations.find((i) => i.id === id);
      if (!invitation)
        throw new AppError("Invitation is no longer available.", 409);
      result = {
        invitationId: id,
        username: invitation.username,
        token: passToken(draft.seq + 100),
        emailStatus: "not_configured",
      };
      break;
    }

    case "revokeInvitation": {
      requireOffice(persona);
      const id = text(input.id, "invitation");
      draft.invitations = draft.invitations.filter((i) => i.id !== id);
      break;
    }

    case "removeMember": {
      requireOffice(persona);
      const id = text(input.id, "member");
      if (id === persona.id)
        throw new AppError("You cannot remove your own access.", 409);
      const member = draft.members.find((m) => m.id === id);
      if (!member) throw new AppError("Member not found.", 404);
      draft.members = draft.members.filter((m) => m.id !== id);
      if (member.unitId)
        draft.units = draft.units.map((u) =>
          u.id === member.unitId
            ? { ...u, residentName: null, rentPaid: 0, rentPaidPeriod: "" }
            : u,
        );
      draft.visitors = draft.visitors.map((v) =>
        v.hostId === id && v.status === "upcoming"
          ? { ...v, status: "cancelled" }
          : v,
      );
      break;
    }

    case "visitor": {
      if (persona.role !== "tenant")
        throw new AppError(
          "Only a resident can request a guest visit. Managers set the visitor limits for each property.",
          403,
        );
      // The real product re-authenticates here; the demo checks the same field
      // against a published sample password so the step is not skipped.
      if (String(input.password || "") !== DEMO_PASSWORD)
        throw new AppError(
          `That password is not correct. In this demo the password is "${DEMO_PASSWORD}".`,
          401,
        );
      const property = requireProperty(draft, persona, input.propertyId);
      const limits = limitsOf(property);
      const identity = visitorIdentity(property.type, input);
      const window = visitWindow(input, limits.maxConsecutiveNights);
      const phone = text(input.phone, "phone", 30);
      if (!/^\+?[\d ()-]{9,25}$/.test(phone))
        throw new AppError("Enter a valid phone number.");
      const visitorEmail =
        typeof input.visitorEmail === "string" && input.visitorEmail.trim()
          ? text(input.visitorEmail, "email address", 254).toLowerCase()
          : null;

      const mine = draft.visitors.filter((v) => v.unitId === persona.unitId);
      const active = mine.filter(
        (v) => v.status === "upcoming" || v.status === "checked_in",
      ).length;
      if (active >= limits.maxActiveGuests)
        throw new AppError(
          `Your unit already has ${active} active guest ${
            active === 1 ? "pass" : "passes"
          }, which is the limit set for this property. Cancel or check out a guest first.`,
          409,
        );
      if (window.nights > 0) {
        const month = monthBounds(window.visitDate);
        const used = nightsUsed(
          mine.filter(
            (v) => v.visitDate >= month.start && v.visitDate <= month.end,
          ),
        );
        if (used + window.nights > limits.sleepoverNightsPerMonth)
          throw new AppError(
            `This property allows ${limits.sleepoverNightsPerMonth} sleepover nights per unit each month. Your unit has used ${used} and this request needs ${window.nights}.`,
            409,
          );
      }

      const id = next(draft, "visit");
      const unit = draft.units.find((u) => u.id === persona.unitId);
      const visit: LiveVisitor = {
        id,
        propertyId: property.id,
        unitId: persona.unitId,
        hostId: persona.id,
        visitorName: text(input.visitorName, "visitor name", 100),
        phone,
        visitorEmail,
        idType: identity.idType,
        idNumber: maskIdNumber(identity.idNumber),
        reference: reference(draft.seq),
        token: passToken(draft.seq),
        entryCode: gateCode(draft, draft.seq),
        visitType: window.visitType,
        visitDate: window.visitDate,
        endDate: window.endDate,
        arrival: window.arrival,
        departure: window.departure,
        nights: window.nights,
        status: "upcoming",
        createdAt: now(),
        checkedInAt: null,
        checkedOutAt: null,
        propertyName: property.name,
        hostName: persona.name,
        unitLabel: unit?.label ?? null,
      };
      draft.visitors = [visit, ...draft.visitors];
      result = {
        id,
        token: visit.token,
        reference: visit.reference,
        entryCode: visit.entryCode,
        emailStatus: "not_configured",
        visitorEmailed: false,
        // The demo sends nothing at all, but a prospect needs to see what a
        // configured deployment does: the guest is texted their gate code.
        // Simulated alongside persistence and identity, and nothing else is.
        smsStatus: "sent",
      };
      break;
    }

    case "visitorStatus": {
      const visit = draft.visitors.find(
        (v) => v.id === text(input.id, "visitor"),
      );
      if (!visit) throw new AppError("Pass not found.", 404);
      requireProperty(draft, persona, visit.propertyId);
      const status = choice(
        input.status,
        ["checked_in", "checked_out", "cancelled"] as const,
        "status",
      );
      if (
        persona.role === "tenant" &&
        (visit.hostId !== persona.id || status !== "cancelled")
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
      if (
        status === "checked_in" &&
        (Date.now() < startsAt(visit) || Date.now() >= endsAt(visit))
      )
        throw new AppError("This pass is outside its arrival window.", 409);
      const at = now();
      draft.visitors = draft.visitors.map((v) =>
        v.id === visit.id
          ? {
              ...v,
              status,
              checkedInAt: status === "checked_in" ? at : v.checkedInAt,
              checkedOutAt: status === "checked_out" ? at : v.checkedOutAt,
            }
          : v,
      );
      break;
    }

    case "report": {
      const property = requireProperty(draft, persona, input.propertyId);
      const urgency = parseUrgency(input.urgency);
      const unit = draft.units.find((u) => u.id === persona.unitId);
      const id = next(draft, "report");
      const report: LiveReport = {
        id,
        propertyId: property.id,
        authorId: persona.id,
        authorName: persona.name,
        category: choice(
          input.category,
          ["Maintenance", "Security", "Noise", "Other"] as const,
          "category",
        ),
        description: text(input.description, "description", 3000),
        urgency,
        status: "open",
        createdAt: now(),
        unitLabel: unit?.label ?? null,
      };
      draft.reports = [report, ...draft.reports];
      result = { id, urgency };
      break;
    }

    case "reportStatus": {
      requireOffice(persona);
      const id = text(input.id, "report");
      const status = choice(
        input.status,
        ["open", "in_progress", "resolved"] as const,
        "status",
      );
      if (!draft.reports.some((r) => r.id === id))
        throw new AppError("Report not found.", 404);
      draft.reports = draft.reports.map((r) =>
        r.id === id ? { ...r, status } : r,
      );
      break;
    }

    case "reportUrgency": {
      requireOffice(persona);
      const id = text(input.id, "report");
      const urgency = parseUrgency(input.urgency);
      if (!draft.reports.some((r) => r.id === id))
        throw new AppError("Report not found.", 404);
      draft.reports = draft.reports.map((r) =>
        r.id === id ? { ...r, urgency } : r,
      );
      break;
    }

    case "contractor": {
      requireOffice(persona);
      const details = parseContractor(input);
      const id = next(draft, "contact");
      const contact: LiveContractor = { id, ...details };
      draft.contractors = [...draft.contractors, contact];
      result = { id };
      break;
    }

    case "contractorUpdate": {
      requireOffice(persona);
      const id = text(input.id, "contact");
      if (!draft.contractors.some((c) => c.id === id))
        throw new AppError("Contact not found.", 404);
      const details = parseContractor(input);
      draft.contractors = draft.contractors.map((c) =>
        c.id === id ? { ...c, ...details } : c,
      );
      break;
    }

    case "contractorRemove": {
      requireOffice(persona);
      const id = text(input.id, "contact");
      if (!draft.contractors.some((c) => c.id === id))
        throw new AppError("Contact not found.", 404);
      draft.contractors = draft.contractors.filter((c) => c.id !== id);
      break;
    }

    case "notice": {
      if (persona.role !== "tenant")
        throw new AppError(
          "Only a resident can give notice. The office answers notices instead.",
          403,
        );
      const property = requireProperty(world, persona, persona.propertyId);
      const unit = draft.units.find((u) => u.id === persona.unitId);
      const kind = choice(input.kind, REQUEST_KINDS, "notice type");
      const effectiveDate = text(input.effectiveDate, "date", 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate))
        throw new AppError("Enter the date as YYYY-MM-DD.");
      const id = next(draft, "notice");
      draft.requests = [
        {
          id,
          propertyId: property.id,
          propertyName: property.name,
          unitId: unit?.id ?? null,
          unitLabel: unit?.label ?? null,
          residentId: persona.id,
          residentName: persona.name,
          kind,
          effectiveDate,
          details: typeof input.details === "string" ? input.details : "",
          status: "open",
          createdAt: new Date().toISOString(),
          decidedAt: null,
          decidedByName: "",
          decisionNote: "",
        },
        ...draft.requests,
      ];
      result = { id };
      break;
    }

    case "noticeWithdraw": {
      const id = text(input.id, "notice");
      const notice = draft.requests.find((r) => r.id === id);
      if (!notice) throw new AppError("Notice not found.", 404);
      if (notice.residentId !== persona.id)
        throw new AppError("That is not your notice.", 403);
      if (!stillOpen(notice.status))
        throw new AppError(
          "This notice has already been answered, so it can no longer be withdrawn. Speak to the office.",
          409,
        );
      draft.requests = draft.requests.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "withdrawn" as const,
              decidedAt: new Date().toISOString(),
            }
          : r,
      );
      break;
    }

    case "noticeStatus": {
      requireOffice(persona);
      const id = text(input.id, "notice");
      const notice = draft.requests.find((r) => r.id === id);
      if (!notice) throw new AppError("Notice not found.", 404);
      if (notice.status === "withdrawn")
        throw new AppError(
          "The resident withdrew this notice. It stays withdrawn.",
          409,
        );
      const status = choice(input.status, OFFICE_STATUSES, "status");
      draft.requests = draft.requests.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              decidedAt: new Date().toISOString(),
              decidedByName: persona.name,
              decisionNote:
                typeof input.note === "string" && input.note.trim()
                  ? input.note
                  : r.decisionNote,
            }
          : r,
      );
      break;
    }

    case "companyName": {
      requireOffice(persona);
      const name = text(input.name, "company name", 120);
      draft.organisation = { ...draft.organisation, name };
      result = { name };
      break;
    }

    case "logoRemove": {
      requireOffice(persona);
      // The demo never had one to remove: nothing is stored, so nothing was
      // uploaded. Said plainly rather than pretending it worked.
      throw new AppError(
        "The demo keeps nothing, so there is no logo to remove. Uploading one works on a real account.",
        409,
      );
    }

    case "regular": {
      requireOffice(persona);
      const property = requireProperty(world, persona, input.propertyId);
      const pass = parseRegular(input, sastToday());
      const identity = visitorIdentity(property.type, input);
      // The same one message the server gives for a missing unit and a wrong
      // one: to the person filling the form they are the same mistake.
      const wanted =
        typeof input.unitId === "string" ? input.unitId.trim() : "";
      const unit = needsUnit(pass.kind)
        ? draft.units.find((u) => u.id === wanted)
        : undefined;
      if (needsUnit(pass.kind) && (!unit || unit.propertyId !== property.id))
        throw new AppError("Choose the unit this person works at.", 409);
      const id = next(draft, "regular");
      draft.regulars = [
        {
          id,
          propertyId: property.id,
          propertyName: property.name,
          unitId: unit?.id ?? null,
          unitLabel: unit?.label ?? null,
          personName: pass.personName,
          occupation: pass.occupation,
          employer: pass.employer,
          phone: pass.phone,
          kind: pass.kind,
          idType: identity.idType,
          idNumber: maskIdNumber(identity.idNumber),
          reference: reference(draft.seq),
          token: passToken(draft.seq),
          entryCode: gateCode(draft, draft.seq),
          days: pass.days,
          fromTime: pass.fromTime,
          toTime: pass.toTime,
          startDate: pass.startDate,
          endDate: pass.endDate,
          revokedAt: null,
          revokedByName: "",
          issuedByName: persona.name,
          createdAt: now(),
        },
        ...draft.regulars,
      ];
      result = { id };
      break;
    }

    case "regularRevoke": {
      requireOffice(persona);
      const id = text(input.id, "pass");
      const pass = draft.regulars.find((r) => r.id === id);
      if (
        !pass ||
        (persona.role !== "manager" && pass.propertyId !== persona.propertyId)
      )
        throw new AppError("Pass not found.", 404);
      draft.regulars = draft.regulars.map((r) =>
        r.id === id
          ? {
              ...r,
              revokedAt: r.revokedAt || now(),
              revokedByName: r.revokedAt ? r.revokedByName : persona.name,
            }
          : r,
      );
      break;
    }

    case "movement": {
      if (persona.role === "tenant")
        throw new AppError(
          "Only the guard or reception records an arrival.",
          403,
        );
      const id = text(input.id, "pass");
      const pass = draft.regulars.find((r) => r.id === id);
      if (!pass || pass.propertyId !== persona.propertyId)
        throw new AppError("Pass not found.", 404);
      const direction = choice(
        input.direction,
        ["in", "out"] as const,
        "direction",
      );
      const open = draft.movements.find(
        (mv) => mv.regularId === pass.id && !mv.outAt,
      );

      if (direction === "out") {
        if (!open)
          throw new AppError(
            `${pass.personName} is not signed in, so there is nothing to sign out.`,
            409,
          );
        draft.movements = draft.movements.map((mv) =>
          mv.id === open.id
            ? { ...mv, outAt: now(), outByName: persona.name }
            : mv,
        );
        break;
      }

      if (open)
        throw new AppError(
          `${pass.personName} is already signed in. Sign them out first.`,
          409,
        );
      // The same five refusals the server makes, in the same order, so a
      // prospect who tries the wrong day sees the product's own answer.
      const today = sastToday();
      const clock = sastTime();
      if (pass.revokedAt)
        throw new AppError(
          `This pass was revoked${pass.revokedByName ? ` by ${pass.revokedByName}` : ""}. Do not admit.`,
          409,
        );
      if (today < pass.startDate)
        throw new AppError(
          `This pass does not start until ${pass.startDate}.`,
          409,
        );
      if (today > pass.endDate)
        throw new AppError(
          `This pass expired on ${pass.endDate}. The office has to renew it.`,
          409,
        );
      if (!allowsDay(pass.days, today))
        throw new AppError(
          `${pass.personName} is not down for today. This pass is good ${describeDays(pass.days).toLowerCase()}.`,
          409,
        );
      if (clock < pass.fromTime || clock > pass.toTime)
        throw new AppError(
          `It is ${clock}. This pass admits between ${pass.fromTime} and ${pass.toTime}.`,
          409,
        );

      const movementId = next(draft, "movement");
      draft.movements = [
        {
          id: movementId,
          propertyId: pass.propertyId,
          regularId: pass.id,
          personName: pass.personName,
          occupation: pass.occupation,
          unitLabel: pass.unitLabel,
          date: today,
          inAt: now(),
          outAt: null,
          inByName: persona.name,
          outByName: "",
        },
        ...draft.movements,
      ];
      result = { movementId };
      break;
    }

    case "announce": {
      requireOffice(persona);
      // The same rule the server applies: reception announces to the building
      // it sits in, and the whole organisation is a manager's to address.
      const wide = !input.propertyId || input.propertyId === "all";
      if (wide && persona.role !== "manager")
        throw new AppError(
          "Reception announces to its own property. Ask a manager to send one to the whole organisation.",
          403,
        );
      const property = wide
        ? null
        : requireProperty(world, persona, input.propertyId);
      const announcement = parseAnnouncement(input, sastToday());
      const id = next(draft, "announcement");
      draft.announcements = [
        {
          id,
          propertyId: property?.id ?? null,
          propertyName: property?.name ?? "",
          title: announcement.title,
          body: announcement.body,
          level: announcement.level,
          audience: announcement.audience,
          showUntil: announcement.showUntil,
          publishedAt: new Date().toISOString(),
          editedAt: null,
          authorName: persona.name,
          archivedAt: null,
        },
        ...draft.announcements,
      ];
      result = { id };
      break;
    }

    case "announcementUpdate": {
      requireOffice(persona);
      const id = text(input.id, "announcement");
      const existing = draft.announcements.find((a) => a.id === id);
      if (
        !existing ||
        (persona.role !== "manager" &&
          existing.propertyId !== persona.propertyId)
      )
        throw new AppError("Announcement not found.", 404);
      if (existing.archivedAt)
        throw new AppError(
          "This announcement has been taken down. Publish a new one instead.",
          409,
        );
      // Audience and building are fixed once published, exactly as on the
      // server: they are what decided whose dashboard it landed on.
      const edit = parseAnnouncement(
        { ...input, audience: existing.audience },
        sastToday(),
      );
      draft.announcements = draft.announcements.map((a) =>
        a.id === id
          ? {
              ...a,
              title: edit.title,
              body: edit.body,
              level: edit.level,
              showUntil: edit.showUntil,
              editedAt: new Date().toISOString(),
            }
          : a,
      );
      break;
    }

    case "announcementTakeDown": {
      requireOffice(persona);
      const id = text(input.id, "announcement");
      const existing = draft.announcements.find((a) => a.id === id);
      if (
        !existing ||
        (persona.role !== "manager" &&
          existing.propertyId !== persona.propertyId)
      )
        throw new AppError("Announcement not found.", 404);
      draft.announcements = draft.announcements.map((a) =>
        a.id === id
          ? { ...a, archivedAt: a.archivedAt || new Date().toISOString() }
          : a,
      );
      break;
    }

    case "documentRemove": {
      requireOffice(persona);
      const id = text(input.id, "document");
      if (!draft.documents.some((d) => d.id === id))
        throw new AppError("Document not found.", 404);
      draft.documents = draft.documents.filter((d) => d.id !== id);
      break;
    }

    default:
      throw new AppError("Unknown action.");
  }

  // Keep the queue ordered the way the server returns it.
  draft.reports = [...draft.reports].sort(
    (a, b) =>
      rank(a.urgency) - rank(b.urgency) ||
      b.createdAt.localeCompare(a.createdAt),
  );
  return { world: draft, result };
}

export type { LiveUnit };
