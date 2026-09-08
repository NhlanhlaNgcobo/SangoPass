import { identity } from "./identity";
import { now } from "./auth";
import { store } from "./store";
import type {
  AuditRecord,
  Collection,
  InvitationRecord,
  InvoiceRecord,
  MembershipRecord,
  OrganisationRecord,
  PropertyRecord,
  ReportRecord,
  UnitRecord,
  UserRecord,
  VisitorRecord,
} from "./store";
import { AppError } from "./validation";
import { access } from "./workspace";
import type { Account } from "@/types/workspace";

const SCOPED: Collection[] = [
  "properties",
  "units",
  "memberships",
  "invitations",
  "visitors",
  "reports",
  "invoices",
  "audit",
];

export interface TenantExport {
  exportedAt: string;
  organisation: OrganisationRecord;
  properties: PropertyRecord[];
  units: UnitRecord[];
  members: MembershipRecord[];
  invitations: InvitationRecord[];
  visitors: VisitorRecord[];
  reports: ReportRecord[];
  invoices: InvoiceRecord[];
  audit: AuditRecord[];
}

async function scoped<T>(collection: Collection, orgId: string) {
  return store().find<T>(collection, { where: [["orgId", "==", orgId]] });
}

/**
 * Everything held about one organisation, in one document.
 *
 * POPIA gives residents access and deletion rights, and residents never
 * contracted with the operator directly - their manager enrolled them - so the
 * organisation needs to be able to answer a request without a database dump.
 */
export async function exportTenant(orgId: string): Promise<TenantExport> {
  const organisation = await store().get<OrganisationRecord>(
    "organisations",
    orgId,
  );
  if (!organisation) throw new AppError("Organisation not found.", 404);
  const [
    properties,
    units,
    members,
    invitations,
    visitors,
    reports,
    invoices,
    audit,
  ] = await Promise.all([
    scoped<PropertyRecord>("properties", orgId),
    scoped<UnitRecord>("units", orgId),
    scoped<MembershipRecord>("memberships", orgId),
    scoped<InvitationRecord>("invitations", orgId),
    scoped<VisitorRecord>("visitors", orgId),
    scoped<ReportRecord>("reports", orgId),
    scoped<InvoiceRecord>("invoices", orgId),
    scoped<AuditRecord>("audit", orgId),
  ]);
  return {
    exportedAt: now(),
    organisation,
    properties,
    units,
    members,
    // Invitation hashes are credentials, not data about a person.
    invitations: invitations.map((row) => ({ ...row, hash: "" })),
    visitors,
    reports,
    invoices,
    audit,
  };
}

/** A manager may export their own organisation. */
export async function exportForManager(user: Account, orgId: string) {
  const membership = await access(user, orgId);
  if (membership.role !== "manager")
    throw new AppError("A manager account is required.", 403);
  return exportTenant(orgId);
}

export interface DeletionReport {
  organisation: string;
  removed: Record<string, number>;
  accountsDeleted: string[];
  accountsRetained: string[];
}

/**
 * Erases an organisation and everything scoped to it, then removes any account
 * that belonged to no other organisation, including its credential in the
 * identity backend.
 */
