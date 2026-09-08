import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "./db";
import {
  createSession,
  hashPassword,
  hashToken,
  memberships,
  newToken,
  now,
  throttle,
  verifyPassword,
} from "./auth";
import { AppError, choice, email, money, password, text } from "./validation";
import type {
  Account,
  Membership,
  WorkspaceState,
  LiveVisitor,
  LiveProperty,
} from "@/types/workspace";

export function access(user: Account, orgId: string): Membership {
  const membership = memberships(user.id).find((m) => m.orgId === orgId);
  if (!membership)
    throw new AppError("You do not have access to this organisation.", 403);
  return membership;
}
function manager(m: Membership) {
  if (m.role !== "manager")
    throw new AppError("A manager account is required.", 403);
}
function property(m: Membership, id: unknown) {
  const p = one<LiveProperty>(
    "SELECT * FROM properties WHERE id=? AND orgId=?",
    text(id, "property"),
    m.orgId,
  );
  if (!p || (m.role !== "manager" && m.propertyId !== p.id))
    throw new AppError("Property not available.", 404);
  return p;
}
export function workspace(user: Account, orgId?: string): WorkspaceState {
  const list = memberships(user.id);
  const m = access(user, orgId || list[0]?.orgId || "");
  const org = one<WorkspaceState["organisation"]>(
    "SELECT * FROM organisations WHERE id=?",
    m.orgId,
  )!;
  org.active = (org.paidUntil || "") > now() || org.trialUntil > now();
  const propertyFilter = m.role === "manager" ? "" : " AND p.id=?";
  const params = m.role === "manager" ? [m.orgId] : [m.orgId, m.propertyId];
  const visitorFilter =
    m.role === "manager"
      ? ""
      : m.role === "security"
        ? " AND v.propertyId=?"
        : " AND v.hostId=?";
  const visitorParams =
    m.role === "manager"
      ? [m.orgId]
      : [m.orgId, m.role === "security" ? m.propertyId : user.id];
  return {
    asOf: now(),
    user,
    memberships: list,
    membership: m,
    organisation: org,
    properties: all(
      "SELECT p.* FROM properties p WHERE p.orgId=?" +
        propertyFilter +
        " ORDER BY p.name",
      ...params,
    ),
    units:
      m.role === "security"
        ? []
        : all(
            "SELECT u.*,a.name residentName FROM units u JOIN properties p ON p.id=u.propertyId LEFT JOIN memberships m ON m.unitId=u.id AND m.role='tenant' LEFT JOIN users a ON a.id=m.userId WHERE p.orgId=?" +
              (m.role === "tenant" ? " AND u.id=?" : propertyFilter) +
              " ORDER BY u.label",
            ...(m.role === "tenant" ? [m.orgId, m.unitId] : params),
          ),
    members:
      m.role === "manager"
        ? all(
            "SELECT u.id,u.name,u.email,m.role,m.propertyId,m.unitId FROM memberships m JOIN users u ON u.id=m.userId WHERE m.orgId=? ORDER BY u.name",
            m.orgId,
          )
        : [],
    visitors: all<LiveVisitor>(
      "SELECT v.*,p.name propertyName,u.name hostName,t.label unitLabel FROM visitors v JOIN properties p ON p.id=v.propertyId JOIN users u ON u.id=v.hostId LEFT JOIN memberships m ON m.userId=v.hostId AND m.orgId=v.orgId LEFT JOIN units t ON t.id=m.unitId WHERE v.orgId=?" +
        visitorFilter +
        " ORDER BY v.visitDate DESC,v.arrival DESC LIMIT 500",
      ...visitorParams,
    ),
    reports: all(
      "SELECT r.*,u.name authorName FROM reports r JOIN users u ON u.id=r.authorId WHERE r.orgId=?" +
        (m.role === "manager"
          ? ""
          : m.role === "tenant"
            ? " AND r.authorId=?"
            : " AND r.propertyId=?") +
        " ORDER BY r.createdAt DESC LIMIT 500",
      ...visitorParams,
    ),
    invoices:
      m.role === "manager"
        ? all(
            "SELECT id,plan,amountCents,status,createdAt FROM invoices WHERE orgId=? ORDER BY createdAt DESC LIMIT 100",
            m.orgId,
          )
        : [],
    invitations:
      m.role === "manager"
        ? all(
            "SELECT id,email,role,expiresAt FROM invitations WHERE orgId=? AND acceptedAt IS NULL AND expiresAt>?",
            m.orgId,
            now(),
          )
        : [],
    billingConfigured: Boolean(
      process.env.PAYFAST_MERCHANT_ID &&
      process.env.PAYFAST_MERCHANT_KEY &&
      process.env.PAYFAST_PASSPHRASE &&
      process.env.APP_URL,
    ),
    billingMode: process.env.PAYFAST_MODE === "live" ? "live" : "sandbox",
    emailConfigured: Boolean(
      process.env.RESEND_API_KEY && process.env.EMAIL_FROM,
    ),
  };
}
export function command(
  user: Account,
  orgId: string,
  input: Record<string, unknown>,
) {
  const m = access(user, orgId);
  return transaction(() => {
    const org = one<{ trialUntil: string; paidUntil: string | null }>(
      "SELECT trialUntil,paidUntil FROM organisations WHERE id=?",
      orgId,
    )!;
    if (
      ["property", "unit", "invite", "visitor"].includes(
        String(input.action),
      ) &&
      org.trialUntil <= now() &&
      (org.paidUntil || "") <= now()
    )
      throw new AppError(
        "Your trial or paid month has ended. Ask a manager to renew from Billing.",
        402,
      );
    let result: Record<string, unknown> = {};
    switch (input.action) {
      case "property": {
        manager(m);
        const id = randomUUID();
        run(
          "INSERT INTO properties VALUES(?,?,?,?,?)",
          id,
          orgId,
          text(input.name, "property name", 100),
          text(input.address, "address", 250),
          choice(
            input.type,
            ["apartment", "student_accommodation"],
            "property type",
          ),
        );
        result = { id };
        break;
      }
      case "unit": {
        manager(m);
        const p = property(m, input.propertyId);
        const plan = one<{ plan: string }>(
          "SELECT plan FROM organisations WHERE id=?",
          orgId,
        )!.plan;
        const cap =
          (
            { starter: 25, growth: 150, premium: 300 } as Record<string, number>
          )[plan] || 25;
        const count = one<{ n: number }>(
          "SELECT count(*) n FROM units u JOIN properties p ON p.id=u.propertyId WHERE p.orgId=?",
          orgId,
        )!.n;
        if (count >= cap)
          throw new AppError(
            "Your plan's unit limit has been reached. Upgrade from Billing.",
            409,
          );
        const id = randomUUID();
        run(
          "INSERT INTO units(id,propertyId,label,rentCents) VALUES(?,?,?,?)",
          id,
          p.id,
          text(input.label, "unit label", 50),
          money(input.rent),
        );
        result = { id };
        break;
      }
      case "rent": {
        manager(m);
        const u = one<{ propertyId: string }>(
          "SELECT propertyId FROM units WHERE id=?",
          text(input.unitId, "unit"),
        );
        if (!u) throw new AppError("Unit not found.", 404);
        property(m, u.propertyId);
        run(
          "UPDATE units SET rentPaid=? WHERE id=?",
          input.paid === true ? 1 : 0,
          String(input.unitId),
        );
        break;
      }
      case "invite": {
        manager(m);
        const role = choice(
          input.role,
          ["manager", "tenant", "security"] as const,
          "role",
        );
        const address = email(input.email);
        let propertyId: string | null = null,
          unitId: string | null = null;
        if (role !== "manager") propertyId = property(m, input.propertyId).id;
        if (role === "manager") {
          const plan = one<{ plan: string }>(
            "SELECT plan FROM organisations WHERE id=?",
            orgId,
          )!.plan;
          const cap =
            ({ starter: 1, growth: 5, premium: 10 } as Record<string, number>)[
              plan
            ] || 1;
          const count = one<{ n: number }>(
            "SELECT count(*) n FROM memberships WHERE orgId=? AND role='manager'",
            orgId,
          )!.n;
          const pending = one<{ n: number }>(
            "SELECT count(*) n FROM invitations WHERE orgId=? AND role='manager' AND acceptedAt IS NULL AND expiresAt>?",
            orgId,
            now(),
          )!.n;
          if (count + pending >= cap)
            throw new AppError(
              "Your plan's manager limit has been reached.",
              409,
            );
        }
        if (role === "tenant") {
          const unit = one<{ id: string }>(
            "SELECT id FROM units WHERE id=? AND propertyId=?",
            text(input.unitId, "unit"),
            propertyId,
          );
          if (
            !unit ||
            one("SELECT userId FROM memberships WHERE unitId=?", unit.id) ||
            one(
              "SELECT id FROM invitations WHERE unitId=? AND acceptedAt IS NULL AND expiresAt>?",
              unit.id,
              now(),
            )
          )
            throw new AppError(
              "Choose a vacant unit without a pending invitation.",
              409,
            );
          unitId = unit.id;
        }
        if (
          one(
            "SELECT m.userId FROM memberships m JOIN users u ON u.id=m.userId WHERE m.orgId=? AND u.email=?",
            orgId,
            address,
          )
        )
          throw new AppError(
            "This person already belongs to the organisation.",
            409,
          );
        const token = newToken(),
          id = randomUUID();
        run(
          "INSERT INTO invitations(id,orgId,email,role,propertyId,unitId,hash,expiresAt) VALUES(?,?,?,?,?,?,?,?)",
          id,
          orgId,
          address,
          role,
          propertyId,
          unitId,
          hashToken(token),
          new Date(Date.now() + 7 * 86400000).toISOString(),
        );
        result = { token };
        break;
      }
      case "revokeInvitation":
        manager(m);
        run(
          "DELETE FROM invitations WHERE id=? AND orgId=? AND acceptedAt IS NULL",
          text(input.id, "invitation"),
          orgId,
        );
        break;
      case "removeMember": {
        manager(m);
        const id = text(input.id, "member");
        if (id === user.id)
          throw new AppError("You cannot remove your own access.", 409);
        run("DELETE FROM memberships WHERE userId=? AND orgId=?", id, orgId);
        run(
          "UPDATE visitors SET status='cancelled' WHERE hostId=? AND orgId=? AND status='upcoming'",
          id,
          orgId,
        );
        break;
      }
      case "visitor": {
        if (m.role === "security")
          throw new AppError(
            "Only a resident or manager can host a visitor.",
            403,
          );
        const p = property(m, input.propertyId);
        const date = text(input.visitDate, "visit date");
        const arrival = text(input.arrival, "arrival time"),
          departure = text(input.departure, "departure time");
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Africa/Johannesburg",
        }).format(new Date());
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date + "T00:00:00+02:00")) ||
          new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date ||
          date < today ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(arrival) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(departure) ||
          arrival >= departure ||
          Date.parse(date + "T" + departure + ":00+02:00") <= Date.now()
        )
          throw new AppError(
            "Choose a valid future visit window. Departure must be after arrival on the same day.",
          );
        const phone = text(input.phone, "phone", 30);
        if (!/^\+?[\d ()-]{9,25}$/.test(phone))
          throw new AppError("Enter a valid phone number.");
        const id = randomUUID(),
          token = newToken(),
          reference = "SP-" + newToken().slice(0, 10).toUpperCase();
        run(
          "INSERT INTO visitors(id,orgId,propertyId,hostId,visitorName,phone,reference,token,visitDate,arrival,departure,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
          id,
          orgId,
          p.id,
          user.id,
          text(input.visitorName, "visitor name", 100),
          phone,
          reference,
          token,
          date,
          arrival,
          departure,
          now(),
        );
        result = { id, token };
        break;
      }
      case "visitorStatus": {
        const v = one<LiveVisitor>(
          "SELECT * FROM visitors WHERE id=? AND orgId=?",
          text(input.id, "visitor"),
          orgId,
        );
        if (!v) throw new AppError("Pass not found.", 404);
        property(m, v.propertyId);
        const status = choice(
          input.status,
          ["checked_in", "checked_out", "cancelled"] as const,
          "status",
        );
        if (
          m.role === "tenant" &&
          (v.hostId !== user.id || status !== "cancelled")
        )
          throw new AppError(
            "You can only cancel your own upcoming passes.",
            403,
          );
        if (
          (status === "checked_out" && v.status !== "checked_in") ||
          (status !== "checked_out" && v.status !== "upcoming")
        )
          throw new AppError(
            "This pass has already changed. Refresh and try again.",
            409,
          );
        if (
          status === "checked_in" &&
          (Date.now() <
            Date.parse(v.visitDate + "T" + v.arrival + ":00+02:00") ||
            Date.now() >=
              Date.parse(v.visitDate + "T" + v.departure + ":00+02:00"))
        )
          throw new AppError("This pass is outside its arrival window.", 409);
        run(
          "UPDATE visitors SET status=?,checkedInAt=CASE WHEN ?='checked_in' THEN ? ELSE checkedInAt END,checkedOutAt=CASE WHEN ?='checked_out' THEN ? ELSE checkedOutAt END WHERE id=?",
          status,
          status,
          now(),
          status,
          now(),
          v.id,
        );
        break;
      }
      case "report": {
        const p = property(m, input.propertyId);
        run(
          "INSERT INTO reports(id,orgId,propertyId,authorId,category,description,createdAt) VALUES(?,?,?,?,?,?,?)",
          randomUUID(),
          orgId,
          p.id,
          user.id,
          choice(
            input.category,
            ["Maintenance", "Security", "Noise", "Other"],
            "category",
          ),
          text(input.description, "description", 3000),
          now(),
        );
        break;
      }
      case "reportStatus": {
        manager(m);
        run(
          "UPDATE reports SET status=? WHERE id=? AND orgId=?",
          choice(input.status, ["open", "in_progress", "resolved"], "status"),
          text(input.id, "report"),
          orgId,
        );
        break;
      }
      default:
        throw new AppError("Unknown action.");
    }
    run(
      "INSERT INTO audit VALUES(?,?,?,?,?)",
      randomUUID(),
      orgId,
      user.id,
      String(input.action),
      now(),
    );
    return result;
  });
}
export async function join(input: Record<string, unknown>) {
  const token = text(input.token, "invitation token", 128),
    address = email(input.email);
  throttle("join:" + address);
  const invitation = one<{
    id: string;
    orgId: string;
    email: string;
    role: string;
    propertyId: string | null;
    unitId: string | null;
  }>(
    "SELECT * FROM invitations WHERE hash=? AND acceptedAt IS NULL AND expiresAt>?",
    hashToken(token),
    now(),
  );
  if (!invitation || invitation.email.toLowerCase() !== address)
    throw new AppError(
      "Invitation is invalid, expired, or belongs to another email.",
      400,
    );
  const existing = one<Account & { password: string }>(
    "SELECT * FROM users WHERE email=?",
    address,
  );
  const pass = password(input.password);
  if (existing && !(await verifyPassword(pass, existing.password)))
    throw new AppError(
      "Enter the password for your existing SangoPass account.",
      401,
    );
  const id = existing?.id || randomUUID();
  const name = existing?.name || text(input.name, "name", 100);
  const digest = existing?.password || (await hashPassword(pass));
  transaction(() => {
    if (
      !one(
        "SELECT id FROM invitations WHERE id=? AND acceptedAt IS NULL AND expiresAt>?",
        invitation.id,
        now(),
      )
    )
      throw new AppError("Invitation is no longer available.", 409);
    if (
      one(
        "SELECT userId FROM memberships WHERE userId=? AND orgId=?",
        id,
        invitation.orgId,
      )
    )
      throw new AppError("You already belong to this organisation.", 409);
    if (
      invitation.unitId &&
      one("SELECT userId FROM memberships WHERE unitId=?", invitation.unitId)
    )
      throw new AppError(
        "This unit is already occupied. Ask your manager for a new invitation.",
        409,
      );
    if (!existing)
      run(
        "INSERT INTO users VALUES(?,?,?,?,?)",
        id,
        address,
        name,
        digest,
        now(),
      );
    run(
      "INSERT INTO memberships VALUES(?,?,?,?,?)",
      id,
      invitation.orgId,
      invitation.role,
      invitation.propertyId,
      invitation.unitId,
    );
    run("UPDATE invitations SET acceptedAt=? WHERE id=?", now(), invitation.id);
  });
  return { token: createSession(id), orgId: invitation.orgId };
}
