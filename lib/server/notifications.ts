import { hashToken, now } from "./auth";
import { emailConfigured } from "./config";
import { guestPassSms, sendSms } from "./sms";
import { formatEntryCode } from "@/lib/shared/passcode";
import { store } from "./store";
import type {
  InvitationRecord,
  OrganisationRecord,
  PropertyRecord,
  UnitRecord,
  UserRecord,
  VisitorRecord,
} from "./store";
import { command } from "./workspace";
import type { Account } from "@/types/workspace";

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

export async function invitationDetails(
  token: string,
): Promise<InvitationDetails | undefined> {
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  const invitation = await store().first<InvitationRecord>("invitations", {
    where: [["hash", "==", hashToken(token)]],
  });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= now())
    return;
  const [organisation, property, unit, existing] = await Promise.all([
    store().get<OrganisationRecord>("organisations", invitation.orgId),
    invitation.propertyId
      ? store().get<PropertyRecord>("properties", invitation.propertyId)
      : Promise.resolve(undefined),
    invitation.unitId
      ? store().get<UnitRecord>("units", invitation.unitId)
      : Promise.resolve(undefined),
    store().first<UserRecord>("users", {
      where: [["email", "==", invitation.email]],
    }),
  ]);
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    username: invitation.username,
    orgName: organisation?.name || "SangoPass",
    propertyName: property?.name ?? null,
    unitLabel: unit?.label ?? null,
    loginCode: property?.loginCode ?? null,
    existingAccount: Boolean(existing),
  };
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

/**
 * The guest pass, sent to the resident who requested the visit.
 *
 * SangoPass never has the visitor's email address - only their phone number -
 * and a guest may not carry a smartphone at all. The resident is the reliable
 * delivery address: they hold the pass, show it at the gate, and can sign
 * their own guest in and out from the workspace.
 */
export function visitorPassEmail(
  visit: {
    visitorName: string;
    propertyName: string;
    hostName: string;
    reference: string;
    token: string;
    entryCode: string;
    visitType: string;
    visitDate: string;
    endDate: string;
    arrival: string;
    departure: string;
    nights: number;
  },
  origin: string,
  recipient: "host" | "visitor" = "host",
) {
  const passUrl = new URL(`/pass/${visit.token}`, origin).href;
  // The gate code, spelled out for a guest who will read it off a screen
  // and say it out loud. Omitted entirely on a pass issued before entry
  // codes existed, rather than printed as an empty box.
  const code = formatEntryCode(visit.entryCode);
  const workspaceUrl = new URL("/workspace", origin).href;
  const when =
    visit.nights > 0
      ? `Arrives ${visit.visitDate} at ${visit.arrival}, leaves ${visit.endDate} at ${visit.departure} SAST (${visit.nights} ${visit.nights === 1 ? "night" : "nights"}).`
      : `${visit.visitDate}, ${visit.arrival} to ${visit.departure} SAST (day visit).`;

  if (recipient === "visitor") {
    const subject = `Your visit to ${visit.propertyName} — ${visit.reference}`;
    const lead = `${visit.hostName} has registered you as a guest at ${visit.propertyName}.`;
    const text = `You are on the system.\n\n${lead}\n${when}\nReference: ${visit.reference}${code ? `\nGate code: ${code}` : ""}\n\nOpen your pass:\n${passUrl}\n\nShow the QR code on this pass to the guard or reception when you arrive, and bring the identity document your host registered for you. Only the guard or reception can scan it.${code ? ` If you arrive without a phone, give the gate code above instead: it works on its own.` : ""}\n\nKeep this link and code private.\n\nSangoPass. A better way to belong.`;
    const html = `<!doctype html><html><body style="margin:0;background:#f6f7f3;font-family:Arial,sans-serif;color:#203b33"><main style="max-width:540px;margin:32px auto;background:white;border:1px solid #e2e7de;border-radius:16px;overflow:hidden"><div style="background:#143e35;color:#d5ed9f;padding:28px;font-size:26px;font-weight:bold">SangoPass.</div><div style="padding:28px"><p style="font-size:11px;letter-spacing:2px;color:#69796e">YOU ARE ON THE SYSTEM</p><h1 style="font-size:28px;font-weight:500">${escape(visit.visitorName)}</h1><p style="line-height:1.7">${escape(lead)}<br>${escape(when)}</p><div style="padding:18px;background:#f0f5e7;border-radius:10px;font-size:20px;letter-spacing:1px"><strong>${escape(visit.reference)}</strong></div>${code ? `<p style="line-height:1.7;margin-top:22px">No smartphone with you? Give this code at the gate instead.</p><div style="padding:18px;background:#143e35;color:#d5ed9f;border-radius:10px;font-size:28px;letter-spacing:4px;text-align:center;font-family:monospace"><strong>${escape(code)}</strong></div>` : ""}<p style="margin:28px 0"><a href="${escape(passUrl)}" style="display:inline-block;background:#143e35;color:white;text-decoration:none;padding:14px 22px;border-radius:8px">Open your pass</a></p><p style="line-height:1.7">Show the QR code to the guard or reception when you arrive, and bring the identity document your host registered for you.</p><p style="font-size:12px;color:#69796e;line-height:1.7">Keep this link private: anyone holding it can see your pass.</p></div></main></body></html>`;
    return { subject, text, html };
  }

  const subject = `Guest pass for ${visit.visitorName} — ${visit.reference}`;
  const text = `Your guest pass is ready.\n\n${visit.visitorName} is expected at ${visit.propertyName}.\n${when}\nReference: ${visit.reference}${code ? `\nGate code: ${code}` : ""}\n\nOpen the pass:\n${passUrl}\n\n${code ? `Your guest has been texted the gate code above. If it did not reach them, read it to them: with the identity document you registered, it is all they need.\n\n` : ""}Keep this link private. If your guest does not have a phone at all, show this pass to the guard or reception yourself when they arrive — only the guard or reception can admit them. You can also cancel the visit from your SangoPass workspace:\n${workspaceUrl}\n\nRemind your guest to bring the identity document you registered for them.\n\nSangoPass. A better way to belong.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f3;font-family:Arial,sans-serif;color:#203b33"><main style="max-width:540px;margin:32px auto;background:white;border:1px solid #e2e7de;border-radius:16px;overflow:hidden"><div style="background:#143e35;color:#d5ed9f;padding:28px;font-size:26px;font-weight:bold">SangoPass.</div><div style="padding:28px"><p style="font-size:11px;letter-spacing:2px;color:#69796e">YOUR GUEST PASS</p><h1 style="font-size:28px;font-weight:500">${escape(visit.visitorName)}</h1><p style="line-height:1.7">Expected at ${escape(visit.propertyName)}.<br>${escape(when)}</p><div style="padding:18px;background:#f0f5e7;border-radius:10px;font-size:20px;letter-spacing:1px"><strong>${escape(visit.reference)}</strong></div>${code ? `<p style="line-height:1.7;margin-top:22px">Your guest's gate code, texted to them:</p><div style="padding:18px;background:#143e35;color:#d5ed9f;border-radius:10px;font-size:28px;letter-spacing:4px;text-align:center;font-family:monospace"><strong>${escape(code)}</strong></div>` : ""}<p style="margin:28px 0"><a href="${escape(passUrl)}" style="display:inline-block;background:#143e35;color:white;text-decoration:none;padding:14px 22px;border-radius:8px">Open the guest pass</a></p><p style="line-height:1.7">${code ? "If the text did not reach them, read the code to them: with their identity document, it is all they need. " : ""}If your guest does not have a phone at all, show this pass to the guard or reception yourself when they arrive. You can cancel the visit from your <a href="${escape(workspaceUrl)}" style="color:#285e45">SangoPass workspace</a>.</p><p style="font-size:12px;color:#69796e;line-height:1.7">Keep this link private: anyone holding it can see the pass. Remind your guest to bring the identity document you registered for them.</p></div></main></body></html>`;
  return { subject, text, html };
}

