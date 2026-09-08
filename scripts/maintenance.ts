/**
 * Scheduled maintenance. Run from cron, a systemd timer, or Cloud Scheduler.
 *
 *   npm run maintenance
 *
 * Does three things the application deliberately no longer does on the request
 * path, plus the renewal reminder that manual monthly billing needs:
 *
 *  - sweeps elapsed sessions, reset tokens and rate-limit windows (these used
 *    to run a full-table delete on every single sign-in attempt)
 *  - prunes the audit trail past its retention window
 *  - emails managers whose paid month or trial ends within seven days
 */
import { sweepSessions } from "../lib/server/auth";
import { expiringOrganisations } from "../lib/server/billing";
import { emailConfigured } from "../lib/server/config";
import { pruneAudit, RETENTION_DAYS } from "../lib/server/audit";
import { sweepRateLimits } from "../lib/server/ratelimit";
import { store } from "../lib/server/store";
import type { MembershipRecord } from "../lib/server/store";

const REMINDER_DAYS = Number(process.env.RENEWAL_REMINDER_DAYS || 7);

function reminderEmail(
  organisation: string,
  until: string,
  planName: string,
  expired: boolean,
  origin: string,
) {
  const when = until.slice(0, 10);
  const subject = expired
    ? `SangoPass access for ${organisation} has ended`
    : `SangoPass renewal due ${when} for ${organisation}`;
  const body = expired
    ? `Access for ${organisation} ended on ${when}.\n\nYour existing records, gate operations and reports still work. Adding properties, units, residents or new visitor passes needs a renewal.\n\nRenew from Billing: ${origin}/workspace\n\nSangoPass bills one month at a time and does not renew automatically.`
    : `The ${planName} month for ${organisation} ends on ${when}.\n\nSangoPass bills one month at a time and does not renew automatically, so nothing is charged unless you renew.\n\nRenew from Billing: ${origin}/workspace`;
  return { subject, text: body };
}

async function reminders() {
  const origin = process.env.APP_URL || "";
  const due = await expiringOrganisations(REMINDER_DAYS);
  if (!due.length) return { considered: 0, sent: 0, skipped: 0 };
  let sent = 0;
  let skipped = 0;

  for (const row of due) {
    const managers = await store().find<MembershipRecord>("memberships", {
      where: [
        ["orgId", "==", row.organisation.id],
        ["role", "==", "manager"],
      ],
    });
    const recipients = managers.map((m) => m.userEmail).filter(Boolean);
    if (!recipients.length) {
      skipped += 1;
      continue;
    }
    const message = reminderEmail(
      row.organisation.name,
      row.until,
      row.plan.name,
      row.expired,
      origin,
    );
    if (!emailConfigured()) {
      console.log(
        `[dry run] ${row.organisation.name}: ${message.subject} -> ${recipients.join(", ")}`,
      );
      skipped += 1;
      continue;
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        // One reminder per organisation per day, even if the job re-runs.
        "Idempotency-Key": `renewal-${row.organisation.id}-${row.until.slice(0, 10)}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: recipients,
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) sent += 1;
    else {
      skipped += 1;
      console.error(
        `Renewal reminder failed for ${row.organisation.name}: ${response.status}`,
      );
    }
  }
  return { considered: due.length, sent, skipped };
}

async function main() {
  const sessions = await sweepSessions();
  const rateLimits = await sweepRateLimits();
  const audit = await pruneAudit();
  const renewal = await reminders();
  console.log(
    JSON.stringify(
      {
        backend: store().name,
        sweptSessions: sessions.sessions,
        sweptResetTokens: sessions.resets,
        sweptRateLimits: rateLimits,
        prunedAuditOlderThanDays: RETENTION_DAYS,
        prunedAudit: audit,
        renewal,
      },
      null,
      2,
    ),
  );
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
