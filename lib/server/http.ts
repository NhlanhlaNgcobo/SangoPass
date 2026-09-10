import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieName, SESSION_DAYS, session } from "./auth";
import { appOrigin, isProduction, requestIsSecure } from "./config";
import { ConflictError } from "./store";
import { AppError } from "./validation";

export async function currentUser() {
  const user = await session((await cookies()).get(cookieName)?.value);
  if (!user) throw new AppError("Please sign in to continue.", 401);
  return user;
}

/**
 * Best-effort caller address for rate limiting. Behind the documented reverse
 * proxy the left-most X-Forwarded-For hop is the client; without a proxy the
 * header is absent and every caller shares the "unknown" bucket, which is why
 * the address bucket is only ever one of several.
 */
export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function context(request: Request) {
  return { ip: clientIp(request) };
}

/**
 * Refuses a write that did not come from this application's own pages.
 *
 * The session cookie is SameSite=Lax, which stops a cross-site form post on
 * its own; this is the second lock, and the one that does not depend on the
 * browser having got the first right.
 */
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== appOrigin(request))
    throw new AppError("Request origin is not allowed.", 403);
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  assertOrigin(request);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("Expected JSON.", 415);
  const value = await request.text();
  if (value.length > 16384) throw new AppError("Request is too large.", 413);
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("not an object");
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
  if (error instanceof ConflictError)
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

export function authResponse(
  token?: string,
  orgId?: string,
  request?: Request,
) {
  const response = NextResponse.json({ ok: true, orgId });
  response.cookies.set(cookieName, token || "", {
    httpOnly: true,
    // Derived from the actual request protocol, honouring a terminating proxy,
    // so a misconfigured APP_URL cannot silently drop the flag.
    secure: isProduction() && requestIsSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: token ? SESSION_DAYS * 86400 : 0,
  });
  return response;
}
