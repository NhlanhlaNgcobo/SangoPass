import { NextResponse } from "next/server";
import { body, currentUser, failure } from "@/lib/server/http";
import { workspace } from "@/lib/server/workspace";
import { commandAndNotify } from "@/lib/server/notifications";
import { text } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const state = await workspace(
      await currentUser(),
      new URL(request.url).searchParams.get("org") || undefined,
    );
    return NextResponse.json(state, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = await body(request);
    const user = await currentUser();
    const orgId = text(input.orgId, "organisation");
    const result = await commandAndNotify(user, orgId, input);
    return NextResponse.json(
      { result, state: await workspace(user, orgId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
