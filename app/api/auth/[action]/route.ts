import { cookies } from "next/headers";
import {
  cookieName,
  endSession,
  login,
  register,
  tenantLogin,
} from "@/lib/server/auth";
import { join } from "@/lib/server/workspace";
import { authResponse, body, context, failure } from "@/lib/server/http";
import { demoMode } from "@/lib/server/config";
import { AppError } from "@/lib/server/validation";
import { requestReset, resetPassword } from "@/lib/server/recovery";

/**
 * Signing out is the one account action a showcase deployment still allows:
 * it takes something away rather than creating it, and refusing it would
 * strand anyone holding a cookie from before the switch was thrown.
 */
const ALLOWED_IN_DEMO = new Set(["logout"]);

export async function POST(
  request: Request,
  route: { params: Promise<{ action: string }> },
) {
  try {
    const input = await body(request);
    const { action } = await route.params;
    const caller = context(request);

    // A showcase deployment says on its sign-in screens that accounts are
    // switched off. Until now that was only what the pages said - the API
    // still created them, against a filesystem the host throws away between
    // invocations, so a prospect who registered got an account that worked
    // once and then vanished. The claim is now enforced where it is made.
    if (demoMode() && !ALLOWED_IN_DEMO.has(action))
      throw new AppError(
        "This is the SangoPass demo, so accounts are switched off. Open /demo to use the product with a sample estate — no sign-up, and nothing is stored.",
        403,
      );

    if (action === "forgot") {
      await requestReset(input, caller);
      return Response.json({ ok: true });
    }
    if (action === "reset") {
      await resetPassword(input);
      return authResponse(undefined, undefined, request);
    }
    if (action === "logout") {
      await endSession((await cookies()).get(cookieName)?.value);
      return authResponse(undefined, undefined, request);
    }
    if (action === "tenant-login") {
      const result = await tenantLogin(input, caller);
      return authResponse(result.token, result.orgId, request);
    }

    const result =
      action === "register"
        ? await register(input, caller)
        : action === "login"
          ? await login(input, caller)
          : action === "join"
            ? await join(input, caller)
            : null;
    if (!result) throw new AppError("Unknown action.", 404);
    return authResponse(
      result.token,
      "orgId" in result ? String(result.orgId) : undefined,
      request,
    );
  } catch (error) {
    return failure(error);
  }
}
