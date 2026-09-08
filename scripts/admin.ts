/**
 * SangoPass operator console.
 *
 * The platform-admin screens under /dashboard/admin are browser-only demo
 * fixtures, so until a real console exists this is the supported way to answer
 * a support request without opening a SQL prompt against production. It runs
 * against whichever backend the environment selects, so with Firebase
 * credentials it works from an operator workstation.
 *
 *   npm run admin -- tenants
 *   npm run admin -- export <orgId> [file.json]
 *   npm run admin -- extend <orgId> <days>
 *   npm run admin -- suspend <orgId> --confirm
 *   npm run admin -- delete <orgId> --confirm
 *   npm run admin -- invoices <orgId>
 *   npm run admin -- invoice-paid <invoiceId> <payfastReference> --confirm
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { now } from "../lib/server/auth";
import { store } from "../lib/server/store";
import type { InvoiceRecord } from "../lib/server/store";
import {
  deleteTenant,
  exportTenant,
  extendAccess,
  listTenants,
  suspendTenant,
} from "../lib/server/tenancy";

const [command, ...args] = process.argv.slice(2);
const confirmed = args.includes("--confirm");
const positional = args.filter((value) => !value.startsWith("--"));

function table(rows: Record<string, unknown>[]) {
  if (!rows.length) return console.log("(none)");
  console.table(rows);
}

async function main() {
  switch (command) {
    case "tenants": {
      const tenants = await listTenants();
      table(
        tenants.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          plan: tenant.plan,
          units: tenant.units,
          members: tenant.members,
          access: tenant.active ? "active" : "LAPSED",
          until: (tenant.paidUntil || tenant.trialUntil).slice(0, 10),
          paying: tenant.paidUntil ? "yes" : "trial",
        })),
      );
      return;
    }

    case "export": {
      const [orgId, file] = positional;
      if (!orgId) throw new Error("Usage: admin export <orgId> [file.json]");
      const payload = await exportTenant(orgId);
      const target = resolve(file || `sangopass-${orgId}.json`);
      await writeFile(target, JSON.stringify(payload, null, 2), "utf8");
      console.log(
        `Exported ${payload.organisation.name}: ${payload.members.length} members, ${payload.units.length} units, ${payload.visitors.length} visitor records -> ${target}`,
      );
      return;
    }

    case "extend": {
      const [orgId, days] = positional;
      if (!orgId || !days)
        throw new Error("Usage: admin extend <orgId> <days>");
      const result = await extendAccess(orgId, Number(days));
      console.log(`Set ${result.field} to ${result.until}`);
      return;
    }

    case "suspend": {
      const [orgId] = positional;
      if (!orgId || !confirmed)
        throw new Error("Usage: admin suspend <orgId> --confirm");
      const result = await suspendTenant(orgId);
      console.log(
        `Suspended: ${result.members} members, ${result.revoked} sessions ended.`,
      );
      return;
    }

    case "delete": {
      const [orgId] = positional;
      if (!orgId || !confirmed)
        throw new Error(
          "Usage: admin delete <orgId> --confirm  (irreversible; export first)",
        );
      const report = await deleteTenant(orgId);
      console.log(`Deleted ${report.organisation}.`);
      table([report.removed]);
      console.log(
        `Accounts removed: ${report.accountsDeleted.length}; retained because they belong to another organisation: ${report.accountsRetained.length}`,
      );
      return;
    }

    case "invoices": {
      const [orgId] = positional;
      if (!orgId) throw new Error("Usage: admin invoices <orgId>");
      const invoices = await store().find<InvoiceRecord>("invoices", {
        where: [["orgId", "==", orgId]],
        orderBy: [{ field: "createdAt", direction: "desc" }],
      });
      table(
        invoices.map((invoice) => ({
          id: invoice.id,
          plan: invoice.plan,
          amount: `R${(invoice.amountCents / 100).toFixed(2)}`,
          status: invoice.status,
          reference: invoice.paymentId || "-",
          created: invoice.createdAt.slice(0, 16).replace("T", " "),
        })),
      );
      return;
    }

    case "invoice-paid": {
      const [invoiceId, reference] = positional;
      if (!invoiceId || !reference || !confirmed)
        throw new Error(
          "Usage: admin invoice-paid <invoiceId> <payfastReference> --confirm",
        );
      const invoice = await store().get<InvoiceRecord>("invoices", invoiceId);
      if (!invoice) throw new Error("Invoice not found.");
      if (invoice.status.endsWith("paid"))
        throw new Error("Invoice is already settled.");
      console.warn(
        "This bypasses PayFast verification. Confirm the payment in the PayFast dashboard first.",
      );
      await store().tx(async (t) => {
        t.reserve(`paymentId:${reference}`, invoice.id);
        t.update("invoices", invoice.id, {
          status: invoice.status.startsWith("sandbox_")
            ? "sandbox_paid"
            : "paid",
          paymentId: reference,
        });
        t.create("audit", `manual-${invoice.id}`, {
          orgId: invoice.orgId,
          userId: null,
          userName: "operator",
          action: "invoice-paid-manually",
          subject: invoice.id,
          createdAt: now(),
        });
      });
      console.log(
        `Marked ${invoice.id} paid. Access still needs 'admin extend' if the paid period should move.`,
      );
      return;
    }

    default:
      console.log(
        [
          "SangoPass operator console",
          "",
          "  tenants                                       list every organisation",
          "  export <orgId> [file.json]                    write a full tenant export",
          "  extend <orgId> <days>                         move the trial or paid horizon",
          "  suspend <orgId> --confirm                     end access and every session",
          "  delete  <orgId> --confirm                     erase a tenant (export first)",
          "  invoices <orgId>                              list invoices",
          "  invoice-paid <id> <reference> --confirm       repair a failed callback",
          "",
          `Backend: ${store().name}`,
        ].join("\n"),
      );
  }
}

main()
  .then(() => store().close())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await store()
      .close()
      .catch(() => undefined);
    process.exitCode = 1;
  });
