"use client";
import { useMemo, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  BadgeCheck,
  HardHat,
  LogIn,
  LogOut,
  QrCode,
  Search,
} from "lucide-react";
import {
  KIND_HELP,
  KIND_LABELS,
  REGULAR_KINDS,
  STANDING_LABELS,
  WEEKDAY_SHORT,
  describeDays,
  needsUnit,
  standing,
  type RegularKind,
} from "@/lib/shared/regulars";
import { formatEntryCode } from "@/lib/shared/passcode";
import { ID_LABELS } from "@/lib/shared/identity";
import type { WorkspaceState } from "@/types/workspace";

const time = (stamp: string) =>
  new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(stamp));

/**
 * The people who work here, and the arrivals they make.
 *
 * Deliberately not the guest register. A guest pass authorises one arrival; a
 * regular pass authorises an arrival on every allowed day for months, and the
 * arrivals are recorded against it one by one. Putting the two in one list
 * would bury today's four guests under the cleaner's ninetieth morning.
 */
export default function RegularsPanel({
  state,
  today,
  office,
  security,
  busy,
  onAct,
}: {
  state: WorkspaceState;
  /** The SAST date, so the browser and the server agree on what has expired. */
  today: string;
  office: boolean;
  security: boolean;
  busy: boolean;
  onAct: (input: Record<string, unknown>) => void;
}) {
  const [kind, setKind] = useState<RegularKind>("staff");
  const [propertyId, setPropertyId] = useState("");
  const [days, setDays] = useState("1111100");
  const [search, setSearch] = useState("");
  const [showQr, setShowQr] = useState("");
  const [issuing, setIssuing] = useState(false);

  const properties = state.properties.filter((p) => !p.archivedAt);
  const chosen = properties.find(
    (p) => p.id === (propertyId || properties[0]?.id),
  );
  const units = state.units.filter(
    (u) => !u.archivedAt && u.propertyId === chosen?.id,
  );

  /** Who is inside right now: an arrival with no departure against it. */
  const onSite = useMemo(
    () => state.movements.filter((m) => !m.outAt),
    [state.movements],
  );
  const inside = useMemo(
    () => new Set(onSite.map((m) => m.regularId)),
    [onSite],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...state.regulars]
      .filter(
        (r) =>
          !term ||
          [
            r.personName,
            r.occupation,
            r.employer,
            r.unitLabel || "",
            r.reference,
          ]
            .join(" ")
            .toLowerCase()
            .includes(term),
      )
      .sort(
        (a, b) =>
          // On site first: at a gate, who is inside is the live question.
          Number(inside.has(b.id)) - Number(inside.has(a.id)) ||
          (standing(a, today) === "active" ? 0 : 1) -
            (standing(b, today) === "active" ? 0 : 1) ||
          a.personName.localeCompare(b.personName),
      );
  }, [state.regulars, search, inside, today]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    onAct({ ...data, days, action: "regular", propertyId: chosen?.id });
    event.currentTarget.reset();
    setIssuing(false);
    setKind("staff");
    setDays("1111100");
  }

  return (
    <>
      {onSite.length > 0 && (
        <section className="sp-panel">
          <div className="sp-section-head">
            <h2>
              On site now <span className="sp-muted">({onSite.length})</span>
            </h2>
          </div>
          <div className="sp-onsite">
            {onSite.map((m) => (
              <article key={m.id}>
                <strong>{m.personName}</strong>
                <small className="sp-block sp-muted">
                  {m.occupation}
                  {m.unitLabel ? ` · ${m.unitLabel}` : ""}
                </small>
                <small className="sp-block sp-muted">
                  In {time(m.inAt)}
                  {m.date !== today ? ` on ${m.date}` : ""} · {m.inByName}
                </small>
                {(security || office) && (
                  <button
                    className="sp-secondary"
                    disabled={busy}
                    onClick={() =>
                      onAct({
                        action: "movement",
                        id: m.regularId,
                        direction: "out",
                      })
                    }
                  >
                    <LogOut size={15} />
                    Sign out
                  </button>
                )}
              </article>
            ))}
          </div>
          {onSite.some((m) => m.date !== today) && (
            <p className="sp-muted">
              Somebody is still signed in from an earlier day. Sign them out so
              the register stops saying they never went home.
            </p>
          )}
        </section>
      )}

      {office && (
        <section className="sp-panel">
          <div className="sp-section-head">
            <h2>Issue a regular pass</h2>
            {!issuing && (
              <button
                className="sp-secondary"
                onClick={() => setIssuing(true)}
                disabled={!properties.length}
              >
                <HardHat size={15} />
                New pass
              </button>
            )}
          </div>
          {!issuing ? (
            <p className="sp-muted" style={{ marginTop: -4 }}>
              For the people who work here: the cleaner who comes every weekday,
              a contractor on a job, a resident&rsquo;s domestic worker. One
              pass covers every allowed day until it ends, so nobody books them
              in again each week.
            </p>
          ) : (
            <form className="sp-form" onSubmit={submit}>
              <label>
                <span>Who they are here for</span>
                <select
                  name="kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as RegularKind)}
                >
                  {REGULAR_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
                <small className="sp-muted">{KIND_HELP[kind]}</small>
              </label>

              {properties.length > 1 && (
                <label>
                  <span>Property</span>
                  <select
                    name="property"
                    value={chosen?.id || ""}
                    onChange={(e) => setPropertyId(e.target.value)}
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {needsUnit(kind) && (
                <label>
                  <span>Which unit they work at</span>
                  <select name="unitId" required>
                    <option value="">Choose a unit</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                        {u.residentName ? ` — ${u.residentName}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                <span>Their name</span>
                <input name="personName" maxLength={100} required />
              </label>
              <label>
                <span>What they do here</span>
                <input
                  name="occupation"
                  maxLength={60}
                  required
                  placeholder="Cleaner, gardener, site foreman"
                />
              </label>
              <label>
                <span>Company, if they work for one</span>
                <input
                  name="employer"
                  maxLength={120}
                  placeholder="Sparkle Cleaning CC"
                />
              </label>
              <label>
                <span>Phone number</span>
                <input name="phone" maxLength={30} required />
              </label>

              <label>
                <span>Identity document</span>
                <select name="idType" defaultValue="sa_id">
                  <option value="sa_id">{ID_LABELS.sa_id}</option>
                  <option value="passport">{ID_LABELS.passport}</option>
                </select>
              </label>
              <label>
                <span>Identity number</span>
                <input name="idNumber" maxLength={80} required />
                <small className="sp-muted">
                  Checked at the gate against the card in their hand. Only the
                  last four characters ever leave the server.
                </small>
              </label>

              <fieldset className="sp-days">
                <legend>Which days they may come</legend>
                <div>
                  {WEEKDAY_SHORT.map((label, index) => (
                    <label key={label} className="sp-day-toggle">
                      <input
                        type="checkbox"
                        checked={days[index] === "1"}
                        onChange={(e) =>
                          setDays(
                            days.slice(0, index) +
                              (e.target.checked ? "1" : "0") +
                              days.slice(index + 1),
                          )
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <small className="sp-muted">{describeDays(days)}</small>
              </fieldset>

              <label>
                <span>They may arrive from</span>
                <input
                  name="fromTime"
                  type="time"
                  defaultValue="07:00"
                  required
                />
              </label>
              <label>
                <span>Until</span>
                <input
                  name="toTime"
                  type="time"
                  defaultValue="17:00"
                  required
                />
                <small className="sp-muted">
                  The gate refuses an arrival outside these hours. A shift that
                  runs past midnight needs two passes.
                </small>
              </label>

              <label>
                <span>Starts</span>
                <input
                  name="startDate"
                  type="date"
                  defaultValue={today}
                  required
                />
              </label>
              <label>
                <span>Ends</span>
                <input name="endDate" type="date" min={today} required />
                <small className="sp-muted">
                  Required, and at most a year out. A standing authorisation
                  with no end is a key nobody ever takes back.
                </small>
              </label>

              <div className="sp-inline-form">
                <button className="sp-primary" disabled={busy}>
                  <BadgeCheck size={15} />
                  Issue the pass
                </button>
                <button
                  type="button"
                  className="sp-text-button"
                  onClick={() => setIssuing(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="sp-panel">
        <div className="sp-section-head">
          <h2>
            Regular passes <span className="sp-muted">({rows.length})</span>
          </h2>
          {state.regulars.length > 0 && (
            <label className="sp-search">
              <Search size={17} />
              <input
                aria-label="Search regular passes by name, trade, company or unit"
                placeholder="Name, trade, company or unit"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          )}
        </div>

        {!rows.length ? (
          <p className="sp-muted">
            <HardHat size={16} />{" "}
            {office
              ? "Nobody has a standing pass yet. Issue one for the cleaner, the gardener or a contractor on a job."
              : "No regular passes for this property."}
          </p>
        ) : (
          rows.map((r) => {
            const mark = standing(r, today);
            const here = inside.has(r.id);
            return (
              <article
                key={r.id}
                className={`sp-regular sp-standing-${mark}${here ? " is-inside" : ""}`}
              >
                <div className="sp-section-head">
                  <h3>
                    {r.personName}
                    {here && <span className="sp-badge success">On site</span>}
                  </h3>
                  <span
                    className={`sp-badge${mark === "active" ? " success" : ""}`}
                  >
                    {STANDING_LABELS[mark]}
                  </span>
                </div>
                <small className="sp-block sp-muted">
                  {r.occupation}
                  {r.employer ? ` · ${r.employer}` : ""} · {KIND_LABELS[r.kind]}
                  {r.unitLabel ? ` · ${r.unitLabel}` : ""}
                </small>
                <small className="sp-block sp-muted">
                  {describeDays(r.days)}, {r.fromTime}–{r.toTime} ·{" "}
                  {r.startDate} to {r.endDate}
                </small>
                {
                  <small className="sp-block sp-muted">
                    {r.reference} · Gate code{" "}
                    <strong>{formatEntryCode(r.entryCode)}</strong> ·{" "}
                    {ID_LABELS[r.idType]} {r.idNumber}
                  </small>
                }
                {r.revokedAt && (
                  <small className="sp-block sp-muted">
                    Revoked{r.revokedByName ? ` by ${r.revokedByName}` : ""}.
                  </small>
                )}

                <div className="sp-inline-form">
                  {(security || office) && mark === "active" && (
                    <button
                      className="sp-secondary"
                      disabled={busy}
                      onClick={() =>
                        onAct({
                          action: "movement",
                          id: r.id,
                          direction: here ? "out" : "in",
                        })
                      }
                    >
                      {here ? <LogOut size={15} /> : <LogIn size={15} />}
                      {here ? "Sign out" : "Sign in"}
                    </button>
                  )}
                  {
                    <button
                      className="sp-text-button"
                      onClick={() => setShowQr(showQr === r.id ? "" : r.id)}
                    >
                      <QrCode size={15} />
                      {showQr === r.id ? "Hide code" : "Show code"}
                    </button>
                  }
                  {office && !r.revokedAt && (
                    <button
                      className="sp-text-button danger"
                      disabled={busy}
                      onClick={() =>
                        onAct({ action: "regularRevoke", id: r.id })
                      }
                    >
                      Revoke
                    </button>
                  )}
                </div>

                {showQr === r.id && (
                  <div className="sp-regular-qr">
                    <QRCodeSVG
                      value={`SANGOPASS-LIVE:${r.reference}:${r.token}`}
                      size={148}
                      level="M"
                    />
                    <p className="sp-muted">
                      Print this for {r.personName}. The gate code{" "}
                      <strong>{formatEntryCode(r.entryCode)}</strong> works on
                      its own if they arrive without it.
                    </p>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>

      {state.movements.length > 0 && (
        <section className="sp-panel">
          <div className="sp-section-head">
            <h2>Gate register</h2>
            <small>Newest first</small>
          </div>
          <div className="sp-table-wrap">
            <table className="sp-responsive-table" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" scope="col">
                    Who
                  </th>
                  <th role="columnheader" scope="col">
                    Day
                  </th>
                  <th role="columnheader" scope="col">
                    In
                  </th>
                  <th role="columnheader" scope="col">
                    Out
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {state.movements.slice(0, 100).map((m) => (
                  <tr key={m.id} role="row">
                    <td data-label="Who" role="cell">
                      {m.personName}
                      <small className="sp-block sp-muted">
                        {m.occupation}
                        {m.unitLabel ? ` · ${m.unitLabel}` : ""}
                      </small>
                    </td>
                    <td data-label="Day" role="cell">
                      {m.date}
                    </td>
                    <td data-label="In" role="cell">
                      {time(m.inAt)}
                      <small className="sp-block sp-muted">{m.inByName}</small>
                    </td>
                    <td data-label="Out" role="cell">
                      {m.outAt ? (
                        <>
                          {time(m.outAt)}
                          <small className="sp-block sp-muted">
                            {m.outByName}
                          </small>
                        </>
                      ) : (
                        <span className="sp-badge success">Still in</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
