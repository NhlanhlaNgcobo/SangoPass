"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import {
  LayoutDashboard,
  Building2,
  Users,
  Ticket,
  ClipboardList,
  CreditCard,
  LogOut,
  Plus,
  ArrowUpRight,
  RefreshCw,
  Menu,
  X,
  Search,
  Check,
  Copy,
} from "lucide-react";
import PassScanner from "./PassScanner";
import Brand from "@/components/ui/Brand";
import type { WorkspaceState, LiveVisitor } from "@/types/workspace";
import { PLANS } from "@/lib/mock/plans";
import { useDialog } from "@/lib/utils/useDialog";
import { useMediaQuery } from "@/lib/utils/useMediaQuery";

const rand = (cents: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
const label = (value: string) => value.replaceAll("_", " ");
const day = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(
    new Date(),
  );
type View =
  "overview" | "properties" | "people" | "visitors" | "reports" | "billing";
function Field({
  name,
  children,
  type = "text",
  required = true,
  defaultValue,
}: {
  name: string;
  children: ReactNode;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
}) {
  return (
    <label>
      {children}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "0.01" : undefined}
        maxLength={type === "text" ? 250 : undefined}
      />
    </label>
  );
}
function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useDialog(true, close);
  return (
    <div
      className="sp-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section {...ref} aria-labelledby="sp-modal-title" className="sp-modal">
        <div className="sp-section-head">
          <h2 id="sp-modal-title">{title}</h2>
          <button onClick={close} aria-label="Close dialog" className="sp-icon">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export default function WorkspaceApp({ initial }: { initial: WorkspaceState }) {
  const [state, setState] = useState(initial),
    [view, setView] = useState<View>("overview"),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [inviteLink, setInviteLink] = useState(""),
    [inviteUsername, setInviteUsername] = useState<string | null>(null),
    [emailStatus, setEmailStatus] = useState(""),
    [pass, setPass] = useState<LiveVisitor | null>(null),
    [selectedProperty, setSelectedProperty] = useState(
      initial.properties[0]?.id || "",
    ),
    [inviteRole, setInviteRole] = useState("tenant");
  const router = useRouter();
  const compact = useMediaQuery("(max-width: 1023px)");
  const navigationOpen = compact && mobile;
  const navigationDialog = useDialog(navigationOpen, () => setMobile(false));
  const manager = state.membership.role === "manager",
    security = state.membership.role === "security";
  const nav = [
    { id: "overview", title: "Overview", icon: LayoutDashboard },
    ...(manager
      ? [
          { id: "properties", title: "Properties", icon: Building2 },
          { id: "people", title: "People", icon: Users },
        ]
      : []),
    {
      id: "visitors",
      title: security ? "Gate register" : "Visitor passes",
      icon: Ticket,
    },
    { id: "reports", title: "Reports", icon: ClipboardList },
    ...(manager ? [{ id: "billing", title: "Billing", icon: CreditCard }] : []),
  ];
  async function refresh(orgId = state.membership.orgId) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/workspace?org=${encodeURIComponent(orgId)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState(data);
      setSelectedProperty(data.properties[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh.");
    } finally {
      setBusy(false);
    }
  }
  async function act(input: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, orgId: state.membership.orgId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState(data.state);
      setModal("");
      if (
        data.result.token &&
        (input.action === "invite" || input.action === "resendInvitation")
      ) {
        setInviteLink(
          `${window.location.origin}/join?token=${data.result.token}`,
        );
        setInviteUsername(data.result.username);
        setEmailStatus(data.result.emailStatus);
      }
      if (data.result.id && input.action === "visitor")
        setPass(
          data.state.visitors.find((v: LiveVisitor) => v.id === data.result.id),
        );
      setNotice(
        data.result.emailStatus === "sent"
          ? "Enrolment saved. The welcome email has been sent to the email provider."
          : data.result.emailStatus === "failed"
            ? "Enrolment saved, but the email could not be sent. Use Resend email in Pending invitations to retry."
            : data.result.emailStatus === "not_configured"
              ? "Enrolment saved. Email is not connected yet; the welcome email has not been sent."
              : "Saved successfully.",
      );
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save. Please try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void act({
      ...Object.fromEntries(new FormData(event.currentTarget)),
      action: modal,
    });
  }
  function open(action: string) {
    setSelectedProperty(state.properties[0]?.id || "");
    setInviteRole("tenant");
    setError("");
    setNotice("");
    setModal(action);
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Link copied. Share it only with the intended recipient.");
    } catch {
      setNotice("Copy the link from the field below.");
    }
  }
  async function checkout(plan: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: state.membership.orgId, plan }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.url;
      for (const [name, value] of Object.entries(data.fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(value);
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout unavailable.");
      setBusy(false);
    }
  }
  const visitors = state.visitors.filter((v) =>
    `${v.visitorName} ${v.reference} ${v.hostName}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const propertySelect = (
    <label>
      Property
      <select
        name="propertyId"
        value={selectedProperty}
        onChange={(e) => setSelectedProperty(e.target.value)}
        required
      >
        <option value="" disabled>
          Select a property
        </option>
        {state.properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
  const empty = (
    title: string,
    description: string,
    action?: string,
    button?: string,
  ) => (
    <div className="sp-empty">
      <Building2 size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="sp-primary" onClick={() => open(action)}>
          {button}
        </button>
      )}
    </div>
  );
  return (
    <div className="sp-shell">
      <div
        className={`sp-navigation ${navigationOpen ? "is-open" : ""}`}
        {...(navigationOpen ? navigationDialog : { ref: navigationDialog.ref })}
        aria-label={navigationOpen ? "Workspace navigation" : undefined}
      >
        <button
          className="sp-nav-backdrop"
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
          tabIndex={-1}
          aria-hidden="true"
        />
        <aside
          id="workspace-navigation"
          className={`sp-sidebar ${navigationOpen ? "is-open" : ""}`}
        >
          <Link href="/" aria-label="SangoPass home">
            <Brand light />
          </Link>
          <button
            className="sp-mobile-close sp-icon"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
          <div className="sp-workspace-label">YOUR WORKSPACE</div>
          <label className="sp-org-select">
            <span className="sr-only">Organisation</span>
            <select
              value={state.membership.orgId}
              onChange={(e) => {
                setView("overview");
                void refresh(e.target.value);
              }}
            >
              {state.memberships.map((m) => (
                <option key={m.orgId} value={m.orgId}>
                  {m.orgName}
                </option>
              ))}
            </select>
            <small>
              {state.membership.role === "tenant"
                ? "Resident"
                : label(state.membership.role)}{" "}
              workspace
            </small>
          </label>
          <nav aria-label="Workspace">
            {nav.map((item) => (
              <button
                key={item.id}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => {
                  setView(item.id as View);
                  setMobile(false);
                  setSearch("");
                }}
              >
                <item.icon size={19} />
                {item.title}
                {item.id === "reports" &&
                  state.reports.some((r) => r.status !== "resolved") && (
                    <span className="sp-nav-dot" />
                  )}
              </button>
            ))}
          </nav>
          <div className="sp-sidebar-bottom">
            <p>
              One community.
              <br />
              Every welcome.
            </p>
            <small>Made for South African living.</small>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await fetch("/api/auth/logout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: "{}",
                  });
                  if (!r.ok) throw new Error();
                  router.push("/login");
                  router.refresh();
                } catch {
                  setBusy(false);
                  setError("Could not sign out. Try again.");
                }
              }}
            >
              <LogOut size={17} />
              Sign out
            </button>
          </div>
        </aside>
      </div>
      <div className="sp-main" inert={navigationOpen}>
        <header className="sp-topbar">
          <div className="sp-row">
            <button
              className="sp-mobile-toggle sp-icon"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
              aria-expanded={navigationOpen}
              aria-controls="workspace-navigation"
            >
              <Menu />
            </button>
            <span>
              {state.organisation.name}{" "}
              <span className="sp-muted">
                / {nav.find((n) => n.id === view)?.title}
              </span>
            </span>
          </div>
          <div className="sp-row">
            <button
              onClick={() => void refresh()}
              disabled={busy}
              aria-label="Refresh workspace"
              className="sp-icon"
            >
              <RefreshCw size={17} />
            </button>
            <span className="sp-avatar">
              {state.user.name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span className="sp-user-name">{state.user.name}</span>
          </div>
        </header>
        <main id="main-content" className="sp-content">
          <div className="sp-page-heading">
            <div>
              <span className="sp-eyebrow">
                {new Intl.DateTimeFormat("en-ZA", {
                  dateStyle: "full",
                  timeZone: "Africa/Johannesburg",
                }).format(new Date())}
              </span>
              <h1>
                {view === "overview"
                  ? `Hello, ${state.user.name.split(" ")[0]}.`
                  : nav.find((n) => n.id === view)?.title}
              </h1>
              <p>
                {
                  {
                    overview: "A little clarity for your community, every day.",
                    properties: "Your spaces, all in one place.",
                    people: "The people who make your community.",
                    visitors: "A warm welcome. A clear record.",
                    reports: "Keep your community cared for.",
                    billing: "Room to grow, at your own pace.",
                  }[view]
                }
              </p>
            </div>
            {view === "properties" ? (
              <button className="sp-primary" onClick={() => open("property")}>
                <Plus size={17} />
                Add property
              </button>
            ) : view === "people" ? (
              <button className="sp-primary" onClick={() => open("invite")}>
                <Plus size={17} />
                Enrol someone
              </button>
            ) : view === "visitors" && !security ? (
              <button
                disabled={!state.properties.length}
                className="sp-primary"
                onClick={() => open("visitor")}
              >
                <Plus size={17} />
                Invite a visitor
              </button>
            ) : view === "reports" ? (
              <button
                disabled={!state.properties.length}
                className="sp-primary"
                onClick={() => open("report")}
              >
                <Plus size={17} />
                New report
              </button>
            ) : null}
          </div>
          {error && !modal && (
            <p className="sp-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="sp-notice" role="status">
              <Check size={16} />
              {notice}
            </p>
          )}
          {!state.organisation.active && (
            <p className="sp-error">
              Your trial or paid month has ended. Existing records remain
              available; ask a manager to renew from Billing to add new records.
            </p>
          )}
          {view === "overview" && (
            <>
              <section className="sp-welcome">
                <div>
                  <span className="sp-eyebrow">
                    CONNECTED SPACES. BETTER LIVING.
                  </span>
                  <h2>
                    Good communities
                    <br />
                    start with a welcome.
                  </h2>
                  <p>
                    {manager
                      ? "Bring every property, resident and arrival into one calm workspace."
                      : "Your community is right here. Make everyday living a little easier."}
                  </p>
                  <button
                    className="sp-light"
                    onClick={() =>
                      state.properties.length
                        ? setView("visitors")
                        : manager
                          ? open("property")
                          : setView("reports")
                    }
                  >
                    {state.properties.length
                      ? "Open visitor register"
                      : manager
                        ? "Add your first property"
                        : "View your reports"}
                    <ArrowUpRight size={17} />
                  </button>
                </div>
                <div className="sp-welcome-image">
                  <Image
                    src={
                      manager
                        ? "/brand/courtyard.webp"
                        : "/brand/student-life-sa.webp"
                    }
                    alt={
                      manager
                        ? "Sunlit courtyard in a South African residence"
                        : "A diverse group of South African students sharing time on campus"
                    }
                    fill
                    sizes="(max-width: 700px) 100vw, 40vw"
                    priority
                  />
                </div>
              </section>
              <div className="sp-stats">
                {[
                  {
                    name: manager ? "Properties" : "Your property",
                    value: state.properties.length,
                  },
                  {
                    name: "Visitors today",
                    value: state.visitors.filter((v) => v.visitDate === day())
                      .length,
                  },
                  {
                    name: "Currently inside",
                    value: state.visitors.filter(
                      (v) => v.status === "checked_in",
                    ).length,
                  },
                  {
                    name: "Open reports",
                    value: state.reports.filter((r) => r.status !== "resolved")
                      .length,
                  },
                ].map((s, i) => (
                  <article key={s.name}>
                    <span className="sp-stat-index">0{i + 1}</span>
                    <p>{s.name}</p>
                    <strong>{s.value.toString().padStart(2, "0")}</strong>
                  </article>
                ))}
              </div>
              <div className="sp-panel">
                <div className="sp-section-head">
                  <h2>Your next steps</h2>
                  <span className="sp-badge">
                    {manager ? "Set up your community" : "Everyday essentials"}
                  </span>
                </div>
                <div className="sp-actions">
                  {(manager
                    ? [
                        {
                          title: "Create your spaces",
                          text: "Add a property and its units.",
                          view: "properties",
                          icon: Building2,
                        },
                        {
                          title: "Bring your people in",
                          text: "Send residents and security their welcome email.",
                          view: "people",
                          icon: Users,
                        },
                        {
                          title: "Welcome your first visitor",
                          text: "Create and share a time-limited QR pass.",
                          view: "visitors",
                          icon: Ticket,
                        },
                      ]
                    : [
                        {
                          title: "Visitor register",
                          text: security
                            ? "Verify passes and record gate movements."
                            : "Create a pass for your next guest.",
                          view: "visitors",
                          icon: Ticket,
                        },
                        {
                          title: "Raise a report",
                          text: "Let your manager know what needs attention.",
                          view: "reports",
                          icon: ClipboardList,
                        },
                      ]
                  ).map((a) => (
                    <button
                      key={a.title}
                      onClick={() => setView(a.view as View)}
                    >
                      <a.icon size={23} />
                      <h3>{a.title}</h3>
                      <p>{a.text}</p>
                      <ArrowUpRight size={18} />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {view === "properties" && (
            <>
              {!state.properties.length ? (
                empty(
                  "Your first property starts here.",
                  "Add your residence, apartment building or estate, then create its units.",
                  "property",
                  "Add a property",
                )
              ) : (
                <div className="sp-property-grid">
                  {state.properties.map((p, i) => (
                    <article className="sp-property-card" key={p.id}>
                      <div className="sp-property-image">
                        <Image
                          src={
                            p.type === "student_accommodation"
                              ? "/brand/residence.webp"
                              : "/brand/courtyard.webp"
                          }
                          alt="Illustrative South African residential architecture"
                          fill
                          sizes="(max-width: 700px) 100vw, 40vw"
                        />
                        <span>PROPERTY {String(i + 1).padStart(2, "0")}</span>
                      </div>
                      <div>
                        <span className="sp-eyebrow">{label(p.type)}</span>
                        <h2>{p.name}</h2>
                        <p>{p.address}</p>
                        <div className="sp-section-head">
                          <small>
                            {
                              state.units.filter((u) => u.propertyId === p.id)
                                .length
                            }{" "}
                            units ·{" "}
                            {
                              state.units.filter(
                                (u) => u.propertyId === p.id && u.residentName,
                              ).length
                            }{" "}
                            occupied
                          </small>
                          <button
                            className="sp-secondary"
                            onClick={() => {
                              open("unit");
                              setSelectedProperty(p.id);
                            }}
                          >
                            <Plus size={15} />
                            Add unit
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {state.units.length > 0 && (
                <section className="sp-panel">
                  <h2>Units & rent register</h2>
                  <p className="sp-muted">
                    Manually record this period’s rent. Payment collection is
                    separate.
                  </p>
                  <div className="sp-table-wrap">
                    <table className="sp-responsive-table" role="table">
                      <thead role="rowgroup">
                        <tr role="row">
                          <th role="columnheader" scope="col">
                            Unit
                          </th>
                          <th role="columnheader" scope="col">
                            Property
                          </th>
                          <th role="columnheader" scope="col">
                            Resident
                          </th>
                          <th role="columnheader" scope="col">
                            Monthly rent
                          </th>
                          <th role="columnheader" scope="col">
                            This period
                          </th>
                        </tr>
                      </thead>
                      <tbody role="rowgroup">
                        {state.units.map((u) => (
                          <tr key={u.id} role="row">
                            <td data-label="Unit" role="cell">
                              <strong>{u.label}</strong>
                            </td>
                            <td data-label="Property" role="cell">
                              {
                                state.properties.find(
                                  (p) => p.id === u.propertyId,
                                )?.name
                              }
                            </td>
                            <td data-label="Resident" role="cell">
                              {u.residentName || "Vacant"}
                            </td>
                            <td data-label="Monthly rent" role="cell">
                              {rand(u.rentCents)}
                            </td>
                            <td data-label="This period" role="cell">
                              <button
                                disabled={busy}
                                className={`sp-badge ${u.rentPaid ? "success" : ""}`}
                                onClick={() =>
                                  void act({
                                    action: "rent",
                                    unitId: u.id,
                                    paid: !u.rentPaid,
                                  })
                                }
                              >
                                {u.rentPaid ? "Paid · undo" : "Mark paid"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
          {view === "people" && (
            <>
              <section className="sp-panel">
                <h2>
                  Community members{" "}
                  <span className="sp-muted">({state.members.length})</span>
                </h2>
                <div className="sp-table-wrap">
                  <table className="sp-responsive-table" role="table">
                    <thead role="rowgroup">
                      <tr role="row">
                        <th role="columnheader" scope="col">
                          Name
                        </th>
                        <th role="columnheader" scope="col">
                          Email
                        </th>
                        <th role="columnheader" scope="col">
                          Username / student number
                        </th>
                        <th role="columnheader" scope="col">
                          Role
                        </th>
                        <th role="columnheader" scope="col">
                          Property / unit
                        </th>
                        <th role="columnheader" scope="col">
                          Access
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {state.members.map((m) => (
                        <tr key={m.id} role="row">
                          <td data-label="Name" role="cell">
                            <strong>{m.name}</strong>
                          </td>
                          <td data-label="Email" role="cell">
                            {m.email}
                          </td>
                          <td
                            data-label="Username / student number"
                            role="cell"
                          >
                            {m.username || "Email sign-in"}
                          </td>
                          <td data-label="Role" role="cell">
                            <span className="sp-badge">
                              {m.role === "tenant" ? "Resident" : m.role}
                            </span>
                          </td>
                          <td data-label="Property / unit" role="cell">
                            {state.properties.find((p) => p.id === m.propertyId)
                              ?.name || "All properties"}
                            {m.unitId &&
                              ` / ${state.units.find((u) => u.id === m.unitId)?.label}`}
                          </td>
                          <td data-label="Access" role="cell">
                            {m.id !== state.user.id && (
                              <button
                                disabled={busy}
                                className="sp-text-button"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Remove ${m.name} from this organisation? Their upcoming passes will be cancelled.`,
                                    )
                                  )
                                    void act({
                                      action: "removeMember",
                                      id: m.id,
                                    });
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="sp-panel">
                <h2>Pending invitations</h2>
                {!state.invitations.length ? (
                  <p className="sp-muted">
                    Enrol someone to securely join your organisation. Links
                    expire after seven days.
                  </p>
                ) : (
                  state.invitations.map((i) => (
                    <div className="sp-list-row" key={i.id}>
                      <div>
                        <strong>{i.email}</strong>
                        <p>
                          {i.role === "tenant" ? "Resident" : i.role} · expires{" "}
                          {new Date(i.expiresAt).toLocaleDateString("en-ZA")}
                        </p>
                        {i.username && (
                          <p>
                            Username / student number:{" "}
                            <strong>{i.username}</strong>
                          </p>
                        )}
                        <p>
                          Email:{" "}
                          {i.emailStatus === "sent"
                            ? "Sent to email provider"
                            : label(i.emailStatus)}
                        </p>
                      </div>
                      <button
                        disabled={busy}
                        className="sp-secondary"
                        onClick={() =>
                          void act({ action: "resendInvitation", id: i.id })
                        }
                      >
                        Resend email
                      </button>
                      <button
                        disabled={busy}
                        className="sp-secondary"
                        onClick={() =>
                          void act({ action: "revokeInvitation", id: i.id })
                        }
                      >
                        Revoke
                      </button>
                    </div>
                  ))
                )}
              </section>
            </>
          )}
          {view === "visitors" && (
            <section className="sp-panel">
              <div className="sp-section-head">
                <h2>
                  {security ? "Arrivals & departures" : "Your visitor passes"}
                </h2>
                <label className="sp-search">
                  <Search size={17} />
                  <input
                    aria-label="Search visitors or pass reference"
                    placeholder="Name or pass reference"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              {(manager || security) && (
                <PassScanner
                  onScan={(payload) => {
                    const found = state.visitors.find(
                      (v) =>
                        payload === `SANGOPASS-LIVE:${v.reference}:${v.token}`,
                    );
                    if (!found) return false;
                    setSearch(found.reference);
                    setNotice(
                      `Pass verified for ${found.visitorName}. Check the status and arrival window before admitting them.`,
                    );
                    return true;
                  }}
                />
              )}
              {!visitors.length ? (
                empty(
                  "No visitors to show.",
                  search
                    ? "Try another name or pass reference."
                    : security
                      ? "Visitor invitations for your assigned property will appear here."
                      : "Invite a guest and share their personal QR pass.",
                )
              ) : (
                <div className="sp-table-wrap">
                  <table className="sp-responsive-table" role="table">
                    <thead role="rowgroup">
                      <tr role="row">
                        <th role="columnheader" scope="col">
                          Visitor
                        </th>
                        <th role="columnheader" scope="col">
                          Visit · SAST
                        </th>
                        <th role="columnheader" scope="col">
                          Host / property
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
                      {visitors.map((v) => (
                        <tr key={v.id} role="row">
                          <td data-label="Visitor" role="cell">
                            <button
                              className="sp-text-button"
                              onClick={() => setPass(v)}
                            >
                              {v.visitorName}
                            </button>
                            <small className="sp-block">{v.reference}</small>
                          </td>
                          <td data-label="Visit · SAST" role="cell">
                            {v.visitDate}
                            <small className="sp-block">
                              {v.arrival}–{v.departure}
                            </small>
                          </td>
                          <td data-label="Host / property" role="cell">
                            {v.hostName}
                            <small className="sp-block">
                              {v.propertyName}
                              {v.unitLabel ? ` / ${v.unitLabel}` : ""}
                            </small>
                          </td>
                          <td data-label="Status" role="cell">
                            <span
                              className={`sp-badge ${v.status === "checked_in" ? "success" : ""}`}
                            >
                              {v.status === "upcoming" &&
                              Date.parse(
                                `${v.visitDate}T${v.departure}:00+02:00`,
                              ) < Date.parse(state.asOf)
                                ? "expired"
                                : label(v.status)}
                            </span>
                          </td>
                          <td data-label="Actions" role="cell">
                            <div className="sp-row">
                              {v.status === "upcoming" && (
                                <>
                                  {(manager || security) && (
                                    <button
                                      disabled={busy}
                                      className="sp-secondary"
                                      onClick={() =>
                                        void act({
                                          action: "visitorStatus",
                                          id: v.id,
                                          status: "checked_in",
                                        })
                                      }
                                    >
                                      Check in
                                    </button>
                                  )}
                                  <button
                                    disabled={busy}
                                    className="sp-text-button"
                                    onClick={() =>
                                      void act({
                                        action: "visitorStatus",
                                        id: v.id,
                                        status: "cancelled",
                                      })
                                    }
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                              {v.status === "checked_in" &&
                                (manager || security) && (
                                  <button
                                    disabled={busy}
                                    className="sp-secondary"
                                    onClick={() =>
                                      void act({
                                        action: "visitorStatus",
                                        id: v.id,
                                        status: "checked_out",
                                      })
                                    }
                                  >
                                    Check out
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {view === "reports" && (
            <section className="sp-panel">
              {!state.reports.length
                ? empty(
                    "All clear, for now.",
                    "Maintenance, noise or security concern? Create a report so your manager can follow up.",
                  )
                : state.reports.map((r) => (
                    <article className="sp-report" key={r.id}>
                      <div className="sp-section-head">
                        <span className="sp-badge">{r.category}</span>
                        {manager ? (
                          <label>
                            <span className="sr-only">Report status</span>
                            <select
                              value={r.status}
                              disabled={busy}
                              onChange={(e) =>
                                void act({
                                  action: "reportStatus",
                                  id: r.id,
                                  status: e.target.value,
                                })
                              }
                            >
                              <option value="open">Open</option>
                              <option value="in_progress">In progress</option>
                              <option value="resolved">Resolved</option>
                            </select>
                          </label>
                        ) : (
                          <span className="sp-badge">{label(r.status)}</span>
                        )}
                      </div>
                      <p className="sp-report-text">{r.description}</p>
                      <small>
                        {r.authorName} ·{" "}
                        {
                          state.properties.find((p) => p.id === r.propertyId)
                            ?.name
                        }{" "}
                        · {new Date(r.createdAt).toLocaleDateString("en-ZA")}
                      </small>
                    </article>
                  ))}
            </section>
          )}
          {view === "billing" && (
            <>
              <section className="sp-panel sp-billing-summary">
                <div>
                  <span className="sp-eyebrow">YOUR PLAN</span>
                  <h2 className="capitalize">{state.organisation.plan}</h2>
                  <p>
                    {state.organisation.paidUntil
                      ? `Paid access until ${new Date(state.organisation.paidUntil).toLocaleDateString("en-ZA")}`
                      : `Trial ends ${new Date(state.organisation.trialUntil).toLocaleDateString("en-ZA")}`}
                  </p>
                </div>
                <span className="sp-badge">
                  {state.organisation.active ? "Active" : "Renewal due"}
                </span>
              </section>
              <p className="sp-muted">
                Monthly access, paid securely through PayFast in South African
                rand. Each payment covers one month; renew manually.{" "}
                {state.billingMode === "sandbox" &&
                  "Checkout is currently in sandbox mode: test payments only."}{" "}
                {!state.billingConfigured &&
                  "Payments will become available when the operator connects their PayFast merchant account."}
              </p>
              <div className="sp-plan-grid">
                {PLANS.filter((p) => p.id !== "portfolio").map((p) => (
                  <article
                    className={`sp-panel ${p.id === "growth" ? "sp-featured" : ""}`}
                    key={p.id}
                  >
                    <span className="sp-eyebrow">
                      {p.id === "growth" ? "ROOM TO GROW" : "YOUR NEXT CHAPTER"}
                    </span>
                    <h2>{p.name}</h2>
                    <strong className="sp-price">{p.priceLabel}</strong>
                    <p>
                      Up to {p.unitCap} units
                      <br />
                      {p.seatCap} manager {p.seatCap === 1 ? "seat" : "seats"}
                      <br />
                      Visitor passes & reports
                    </p>
                    <button
                      disabled={busy || !state.billingConfigured}
                      onClick={() => void checkout(p.id)}
                      className="sp-primary"
                    >
                      {state.billingMode === "sandbox"
                        ? "Test checkout"
                        : "Pay for one month"}
                    </button>
                  </article>
                ))}
              </div>
              <section className="sp-panel">
                <h2>Payment history</h2>
                {!state.invoices.length ? (
                  <p className="sp-muted">
                    Your payment records will appear here after checkout.
                  </p>
                ) : (
                  <div className="sp-table-wrap">
                    <table className="sp-responsive-table" role="table">
                      <thead role="rowgroup">
                        <tr role="row">
                          <th role="columnheader" scope="col">
                            Reference
                          </th>
                          <th role="columnheader" scope="col">
                            Plan
                          </th>
                          <th role="columnheader" scope="col">
                            Amount
                          </th>
                          <th role="columnheader" scope="col">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody role="rowgroup">
                        {state.invoices.map((i) => (
                          <tr key={i.id} role="row">
                            <td data-label="Reference" role="cell">
                              {i.id.slice(0, 8)}
                            </td>
                            <td data-label="Plan" role="cell">
                              {i.plan}
                            </td>
                            <td data-label="Amount" role="cell">
                              {rand(i.amountCents)}
                            </td>
                            <td data-label="Status" role="cell">
                              {label(i.status)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
          <footer className="sp-footer">
            <span>SangoPass. A better way to belong.</span>
            <span>South Africa · All visit times in SAST</span>
          </footer>
        </main>
      </div>
      {modal && (
        <Dialog
          title={
            {
              property: "Add a property",
              unit: "Add a unit",
              invite: "Enrol someone",
              visitor: "Invite a visitor",
              report: "Create a report",
            }[modal] || "New record"
          }
          close={() => {
            if (!busy) setModal("");
          }}
        >
          <form className="sp-form" onSubmit={submit}>
            {modal === "property" && (
              <>
                <Field name="name">Property name</Field>
                <Field name="address">Street address & city</Field>
                <label>
                  Property type
                  <select name="type">
                    <option value="apartment">
                      Apartments / residential estate
                    </option>
                    <option value="student_accommodation">
                      Student accommodation
                    </option>
                  </select>
                </label>
              </>
            )}
            {modal === "unit" && (
              <>
                {propertySelect}
                <Field name="label">Unit / room number</Field>
                <Field name="rent" type="number" defaultValue={0}>
                  Monthly rent (ZAR)
                </Field>
              </>
            )}
            {modal === "invite" && (
              <>
                <Field name="email" type="email">
                  Email address
                </Field>
                <label>
                  Role
                  <select
                    name="role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    <option value="tenant">Resident</option>
                    <option value="security">Security</option>
                    <option value="manager">Property manager</option>
                  </select>
                </label>
                {inviteRole !== "manager" && propertySelect}
                {inviteRole === "tenant" && (
                  <label>
                    Vacant unit
                    <select name="unitId" required>
                      <option value="">Select a unit</option>
                      {state.units
                        .filter(
                          (u) =>
                            u.propertyId === selectedProperty &&
                            !u.residentName &&
                            !state.invitations.some((i) => i.unitId === u.id),
                        )
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {inviteRole === "tenant" &&
                  state.properties.find((p) => p.id === selectedProperty)
                    ?.type === "student_accommodation" && (
                    <label>
                      Student number
                      <input
                        name="studentNumber"
                        required
                        maxLength={80}
                        autoCapitalize="none"
                        spellCheck={false}
                      />
                      <small>
                        The student will use this exact student number as their
                        username. Keep any leading zeroes.
                      </small>
                    </label>
                  )}
                <p className="sp-muted">
                  {inviteRole === "tenant"
                    ? "Residents receive a unique username linked to their unit. For student accommodation, their student number is their username. "
                    : "The invited person signs in with their email. "}
                  A welcome email asks them to create their own password.
                </p>
                {!state.emailConfigured && (
                  <p className="sp-error">
                    Email delivery is not connected. You can save this
                    enrolment, but the welcome email will not be sent until the
                    operator configures the email service and you resend it.
                  </p>
                )}
              </>
            )}
            {modal === "visitor" && (
              <>
                {propertySelect}
                <Field name="visitorName">Visitor’s full name</Field>
                <Field name="phone" type="tel">
                  Visitor’s phone number
                </Field>
                <Field name="visitDate" type="date" defaultValue={day()}>
                  Visit date
                </Field>
                <div className="sp-two-col">
                  <Field name="arrival" type="time" defaultValue="09:00">
                    Arrival (SAST)
                  </Field>
                  <Field name="departure" type="time" defaultValue="18:00">
                    Departure (SAST)
                  </Field>
                </div>
                <small>
                  Share a pass only with your intended guest. The pass is valid
                  for one visit.
                </small>
              </>
            )}
            {modal === "report" && (
              <>
                {propertySelect}
                <label>
                  Category
                  <select name="category">
                    <option>Maintenance</option>
                    <option>Security</option>
                    <option>Noise</option>
                    <option>Other</option>
                  </select>
                </label>
                <label>
                  What needs attention?
                  <textarea
                    name="description"
                    rows={4}
                    required
                    maxLength={3000}
                  />
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="sp-error">
                {error}
              </p>
            )}
            <button disabled={busy} className="sp-primary">
              {busy
                ? "Saving…"
                : modal === "invite"
                  ? state.emailConfigured
                    ? "Enrol & send welcome email"
                    : "Save enrolment"
                  : "Save"}
            </button>
          </form>
        </Dialog>
      )}
      {inviteLink && (
        <Dialog title="Enrolment saved" close={() => setInviteLink("")}>
          <p>
            {emailStatus === "sent"
              ? "The welcome email includes their login details and a private password-setup link."
              : "The welcome email has not been sent. Connect the email service or retry sending from Pending invitations."}{" "}
            The setup link is single-use. Resending replaces the old link
            without changing the username.
          </p>
          {inviteUsername && (
            <div className="sp-enrolment-summary">
              Username / student number: <strong>{inviteUsername}</strong>
            </div>
          )}
          <label className="sp-form">
            Invitation link
            <input
              readOnly
              value={inviteLink}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <button className="sp-primary" onClick={() => void copy(inviteLink)}>
            <Copy size={16} />
            Copy invitation
          </button>
          {notice && <p role="status">{notice}</p>}
        </Dialog>
      )}
      {pass && (
        <Dialog title="A welcome, made personal" close={() => setPass(null)}>
          <div className="sp-pass">
            <Brand />
            <h2>{pass.visitorName}</h2>
            <p>{pass.propertyName}</p>
            <QRCodeSVG
              value={`SANGOPASS-LIVE:${pass.reference}:${pass.token}`}
              size={200}
              level="M"
            />
            <strong>{pass.reference}</strong>
            <p>
              {pass.visitDate} · {pass.arrival}–{pass.departure} SAST
            </p>
            <span className="sp-badge">
              {label(
                state.visitors.find((v) => v.id === pass.id)?.status ||
                  pass.status,
              )}
            </span>
            <button
              className="sp-primary"
              onClick={() =>
                void copy(`${window.location.origin}/pass/${pass.token}`)
              }
            >
              <Copy size={16} />
              Copy guest pass link
            </button>
            <Link
              href={`/pass/${pass.token}`}
              target="_blank"
              className="sp-text-button"
            >
              Open printable pass <ArrowUpRight size={15} />
            </Link>
            {notice && <p role="status">{notice}</p>}
          </div>
        </Dialog>
      )}
    </div>
  );
}
