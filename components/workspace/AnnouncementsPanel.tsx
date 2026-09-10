"use client";
import { useState, type FormEvent } from "react";
import { Megaphone, Send } from "lucide-react";
import {
  ANNOUNCEMENT_LEVELS,
  AUDIENCES,
  AUDIENCE_HELP,
  AUDIENCE_LABELS,
  LEVEL_HELP,
  LEVEL_LABELS,
  STANDING_LABELS,
  levelRank,
  showing,
  standing,
  type AnnouncementLevel,
  type Audience,
} from "@/lib/shared/announcements";
import type { LiveAnnouncement, WorkspaceState } from "@/types/workspace";

const asDate = (value: string) => value.slice(0, 10);

/** Loudest first, newest within a level: the order the server sends them in. */
const board = (rows: LiveAnnouncement[]) =>
  [...rows].sort(
    (a, b) =>
      levelRank(a.level) - levelRank(b.level) ||
      b.publishedAt.localeCompare(a.publishedAt),
  );

export default function AnnouncementsPanel({
  state,
  today,
  office,
  manager,
  busy,
  onAct,
}: {
  state: WorkspaceState;
  /** The SAST date, so the browser and the server agree on what has expired. */
  today: string;
  office: boolean;
  manager: boolean;
  busy: boolean;
  onAct: (input: Record<string, unknown>) => void;
}) {
  const [level, setLevel] = useState<AnnouncementLevel>("routine");
  const [audience, setAudience] = useState<Audience>("everyone");
  const [editing, setEditing] = useState("");

  const rows = board(state.announcements);
  const up = rows.filter((a) => showing(a, today));
  // The desk announces to its own building and nowhere else, so there is
  // nothing for it to choose between.
  const choices = state.properties.filter((p) => !p.archivedAt);
  const home = state.properties.find(
    (p) => p.id === state.membership.propertyId,
  );

  function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onAct({
      ...Object.fromEntries(form),
      action: "announce",
      // A checkbox is absent from the form data when it is unticked, and the
      // server reads a missing value as "do not email".
      email: form.get("email") === "on",
    });
    event.currentTarget.reset();
    setLevel("routine");
    setAudience("everyone");
  }

  function correct(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    onAct({
      ...Object.fromEntries(new FormData(event.currentTarget)),
      id,
      action: "announcementUpdate",
    });
    setEditing("");
  }

  return (
    <>
      {office && (
        <section className="sp-panel">
          <div className="sp-section-head">
            <h2>Publish an announcement</h2>
          </div>
          <p className="sp-muted" style={{ marginTop: -4 }}>
            {manager
              ? "Tell a building, or the whole company, something they need to know. It goes straight to the dashboards of everyone you address, and drops off on its own when it stops being true."
              : `Tell ${home?.name || "your building"} something they need to know. It goes to the dashboards of everyone you address here.`}
          </p>
          <form className="sp-form" onSubmit={publish}>
            {manager ? (
              <label>
                <span>Who it is about</span>
                <select name="propertyId" defaultValue="all">
                  <option value="all">
                    Everyone at {state.organisation.name}
                  </option>
                  {choices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="sp-muted">
                Going to <strong>{home?.name || "your property"}</strong>. Ask a
                manager to send one to the whole organisation.
              </p>
            )}
            <label>
              <span>Who sees it</span>
              <select
                name="audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value as Audience)}
              >
                {AUDIENCES.map((a) => (
                  <option key={a} value={a}>
                    {AUDIENCE_LABELS[a]}
                  </option>
                ))}
              </select>
              <small className="sp-muted">{AUDIENCE_HELP[audience]}</small>
            </label>
            <label>
              <span>How loudly</span>
              <select
                name="level"
                value={level}
                onChange={(e) => setLevel(e.target.value as AnnouncementLevel)}
              >
                {ANNOUNCEMENT_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABELS[l]}
                  </option>
                ))}
              </select>
              <small className="sp-muted">{LEVEL_HELP[level]}</small>
            </label>
            <label>
              <span>Title</span>
              <input
                name="title"
                maxLength={120}
                required
                placeholder="Water off Tuesday, 09:00 to 15:00"
              />
            </label>
            <label>
              <span>Announcement</span>
              <textarea
                name="body"
                rows={5}
                maxLength={4000}
                required
                placeholder="The municipality is replacing the main on Ubuntu Street. Please store drinking water on Monday night."
              />
            </label>
            <label>
              <span>Take it down after</span>
              <input name="showUntil" type="date" min={today} />
              <small className="sp-muted">
                Optional. After this date it stops showing on dashboards and
                stays on your board here, so nobody has to remember to come back
                and clear it.
              </small>
            </label>
            {state.emailConfigured ? (
              <label className="sp-row">
                <input type="checkbox" name="email" />
                <span>
                  Email it as well
                  <small className="sp-block sp-muted">
                    Sent to everyone it is addressed to, blind copied so no
                    resident sees another resident&rsquo;s address. You get your
                    own copy.
                  </small>
                </span>
              </label>
            ) : (
              <p className="sp-muted">
                Email is not configured, so this goes to dashboards only.
              </p>
            )}
            <button className="sp-primary" disabled={busy}>
              <Send size={15} />
              Publish
            </button>
          </form>
        </section>
      )}

      <section className="sp-panel">
        <div className="sp-section-head">
          <h2>
            {office ? "Your board" : "From the office"}{" "}
            <span className="sp-muted">({up.length} showing)</span>
          </h2>
        </div>

        {!rows.length ? (
          <p className="sp-muted">
            <Megaphone size={16} />{" "}
            {office
              ? "Nothing announced yet. A water outage, the AGM date, a gate that has failed — this is where you say it once and everyone has it."
              : "Nothing from the office right now."}
          </p>
        ) : (
          rows.map((a) => {
            const mark = standing(a, today);
            return (
              <article
                key={a.id}
                className={`sp-announcement sp-level-${a.level}${
                  mark === "showing" ? "" : " is-past"
                }`}
              >
                <div className="sp-section-head">
                  <h3>{a.title}</h3>
                  <span
                    className={`sp-badge sp-badge-${a.level === "urgent" ? "emergency" : a.level === "important" ? "urgent" : "normal"}`}
                  >
                    {LEVEL_LABELS[a.level]}
                  </span>
                </div>
                <p className="sp-announcement-body">{a.body}</p>
                <small className="sp-block sp-muted">
                  {a.propertyName || `Everyone at ${state.organisation.name}`}
                  {office ? ` · ${AUDIENCE_LABELS[a.audience]}` : ""} ·{" "}
                  {a.authorName || "The office"} · {asDate(a.publishedAt)}
                  {a.editedAt ? ` · corrected ${asDate(a.editedAt)}` : ""}
                  {office && mark !== "showing"
                    ? ` · ${STANDING_LABELS[mark]}`
                    : a.showUntil && mark === "showing"
                      ? ` · until ${a.showUntil}`
                      : ""}
                </small>

                {office &&
                  !a.archivedAt &&
                  (editing === a.id ? (
                    <form
                      className="sp-form"
                      onSubmit={(e) => correct(e, a.id)}
                    >
                      <label>
                        <span>Title</span>
                        <input
                          name="title"
                          defaultValue={a.title}
                          maxLength={120}
                          required
                        />
                      </label>
                      <label>
                        <span>Announcement</span>
                        <textarea
                          name="body"
                          rows={4}
                          defaultValue={a.body}
                          maxLength={4000}
                          required
                        />
                      </label>
                      <label>
                        <span>How loudly</span>
                        <select name="level" defaultValue={a.level}>
                          {ANNOUNCEMENT_LEVELS.map((l) => (
                            <option key={l} value={l}>
                              {LEVEL_LABELS[l]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Take it down after</span>
                        <input
                          name="showUntil"
                          type="date"
                          // An end date that has already gone is not offered
                          // back: correcting an expired announcement means
                          // giving it a new life, and the server refuses a
                          // date in the past rather than publish into silence.
                          defaultValue={a.showUntil >= today ? a.showUntil : ""}
                          min={today}
                        />
                      </label>
                      <p className="sp-muted">
                        Who it went to cannot change: it is already on their
                        dashboards. Take this one down and publish another
                        instead.
                      </p>
                      <div className="sp-inline-form">
                        <button className="sp-secondary" disabled={busy}>
                          Save correction
                        </button>
                        <button
                          type="button"
                          className="sp-text-button"
                          onClick={() => setEditing("")}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="sp-inline-form">
                      <button
                        className="sp-secondary"
                        disabled={busy}
                        onClick={() => setEditing(a.id)}
                      >
                        Correct
                      </button>
                      <button
                        className="sp-text-button danger"
                        disabled={busy}
                        onClick={() =>
                          onAct({ action: "announcementTakeDown", id: a.id })
                        }
                      >
                        Take down
                      </button>
                    </div>
                  ))}
              </article>
            );
          })
        )}
      </section>
    </>
  );
}
