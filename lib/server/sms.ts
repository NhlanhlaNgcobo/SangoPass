/**
 * Texting a visitor their entry code.
 *
 * Every other message this product sends is email, which assumes the recipient
 * has an inbox and a browser. A guest arriving on foot at a gate at seven in
 * the evening may have neither: what they have is a phone that receives SMS.
 * So the entry code goes by SMS, to the number the resident already had to
 * supply, and nothing about it needs the visitor to own a smartphone.
 *
 * Sending is optional in exactly the way email is. With no credentials the
 * pass is still created, the code is still on it, and the interface says the
 * message was not sent so the resident reads the code to their guest instead.
 * Delivery never fails the visit.
 *
 * The gateway is BulkSMS, a South African provider: HTTP Basic with a token
 * pair, and a JSON body of `to` and `body`. Everything provider-specific is in
 * `deliver` below, so swapping to SMSPortal, Clickatell or an aggregator is
 * one function and a set of environment variables, not a change to any caller.
 *
 * No credentials were available while this was written, so the request shape
 * follows BulkSMS's published JSON API and has not been exercised against a
 * live account. Send one real message before relying on it.
 */
import { smsConfigured, sms } from "./config";
import { formatEntryCode } from "@/lib/shared/passcode";
import { toE164 } from "@/lib/shared/phone";
import type { SmsStatus } from "@/lib/shared/sms";

/**
 * What happened to the message, in the same vocabulary the enrolment email
 * uses, so the interface reports both the same way. Defined in lib/shared so
 * the resident's screen can explain the outcome without importing anything
 * that reads the server's environment.
 *
 * `no_number` is its own outcome rather than a failure: the visit is fine, the
 * number simply is not one that can be texted, and the resident needs to know
 * that now rather than wonder why their guest never heard anything.
 */
export type { SmsStatus };

export interface SmsMessage {
  /** E.164, as produced by toE164. */
  to: string;
  body: string;
}

/**
 * The message itself: short, because it is read on a feature phone's screen
 * and often forwarded by someone reading it out loud. The code leads, because
 * the code is the only part the guard needs.
 */
export function guestPassSms(visit: {
  visitorName: string;
  propertyName: string;
  hostName: string;
  entryCode: string;
  visitDate: string;
  endDate: string;
  arrival: string;
  departure: string;
  nights: number;
}): string {
  const when =
    visit.nights > 0
      ? `${visit.visitDate} ${visit.arrival} to ${visit.endDate} ${visit.departure}`
      : `${visit.visitDate}, ${visit.arrival}-${visit.departure}`;
  return [
    `SangoPass: your gate code is ${formatEntryCode(visit.entryCode)}`,
    `${visit.hostName} is expecting you at ${visit.propertyName}.`,
    `${when} SAST.`,
    "Give this code and your ID at the gate. Do not share it.",
  ].join("\n");
}

/**
 * Sends one message, reporting what happened rather than throwing: a guest
 * pass that exists and was not texted is a far better outcome than a visit
 * request that failed because a gateway was slow.
 */
export async function sendSms(
  to: string,
  body: string,
  send: typeof fetch = fetch,
): Promise<SmsStatus> {
  const number = toE164(to);
  if (!number) return "no_number";
  if (!smsConfigured()) return "not_configured";
  return deliver({ to: number, body }, send);
}

/** Everything BulkSMS-specific lives here. Swap this to change provider. */
async function deliver(
  message: SmsMessage,
  send: typeof fetch,
): Promise<SmsStatus> {
  const { tokenId, tokenSecret, sender, endpoint } = sms();
  try {
    const response = await send(endpoint, {
      method: "POST",
      headers: {
        // Basic auth over the token pair, never the account password.
        Authorization: `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: message.to,
        body: message.body,
        ...(sender ? { from: sender } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
