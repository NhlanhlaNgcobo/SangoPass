import { hashToken, newToken, now, type RequestContext } from "./auth";
import { identity } from "./identity";
import { BACKSTOPS, bucket, throttle } from "./ratelimit";
import { store } from "./store";
import type { ResetTokenRecord, UserRecord } from "./store";
import { AppError, email, password, text } from "./validation";

const RESET_MINUTES = 30;

export async function requestReset(
  input: Record<string, unknown>,
  context?: RequestContext,
  send: typeof fetch = fetch,
) {
  const address = email(input.email);
  await throttle([
    bucket(`reset:${address}`, 3),
    bucket(`reset:ip:${context?.ip || "unknown"}`, 10),
    BACKSTOPS.resets,
  ]);
  if (
    !process.env.RESEND_API_KEY ||
    !process.env.EMAIL_FROM ||
    !process.env.APP_URL
  )
    throw new AppError(
      "Password recovery email is not connected yet. Contact your SangoPass operator.",
      503,
    );

  const user = await store().first<UserRecord>("users", {
    where: [["email", "==", address]],
  });
  if (!user) return;

  const token = newToken();
  await store().removeWhere("resetTokens", {
    where: [["userId", "==", user.id]],
  });
  await store().tx(async (t) => {
    t.set("resetTokens", hashToken(token), {
      userId: user.id,
      expiresAt: new Date(Date.now() + RESET_MINUTES * 60000).toISOString(),
    });
  });

  const link = new URL(`/reset?token=${token}`, process.env.APP_URL).href;
  const response = await send("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [address],
      subject: "Reset your SangoPass password",
      text: `Use this private link to reset your SangoPass password. It expires in ${RESET_MINUTES} minutes.\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  // Do not disclose whether an email belongs to an account if delivery fails.
  if (!response.ok)
    console.error("Password recovery email delivery failed:", response.status);
}

export async function resetPassword(input: Record<string, unknown>) {
  const token = text(input.token, "reset token", 128);
  await throttle([bucket(`reset-use:${hashToken(token)}`, 5)]);
  const secret = password(input.password);

  const record = await store().get<ResetTokenRecord>(
    "resetTokens",
    hashToken(token),
  );
  if (!record || record.expiresAt <= now())
    throw new AppError("This password reset link is invalid or expired.");

  // The credential backend owns the secret; the application owns the sessions.
  await identity().setPassword(record.userId, secret);
  await store().removeWhere("sessions", {
    where: [["userId", "==", record.userId]],
  });
  await store().removeWhere("resetTokens", {
    where: [["userId", "==", record.userId]],
  });
}
