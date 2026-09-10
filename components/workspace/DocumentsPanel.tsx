"use client";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  QrCode,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import type {
  LiveDocument,
  LiveTenancy,
  LiveVisitor,
  WorkspaceState,
} from "@/types/workspace";

const KIND_LABELS: Record<LiveDocument["kind"], string> = {
  lease: "Lease agreement",
  notice: "Notice",
  identity: "Identity document",
  proof_of_payment: "Proof of payment",
  inspection: "Inspection",
  other: "Other",
};

const SIZES = ["B", "KB", "MB"];
function size(bytes: number) {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZES.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${SIZES[unit]}`;
}

const asDate = (value: string) => value.slice(0, 10);

/**
 * Everything the office holds about one stay, in one place.
 *
 * A folder is a tenancy rather than a person, because that is the unit the
 * paperwork actually belongs to: the same person taking a second unit is a
 * second lease, and a unit's previous occupant keeps their own folder rather
 * than having it overwritten by whoever moved in next.
 */
interface Folder {
  tenancy: LiveTenancy;
  documents: LiveDocument[];
  passes: LiveVisitor[];
}

export default function DocumentsPanel({
  state,
  office,
  orgId,
  demo,
  busy,
  onRemove,
  onUploaded,
  onError,
}: {
  state: WorkspaceState;
  office: boolean;
  orgId: string;
  /** The demo holds no files, so it offers the shape and says so. */
  demo: boolean;
  busy: boolean;
  onRemove: (id: string) => void;
  onUploaded: (next: WorkspaceState) => void;
  onError: (message: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [openFolder, setOpenFolder] = useState<string>("");
  const [uploadTo, setUploadTo] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [showQr, setShowQr] = useState<string>("");
  const form = useRef<HTMLFormElement>(null);

  const folders = useMemo<Folder[]>(() => {
    return state.tenancies
      .map((tenancy) => ({
        tenancy,
        documents: state.documents.filter((d) => d.tenancyId === tenancy.id),
        // The passes this resident generated while living there. Not stored
        // files - a pass is data, and its QR is drawn from the token - so they
        // sit in the folder without anything having been uploaded.
        passes: state.visitors.filter(
          (v) => v.hostId === tenancy.residentId && v.unitId === tenancy.unitId,
        ),
      }))
      .sort(
        (a, b) =>
          Number(b.tenancy.current) - Number(a.tenancy.current) ||
          b.tenancy.startedAt.localeCompare(a.tenancy.startedAt),
      );
  }, [state.tenancies, state.documents, state.visitors]);

  // Name, surname or unit - the three things somebody at a desk actually has
  // when they go looking. Surname works because the whole name is searched,
  // so "Petersen" finds Aisha Petersen without storing the halves apart.
  const query = search.trim().toLowerCase();
  const shown = query
    ? folders.filter((f) =>
        `${f.tenancy.residentName} ${f.tenancy.unitLabel} ${f.tenancy.propertyName} ${f.tenancy.username ?? ""} ${f.tenancy.residentEmail}`
          .toLowerCase()
          .includes(query),
      )
    : folders;

  const loose = state.documents.filter((d) => !d.tenancyId);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (demo) {
      onError(
        "The demo keeps nothing, so there is nowhere to put a file. Uploading works on a real account.",
      );
      return;
    }
    setUploading(true);
    try {
      data.set("orgId", orgId);
      const response = await fetch("/api/documents", {
        method: "POST",
        body: data,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      onUploaded(payload.state as WorkspaceState);
      form.current?.reset();
      setUploadTo("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Unable to upload that file.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="sp-panel">
      <div className="sp-section-head">
        <h2>
          Documents <span className="sp-muted">({state.documents.length})</span>
        </h2>
        <label className="sp-search">
          <Search size={17} />
          <input
            aria-label="Search documents by resident name, surname or unit"
            placeholder="Name, surname or unit"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <p className="sp-muted" style={{ marginTop: -4, marginBottom: 16 }}>
        {office
          ? "Every stay in this register, current and finished, with the papers and passes filed against it. A folder stays after the resident leaves."
          : "The papers your building holds for you."}
      </p>

      {office && (
        <form
          ref={form}
          className="sp-upload"
          onSubmit={upload}
          style={{ marginBottom: 20 }}
        >
          <label>
            <span>File against</span>
            <select
              name="tenancyId"
              value={uploadTo}
              onChange={(e) => setUploadTo(e.target.value)}
              required
            >
              <option value="">Choose a resident and unit…</option>
              {folders.map((f) => (
                <option key={f.tenancy.id} value={f.tenancy.id}>
                  {f.tenancy.residentName} — {f.tenancy.unitLabel}
                  {f.tenancy.current ? "" : " (past)"}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Type</span>
            <select name="kind" defaultValue="lease">
              {(Object.keys(KIND_LABELS) as LiveDocument["kind"][]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Title</span>
            <input name="title" placeholder="Lease agreement" required />
          </label>
          <label>
            <span>File</span>
            <input
              name="file"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              required
            />
          </label>
          <button className="sp-secondary" disabled={uploading || busy}>
            <Upload size={15} />
            {uploading ? "Uploading…" : "File it"}
          </button>
          <small className="sp-muted">
            PDF or image, up to 15 MB. Only the office can see it.
          </small>
        </form>
      )}

      {!shown.length ? (
        <p className="sp-muted">
          {query
            ? "No resident, unit or property matches that."
            : "No tenancies recorded yet. A folder opens the moment a resident takes a unit."}
        </p>
      ) : (
        <div className="sp-folders">
          {shown.map(({ tenancy, documents, passes }) => {
            const isOpen = openFolder === tenancy.id;
            return (
              <article
                key={tenancy.id}
                className={`sp-folder${tenancy.current ? "" : " past"}`}
              >
                <button
                  className="sp-folder-head"
                  aria-expanded={isOpen}
                  onClick={() => setOpenFolder(isOpen ? "" : tenancy.id)}
                >
                  {isOpen ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                  <span className="sp-folder-title">
                    <strong>{tenancy.residentName}</strong>
                    <small>
                      {tenancy.unitLabel} · {tenancy.propertyName}
                    </small>
                  </span>
                  <span
                    className={`sp-badge${tenancy.current ? " success" : ""}`}
                  >
                    {tenancy.current ? "Current" : "Past"}
                  </span>
                  <small className="sp-muted">
                    {asDate(tenancy.startedAt)} →{" "}
                    {tenancy.endedAt ? asDate(tenancy.endedAt) : "present"}
                  </small>
                  <small className="sp-muted">
                    {documents.length}{" "}
                    {documents.length === 1 ? "document" : "documents"}
                    {passes.length
                      ? ` · ${passes.length} ${passes.length === 1 ? "pass" : "passes"}`
                      : ""}
                  </small>
                </button>

                {isOpen && (
                  <div className="sp-folder-body">
                    {!documents.length ? (
                      <p className="sp-muted">Nothing filed for this stay.</p>
                    ) : (
                      <ul className="sp-doc-list">
                        {documents.map((d) => (
                          <li key={d.id}>
                            <FileText size={16} />
                            <span>
                              {demo ? (
                                <strong>{d.title}</strong>
                              ) : (
                                <a
                                  href={`/api/documents/${d.id}?org=${encodeURIComponent(orgId)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <strong>{d.title}</strong>
                                </a>
                              )}
                              <small className="sp-block sp-muted">
                                {KIND_LABELS[d.kind]} · {size(d.bytes)} ·{" "}
                                {asDate(d.uploadedAt)} · {d.uploadedByName}
                              </small>
                            </span>
                            {office && (
                              <button
                                className="sp-text-button danger"
                                disabled={busy}
                                onClick={() => onRemove(d.id)}
                                aria-label={`Remove ${d.title}`}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {passes.length > 0 && (
                      <div className="sp-folder-passes">
                        <h4>
                          <QrCode size={15} /> Guest passes generated ({passes.length})
                        </h4>
                        <ul className="sp-doc-list">
                          {passes.map((p) => (
                            <li key={p.id}>
                              <span>
                                <strong>{p.visitorName}</strong>
                                <small className="sp-block sp-muted">
                                  {p.reference} · {p.visitDate} · {p.status}
                                </small>
                              </span>
                              <button
                                className="sp-text-button"
                                onClick={() =>
                                  setShowQr(showQr === p.id ? "" : p.id)
                                }
                              >
                                {showQr === p.id ? "Hide QR" : "Show QR"}
                              </button>
                              {showQr === p.id && (
                                <div className="sp-folder-qr">
                                  <QRCodeSVG
                                    value={`SANGOPASS-LIVE:${p.reference}:${p.token}`}
                                    size={132}
                                    level="M"
                                  />
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {office && loose.length > 0 && !query && (
        <>
          <h3 style={{ marginTop: 24 }}>Filed against the building</h3>
          <ul className="sp-doc-list">
            {loose.map((d) => (
              <li key={d.id}>
                <FileText size={16} />
                <span>
                  {demo ? (
                    <strong>{d.title}</strong>
                  ) : (
                    <a
                      href={`/api/documents/${d.id}?org=${encodeURIComponent(orgId)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <strong>{d.title}</strong>
                    </a>
                  )}
                  <small className="sp-block sp-muted">
                    {d.propertyName} · {KIND_LABELS[d.kind]} · {size(d.bytes)}
                  </small>
                </span>
                <button
                  className="sp-text-button danger"
                  disabled={busy}
                  onClick={() => onRemove(d.id)}
                  aria-label={`Remove ${d.title}`}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
