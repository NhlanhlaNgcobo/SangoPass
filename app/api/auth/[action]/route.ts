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
import { AppError } from "@/lib/server/validation";
import { requestReset, resetPassword } from "@/lib/server/recovery";

export async function POST(
  request: Request,
  route: { params: Promise<{ action: string }> },
) {
  try {
    const input = await body(request);
    const { action } = await route.params;
    const caller = context(request);

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
