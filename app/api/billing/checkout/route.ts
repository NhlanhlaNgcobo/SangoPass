import { NextResponse } from "next/server";
import { body, currentUser, failure } from "@/lib/server/http";
import { checkout } from "@/lib/server/billing";
import { text } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const input = await body(request);
    const user = await currentUser();
    return NextResponse.json(
      await checkout(user, text(input.orgId, "organisation"), input.plan),
    );
  } catch (error) {
    return failure(error);
  }
}
