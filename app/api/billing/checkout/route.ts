import { NextResponse } from "next/server";
import { body, currentUser, failure } from "@/lib/server/http";
import { checkout } from "@/lib/server/billing";
import { text } from "@/lib/server/validation";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const input = await body(request);
    return NextResponse.json(
      checkout(
        await currentUser(),
        text(input.orgId, "organisation"),
        input.plan,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