/**
 * Runs a workspace command, then sends whatever outbound email it produced:
 * the welcome email for an enrolment, or the guest pass for a visit request.
 * Delivery never fails the command - the record is saved either way, and the
 * interface reports what happened to the message.
 */
export async function commandAndNotify(
  user: Account,
  orgId: string,
  input: Record<string, unknown>,
  send: typeof fetch = fetch,
) {
  const result = await command(user, orgId, input);

  if (input.action === "visitor") {
    const visit = await store().get<VisitorRecord>(
      "visitors",
      String(result.id),
    );
    if (!visit) return result;

    // The SMS is not a copy of the email, and does not depend on it. Email
    // reaches a visitor who has an inbox; this reaches the one who does not,
    // and it is the only channel that works for a guest without a smartphone.
    // It is attempted whether or not email is configured, and its outcome is
    // reported separately, because the resident's next action differs: an
    // unsent code is one they have to read out themselves.
    const smsStatus = await sendSms(
      visit.phone,
      guestPassSms(visit),
      send,
    );

    if (!emailConfigured())
      return {
        ...result,
        emailStatus: "not_configured",
        visitorEmailed: false,
        smsStatus,
      };

    // Two copies, addressed differently: the resident gets one so a guest
    // without a phone still has something to present at the gate, and the
    // visitor gets one when they gave an address, so they can check for
    // themselves that they are on the system before travelling.
    const deliver = async (to: string, recipient: "host" | "visitor") => {
      try {
        const message = visitorPassEmail(
          visit,
          process.env.APP_URL!,
          recipient,
        );
        const response = await send("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `guest-pass-${recipient}-${visit.id}`,
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM,
            to: [to],
            ...message,
          }),
          signal: AbortSignal.timeout(15000),
        });
        return response.ok;
      } catch {
        return false;
      }
    };

    const toHost = await deliver(user.email, "host");
    const toVisitor = visit.visitorEmail
      ? await deliver(visit.visitorEmail, "visitor")
      : false;
    return {
      ...result,
      emailStatus: toHost ? "sent" : "failed",
      visitorEmailed: toVisitor,
      smsStatus,
    };
  }

  if (input.action !== "invite" && input.action !== "resendInvitation")
    return result;

  const token = String(result.token);
  const id = String(result.invitationId);
  const hash = hashToken(token);
  const details = await invitationDetails(token);
  if (!details) return { ...result, emailStatus: "not_sent" };

  let emailStatus = "not_configured";
  if (emailConfigured()) {
    try {
      const message = welcomeEmail(details, token, process.env.APP_URL!);
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

  await store().tx(async (t) => {
    const live = await t.get<InvitationRecord>("invitations", id);
    if (!live || live.hash !== hash || live.acceptedAt) return;
    t.update("invitations", id, {
      emailStatus,
      emailSentAt: emailStatus === "sent" ? now() : null,
    });
  });
  return { ...result, emailStatus };
}
