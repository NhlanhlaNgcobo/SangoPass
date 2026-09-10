import { NextResponse } from "next/server";
import { assertOrigin, currentUser, failure } from "@/lib/server/http";
import { MAX_DOCUMENT_BYTES } from "@/lib/server/documents";
import { fileDocument } from "@/lib/server/filing";
import { workspace } from "@/lib/server/workspace";
import { AppError, text } from "@/lib/server/validation";

export const runtime = "nodejs";

/**
 * Uploading a tenant document.
 *
 * Its own endpoint rather than an action on /api/workspace, because that one
 * accepts JSON and refuses anything over 16KB - the right rule for commands
 * and the wrong one for a scanned lease.
 */
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (!request.headers.get("content-type")?.includes("multipart/form-data"))
      throw new AppError("Expected a file upload.", 415);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Attach a file.");
    // Checked before reading the body into memory, so an oversized upload is
    // refused rather than buffered.
    if (file.size > MAX_DOCUMENT_BYTES)
      throw new AppError(
        `Documents are limited to ${Math.floor(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB.`,
        413,
      );

    const user = await currentUser();
    const orgId = text(form.get("orgId"), "organisation");
    const result = await fileDocument(user, {
      orgId,
      tenancyId: form.get("tenancyId") ?? undefined,
      propertyId: form.get("propertyId") ?? undefined,
      title: form.get("title") ?? file.name,
      kind: form.get("kind") ?? "other",
      filename: file.name || "document",
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