export async function deleteTenant(orgId: string): Promise<DeletionReport> {
  const organisation = await store().get<OrganisationRecord>(
    "organisations",
    orgId,
  );
  if (!organisation) throw new AppError("Organisation not found.", 404);

  const members = await scoped<MembershipRecord>("memberships", orgId);
  const properties = await scoped<PropertyRecord>("properties", orgId);
  const units = await scoped<UnitRecord>("units", orgId);
  const visitors = await scoped<VisitorRecord>("visitors", orgId);
  const invoices = await scoped<InvoiceRecord>("invoices", orgId);

  // Release every uniqueness key this organisation held.
  const keys = [
    ...properties.flatMap((p) => [
      `property:${p.orgId}:${p.name.toLowerCase()}`,
      `loginCode:${p.loginCode}`,
    ]),
    ...units.map((u) => `unit:${u.propertyId}:${u.label.toLowerCase()}`),
    ...members
      .filter((m) => m.role === "tenant" && m.unitId)
      .map((m) => `unitResident:${m.unitId}`),
    ...members
      .filter((m) => m.role === "tenant" && m.propertyId && m.usernameKey)
      .map((m) => `username:${m.propertyId}:${m.usernameKey}`),
    ...visitors.flatMap((v) => [
      `visitorRef:${v.reference}`,
      `visitorToken:${v.token}`,
    ]),
    ...invoices
      .filter((invoice) => invoice.paymentId)
      .map((invoice) => `paymentId:${invoice.paymentId}`),
  ];

  const removed: Record<string, number> = {};
  for (const collection of SCOPED)
    removed[collection] = await store().removeWhere(collection, {
      where: [["orgId", "==", orgId]],
    });

  for (let index = 0; index < keys.length; index += 100) {
    const slice = keys.slice(index, index + 100);
    await store().tx(async (t) => {
      for (const key of slice) t.release(key);
    });
  }

  const accountsDeleted: string[] = [];
  const accountsRetained: string[] = [];
  for (const member of members) {
    const remaining = await store().find<MembershipRecord>("memberships", {
      where: [["userId", "==", member.userId]],
    });
    if (remaining.length) {
      accountsRetained.push(member.userId);
      continue;
    }
    const user = await store().get<UserRecord>("users", member.userId);
    await store().removeWhere("sessions", {
      where: [["userId", "==", member.userId]],
    });
    await store().removeWhere("resetTokens", {
      where: [["userId", "==", member.userId]],
    });
    await identity().deleteUser(member.userId);
    await store().tx(async (t) => {
      if (user) t.release(`userEmail:${user.email}`);
      t.remove("users", member.userId);
    });
    accountsDeleted.push(member.userId);
  }

  await store().tx(async (t) => {
    t.remove("organisations", orgId);
  });

  return {
    organisation: organisation.name,
    removed,
    accountsDeleted,
    accountsRetained,
  };
}

/** Operator support: move the trial or paid horizon without a payment. */
export async function extendAccess(orgId: string, days: number) {
  const organisation = await store().get<OrganisationRecord>(
    "organisations",
    orgId,
  );
  if (!organisation) throw new AppError("Organisation not found.", 404);
  const field = organisation.paidUntil ? "paidUntil" : "trialUntil";
  const current = organisation.paidUntil || organisation.trialUntil;
  const from = Math.max(Date.now(), Date.parse(current) || Date.now());
  const until = new Date(from + days * 86400000).toISOString();
  await store().tx(async (t) => {
    t.update("organisations", orgId, { [field]: until });
  });
  return { field, until };
}

/** Operator support: end every live session for an organisation's members. */
export async function suspendTenant(orgId: string) {
  const members = await scoped<MembershipRecord>("memberships", orgId);
  let revoked = 0;
  for (const member of members) {
    revoked += await store().removeWhere("sessions", {
      where: [["userId", "==", member.userId]],
    });
    await identity().revoke(member.userId);
  }
  await store().tx(async (t) => {
    t.update("organisations", orgId, {
      trialUntil: "1970-01-01T00:00:00.000Z",
      paidUntil: null,
    });
  });
  return { members: members.length, revoked };
}

export async function listTenants() {
  const organisations = await store().find<OrganisationRecord>("organisations");
  const rows = await Promise.all(
    organisations.map(async (organisation) => ({
      id: organisation.id,
      name: organisation.name,
      plan: organisation.plan,
      trialUntil: organisation.trialUntil,
      paidUntil: organisation.paidUntil,
      createdAt: organisation.createdAt,
      units: await store().count("units", {
        where: [["orgId", "==", organisation.id]],
      }),
      members: await store().count("memberships", {
        where: [["orgId", "==", organisation.id]],
      }),
      active:
        (organisation.paidUntil || "") > now() ||
        organisation.trialUntil > now(),
    })),
  );
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
