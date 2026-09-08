import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieName, session } from "./auth";
import { AppError } from "./validation";
export async function currentUser() {
  const user = session((await cookies()).get(cookieName)?.value);
  if (!user) throw new AppError("Please sign in to continue.", 401);
  return user;
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : new URL(request.url).origin;
  if (!origin || origin !== expected)
    throw new AppError("Request origin is not allowed.", 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("Expected JSON.", 415);
  const value = await request.text();
  if (value.length > 16384) throw new AppError("Request is too large.", 413);
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new AppError("Invalid request.");
  }
}
export function failure(error: unknown) {
  if (error instanceof AppError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed")
  )
    return NextResponse.json(
      { error: "That record already exists. Please refresh and try again." },
      { status: 409 },
    );
  console.error(
    "SangoPass request failed",
    error instanceof Error ? error.message : "Unknown error",
  );
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
export function authResponse(token?: string, orgId?: string) {
  const response = NextResponse.json({ ok: true, orgId });
  response.cookies.set(cookieName, token || "", {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.APP_URL?.startsWith("https://") === true,
    sameSite: "lax",
    path: "/",
    maxAge: token ? 7 * 86400 : 0,
  });
  return response;
}
