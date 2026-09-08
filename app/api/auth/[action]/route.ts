import { cookies } from "next/headers";
import {
  cookieName,
  endSession,
  login,
  register,
  tenantLogin,
} from "@/lib/server/auth";
import { join } from "@/lib/server/workspace";
import { authResponse, body, failure } from "@/lib/server/http";
import { AppError } from "@/lib/server/validation";
import { requestReset, resetPassword } from "@/lib/server/recovery";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  try {
    const input = await body(request);
    const { action } = await context.params;
    if (action === "forgot") {
      await requestReset(input);
      return Response.json({ ok: true });
    }
    if (action === "reset") {
      await resetPassword(input);
      return authResponse();
    }
    if (action === "logout") {
      endSession((await cookies()).get(cookieName)?.value);
      return authResponse();
    }
    if (action === "tenant-login") {
      const result = await tenantLogin(input);
      return authResponse(result.token, result.orgId);
    }
    const result =
      action === "register"
        ? await register(input)
        : action === "login"
          ? await login(input)
          : action === "join"
            ? await join(input)
            : null;
    if (!result) throw new AppError("Unknown action.", 404);
    return authResponse(
      result.token,
      "orgId" in result ? String(result.orgId) : undefined,
    );
  } catch (error) {
    return failure(error);
  }
}
