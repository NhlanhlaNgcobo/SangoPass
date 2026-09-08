import { NextResponse } from "next/server";
import { activity } from "@/lib/server/audit";
import { currentUser, failure } from "@/lib/server/http";
import { text } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const orgId = text(
      new URL(request.url).searchParams.get("org"),
      "organisation",
    );
    const entries = await activity(await currentUser(), orgId);
    return NextResponse.json(
      { entries },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
