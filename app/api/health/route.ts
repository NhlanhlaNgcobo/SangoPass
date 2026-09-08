import { NextResponse } from "next/server";
import { backend } from "@/lib/server/config";
import { store } from "@/lib/server/store";

// A readiness probe for load balancers and deploy checks. It confirms the
// storage backend actually answers, and deliberately reveals nothing else:
// no versions, no configuration, no counts.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await store().count("organisations", { limit: 1 });
    return NextResponse.json(
      { ok: true, backend: backend() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "SangoPass health check failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
