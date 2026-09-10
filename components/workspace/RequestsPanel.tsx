"use client";
import { useState, type FormEvent } from "react";
import { Inbox, Send } from "lucide-react";
import {
  OFFICE_STATUSES,
  REQUEST_DESCRIPTIONS,
  REQUEST_KINDS,
  REQUEST_LABELS,
  STATUS_LABELS,
  stillOpen,
  type RequestKind,
  type RequestStatus,
} from "@/lib/shared/notices";
import type { WorkspaceState } from "@/types/workspace";

const asDate = (value: string) => value.slice(0, 10);

/** Open notices sort to the top: they are the ones that still owe an answer. */
const queue = (state: WorkspaceState) =>
  [...state.requests].sort(
    (a, b) =>
      Number(stillOpen(b.status)) - Number(stillOpen(a.status)) ||
      b.createdAt.localeCompare(a.createdAt),
  );

export default function RequestsPanel({
  state,
  office,
  tenant,
  busy,
  onAct,
}: {
  state: WorkspaceState;
  office: boolean;
  tenant: boolean;
  busy: boolean;
  onAct: (input: Record<string, unknown>) => void;
}) {
  const [kind, setKind] = useState<RequestKind>("move_out");
  const [deciding, setDeciding] = useState<string>("");

  const rows = queue(state);
  const open = rows.filter((r) => stillOpen(r.status)).length;

  function raise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    onAct({ ...data, action: "notice" });
    event.currentTarget.reset();
  }

  function decide(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    onAct({ ...data, id, action: "noticeStatus" });
    setDeciding("");
  }

  return (
    <>
      {tenant && (
        <section className="sp-panel">
          <div className="sp-section-head">
            <h2>Give notice</h2>
          </div>
          <p className="sp-muted" style={{ marginTop: -4 }}>
            Tell the office you are moving out, or that you would like a
            different unit or property. It goes to reception and your manager,
            and you can see what they decide below. Nothing changes until they
            answer.
          </p>
          <form className="sp-form" onSubmit={raise}>
            <label>
              <span>What is changing</span>
              <select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as RequestKind)}
              >
                {REQUEST_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {REQUEST_LABELS[k]}
                  </option>
                ))}
              </select>
              <small className="sp-muted">{REQUEST_DESCRIPTIONS[kind]}</small>
            </label>
            <label>
              <span>From when</span>
              <input name="effectiveDate" type="date" required />
              <small className="sp-muted">
                The date you intend it to take effect. Check your lease for how
                much notice you owe.
              </small>
            </label>
            <label>
              <span>Anything the office should know</span>
              <textarea
                name="details"
                rows={3}
                maxLength={1000}
                placeholder="A new job in another city, and I would like the exit inspection on a Saturday if possible."
              />
            </label>
            <button className="sp-primary" disabled={busy}>
              <Send size={15} />
              Send notice
            </button>
          </form>
        </section>
      )}

      <section className="sp-panel">
        <div className="sp-section-head">
          <h2>
            {office ? "Resident notices" : "Your notices"}{" "}
            <span className="sp-muted">
              ({open} awaiting {office ? "you" : "the office"})
            </span>
          </h2>
        </div>

        {!rows.length ? (
          <p className="sp-muted">
            <Inbox size={16} />{" "}
            {office
              ? "No notices. When a resident says they are moving out or want a different unit, it lands here."
              : "You have not given any notice."}
          </p>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-responsive-table" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  {office && (
                    <th role="columnheader" scope="col">
                      Resident
                    </th>
                  )}
                  <th role="columnheader" scope="col">
                    Notice
                  </th>
                  <th role="columnheader" scope="col">
                    From
                  </th>
                  <th role="columnheader" scope="col">
                    Status
                  </th>
                  <th role="columnheader" scope="col">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {rows.map((r) => (
                  <tr key={r.id} role="row">
                    {office && (
                      <td data-label="Resident" role="cell">
                        {r.residentName}
                        <small className="sp-block sp-muted">
                          {r.unitLabel ? `${r.unitLabel} · ` : ""}
                          {r.propertyName}
                        </small>
                      </td>
                    )}
                    <td data-label="Notice" role="cell">
                      <strong>{REQUEST_LABELS[r.kind]}</strong>
                      {r.details && (
                        <small className="sp-block sp-muted">{r.details}</small>
                      )}
                      <small className="sp-block sp-muted">
                        Raised {asDate(r.createdAt)}
                      </small>
                    </td>
                    <td data-label="From" role="cell">
                      {r.effectiveDate}
                    </td>
                    <td data-label="Status" role="cell">
                      <span
                        className={`sp-badge phrase${r.status === "approved" ? " success" : ""}`}
                      >
                        {STATUS_LABELS[r.status as RequestStatus]}
                      </span>
                      {r.decisionNote && (
                        <small className="sp-block sp-muted">
                          “{r.decisionNote}”
                          {r.decidedByName ? ` — ${r.decidedByName}` : ""}
                        </small>
                      )}
                    </td>
                    <td data-label="Actions" role="cell">
                      {office && r.status !== "withdrawn" ? (
                        deciding === r.id ? (
                          <form
                            className="sp-inline-form"
                            onSubmit={(e) => decide(e, r.id)}
                          >
                            <select name="status" defaultValue="acknowledged">
                              {OFFICE_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                            <input
                              name="note"
                              placeholder="A note for the resident"
                              maxLength={1000}
                            />
                            <button className="sp-secondary" disabled={busy}>
                              Save
                            </button>
                            <button
                              type="button"
                              className="sp-text-button"
                              onClick={() => setDeciding("")}
                            >
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <button
                            className="sp-secondary"
                            disabled={busy}
                            onClick={() => setDeciding(r.id)}
                          >
                            Answer
                          </button>
                        )
                      ) : tenant && stillOpen(r.status) ? (
                        <button
                          className="sp-text-button danger"
                          disabled={busy}
                          onClick={() =>
                            onAct({ action: "noticeWithdraw", id: r.id })
                          }
                        >
                          Withdraw
                        </button>
                      ) : (
                        <span className="sp-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
