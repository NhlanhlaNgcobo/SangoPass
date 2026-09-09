/**
 * What happened to a text message, and what to say about it.
 *
 * Shared rather than server-only because the resident's screen has to explain
 * the outcome the moment the pass is created, and the wording is the whole
 * point: every status except "sent" ends with the resident doing something,
 * so each one says what.
 */
export type SmsStatus = "sent" | "failed" | "not_configured" | "no_number";

const NOTICES: Record<SmsStatus, string> = {
  sent: "The gate code has been texted to your guest.",
  failed:
    "The gate code could not be texted just now. Read it to your guest instead.",
  not_configured:
    "Text messaging is not connected yet, so read the gate code to your guest.",
  no_number:
    "That phone number cannot receive a text, so read the gate code to your guest.",
};

export function smsNotice(status: string): string {
  return NOTICES[status as SmsStatus] ?? NOTICES.not_configured;
}
