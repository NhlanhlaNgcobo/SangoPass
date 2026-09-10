import { currentUser, failure } from "@/lib/server/http";
import { openDocument } from "@/lib/server/filing";
import { text } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams a filed document back to someone entitled to see it.
 *
 * Storage itself is closed - deny-all rules, no signed URLs - so this is the
 * only door, and openDocument() checks the membership behind it.
 *
 * The response headers matter as much as the check. An uploaded file is
 * content this application did not write, served from its own origin, so:
 * nosniff stops the browser second-guessing a declared type, the sandbox CSP
 * neutralises anything active that made it through the upload whitelist, and
 * no-store keeps a lease out of a shared machine's disk cache.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const orgId = text(
      new URL(request.url).searchParams.get("org"),
      "organisation",
    );
    const { record, bytes } = await openDocument(await currentUser(), orgId, id);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": record.mime,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `inline; filename="${record.filename.replace(/[^\w. -]/g, "_")}"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
