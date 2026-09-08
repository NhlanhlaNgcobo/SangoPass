import type { Account } from "@/types/workspace";
import { command } from "./workspace";
import { one, run } from "./db";
import { hashToken, now } from "./auth";
export interface InvitationDetails {
  id: string;
  email: string;
  role: string;
  username: string | null;
  orgName: string;
  propertyName: string | null;
  unitLabel: string | null;
  loginCode: string | null;
  existingAccount: boolean;
}
export function invitationDetails(
  token: string,
): InvitationDetails | undefined {
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  const result = one<
    Omit<InvitationDetails, "existingAccount"> & { existingAccount: number }
  >(
    "SELECT i.id,i.email,i.role,i.username,o.name orgName,p.name propertyName,p.loginCode,u.label unitLabel,EXISTS(SELECT 1 FROM users WHERE email=i.email) existingAccount FROM invitations i JOIN organisations o ON o.id=i.orgId LEFT JOIN properties p ON p.id=i.propertyId LEFT JOIN units u ON u.id=i.unitId WHERE i.hash=? AND i.acceptedAt IS NULL AND i.expiresAt>?",
    hashToken(token),
    now(),
  );
  return result
    ? { ...result, existingAccount: Boolean(result.existingAccount) }
    : undefined;
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function welcomeEmail(
  details: InvitationDetails,
  token: string,
  origin: string,
) {
  const setupUrl = new URL("/join?token=" + token, origin).href;
  const loginUrl = new URL(
    details.role === "tenant"
      ? "/tenant/login?property=" + details.loginCode
      : "/login",
    origin,
  ).href;
  const description = `You have been added to ${details.orgName}${details.propertyName ? " at " + details.propertyName : ""}${details.unitLabel ? ", unit " + details.unitLabel : ""} on SangoPass.`;
  const credential = details.username
    ? `Your username / student number: ${details.username}\nProperty code: ${details.loginCode}`
    : `Your sign-in email: ${details.email}`;
  const passwordInstruction = details.existingAccount
    ? "Use your existing SangoPass password to accept this invitation. If you have forgotten it, reset it from the sign-in screen first."
    : "Create your own password using the secure setup link below. Your administrator cannot see your password.";
  const text = `Welcome to SangoPass\n\n${description}\n\n${credential}\n\n${passwordInstruction}\n${setupUrl}\n\nOnce activated, sign in here:\n${loginUrl}\n\nThis invitation can be used once and expires seven days after enrolment. Keep this email and its links private. If you were not expecting this invitation, contact your property manager.\n\nSangoPass. A better way to belong.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f3;font-family:Arial,sans-serif;color:#203b33"><main style="max-width:540px;margin:32px auto;background:white;border:1px solid #e2e7de;border-radius:16px;overflow:hidden"><div style="background:#143e35;color:#d5ed9f;padding:28px;font-size:26px;font-weight:bold">SangoPass.</div><div style="padding:28px"><p style="font-size:11px;letter-spacing:2px;color:#69796e">YOUR COMMUNITY AWAITS</p><h1 style="font-size:28px;font-weight:500">Welcome home.</h1><p style="line-height:1.7">${escape(description)}</p><div style="padding:18px;background:#f0f5e7;border-radius:10px;line-height:1.8">${escape(credential).replaceAll("\n", "<br>")}</div><p style="line-height:1.7">${escape(passwordInstruction)}</p><p style="margin:28px 0"><a href="${escape(setupUrl)}" style="display:inline-block;background:#143e35;color:white;text-decoration:none;padding:14px 22px;border-radius:8px">${details.existingAccount ? "Activate your access" : "Create your password"}</a></p><p style="line-height:1.7">After activation, use your ${details.username ? "username or student number" : "email"} and password on your <a href="${escape(loginUrl)}" style="color:#285e45">SangoPass login screen</a>.</p><p style="font-size:12px;color:#69796e;line-height:1.7">This private link can be used once and expires seven days after enrolment. If you were not expecting this invitation, contact your property manager.</p></div></main></body></html>`;
  return {
    subject: "You’ve been added to SangoPass — activate your access",
    text,
    html,
  };
}
export async function enrolmentCommand(
  user: Account,
  orgId: string,
  input: Record<string, unknown>,
  send: typeof fetch = fetch,
) {
  const result = command(user, orgId, input);
  if (input.action !== "invite" && input.action !== "resendInvitation")
    return result;
  const token = String(result.token),
    id = String(result.invitationId),
    hash = hashToken(token);
  const details = invitationDetails(token);
  if (!details) return { ...result, emailStatus: "not_sent" };
  let emailStatus = "not_configured";
  if (
    process.env.RESEND_API_KEY &&
    process.env.EMAIL_FROM &&
    process.env.APP_URL
  ) {
    try {
      const message = welcomeEmail(details, token, process.env.APP_URL);
      const response = await send("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `enrolment-${id}-${hash}`,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: [details.email],
          ...message,
        }),
        signal: AbortSignal.timeout(15000),
      });
      emailStatus = response.ok ? "sent" : "failed";
    } catch {
      emailStatus = "failed";
    }
  }
  run(
    "UPDATE invitations SET emailStatus=?,emailSentAt=? WHERE id=? AND hash=? AND acceptedAt IS NULL",
    emailStatus,
    emailStatus === "sent" ? now() : null,
    id,
    hash,
  );
  return { ...result, emailStatus };
}
