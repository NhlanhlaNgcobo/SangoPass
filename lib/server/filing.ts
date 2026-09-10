/**
 * The tenant filing cabinet: putting a document in it, and taking one out.
 *
 * Kept apart from workspace.ts because these two are the only operations in
 * the product that move bytes rather than records, and they cannot ride the
 * JSON command channel: a scanned lease is megabytes, and the command endpoint
 * refuses anything over 16KB for good reason.
 */
import { randomUUID } from "node:crypto";
import { now } from "./auth";
import {
  documentKey,
  documentStorage,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
} from "./documents";
import { store } from "./store";
import type {
  DocumentRecord,
  MembershipRecord,
  PropertyRecord,
  TenancyRecord,
  UnitRecord,
} from "./store";
import { AppError, choice, text } from "./validation";
import { access } from "./workspace";
import type { Account, DocumentKind } from "@/types/workspace";

const KINDS = [
  "lease",
  "notice",
  "identity",
  "proof_of_payment",
  "inspection",
  "other",
] as const;

function office(m: MembershipRecord) {
  if (m.role !== "manager" && m.role !== "reception")
    throw new AppError("A manager or reception account is required.", 403);
}

export interface FileDocumentInput {
  orgId: string;
  tenancyId?: unknown;
  propertyId?: unknown;
  title?: unknown;
  kind?: unknown;
  filename: string;
  mime: string;
  data: Uint8Array;
}

/**
 * Files a document against a tenancy.
 *
 * The record is written only once the bytes are safely stored: a row pointing
 * at a file that was never written is a lease that appears to exist and cannot
 * be opened, which is worse than no row at all. The reverse - bytes with no
 * row - costs some storage and nothing else.
 */
export async function fileDocument(
  user: Account,
  input: FileDocumentInput,
): Promise<{ id: string }> {
  const m = await access(user, input.orgId);
  office(m);

  if (!input.data.length) throw new AppError("That file is empty.");
  if (input.data.length > MAX_DOCUMENT_BYTES)
    throw new AppError(
      `Documents are limited to ${Math.floor(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB. Scan at a lower resolution, or split the file.`,
      413,
    );
  if (!DOCUMENT_TYPES[input.mime])
    throw new AppError(
      "Attach a PDF or an image (JPEG, PNG or WebP). Other file types are not accepted.",
      415,
    );

  const kind = choice(input.kind ?? "other", KINDS, "document type");
  const title = text(input.title, "title", 180);
  const database = store();

  // A document is filed against a stay, which is what gives it a resident, a
  // unit and a building. Filing straight onto a property is allowed for the
  // papers that belong to the building rather than to anyone living in it.
  let tenancy: TenancyRecord | undefined;
  let property: PropertyRecord | undefined;
  let unit: UnitRecord | undefined;

  if (typeof input.tenancyId === "string" && input.tenancyId) {
    tenancy = await database.get<TenancyRecord>("tenancies", input.tenancyId);
    if (!tenancy || tenancy.orgId !== m.orgId)
      throw new AppError("Tenancy not found.", 404);
    property = await database.get<PropertyRecord>(
      "properties",
      tenancy.propertyId,
    );
    unit = await database.get<UnitRecord>("units", tenancy.unitId);
  } else {
    property = await database.get<PropertyRecord>(
      "properties",
      text(input.propertyId, "property"),
    );
    if (!property || property.orgId !== m.orgId)
      throw new AppError("Property not available.", 404);
  }
  if (!property) throw new AppError("Property not available.", 404);
  if (m.role !== "manager" && property.id !== m.propertyId)
    throw new AppError("Property not available.", 404);

  const id = randomUUID();
  const storageKey = documentKey(m.orgId, id);
  await documentStorage().put(storageKey, input.data);

  try {
    await store().tx(async (t) => {
      t.create("documents", id, {
        orgId: m.orgId,
        propertyId: property.id,
        propertyName: property.name,
        unitId: tenancy?.unitId ?? null,
        unitLabel: tenancy?.unitLabel ?? unit?.label ?? null,
        tenancyId: tenancy?.id ?? null,
        residentId: tenancy?.residentId ?? null,
        residentName: tenancy?.residentName ?? "",
        title,
        kind,
        filename: text(input.filename, "file name", 255),
        mime: input.mime,
        bytes: input.data.length,
        storageKey,
        uploadedAt: now(),
        uploadedBy: user.id,
        uploadedByName: user.name,
      });
      t.create("audit", randomUUID(), {
        orgId: m.orgId,
        userId: user.id,
        userName: user.name,
        action: "document",
        subject: id,
        createdAt: now(),
      });
    });
  } catch (error) {
    // The row never landed, so the bytes belong to nobody. Take them back out.
    await documentStorage()
      .remove(storageKey)
      .catch(() => undefined);
    throw error;
  }

  return { id };
}

export interface OpenedDocument {
  record: DocumentRecord;
  bytes: Uint8Array;
}

/**
 * Reads a filed document, for someone entitled to see it.
 *
 * The bucket and the disk are both closed to the outside world - storage.rules
 * is a total denial and no signed URL is ever issued - so this is the only way
 * in, and the membership check here is the whole of the access control.
 */
export async function openDocument(
  user: Account,
  orgId: string,
  id: string,
): Promise<OpenedDocument> {
  const m = await access(user, orgId);
  const database = store();
  const record = await database.get<DocumentRecord>("documents", id);
  // A document in another organisation is reported missing rather than
  // forbidden: "not yours" still confirms it exists.
  if (!record || record.orgId !== m.orgId)
    throw new AppError("Document not found.", 404);

  const allowed =
    m.role === "manager" ||
    (m.role === "reception" && record.propertyId === m.propertyId) ||
    (m.role === "tenant" && record.residentId === user.id);
  if (!allowed) throw new AppError("Document not found.", 404);

  const bytes = await documentStorage().get(record.storageKey);
  if (!bytes)
    throw new AppError(
      "This document is recorded but its file is missing. Ask whoever uploaded it to add it again.",
      410,
    );
  return { record, bytes };
}

export type { DocumentKind };
