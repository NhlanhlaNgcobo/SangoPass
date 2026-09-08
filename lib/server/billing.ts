import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { bucket, throttle } from "./ratelimit";
import { store } from "./store";
import type { InvoiceRecord, OrganisationRecord } from "./store";
import { access } from "./workspace";
import { now } from "./auth";
import { PLANS, PRICES, plan as planFor, type PlanId } from "./plans";
import { AppError, choice } from "./validation";
import type { Account } from "@/types/workspace";

export { PRICES };

// PHP urlencode compatibility is required by PayFast's custom integration.
const encode = (value: string) =>
  encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(
      /[!'()*~]/g,
      (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
    );

export function parameterString(fields: Record<string, string>) {
  return Object.entries(fields)
    .filter(([key]) => key !== "signature")
    .map(([key, value]) => `${key}=${encode(value)}`)
    .join("&");
}

export function signature(fields: Record<string, string>, passphrase: string) {
  return createHash("md5")
    .update(parameterString(fields) + "&passphrase=" + encode(passphrase))
    .digest("hex");
}

function config() {
  const {
    PAYFAST_MERCHANT_ID: id,
    PAYFAST_MERCHANT_KEY: key,
    PAYFAST_PASSPHRASE: passphrase,
    APP_URL: origin,
  } = process.env;
  if (!id || !key || !passphrase || !origin)
    throw new AppError(
      "Payments are not connected yet. The operator needs to configure PayFast.",
      503,
    );
  const mode = process.env.PAYFAST_MODE === "live" ? "live" : "sandbox";
  const url = new URL(origin);
  if (url.protocol !== "https:")
    throw new AppError("PayFast checkout needs a public HTTPS app URL.", 503);
  return {
    id,
    key,
    passphrase,
    origin: url.origin,
    mode,
    base:
      mode === "live"
        ? "https://www.payfast.co.za"
        : "https://sandbox.payfast.co.za",
  };
}

export async function checkout(user: Account, orgId: string, value: unknown) {
  const membership = await access(user, orgId);
  if (membership.role !== "manager")
    throw new AppError("Only managers can manage billing.", 403);
  const chosen = choice(
    value,
    Object.keys(PLANS) as PlanId[],
    "plan",
  );
  const settings = config();
  await throttle([bucket(`checkout:${orgId}`, 20)]);

  const target = PLANS[chosen];
  const units = await store().count("units", {
    where: [["orgId", "==", orgId]],
  });
  const seats = await store().count("memberships", {
    where: [
      ["orgId", "==", orgId],
      ["role", "==", "manager"],
    ],
  });
  const pending = (
    await store().find("invitations", {
      where: [
        ["orgId", "==", orgId],
        ["role", "==", "manager"],
        ["acceptedAt", "==", null],
        ["expiresAt", ">", now()],
      ],
    })
  ).length;
  if (units > target.units || seats + pending > target.managers)
    throw new AppError(
      `This plan is too small for your current usage: ${units} units and ${seats + pending} manager seats against a limit of ${target.units} units and ${target.managers} managers. Release the excess or choose a larger plan.`,
      409,
    );

  const id = randomUUID();
  await store().tx(async (t) => {
    t.create("invoices", id, {
      orgId,
      plan: chosen,
      amountCents: target.priceCents,
      status: settings.mode === "sandbox" ? "sandbox_pending" : "pending",
      paymentId: null,
      createdAt: now(),
    });
  });

  const fields: Record<string, string> = {
    merchant_id: settings.id,
    merchant_key: settings.key,
    return_url: settings.origin + "/workspace?payment=returned",
    cancel_url: settings.origin + "/workspace?payment=cancelled",
    notify_url: settings.origin + "/api/billing/notify",
    email_address: user.email,
    m_payment_id: id,
    amount: (target.priceCents / 100).toFixed(2),
    item_name: `SangoPass ${chosen} - one month`,
  };
  fields.signature = signature(fields, settings.passphrase);
  return { url: settings.base + "/eng/process", fields };
}

export type NotificationOutcome =
  | "activated"
  | "recorded"
  | "ignored"
  | "duplicate";

/**
 * Verifies and applies a PayFast instant transaction notification.
 *
 * Anything the merchant could legitimately resend resolves to an outcome
 * rather than an error: PayFast treats a non-2xx reply as undelivered and
 * retries it, so a duplicate reference used to produce a retry loop.
 */
export async function notification(
  raw: string,
  referrer: string | null,
  confirm: typeof fetch = fetch,
): Promise<NotificationOutcome> {
  const settings = config();
  const pairs = new URLSearchParams(raw);
  const fields: Record<string, string> = {};
  for (const [key, value] of pairs) {
    if (key in fields || !/^[a-zA-Z0-9_]+$/.test(key))
      throw new AppError("Invalid notification.");
    fields[key] = value;
  }

  const supplied = fields.signature;
  const expected = signature(fields, settings.passphrase);
  if (
    !supplied ||
    !/^[a-f0-9]{32}$/.test(supplied) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    throw new AppError("Invalid signature.", 400);

  const allowed = [
    "www.payfast.co.za",
    "sandbox.payfast.co.za",
    "w1w.payfast.co.za",
    "w2w.payfast.co.za",
  ];
  let host = "";
  try {
    host = new URL(referrer || "").hostname;
  } catch {
    host = "";
  }
  if (!allowed.includes(host))
    throw new AppError("Invalid payment origin.", 400);

  const invoice = await store().get<InvoiceRecord>(
    "invoices",
    fields.m_payment_id || "",
  );
  if (
    !invoice ||
    fields.merchant_id !== settings.id ||
    !/^\d+\.\d{2}$/.test(fields.amount_gross || "") ||
    Math.round(Number(fields.amount_gross) * 100) !== invoice.amountCents ||
    !fields.pf_payment_id
  )
    throw new AppError("Payment details do not match.", 400);
  if ((settings.mode === "sandbox") !== invoice.status.startsWith("sandbox_"))
    throw new AppError("Payment mode does not match.", 400);

  const response = await confirm(settings.base + "/eng/query/validate", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parameterString(fields),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || (await response.text()).trim() !== "VALID")
    throw new AppError("Payment could not be verified.", 502);
  if (fields.payment_status !== "COMPLETE") return "ignored";

  const paymentId = fields.pf_payment_id;
  return store().tx(async (t): Promise<NotificationOutcome> => {
    const current = await t.get<InvoiceRecord>("invoices", invoice.id);
    if (!current) return "ignored";
    if (current.status === "paid" || current.status === "sandbox_paid")
      return "duplicate";
    const claimed = await t.get<{ owner: string }>(
      "reservations",
      `paymentId:${paymentId}`,
    );
    if (claimed && claimed.owner !== invoice.id) {
      // A reference already applied to a different invoice: acknowledge so
      // PayFast stops retrying, and leave this invoice untouched.
      console.warn(
        "SangoPass ignored a PayFast reference already applied to another invoice",
      );
      return "duplicate";
    }
    const organisation = await t.get<OrganisationRecord>(
      "organisations",
      invoice.orgId,
    );

    if (!claimed) t.reserve(`paymentId:${paymentId}`, invoice.id);
    t.update("invoices", invoice.id, {
      status: settings.mode === "sandbox" ? "sandbox_paid" : "paid",
      paymentId,
    });
    // Sandbox transactions never activate paid production entitlements.
    if (settings.mode !== "live" || !organisation) return "recorded";

    const start = new Date(
      Math.max(Date.now(), Date.parse(organisation.paidUntil || "") || 0),
    );
    const originalDay = start.getUTCDate();
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() + 1);
    const last = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    ).getUTCDate();
    start.setUTCDate(Math.min(originalDay, last));
    t.update("organisations", invoice.orgId, {
      plan: invoice.plan,
      paidUntil: start.toISOString(),
    });
    return "activated";
  });
}

/**
 * Organisations whose paid or trial access lapses inside the window, for the
 * renewal reminder job. Manual monthly renewal with no reminder was the single
 * largest avoidable source of churn.
 */
export async function expiringOrganisations(withinDays = 7) {
  const today = now();
  const horizon = new Date(Date.now() + withinDays * 86400000).toISOString();
  const all = await store().find<OrganisationRecord>("organisations");
  return all
    .map((organisation) => {
      const until = organisation.paidUntil || organisation.trialUntil;
      return {
        organisation,
        until,
        plan: planFor(organisation.plan),
        expired: until <= today,
        paid: Boolean(organisation.paidUntil),
      };
    })
    .filter((row) => row.until <= horizon)
    .sort((a, b) => a.until.localeCompare(b.until));
}
