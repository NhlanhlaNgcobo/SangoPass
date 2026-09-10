import { hashToken, newToken, now } from "./auth";
import { store } from "./store";
import type {
  InvitationRecord,
  MembershipRecord,
  PropertyRecord,
  Tx,
  UnitRecord,
} from "./store";
import { AppError, email as emailAddress, text } from "./validation";
import { MAX_IMPORT_ROWS, headerIndex, parseCsv } from "@/lib/shared/csv";

export { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from "@/lib/shared/csv";
import { randomUUID } from "node:crypto";

export const USERNAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$/;

export const USERNAME_RULE =
  "Student numbers must be 2-80 letters, digits, dots, hyphens or underscores. Leading zeroes are preserved.";

/**
 * The credential a resident signs in with.
 *
 * A student residence keeps the student number exactly as the institution
 * issues it, leading zeroes and all, because that is the number on the card
 * and the one the resident already knows. An apartment has no such number, so
 * one is minted from the unit label and a random tail - unit-linked, so a
 * resident can read their own username and see which door it belongs to.
 *
 * One definition, used by the single enrolment and the bulk import alike: two
 * copies of a credential format is exactly how the two quietly drift apart.
 */
export function tenantUsername(
  property: PropertyRecord,
  unit: UnitRecord,
  studentNumber: unknown,
): string {
  if (property.type !== "student_accommodation")
    return (
      "SP-" +
      (unit.label.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || "UNIT") +
      "-" +
      newToken().slice(0, 8).toUpperCase()
    );
  const supplied = text(studentNumber, "student number", 80);
  if (!USERNAME.test(supplied)) throw new AppError(USERNAME_RULE);
  return supplied;
}

export interface NewInvitation {
  orgId: string;
  email: string;
  role: string;
  propertyId: string | null;
  unitId: string | null;
  username: string | null;
}

/** Seven days: long enough for somebody on leave, short enough to expire. */
export const INVITATION_DAYS = 7;

/**
 * Writes one invitation and hands back the token that redeems it.
 *
 * The token is returned and never stored; only its hash is kept, so a leaked
 * database cannot be used to accept invitations on other people's behalf.
 */
export function createInvitation(t: Tx, invitation: NewInvitation) {
  const token = newToken();
  const id = randomUUID();
  t.create("invitations", id, {
    orgId: invitation.orgId,
    email: invitation.email,
    role: invitation.role,
    propertyId: invitation.propertyId,
    unitId: invitation.unitId,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITATION_DAYS * 86400000).toISOString(),
    acceptedAt: null,
    username: invitation.username,
    usernameKey: invitation.username ? invitation.username.toLowerCase() : null,
    emailStatus: "not_sent",
    emailSentAt: null,
  });
  return { id, token };
}

/* ------------------------------------------------------------------ */
/* Bulk import                                                         */
/* ------------------------------------------------------------------ */

export interface ImportRow {
  /** The line in the file the manager is looking at, header counted. */
  line: number;
  email: string;
  unitLabel: string;
  studentNumber: string;
}

export interface RowProblem {
  line: number;
  message: string;
}

export interface ImportPlan {
  rows: (ImportRow & { unitId: string; username: string })[];
}

/**
 * Reads a roll and decides, for every line, whether it can be enrolled.
 *
 * Nothing is written here. The whole file is checked first and refused as a
 * whole, because a half-applied import is worse than a refused one: a manager
 * who does not know which forty of their hundred rows landed has to reconcile
 * by hand, and the natural second attempt - upload it again - would then
 * double-enrol everybody who succeeded the first time.
 */
