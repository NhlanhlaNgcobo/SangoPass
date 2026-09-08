import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { one, run, transaction } from "./db";
import { access } from "./workspace";
import { now, throttle } from "./auth";
import { AppError, choice } from "./validation";
import type { Account } from "@/types/workspace";
export const PRICES = { starter: 49900, growth: 129900, premium: 249900 };
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
export function checkout(user: Account, orgId: string, value: unknown) {
  if (access(user, orgId).role !== "manager")
    throw new AppError("Only managers can manage billing.", 403);
  const plan = choice(value, ["starter", "growth", "premium"] as const, "plan"),
    c = config();
  throttle("checkout:" + orgId, 20);
  const units = one<{ n: number }>(
    "SELECT count(*) n FROM units u JOIN properties p ON p.id=u.propertyId WHERE p.orgId=?",
    orgId,
  )!.n;
  const seats = one<{ n: number }>(
    "SELECT count(*) n FROM memberships WHERE orgId=? AND role='manager'",
    orgId,
  )!.n;
  const pending = one<{ n: number }>(
    "SELECT count(*) n FROM invitations WHERE orgId=? AND role='manager' AND acceptedAt IS NULL AND expiresAt>?",
    orgId,
    now(),
  )!.n;
  if (
    units > { starter: 25, growth: 150, premium: 300 }[plan] ||
    seats + pending > { starter: 1, growth: 5, premium: 10 }[plan]
  )
    throw new AppError(
      "This plan is too small for your current units or manager seats.",
      409,
    );
  const id = randomUUID();
  run(
    "INSERT INTO invoices(id,orgId,plan,amountCents,status,createdAt) VALUES(?,?,?,?,?,?)",
    id,
    orgId,
    plan,
    PRICES[plan],
    c.mode === "sandbox" ? "sandbox_pending" : "pending",
    now(),
  );
  const fields: Record<string, string> = {
    merchant_id: c.id,
    merchant_key: c.key,
    return_url: c.origin + "/workspace?payment=returned",
    cancel_url: c.origin + "/workspace?payment=cancelled",
    notify_url: c.origin + "/api/billing/notify",
    email_address: user.email,
    m_payment_id: id,
    amount: (PRICES[plan] / 100).toFixed(2),
    item_name: `SangoPass ${plan} - one month`,
  };
  fields.signature = signature(fields, c.passphrase);
  return { url: c.base + "/eng/process", fields };
}
export async function notification(
  raw: string,
  referrer: string | null,
  confirm: typeof fetch = fetch,
) {
  const c = config(),
    pairs = new URLSearchParams(raw),
    fields: Record<string, string> = {};
  for (const [key, value] of pairs) {
    if (key in fields || !/^[a-zA-Z0-9_]+$/.test(key))
      throw new AppError("Invalid notification.");
    fields[key] = value;
  }
  const supplied = fields.signature;
  if (
    !supplied ||
    !/^[a-f0-9]{32}$/.test(supplied) ||
    !timingSafeEqual(
      Buffer.from(supplied),
      Buffer.from(signature(fields, c.passphrase)),
    )
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
  } catch {}
  if (!allowed.includes(host))
    throw new AppError("Invalid payment origin.", 400);
  const invoice = one<{
    id: string;
    orgId: string;
    plan: string;
    amountCents: number;
    status: string;
  }>("SELECT * FROM invoices WHERE id=?", fields.m_payment_id || "");
  if (
    !invoice ||
    fields.merchant_id !== c.id ||
    !/^\d+\.\d{2}$/.test(fields.amount_gross || "") ||
    Math.round(Number(fields.amount_gross) * 100) !== invoice.amountCents ||
    !fields.pf_payment_id
  )
    throw new AppError("Payment details do not match.", 400);
  if ((c.mode === "sandbox") !== invoice.status.startsWith("sandbox_"))
    throw new AppError("Payment mode does not match.", 400);
  const response = await confirm(c.base + "/eng/query/validate", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parameterString(fields),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || (await response.text()).trim() !== "VALID")
    throw new AppError("Payment could not be verified.", 502);
  if (fields.payment_status !== "COMPLETE") return;
  transaction(() => {
    const current = one<{ status: string }>(
      "SELECT status FROM invoices WHERE id=?",
      invoice.id,
    )!;
    if (current.status === "paid" || current.status === "sandbox_paid") return;
    if (one("SELECT id FROM invoices WHERE paymentId=?", fields.pf_payment_id))
      throw new AppError("Duplicate payment reference.", 409);
    run(
      "UPDATE invoices SET status=?,paymentId=? WHERE id=?",
      c.mode === "sandbox" ? "sandbox_paid" : "paid",
      fields.pf_payment_id,
      invoice.id,
    );
    // Sandbox transactions never activate paid production entitlements.
    if (c.mode === "live") {
      const org = one<{ paidUntil: string | null }>(
        "SELECT paidUntil FROM organisations WHERE id=?",
        invoice.orgId,
      )!;
      const start = new Date(
        Math.max(Date.now(), Date.parse(org.paidUntil || "") || 0),
      );
      const originalDay = start.getUTCDate();
      start.setUTCDate(1);
      start.setUTCMonth(start.getUTCMonth() + 1);
      const last = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
      ).getUTCDate();
      start.setUTCDate(Math.min(originalDay, last));
      run(
        "UPDATE organisations SET plan=?,paidUntil=? WHERE id=?",
        invoice.plan,
        start.toISOString(),
        invoice.orgId,
      );
    }
  });
}
