import { NextResponse } from "next/server";
import { assertOrigin, currentUser, failure } from "@/lib/server/http";
import { deliverImport } from "@/lib/server/notifications";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  importResidents,
} from "@/lib/server/enrolment";
import { access, entitled, workspace } from "@/lib/server/workspace";
import { store } from "@/lib/server/store";
import type { OrganisationRecord, PropertyRecord } from "@/lib/server/store";
import { AppError, text } from "@/lib/server/validation";

export const runtime = "nodejs";

/**
 * Enrolling a whole building from a spreadsheet.
 *
 * Its own endpoint rather than an action on /api/workspace for the reason the
 * document upload has one: that route takes JSON and refuses anything over
 * 16KB, which is the right rule for a command and the wrong one for a file.
 */
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (!request.headers.get("content-type")?.includes("multipart/form-data"))
      throw new AppError("Attach the file as an upload.", 415);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Attach a CSV file.");
    // Checked before the body is read into memory.
    if (file.size > MAX_IMPORT_BYTES)
      throw new AppError(
        `A roll of up to ${MAX_IMPORT_ROWS} residents is far smaller than ${Math.floor(MAX_IMPORT_BYTES / 1024)} KB. Check you attached the right file.`,
        413,
      );

    const user = await currentUser();
    const orgId = text(form.get("orgId"), "organisation");
    const membership = await access(user, orgId);
    if (membership.role !== "manager" && membership.role !== "reception")
      throw new AppError("A manager or reception account is required.", 403);

    // Enrolling is growth, so it waits for renewal exactly as adding one
    // resident by hand does. A file is not a way around the gate.
    const organisation = await store().get<OrganisationRecord>(
      "organisations",
      orgId,
    );
    if (!organisation || !entitled(organisation))
      throw new AppError(
        "Your trial or paid month has ended. Ask a manager to renew from Billing.",
        402,
      );

    const property = await store().get<PropertyRecord>(
      "properties",
      text(form.get("propertyId"), "property"),
    );
    if (
      !property ||
      property.orgId !== orgId ||
      (membership.role !== "manager" && membership.propertyId !== property.id)
    )
      throw new AppError("Property not available.", 404);
    if (property.archivedAt)
      throw new AppError(
        `${property.name} is archived. Restore it from Properties first.`,
        409,
      );

    const outcome = await importResidents(orgId, property, await file.text());

    // Nothing was written: hand back every line that has to be fixed, so the
    // manager corrects the file once rather than discovering the next problem
    // on the next upload.
    if (!outcome.ok)
      return NextResponse.json(
        {
          result: { enrolled: 0, problems: outcome.problems },
          state: await workspace(user, orgId),
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );

    const post = await deliverImport(outcome.invitations);
    return NextResponse.json(
      {
        result: {
          enrolled: outcome.invitations.length,
          problems: [],
          emailed: post.sent,
          emailFailed: post.failed,
          emailConfigured: post.configured,
        },
        state: await workspace(user, orgId),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
