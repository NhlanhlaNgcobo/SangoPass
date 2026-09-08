import { NextResponse } from "next/server";
import { currentUser, failure } from "@/lib/server/http";
import { exportForManager } from "@/lib/server/tenancy";
import { text } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const orgId = text(
      new URL(request.url).searchParams.get("org"),
      "organisation",
    );
    const payload = await exportForManager(await currentUser(), orgId);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="sangopass-${orgId}.json"`,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
