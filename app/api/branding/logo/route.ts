import { NextResponse } from "next/server";
import { assertOrigin, currentUser, failure } from "@/lib/server/http";
import { MAX_LOGO_BYTES } from "@/lib/server/documents";
import { openLogo, setLogo } from "@/lib/server/filing";
import { workspace } from "@/lib/server/workspace";
import { AppError, text } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves the company logo to anyone who belongs to the organisation. */
export async function GET(request: Request) {
  try {
    const orgId = text(
      new URL(request.url).searchParams.get("org"),
      "organisation",
    );
    const { mime, bytes } = await openLogo(await currentUser(), orgId);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length),
        // Private, because it identifies the organisation viewing it, and
        // revalidated because a company that changes its logo wants to see the
        // change. The URL carries the update time, so a hit is always current.
        "Cache-Control": "private, max-age=300",
        // The strict policy for uploaded bytes lives in next.config.ts, whose
        // headers() wins over anything set here. See uploadCsp there.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (!request.headers.get("content-type")?.includes("multipart/form-data"))
      throw new AppError("Expected a file upload.", 415);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Choose an image.");
    if (file.size > MAX_LOGO_BYTES)
      throw new AppError(
        `A logo must be under ${Math.floor(MAX_LOGO_BYTES / (1024 * 1024))} MB.`,
        413,
      );

    const user = await currentUser();
    const orgId = text(form.get("orgId"), "organisation");
    const result = await setLogo(user, orgId, {
      mime: file.type || "application/octet-stream",
      data: new Uint8Array(await file.arrayBuffer()),
    });

    return NextResponse.json(
      { result, state: await workspace(user, orgId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
