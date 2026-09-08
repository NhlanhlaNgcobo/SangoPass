import { email, password, text, AppError } from "./validation";
import { hashPassword, hashToken, newToken, now, throttle } from "./auth";
import { one, run, transaction } from "./db";
export async function requestReset(input: Record<string, unknown>) {
  const address = email(input.email);
  throttle("reset:" + address, 3);
  throttle("resets", 100);
  if (
    !process.env.RESEND_API_KEY ||
    !process.env.EMAIL_FROM ||
    !process.env.APP_URL
  )
    throw new AppError(
      "Password recovery email is not connected yet. Contact your SangoPass operator.",
      503,
    );
  const user = one<{ id: string }>(
    "SELECT id FROM users WHERE email=?",
    address,
  );
  if (!user) return;
  const token = newToken();
  run("DELETE FROM reset_tokens WHERE userId=? OR expiresAt<?", user.id, now());
  run(
    "INSERT INTO reset_tokens VALUES(?,?,?)",
    hashToken(token),
    user.id,
    new Date(Date.now() + 30 * 60000).toISOString(),
  );
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [address],
      subject: "Reset your SangoPass password",
      text: `Use this private link to reset your SangoPass password. It expires in 30 minutes.\n\n${new URL("/reset?token=" + token, process.env.APP_URL)}\n\nIf you didn't request this, you can ignore this email.`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  // Do not disclose whether an email belongs to an account if delivery fails.
  if (!response.ok)
    console.error("Password recovery email delivery failed:", response.status);
}
export async function resetPassword(input: Record<string, unknown>) {
  const token = text(input.token, "reset token", 128);
  throttle("reset-use:" + hashToken(token), 5);
  const digest = await hashPassword(password(input.password));
  transaction(() => {
    const row = one<{ userId: string }>(
      "SELECT userId FROM reset_tokens WHERE hash=? AND expiresAt>?",
      hashToken(token),
      now(),
    );
    if (!row)
      throw new AppError("This password reset link is invalid or expired.");
    run("UPDATE users SET password=? WHERE id=?", digest, row.userId);
    run("DELETE FROM sessions WHERE userId=?", row.userId);
    run("DELETE FROM reset_tokens WHERE userId=?", row.userId);
  });
}
