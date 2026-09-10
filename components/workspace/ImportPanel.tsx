"use client";
import { useRef, useState, type FormEvent } from "react";
import { Download, Upload, Users } from "lucide-react";
import { MAX_IMPORT_ROWS, importTemplate } from "@/lib/shared/csv";
import type { WorkspaceState } from "@/types/workspace";

interface RowProblem {
  line: number;
  message: string;
}

/**
 * Enrolling a building from the spreadsheet the office already keeps.
 *
 * The whole file is checked before any of it is written, so what comes back
 * is either everybody or a list of lines to fix. That is the only shape that
 * makes the obvious second attempt - correct the file, upload it again - safe
 * to make: a partial import would double-enrol everyone who worked the first
 * time.
 */
export default function ImportPanel({
  state,
  orgId,
  demo,
  onImported,
}: {
  state: WorkspaceState;
  orgId: string;
  /** The demo stores nothing, so there is nowhere for a roll to land. */
  demo: boolean;
  onImported: (next: WorkspaceState, message: string) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [propertyId, setPropertyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<RowProblem[]>([]);
  const [failure, setFailure] = useState("");

  const open = state.properties.filter((p) => !p.archivedAt);
  const chosen = open.find((p) => p.id === (propertyId || open[0]?.id));
  const student = chosen?.type === "student_accommodation";
  // Units with a bed still free, not only empty ones: a three-person flat
  // with one sharer in it still has two places for this roll to fill.
  const vacant = state.units.filter(
    (u) =>
      !u.archivedAt &&
      u.propertyId === chosen?.id &&
      u.occupants < u.maxOccupants,
  );

  /** The blank roll, built in the browser and already listing the empty units. */
  function template() {
    if (!chosen) return;
    const file = new Blob(
      [
        importTemplate(
          Boolean(student),
          vacant.map((u) => u.label),
        ),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${chosen.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-residents.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblems([]);
    setFailure("");
    if (demo) {
      setFailure(
        "The demo keeps nothing, so there is nowhere for a roll to land. Importing works on a real account.",
      );
      return;
    }
    const data = new FormData(event.currentTarget);
    data.set("orgId", orgId);
    data.set("propertyId", chosen?.id || "");
    setBusy(true);
    try {
      const response = await fetch("/api/residents/import", {
        method: "POST",
        body: data,
      });
      const payload = await response.json();
      if (response.status === 422) {
        // Not an error in the usual sense: the file was read, understood, and
        // every line that needs fixing is named. Nothing was written.
        setProblems(payload.result.problems as RowProblem[]);
        return;
      }
      if (!response.ok) throw new Error(payload.error);
      const { enrolled, emailed, emailFailed, emailConfigured } =
        payload.result;
      onImported(
        payload.state as WorkspaceState,
        [
          `${enrolled} ${enrolled === 1 ? "resident" : "residents"} enrolled.`,
          !emailConfigured
            ? "Email is not connected, so no welcome emails were sent — share each invitation from Pending invitations."
            : emailFailed
              ? `${emailed} welcome ${emailed === 1 ? "email" : "emails"} sent; ${emailFailed} did not. Retry those from Pending invitations.`
              : `${emailed} welcome ${emailed === 1 ? "email" : "emails"} sent.`,
        ].join(" "),
      );
      form.current?.reset();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Unable to read that file.");
    } finally {
      setBusy(false);
    }
  }

  if (!open.length) return null;

  return (
    <section className="sp-panel">
      <div className="sp-section-head">
        <h2>Enrol a whole building</h2>
      </div>
      <p className="sp-muted" style={{ marginTop: -4 }}>
        Upload the roll you already keep. Up to {MAX_IMPORT_ROWS} residents in
        one file, each with their email address and the unit they are moving
        into{student ? ", and the student number the institution issued" : ""}.
        Columns you keep for your own records — names, phone numbers, lease
        dates — are ignored rather than refused.
      </p>

      <form className="sp-form" ref={form} onSubmit={send}>
        <label>
          <span>Which property</span>
          <select
            name="property"
            value={chosen?.id || ""}
            onChange={(e) => {
              setPropertyId(e.target.value);
              setProblems([]);
              setFailure("");
            }}
          >
            {open.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <small className="sp-muted">
            {vacant.length
              ? `${vacant.length} vacant ${vacant.length === 1 ? "unit" : "units"} to fill.`
              : "Every unit here is taken or archived. Add units first."}
          </small>
        </label>

        <button type="button" className="sp-secondary" onClick={template}>
          <Download size={15} />
          Download a blank roll
        </button>
        <small className="sp-muted" style={{ marginTop: -8 }}>
          Comes with this property&rsquo;s vacant units already listed, so the
          labels match. Fill in the email beside each one and delete the rows
          you are not using.
        </small>

        <label>
          <span>Your completed roll</span>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            onChange={() => {
              setProblems([]);
              setFailure("");
            }}
          />
        </label>
        <button className="sp-primary" disabled={busy || !vacant.length}>
          <Upload size={15} />
          {busy ? "Checking every row…" : "Enrol them"}
        </button>
      </form>

      {failure && (
        <p className="sp-error" role="alert">
          {failure}
        </p>
      )}

      {problems.length > 0 && (
        <div className="sp-import-problems" role="alert">
          <strong>
            <Users size={16} aria-hidden /> Nothing was enrolled.{" "}
            {problems.length === 1
              ? "One line needs fixing"
              : `${problems.length} lines need fixing`}
            .
          </strong>
          <p className="sp-muted">
            The whole file is checked before any of it is written, so fix these
            and send the same file again.
          </p>
          <ul>
            {problems.map((problem) => (
              <li key={`${problem.line}-${problem.message}`}>
                <span className="sp-import-line">Line {problem.line}</span>
                {problem.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
