import { NextResponse } from "next/server";
import { body, currentUser, failure } from "@/lib/server/http";
import { workspace } from "@/lib/server/workspace";
import { enrolmentCommand } from "@/lib/server/enrolment";
import { text } from "@/lib/server/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return NextResponse.json(
      workspace(
        await currentUser(),
        new URL(request.url).searchParams.get("org") || undefined,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = await body(request);
    const user = await currentUser();
    const orgId = text(input.orgId, "organisation");
    const result = await enrolmentCommand(user, orgId, input);
    return NextResponse.json({ result, state: workspace(user, orgId) });
  } catch (error) {
    return failure(error);
  }
}