export function planImport(
  csv: string,
  property: PropertyRecord,
  units: UnitRecord[],
  members: MembershipRecord[],
  pending: InvitationRecord[],
): { plan: ImportPlan; problems: RowProblem[] } {
  const table = parseCsv(csv);
  if (!table.length) throw new AppError("That file has nothing in it.", 400);

  const header = headerIndex(table[0]);
  if (header.email < 0)
    throw new AppError(
      "The file needs a column headed Email. The first row must be the headings.",
    );
  if (header.unit < 0)
    throw new AppError(
      "The file needs a column headed Unit, holding the unit label exactly as it appears in Properties.",
    );
  const student = property.type === "student_accommodation";
  if (student && header.studentNumber < 0)
    throw new AppError(
      `${property.name} is a student residence, so the file also needs a column headed Student number.`,
    );

  const body = table.slice(1);
  if (!body.length)
    throw new AppError("That file has headings and no residents under them.");
  if (body.length > MAX_IMPORT_ROWS)
    throw new AppError(
      `One file enrols up to ${MAX_IMPORT_ROWS} residents and this one has ${body.length}. Split it and send them in turn.`,
    );

  // Everything the file is checked against, read once rather than per row.
  const openUnits = new Map(
    units
      .filter((unit) => !unit.archivedAt)
      .map((unit) => [unit.label.trim().toLowerCase(), unit]),
  );
  const occupied = new Set(
    units.filter((unit) => unit.residentId).map((unit) => unit.id),
  );
  const live = pending.filter(
    (invitation) => !invitation.acceptedAt && invitation.expiresAt > now(),
  );
  for (const invitation of live)
    if (invitation.unitId) occupied.add(invitation.unitId);
  const takenEmails = new Set(members.map((m) => m.userEmail));
  const takenUsernames = new Set(
    [
      ...members.map((m) => m.usernameKey),
      ...live.map((invitation) => invitation.usernameKey),
    ].filter((key): key is string => Boolean(key)),
  );

  // Claims made by earlier rows of this same file. Without these, a file that
  // lists one unit twice would pass every check and then fail at the write,
  // or worse, enrol two people into one flat.
  const seenEmails = new Set<string>();
  const seenUnits = new Set<string>();
  const seenUsernames = new Set<string>();

  const problems: RowProblem[] = [];
  const rows: ImportPlan["rows"] = [];

  body.forEach((cells, index) => {
    // The header is line 1, so the first resident is on line 2 - which is what
    // the manager's spreadsheet shows them down the side.
    const line = index + 2;
    const cell = (at: number) => (at >= 0 ? (cells[at] ?? "").trim() : "");
    const fail = (message: string) => problems.push({ line, message });

    let address = "";
    try {
      address = emailAddress(cell(header.email));
    } catch {
      fail(`"${cell(header.email)}" is not an email address.`);
      return;
    }
    if (seenEmails.has(address)) {
      fail(`${address} appears more than once in this file.`);
      return;
    }
    if (takenEmails.has(address)) {
      fail(`${address} already belongs to this organisation.`);
      return;
    }

    const label = cell(header.unit);
    if (!label) {
      fail("No unit given.");
      return;
    }
    const unit = openUnits.get(label.toLowerCase());
    if (!unit) {
      fail(`There is no unit called "${label}" at ${property.name}.`);
      return;
    }
    if (occupied.has(unit.id)) {
      fail(`${unit.label} already has a resident or a pending invitation.`);
      return;
    }
    if (seenUnits.has(unit.id)) {
      fail(`${unit.label} is claimed more than once in this file.`);
      return;
    }

    const studentNumber = cell(header.studentNumber);
    let username: string;
    if (student) {
      if (!studentNumber) {
        fail("No student number given.");
        return;
      }
      if (!USERNAME.test(studentNumber)) {
        fail(`"${studentNumber}" is not a valid student number.`);
        return;
      }
      username = studentNumber;
      const key = username.toLowerCase();
      if (seenUsernames.has(key)) {
        fail(`Student number ${username} appears more than once in this file.`);
        return;
      }
      if (takenUsernames.has(key)) {
        fail(`Student number ${username} is already enrolled here.`);
        return;
      }
      seenUsernames.add(key);
    } else {
      username = tenantUsername(property, unit, undefined);
    }

    seenEmails.add(address);
    seenUnits.add(unit.id);
    rows.push({
      line,
      email: address,
      unitLabel: unit.label,
      studentNumber,
      unitId: unit.id,
      username,
    });
  });

  return { plan: { rows }, problems };
}

/**
 * Enrols a whole file, or none of it.
 *
 * The reads that decide the answer happen before the transaction, because
 * they are the same three lists for every row and re-reading them per row
 * would turn a hundred-resident import into three hundred queries. The
 * transaction then re-checks nothing: it is opened only once the plan is
 * known to be sound, and a race with a single enrolment of the same unit is
 * caught by the unit's own uniqueness at redemption time.
 */
export async function importResidents(
  orgId: string,
  property: PropertyRecord,
  csv: string,
): Promise<
  | { ok: false; problems: RowProblem[] }
  | { ok: true; invitations: { id: string; token: string; email: string }[] }
> {
  const database = store();
  const [units, members, pending] = await Promise.all([
    database.find<UnitRecord>("units", {
      where: [["propertyId", "==", property.id]],
    }),
    database.find<MembershipRecord>("memberships", {
      where: [["orgId", "==", orgId]],
    }),
    database.find<InvitationRecord>("invitations", {
      where: [
        ["orgId", "==", orgId],
        ["acceptedAt", "==", null],
      ],
    }),
  ]);

  const { plan, problems } = planImport(csv, property, units, members, pending);
  if (problems.length) return { ok: false, problems };

  return database.tx(async (t) => {
    const invitations = plan.rows.map((row) => ({
      email: row.email,
      ...createInvitation(t, {
        orgId,
        email: row.email,
        role: "tenant",
        propertyId: property.id,
        unitId: row.unitId,
        username: row.username,
      }),
    }));
    return { ok: true as const, invitations };
  });
}
