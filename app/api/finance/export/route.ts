import { currentUser, failure } from "@/lib/server/http";
import { financeExport } from "@/lib/server/books";
import { text } from "@/lib/server/validation";

/**
 * One month of the organisation's books as a spreadsheet.
 *
 * CSV rather than xlsx: it opens directly in Excel, Numbers and Google Sheets,
 * it needs no library on either side, and a manager can hand it to a bookkeeper
 * or an accounting package without anything in between. Returned as a file
 * rather than a download built in the browser, so the figures are produced by
 * the same code the screen reads and a manager cannot export a month they are
 * not entitled to see.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const orgId = text(url.searchParams.get("org"), "organisation");
    const { csv, filename } = await financeExport(
      await currentUser(),
      orgId,
      url.searchParams.get("period"),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
