"use client";
import {
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
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
  AlertTriangle,
  Palette,
  RotateCcw,
  Wrench,
  Wallet,
  Download,
  Pencil,
  FolderOpen,
  Inbox,
  Megaphone,
} from "lucide-react";
import PassScanner from "./PassScanner";
import DocumentsPanel from "./DocumentsPanel";
import RequestsPanel from "./RequestsPanel";
import AnnouncementsPanel from "./AnnouncementsPanel";
import ImportPanel from "./ImportPanel";
import CompanyIdentity, { logoUrl } from "./CompanyIdentity";
import Brand from "@/components/ui/Brand";
import type {
  IdType,
  LiveUnit,
  LiveVisitor,
  VisitType,
  WorkspaceState,
} from "@/types/workspace";
import { levelAlerting, showing } from "@/lib/shared/announcements";
import {
  ALERTING,
  TRADES,
  URGENCY_HELP,
  URGENCY_LABELS,
  alerting,
  type Urgency,
} from "@/lib/shared/maintenance";
import {
  PLAN_CARDS,
  UNIVERSAL_RULES,
  includedSms,
  plan as planFor,
} from "@/lib/shared/plans";
import {
  AA,
  AA_LARGE,
  DEFAULT_THEME,
  THEME_PRESETS,
  themeContrast,
  themeReadable,
  themeVariables,
  normaliseHex,
  resolveTheme,
  type BrandTheme,
} from "@/lib/shared/theme";
import { formatEntryCode, sameEntryCode } from "@/lib/shared/passcode";
import { matchesMaskedId } from "@/lib/shared/identity";
import { smsNotice } from "@/lib/shared/sms";
import { financeCsv, financeFilename } from "@/lib/server/finance";
import {
  CATEGORY_HELP,
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  NATURE_HELP,
  NATURE_LABELS,
  currentPeriod,
  periodLabel,
  rands,
  recentPeriods,
  summarise,
  type LedgerKind,
  type LedgerNature,
} from "@/lib/shared/money";
import { useDialog } from "@/lib/utils/useDialog";
import { useMediaQuery } from "@/lib/utils/useMediaQuery";

const rand = (cents: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
const label = (value: string) => value.replaceAll("_", " ");
const roleLabel = (role: string) =>
  role === "tenant"
    ? "Resident"
    : role === "manager"
      ? "Property manager"
      : role === "reception"
        ? "Reception"
        : "Security";
const idLabel = (type: IdType) =>
  type === "sa_id" ? "SA ID" : type === "passport" ? "Passport" : "Student no.";
const day = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(
    new Date(),
  );
type View =
  | "overview"
  | "properties"
  | "people"
  | "visitors"
  | "reports"
  | "documents"
  | "requests"
  | "announcements"
  | "contacts"
  | "money"
  | "billing"
  | "brand";
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
/** One colour: a swatch that opens the native picker, plus the hex in text. */
function ColourField({
  label: name,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  // The text box keeps whatever is being typed - "#12", "#12ab" - and only
  // reports upwards once it parses, so a half-typed hex neither repaints the
  // dashboard nor gets rewritten under the cursor.
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <div className="sp-colour-field">
      <label>
        <span>{name}</span>
        <span className="sp-muted">{hint}</span>
      </label>
      <div className="sp-colour-row">
        <input
          type="color"
          aria-label={`${name} colour picker`}
          value={value}
          onChange={(e) => {
            setTyped(null);
            onChange(e.target.value.toUpperCase());
          }}
        />
        <input
          type="text"
          aria-label={`${name} hex code`}
          spellCheck={false}
          value={typed ?? value}
          onChange={(e) => {
            setTyped(e.target.value);
            const hex = normaliseHex(e.target.value);
            if (hex) onChange(hex);
          }}
          onBlur={() => setTyped(null)}
        />
      </div>
    </div>
  );
}

/**
 * Where a manager sets the company's colours.
 *
 * Every change repaints the real dashboard behind this panel rather than a
 * small swatch, so what a manager approves is what they will actually be
 * looking at all day. Saving is blocked - not merely warned about - while a
 * pair would leave text unreadable, because the same two colours are about to
 * land on every tenant and security account in the company.
 */
function BrandStudio({
  saved,
  draft,
  busy,
  onDraft,
  onSave,
}: {
  saved: BrandTheme;
  draft: BrandTheme;
  busy: boolean;
  onDraft: (theme: BrandTheme) => void;
  onSave: (theme: BrandTheme) => void;
}) {
  const readable = themeReadable(draft);
  const ratios = themeContrast(draft);
  const changed =
    draft.primary !== saved.primary || draft.accent !== saved.accent;
  const failures = [
    ratios.primary < AA && "text on your primary colour",
    ratios.accent < AA && "text on your accent colour",
    ratios.pair < AA_LARGE && "the accent where it sits on the primary",
  ].filter(Boolean) as string[];
  return (
    <>
      <section className="sp-panel">
        <div className="sp-section-head">
          <h2>Your company colours</h2>
          {changed && (
            <button
              className="sp-secondary"
              disabled={busy}
              onClick={() => onDraft(saved)}
            >
              <RotateCcw size={15} />
              Discard changes
            </button>
          )}
        </div>
        <p className="sp-muted sp-brand-intro">
          Pick the two colours your company already uses. They apply to this
          whole workspace and to the dashboards of everyone in{" "}
          <strong>your organisation</strong> — your residents and your security
          team see the same colours you do, without setting anything themselves.
          The dashboard behind this panel updates as you choose; nothing is
          shared until you save.
        </p>
        <div className="sp-brand-fields">
          <ColourField
            label="Primary"
            hint="Sidebar, buttons and the welcome panel"
            value={draft.primary}
            onChange={(primary) => onDraft({ ...draft, primary })}
          />
          <ColourField
            label="Accent"
            hint="The selected menu item and highlights"
            value={draft.accent}
            onChange={(accent) => onDraft({ ...draft, accent })}
          />
        </div>
        {!readable && (
          <p className="sp-error" role="alert">
            <AlertTriangle size={16} />
            These colours are too close together to read comfortably —{" "}
            {new Intl.ListFormat("en-ZA", {
              style: "long",
              type: "conjunction",
            }).format(failures)}{" "}
            {failures.length > 1 ? "fall" : "falls"} below the accessibility
            minimum. Try a darker primary or a lighter accent.
          </p>
        )}
        <div className="sp-brand-save">
          <button
            className="sp-primary"
            disabled={busy || !changed || !readable}
            onClick={() => onSave(draft)}
          >
            <Check size={16} />
            Save for everyone
          </button>
          <button
            className="sp-secondary"
            disabled={busy}
            onClick={() => onDraft(DEFAULT_THEME)}
          >
            Reset to SangoPass colours
          </button>
        </div>
      </section>
      <section className="sp-panel">
        <h2>Start from a palette</h2>
        <p className="sp-muted sp-brand-intro">
          A starting point you can then adjust to your exact brand.
        </p>
        <div className="sp-brand-presets">
          {THEME_PRESETS.map((preset) => {
            const current =
              draft.primary === preset.primary &&
              draft.accent === preset.accent;
            return (
              <button
                key={preset.id}
                className="sp-brand-preset"
                aria-pressed={current}
                disabled={busy}
                onClick={() =>
                  onDraft({ primary: preset.primary, accent: preset.accent })
                }
              >
                <span
                  className="sp-brand-swatch"
                  style={{ background: preset.primary }}
                >
                  <span style={{ background: preset.accent }} />
                </span>
                {preset.name}
                {current && <Check size={15} />}
              </button>
            );
          })}
        </div>
      </section>
      <section className="sp-panel">
        <h2>Contrast</h2>
        <p className="sp-muted sp-brand-intro">
          Measured against WCAG AA, the accessibility standard for readable
          text. Higher is easier to read.
        </p>
        <ul className="sp-brand-ratios">
          {[
            { name: "Text on primary", ratio: ratios.primary, floor: AA },
            { name: "Text on accent", ratio: ratios.accent, floor: AA },
            { name: "Accent on primary", ratio: ratios.pair, floor: AA_LARGE },
          ].map((row) => (
            <li key={row.name}>
              <span>{row.name}</span>
              <strong>{row.ratio.toFixed(1)}:1</strong>
              <span
                className={
                  row.ratio >= row.floor ? "sp-badge" : "sp-badge is-warning"
                }
              >
                {row.ratio >= row.floor
                  ? "Passes"
                  : `Below ${row.floor.toFixed(1)}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/**
 * Lets the demo run this exact component against an in-browser world instead
 * of the API. Everything below is identical in both modes: the demo is the
 * product, not a mock-up of it.
 */
export interface DemoDriver {
  command(input: Record<string, unknown>): {
    result: Record<string, unknown>;
    state: WorkspaceState;
  };
  refresh(): WorkspaceState;
  banner: ReactNode;
}

export default function WorkspaceApp({
  initial,
  demo,
}: {
  initial: WorkspaceState;
  demo?: DemoDriver;
}) {
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
    [inviteRole, setInviteRole] = useState("tenant"),
    [visitType, setVisitType] = useState<VisitType>("daily"),
    [idType, setIdType] = useState<IdType>("sa_id"),
    [urgency, setUrgency] = useState<Urgency>("normal"),
    // The month the money screen is showing. Opens on the one in progress.
    [period, setPeriod] = useState(currentPeriod()),
    [entryKind, setEntryKind] = useState<LedgerKind>("expense"),
    [entryNature, setEntryNature] = useState<LedgerNature>("variable"),
    // Which unit an edit dialog is about, and whether the register shows the
    // units and properties that have been filed away.
    [editing, setEditing] = useState(""),
    [showArchived, setShowArchived] = useState(false),
    // An unsaved brand colour choice. While it is set the whole dashboard is
    // painted with it, so a manager judges the colours on the real interface
    // rather than on a swatch. Leaving the Brand view drops it.
    [themeDraft, setThemeDraft] = useState<BrandTheme | null>(null);
  const router = useRouter();
  const compact = useMediaQuery("(max-width: 1023px)");
  const navigationOpen = compact && mobile;
  const navigationDialog = useDialog(navigationOpen, () => setMobile(false));
  const manager = state.membership.role === "manager",
    reception = state.membership.role === "reception",
    security = state.membership.role === "security",
    // Only a resident hosts a guest. Managers set the limits instead.
    tenant = state.membership.role === "tenant";
  // The front desk does everything a manager does to a building. Every screen
  // below reads this instead of `manager`, except the two about money.
  const office = manager || reception;
  const allowance = state.allowance;
  const nav = [
    { id: "overview", title: "Overview", icon: LayoutDashboard },
    ...(office
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
    {
      id: "reports",
      title: office ? "Maintenance" : "Reports",
      icon: ClipboardList,
    },
    // Everyone gets the board, under the name that describes their side of it:
    // the office writes announcements, everybody else is told them. Security
    // included - a guard is exactly who "the boom is out" is written for.
    {
      id: "announcements",
      title: office ? "Announcements" : "Notice board",
      icon: Megaphone,
    },
    ...(office
      ? [
          { id: "documents", title: "Documents", icon: FolderOpen },
          { id: "requests", title: "Requests", icon: Inbox },
          { id: "contacts", title: "Maintenance contacts", icon: Wrench },
        ]
      : []),
    // A resident raises notices and watches what the office does with them, so
    // they get the same tab under the name that describes their side of it.
    ...(tenant ? [{ id: "requests", title: "My notices", icon: Inbox }] : []),
    // Money is the whole of what reception does not get: the books, and the
    // subscription that pays for the product.
    ...(manager
      ? [
          { id: "money", title: "Money", icon: Wallet },
          { id: "billing", title: "Billing", icon: CreditCard },
        ]
      : []),
    ...(office ? [{ id: "brand", title: "Brand", icon: Palette }] : []),
  ];
  // What the workspace is painted with right now: the unsaved draft while a
  // manager is choosing, otherwise the organisation's saved colours - which
  // the server sends to every role, so a tenant lands here already themed.
  // Resolved rather than trusted: a demo world restored from a session that
  // predates the theme field carries none, and this pair paints everything.
  const savedTheme = resolveTheme(state.organisation.theme);
  const theme = themeDraft ?? savedTheme;
  async function refresh(orgId = state.membership.orgId) {
    setBusy(true);
    setError("");
    try {
      if (demo) {
        const next = demo.refresh();
        setState(next);
        setSelectedProperty(next.properties[0]?.id || "");
        return;
      }
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
      const data = demo
        ? demo.command(input)
        : await (async () => {
            const response = await fetch("/api/workspace", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...input, orgId: state.membership.orgId }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error);
            return payload as {
              result: Record<string, unknown>;
              state: WorkspaceState;
            };
          })();
      setState(data.state);
      setModal("");
      if (
        data.result.token &&
        (input.action === "invite" || input.action === "resendInvitation")
      ) {
        setInviteLink(
          `${window.location.origin}/join?token=${data.result.token}`,
        );
        setInviteUsername(
          data.result.username == null ? null : String(data.result.username),
        );
        setEmailStatus(String(data.result.emailStatus || ""));
      }
      if (data.result.id && input.action === "visitor")
        setPass(
          data.state.visitors.find((v) => v.id === data.result.id) ?? null,
        );
      // A guest pass reports the text message first. It is the channel that
      // reaches the visitor themselves, and the one whose failure changes what
      // the resident has to do next.
      setNotice(
        input.action === "visitor"
          ? [
              "Guest pass created.",
              smsNotice(String(data.result.smsStatus ?? "not_configured")),
              data.result.emailStatus === "sent"
                ? "A copy is on its way to your inbox."
                : "",
            ]
              .filter(Boolean)
              .join(" ")
          : input.action === "announce"
            ? // What reached an inbox is reported separately from what went on
              // the board, because the board always worked and the email is
              // the half the office may need to chase.
              [
                "Announced. It is on the board now.",
                !input.email
                  ? ""
                  : data.result.emailStatus === "sent"
                    ? `Emailed to ${data.result.emailed} ${data.result.emailed === 1 ? "person" : "people"}.`
                    : data.result.emailStatus === "partial"
                      ? `Emailed to ${data.result.emailed} of ${data.result.recipients}; the rest did not send. Tell the others another way.`
                      : data.result.emailStatus === "no_recipients"
                        ? "Nobody is enrolled to receive it by email yet."
                        : data.result.emailStatus === "not_configured"
                          ? "Email is not connected, so it went to dashboards only."
                          : "The email could not be sent, so it went to dashboards only.",
              ]
                .filter(Boolean)
                .join(" ")
            : data.result.emailStatus === "sent"
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
  function open(action: string, propertyId?: string) {
    const property = propertyId || openProperties[0]?.id || "";
    setSelectedProperty(property);
    setInviteRole("tenant");
    setVisitType("daily");
    setUrgency("normal");
    setEntryKind("expense");
    setEntryNature("variable");
    // A student residence usually identifies guests by student number; an
    // apartment never does.
    setIdType(
      state.properties.find((p) => p.id === property)?.type ===
        "student_accommodation"
        ? "student_number"
        : "sa_id",
    );
    setError("");
    setNotice("");
    setModal(action);
  }
  /** Edit one unit: the dialog reads it out of state by id. */
  function openUnit(id: string) {
    setEditing(id);
    open("unitUpdate", state.units.find((u) => u.id === id)?.propertyId);
  }
  /**
   * The demo has no session, so the export route would answer 401 and hand a
   * prospect raw JSON. It builds the file in the browser instead, from the
   * same function the server renders it with, so what a prospect downloads is
   * the file the product produces.
   */
  function downloadBooks() {
    const csv = financeCsv(
      state.organisation.name,
      period,
      state.ledger,
      openUnits.map((u) => ({
        label: u.label,
        propertyName:
          state.properties.find((p) => p.id === u.propertyId)?.name ?? "",
        rentCents: u.rentCents,
        occupied: Boolean(u.residentName),
        paid: paidThisMonth(u),
      })),
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = financeFilename(state.organisation.name, period);
    link.click();
    URL.revokeObjectURL(url);
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
  // The gate code is searchable too, so a guard who has been read a code down
  // a radio can type it straight into the box they already use. So is the
  // identity document: at the gate the card in the visitor's hand is often the
  // only thing that is certainly right, when the name was spelt differently on
  // the request and nobody can find the reference.
  const visitors = state.visitors.filter(
    (v) =>
      `${v.visitorName} ${v.reference} ${v.hostName}`
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      (v.entryCode !== "" && sameEntryCode(v.entryCode, search)) ||
      (v.idNumber !== "" && matchesMaskedId(v.idNumber, search)),
  );
  // A directory is only useful if you can find the plumber in it at 6am, so
  // the trade and the company are searchable alongside the name.
  const contacts = state.contractors.filter((c) =>
    `${c.name} ${c.trade} ${c.company ?? ""} ${c.phone} ${c.email ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  // The books for the month on screen, and the rent the occupied units should
  // produce. Expected rent comes from the register as it stands today, so it
  // is only claimed for the month in progress: measuring August against
  // today's tenants and today's rents would be a number that means nothing.
  const liveMonth = period === currentPeriod();
  // Archived properties and units are still sent, so a visitor row or a report
  // can name the building it happened at. Everywhere a manager chooses or
  // counts something, only what is in use belongs.
  const openProperties = state.properties.filter((p) => !p.archivedAt);
  const openUnits = state.units.filter((u) => !u.archivedAt);
  const occupied = openUnits.filter((u) => u.residentName);
  // A vacant unit owes nothing, so it is never in arrears. What it is, is rent
  // the property is not earning - which is the figure an owner asks about, and
  // is reported on its own rather than hidden inside the rent lines.
  const vacant = openUnits.filter((u) => !u.residentName);
  const paidThisMonth = (unit: LiveUnit) =>
    Boolean(unit.rentPaid) && unit.rentPaidPeriod === currentPeriod();
  const rentOf = (rows: LiveUnit[]) =>
    rows.reduce((total, u) => total + u.rentCents, 0);
  const expectedRentCents = liveMonth ? rentOf(occupied) : 0;
  const books = summarise(
    period,
    state.ledger,
    expectedRentCents,
    liveMonth ? rentOf(vacant) : 0,
  );
  const monthEntries = state.ledger
    .filter((entry) => entry.period === period)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const arrears = occupied.filter((u) => !paidThisMonth(u));
  // Every month with something in it, plus the last year, so a manager can
  // reach a month they recorded long ago as well as one they simply missed.
  const periods = [
    ...new Set([...recentPeriods(12), ...state.ledger.map((e) => e.period)]),
  ].sort((a, b) => b.localeCompare(a));
  // What this organisation is entitled to, and what it is actually using.
  // Seats and units are counted live so the billing screen agrees with the
  // limits the server enforces rather than describing them separately.
  const planNow = planFor(state.organisation.plan);
  // Reception spends a seat too, exactly as the server counts it on invite.
  const managerSeats = state.members.filter(
    (m) => m.role === "manager" || m.role === "reception",
  ).length;
  const passesThisMonth = state.visitors.filter(
    (v) => v.createdAt.slice(0, 7) === currentPeriod(),
  ).length;
  const editingProperty = state.properties.find(
    (p) => p.id === selectedProperty,
  );
  const editingUnit = state.units.find((u) => u.id === editing);
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
        {openProperties.map((p) => (
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
    <div className="sp-shell" style={themeVariables(theme) as CSSProperties}>
      {demo?.banner}
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
          {/*
            The company's own mark when they have uploaded one, and SangoPass
            when they have not. The stamp in the URL changes with the upload,
            so replacing a logo is visible immediately rather than whenever a
            member's cache happens to expire.
          */}
          <Link
            href="/"
            aria-label={
              state.organisation.logoUpdatedAt
                ? `${state.organisation.name} home`
                : "SangoPass home"
            }
          >
            {state.organisation.logoUpdatedAt && !demo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="sp-org-logo"
                src={logoUrl(
                  state.membership.orgId,
                  state.organisation.logoUpdatedAt,
                )}
                alt={state.organisation.name}
              />
            ) : (
              <Brand light />
            )}
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
                  // Navigating away abandons an unsaved colour choice rather
                  // than leaving the workspace in colours nobody saved.
                  if (item.id !== "brand") setThemeDraft(null);
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
                    announcements: office
                      ? "Say it once, and everybody has it."
                      : "What the office wants you to know.",
                    documents: "Every stay, and the papers that go with it.",
                    requests: tenant
                      ? "Tell the office what is changing."
                      : "What your residents say is about to change.",
                    contacts: "Everyone who keeps the place working.",
                    money: "What came in, what went out.",
                    billing: "Room to grow, at your own pace.",
                    brand: "Make it look like your company.",
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
            ) : view === "visitors" && tenant ? (
              <button
                disabled={!openProperties.length}
                className="sp-primary"
                onClick={() => open("visitor")}
              >
                <Plus size={17} />
                Request a guest visit
              </button>
            ) : view === "reports" ? (
              <button
                disabled={!openProperties.length}
                className="sp-primary"
                onClick={() => open("report")}
              >
                <Plus size={17} />
                {office ? "Log an issue" : "Report an issue"}
              </button>
            ) : view === "contacts" ? (
              <button className="sp-primary" onClick={() => open("contractor")}>
                <Plus size={17} />
                Add a contact
              </button>
            ) : view === "money" ? (
              <button
                className="sp-primary"
                onClick={() => open("ledgerEntry")}
              >
                <Plus size={17} />
                Record money
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
              {/*
                An urgent announcement is the one thing on this screen that
                cannot wait for somebody to go looking for it. A resident opens
                the workspace to book a guest, not to read a board, so the
                board comes to them - and the office sees the same banner, so
                what it has raised is visible from where it works.
              */}
              {(() => {
                const raised = state.announcements.filter(
                  (a) => levelAlerting(a.level) && showing(a, day()),
                );
                if (!raised.length) return null;
                return (
                  <section role="alert" className="sp-alert sp-alert-critical">
                    <Megaphone size={20} aria-hidden />
                    <div>
                      <strong>
                        {raised.length === 1
                          ? raised[0].title
                          : `${raised.length} urgent announcements`}
                      </strong>
                      <p>
                        {raised.length === 1
                          ? `${raised[0].propertyName || state.organisation.name} · ${raised[0].authorName || "The office"}.`
                          : `From ${state.organisation.name}.`}{" "}
                        <button
                          className="sp-text-button"
                          onClick={() => setView("announcements")}
                        >
                          {raised.length === 1
                            ? "Read it on the board"
                            : "Read them on the board"}
                        </button>
                      </p>
                    </div>
                  </section>
                );
              })()}
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
                    value: openProperties.length,
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
                  {(showArchived ? state.properties : openProperties).map(
                    (p, i) => (
                      <article
                        className={`sp-property-card ${p.archivedAt ? "is-archived" : ""}`}
                        key={p.id}
                      >
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
                          <small className="sp-block">
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
                          <small className="sp-block">
                            Guests: {p.sleepoverNightsPerMonth} sleepover nights
                            per unit each month · up to {p.maxConsecutiveNights}{" "}
                            consecutive · {p.maxActiveGuests} active passes
                          </small>
                          <div className="sp-row">
                            {p.archivedAt ? (
                              <>
                                <span className="sp-badge is-warning">
                                  Archived
                                </span>
                                <button
                                  disabled={busy}
                                  className="sp-secondary"
                                  onClick={() =>
                                    void act({
                                      action: "propertyArchive",
                                      id: p.id,
                                      archived: false,
                                    })
                                  }
                                >
                                  <RotateCcw size={15} />
                                  Restore
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="sp-secondary"
                                  onClick={() => open("unit", p.id)}
                                >
                                  <Plus size={15} />
                                  Add unit
                                </button>
                                <button
                                  className="sp-secondary"
                                  onClick={() => open("propertyUpdate", p.id)}
                                >
                                  <Pencil size={15} />
                                  Edit
                                </button>
                                <button
                                  className="sp-secondary"
                                  onClick={() => open("propertyLimits", p.id)}
                                >
                                  <Ticket size={15} />
                                  Visitor limits
                                </button>
                                {/* Archiving, never deleting: this building is
                                  named in last month's books, in the visitor
                                  register and in the audit trail. */}
                                <button
                                  disabled={busy}
                                  className="sp-text-button"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Archive ${p.name}? It stops appearing when you add units, enrol residents or record money, and its empty units are archived with it. Everything already recorded stays exactly as it is, and you can restore it.`,
                                      )
                                    )
                                      void act({
                                        action: "propertyArchive",
                                        id: p.id,
                                        archived: true,
                                      });
                                  }}
                                >
                                  Archive
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    ),
                  )}
                </div>
              )}
              {state.units.length > 0 && (
                <section className="sp-panel">
                  <div className="sp-section-head">
                    <h2>
                      Units & rent register{" "}
                      <span className="sp-muted">({openUnits.length})</span>
                    </h2>
                    {state.units.length > openUnits.length && (
                      <label className="sp-row">
                        <input
                          type="checkbox"
                          checked={showArchived}
                          onChange={(e) => setShowArchived(e.target.checked)}
                        />
                        <span>
                          Show archived ({state.units.length - openUnits.length}
                          )
                        </span>
                      </label>
                    )}
                  </div>
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
                            {periodLabel(currentPeriod())}
                          </th>
                          <th role="columnheader" scope="col">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody role="rowgroup">
                        {(showArchived ? state.units : openUnits).map((u) => (
                          <tr key={u.id} role="row">
                            <td data-label="Unit" role="cell">
                              <strong>{u.label}</strong>
                              {u.archivedAt && (
                                <small className="sp-block">
                                  <span className="sp-badge is-warning">
                                    Archived
                                  </span>
                                </small>
                              )}
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
                            <td
                              data-label={periodLabel(currentPeriod())}
                              role="cell"
                            >
                              {/* Paid means paid for this month. A unit marked
                                  in September reads as unpaid in October, and
                                  marking it here writes the receipt into the
                                  books under Money. */}
                              {u.archivedAt ? (
                                <span className="sp-muted">—</span>
                              ) : (
                                <button
                                  disabled={busy}
                                  className={`sp-badge ${
                                    paidThisMonth(u) ? "success" : ""
                                  }`}
                                  onClick={() =>
                                    void act({
                                      action: "rent",
                                      unitId: u.id,
                                      paid: !paidThisMonth(u),
                                    })
                                  }
                                >
                                  {paidThisMonth(u)
                                    ? "Paid · undo"
                                    : "Mark paid"}
                                </button>
                              )}
                            </td>
                            <td data-label="Actions" role="cell">
                              <div className="sp-row">
                                {u.archivedAt ? (
                                  <button
                                    disabled={busy}
                                    className="sp-secondary"
                                    onClick={() =>
                                      void act({
                                        action: "unitArchive",
                                        id: u.id,
                                        archived: false,
                                      })
                                    }
                                  >
                                    <RotateCcw size={15} />
                                    Restore
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      className="sp-secondary"
                                      onClick={() => openUnit(u.id)}
                                    >
                                      <Pencil size={15} />
                                      Edit
                                    </button>
                                    {/* Archived, never deleted: this unit is
                                        named in the books and in the visitor
                                        register, and both must keep reading. */}
                                    <button
                                      disabled={busy}
                                      className="sp-text-button"
                                      onClick={() => {
                                        if (
                                          window.confirm(
                                            `Archive ${u.label}? It stops being offered when you enrol a resident and stops counting as vacant income. Everything already recorded stays as it is, and you can restore it.`,
                                          )
                                        )
                                          void act({
                                            action: "unitArchive",
                                            id: u.id,
                                            archived: true,
                                          });
                                      }}
                                    >
                                      Archive
                                    </button>
                                  </>
                                )}
                              </div>
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
              {/*
                Above the register rather than below it: a manager opens People
                on the day they are setting the estate up, and enrolling a
                hundred residents one dialog at a time is the moment they give
                up on the product.
              */}
              <ImportPanel
                state={state}
                orgId={state.membership.orgId}
                demo={Boolean(demo)}
                onImported={(next, message) => {
                  setState(next);
                  setError("");
                  setNotice(message);
                }}
              />
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
                              {roleLabel(m.role)}
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
                          {roleLabel(i.role)} · expires{" "}
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
                    aria-label="Search visitors by name, pass reference or identity number"
                    placeholder="Name, reference or ID number"
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
                  onCode={(code) => {
                    // Verification, not admission: the guard still reads the
                    // status and the arrival window, and still checks the
                    // identity document, exactly as after a scan.
                    const found = state.visitors.find((v) =>
                      sameEntryCode(v.entryCode, code),
                    );
                    if (!found) return false;
                    setSearch(found.reference);
                    setNotice(
                      `Gate code matches ${found.visitorName}, expected at ${found.propertyName}${
                        found.unitLabel ? ` for ${found.unitLabel}` : ""
                      }. Check their identity document, the status and the arrival window before admitting them.`,
                    );
                    return true;
                  }}
                />
              )}
              {!visitors.length ? (
                empty(
                  "No visitors to show.",
                  search
                    ? "Try another name, pass reference or identity number."
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
                            {v.nights > 0 ? ` → ${v.endDate}` : ""}
                            <small className="sp-block">
                              {v.arrival}–{v.departure}
                              {v.nights > 0
                                ? ` · ${v.nights} ${v.nights === 1 ? "night" : "nights"}`
                                : " · day visit"}
                            </small>
                          </td>
                          <td data-label="Host / property" role="cell">
                            {v.hostName}
                            <small className="sp-block">
                              {v.propertyName}
                              {v.unitLabel ? ` / ${v.unitLabel}` : ""}
                            </small>
                            <small className="sp-block">
                              {v.idNumber
                                ? `${idLabel(v.idType)} ${v.idNumber}`
                                : "ID not recorded"}
                            </small>
                          </td>
                          <td data-label="Status" role="cell">
                            <span
                              className={`sp-badge ${v.status === "checked_in" ? "success" : ""}`}
                            >
                              {v.status === "upcoming" &&
                              Date.parse(
                                `${v.endDate}T${v.departure}:00+02:00`,
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
            <>
              {manager &&
                (() => {
                  const open = state.reports.filter(
                    (r) => r.status !== "resolved",
                  );
                  const raised = open.filter((r) => alerting(r.urgency));
                  if (!raised.length) return null;
                  const worst = raised.some((r) => r.urgency === "emergency");
                  return (
                    <section
                      role="alert"
                      className={`sp-alert ${worst ? "sp-alert-critical" : "sp-alert-amber"}`}
                    >
                      <AlertTriangle size={20} aria-hidden />
                      <div>
                        <strong>
                          {raised.length}{" "}
                          {raised.length === 1 ? "issue needs" : "issues need"}{" "}
                          attention now
                        </strong>
                        <p>
                          {ALERTING.map((level) => {
                            const count = raised.filter(
                              (r) => r.urgency === level,
                            ).length;
                            return count
                              ? `${count} ${URGENCY_LABELS[level].toLowerCase()}`
                              : null;
                          })
                            .filter(Boolean)
                            .join(" · ")}
                          {". "}
                          {raised[0].unitLabel
                            ? `Oldest open: ${raised[0].unitLabel}, ${raised[0].category.toLowerCase()}.`
                            : ""}
                        </p>
                      </div>
                    </section>
                  );
                })()}

              <section className="sp-panel">
                <div className="sp-section-head">
                  <h2>
                    {office
                      ? "Maintenance & complaints"
                      : "Your reported issues"}
                  </h2>
                  {office && state.reports.length > 0 && (
                    <small>
                      {
                        state.reports.filter((r) => r.status !== "resolved")
                          .length
                      }{" "}
                      open · most urgent first
                    </small>
                  )}
                </div>
                {!state.reports.length
                  ? empty(
                      "All clear, for now.",
                      manager
                        ? "Maintenance issues and complaints logged by residents will appear here, most urgent first."
                        : "Something broken, unsafe or disturbing? Log it and your property manager will see it, ranked by how urgent it is.",
                    )
                  : state.reports.map((r) => (
                      <article
                        className={`sp-report sp-urgency-${r.urgency}`}
                        key={r.id}
                      >
                        <div className="sp-section-head">
                          <span className="sp-row">
                            <span
                              className={`sp-badge sp-badge-${r.urgency}`}
                              title={URGENCY_HELP[r.urgency]}
                            >
                              {URGENCY_LABELS[r.urgency]}
                            </span>
                            <span className="sp-badge">{r.category}</span>
                          </span>
                          {manager ? (
                            <span className="sp-row">
                              <label>
                                <span className="sr-only">Urgency</span>
                                <select
                                  value={r.urgency}
                                  disabled={busy}
                                  onChange={(e) =>
                                    void act({
                                      action: "reportUrgency",
                                      id: r.id,
                                      urgency: e.target.value,
                                    })
                                  }
                                >
                                  <option value="emergency">Emergency</option>
                                  <option value="urgent">Urgent</option>
                                  <option value="normal">Normal</option>
                                  <option value="low">Low</option>
                                </select>
                              </label>
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
                                  <option value="in_progress">
                                    In progress
                                  </option>
                                  <option value="resolved">Resolved</option>
                                </select>
                              </label>
                            </span>
                          ) : (
                            <span className="sp-badge">{label(r.status)}</span>
                          )}
                        </div>
                        <p className="sp-report-text">{r.description}</p>
                        <small>
                          {r.authorName}
                          {r.unitLabel ? ` · ${r.unitLabel}` : ""} ·{" "}
                          {
                            state.properties.find((p) => p.id === r.propertyId)
                              ?.name
                          }{" "}
                          · {new Date(r.createdAt).toLocaleDateString("en-ZA")}
                        </small>
                      </article>
                    ))}
              </section>
            </>
          )}
          {view === "billing" && manager && (
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
                rand, VAT included. Each payment covers one month; renew
                manually — nothing recurs on a card without you.{" "}
                {state.billingMode === "sandbox" &&
                  "Checkout is currently in sandbox mode: test payments only."}{" "}
                {!state.billingConfigured &&
                  "Payments will become available when the operator connects their PayFast merchant account."}
              </p>
              {/*
                Where this organisation actually stands against the plan it is
                on. A cap is only fair if a manager can see how close they are
                to it before it stops them.
              */}
              <section className="sp-panel">
                <h2>What you are using</h2>
                <div className="sp-money-tiles">
                  {[
                    {
                      name: "Units in use",
                      value: `${openUnits.length} of ${planNow.units}`,
                      hint:
                        state.units.length > openUnits.length
                          ? `${state.units.length - openUnits.length} archived, not counted`
                          : "Archived units do not count",
                      warn: openUnits.length > planNow.units,
                    },
                    {
                      name: "Manager & reception sign-ins",
                      value: `${managerSeats} of ${planNow.managers}`,
                      hint:
                        planNow.managers === 1
                          ? "One seat on Starter"
                          : "Across the organisation",
                      warn: managerSeats > planNow.managers,
                    },
                    {
                      name: "Gate-code texts",
                      value: `${passesThisMonth} of ${includedSms(
                        state.organisation.plan,
                        openUnits.length,
                      )}`,
                      hint: `${periodLabel(currentPeriod())} · R0.60 each beyond`,
                      warn:
                        passesThisMonth >
                        includedSms(state.organisation.plan, openUnits.length),
                    },
                  ].map((tile) => (
                    <article key={tile.name}>
                      <p>{tile.name}</p>
                      <strong className={tile.warn ? "sp-money-down" : ""}>
                        {tile.value}
                      </strong>
                      <small>{tile.hint}</small>
                    </article>
                  ))}
                </div>
                <p className="sp-muted">
                  Text usage counts guest passes created this month and is a
                  guide, not an invoice. We would raise anything unusual with
                  you before it appeared on one.
                </p>
              </section>
              <div className="sp-plan-grid">
                {PLAN_CARDS.filter((p) => p.id !== "portfolio").map((p) => (
                  <article
                    className={`sp-panel ${p.id === "growth" ? "sp-featured" : ""}`}
                    key={p.id}
                  >
                    <span className="sp-eyebrow">
                      {p.id === "growth" ? "ROOM TO GROW" : "YOUR NEXT CHAPTER"}
                    </span>
                    <h2>{p.name}</h2>
                    <strong className="sp-price">{p.priceLabel}</strong>
                    <small className="sp-block sp-muted">VAT included</small>
                    <p className="sp-plan-audience">{p.audience}</p>
                    <ul className="sp-plan-rules">
                      {p.rules.map((rule) => (
                        <li key={rule}>
                          <Check size={14} />
                          {rule}
                        </li>
                      ))}
                    </ul>
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
                <h2>How your plan works</h2>
                <ul className="sp-plan-rules">
                  {UNIVERSAL_RULES.map((rule) => (
                    <li key={rule}>
                      <Check size={14} />
                      {rule}
                    </li>
                  ))}
                </ul>
              </section>
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
          {view === "documents" && office && (
            <DocumentsPanel
              state={state}
              office={office}
              orgId={state.membership.orgId}
              demo={Boolean(demo)}
              busy={busy}
              onRemove={(id) => void act({ action: "documentRemove", id })}
              onUploaded={(next) => {
                setState(next);
                setError("");
                setNotice("Document filed.");
              }}
              onError={setError}
            />
          )}
          {view === "announcements" && (
            <AnnouncementsPanel
              state={state}
              today={day()}
              office={office}
              manager={manager}
              busy={busy}
              onAct={(input) => void act(input)}
            />
          )}
          {view === "requests" && (office || tenant) && (
            <RequestsPanel
              state={state}
              office={office}
              tenant={tenant}
              busy={busy}
              onAct={(input) => void act(input)}
            />
          )}
          {/*
            Its own screen rather than a panel under the maintenance queue,
            where it sat below however many open reports there happened to be.
            A manager reaches for this list when something has just broken, so
            it has to be one click from anywhere.
          */}
          {view === "contacts" && office && (
            <section className="sp-panel">
              <div className="sp-section-head">
                <h2>
                  Your maintenance team{" "}
                  <span className="sp-muted">({state.contractors.length})</span>
                </h2>
                {state.contractors.length > 0 && (
                  <label className="sp-search">
                    <Search size={17} />
                    <input
                      aria-label="Search contacts by name, trade or company"
                      placeholder="Name, trade or company"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                )}
              </div>
              <p className="sp-muted">
                Your in-house people and outside contractors. A phone list,
                nothing more: none of these are accounts and none of them grant
                access.
              </p>
              {!state.contractors.length ? (
                empty(
                  "No contacts yet.",
                  "Add the plumber, the electrician and whoever holds the gate keys, so they are to hand when something breaks.",
                  "contractor",
                  "Add your first contact",
                )
              ) : !contacts.length ? (
                empty(
                  "No contact matches that.",
                  "Try another name, trade or company.",
                )
              ) : (
                <div className="sp-table-wrap">
                  <table className="sp-responsive-table" role="table">
                    <thead role="rowgroup">
                      <tr role="row">
                        <th role="columnheader" scope="col">
                          Name
                        </th>
                        <th role="columnheader" scope="col">
                          Trade
                        </th>
                        <th role="columnheader" scope="col">
                          Contact
                        </th>
                        <th role="columnheader" scope="col">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {contacts.map((c) => (
                        <tr key={c.id} role="row">
                          <td data-label="Name" role="cell">
                            <strong>{c.name}</strong>
                            <small className="sp-block">
                              {c.kind === "in_house"
                                ? "In-house"
                                : c.company || "Contractor"}
                            </small>
                          </td>
                          <td data-label="Trade" role="cell">
                            {c.trade}
                            {c.notes ? (
                              <small className="sp-block">{c.notes}</small>
                            ) : null}
                          </td>
                          <td data-label="Contact" role="cell">
                            {/* Tappable: this list is read on a phone, and the
                                next thing a manager does is call. */}
                            <a href={`tel:${c.phone.replace(/\s/g, "")}`}>
                              {c.phone}
                            </a>
                            {c.email ? (
                              <small className="sp-block">
                                <a href={`mailto:${c.email}`}>{c.email}</a>
                              </small>
                            ) : null}
                          </td>
                          <td data-label="Actions" role="cell">
                            <button
                              disabled={busy}
                              className="sp-text-button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Remove ${c.name} from your maintenance contacts?`,
                                  )
                                )
                                  void act({
                                    action: "contractorRemove",
                                    id: c.id,
                                  });
                              }}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {/*
            The organisation's own books, kept apart from Billing, which is
            what they pay SangoPass. Rent receipts arrive here from the rent
            register rather than being typed twice, so the two can never
            disagree; costs are entered here directly.
          */}
          {view === "money" && manager && (
            <>
              <section className="sp-panel">
                <div className="sp-section-head">
                  <h2>{periodLabel(period)}</h2>
                  <div className="sp-row">
                    <label className="sp-period">
                      <span className="sr-only">Month</span>
                      <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                      >
                        {periods.map((option) => (
                          <option key={option} value={option}>
                            {periodLabel(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {/* A plain link, not fetch-and-blob: the browser handles
                        the download, and the server decides what this manager
                        is allowed to export. */}
                    {demo ? (
                      <button
                        className="sp-secondary"
                        onClick={() => downloadBooks()}
                      >
                        <Download size={15} />
                        Download spreadsheet
                      </button>
                    ) : (
                      <a
                        className="sp-secondary"
                        href={`/api/finance/export?org=${encodeURIComponent(
                          state.membership.orgId,
                        )}&period=${period}`}
                      >
                        <Download size={15} />
                        Download spreadsheet
                      </a>
                    )}
                  </div>
                </div>
                <div className="sp-money-tiles">
                  {[
                    ...(liveMonth
                      ? [
                          {
                            name: "Rent expected",
                            value: books.rentExpectedCents,
                            hint: `${occupied.length} occupied ${
                              occupied.length === 1 ? "unit" : "units"
                            }`,
                          },
                          {
                            name: "Rent collected",
                            value: books.rentCollectedCents,
                            hint: `${occupied.length - arrears.length} of ${
                              occupied.length
                            } paid`,
                          },
                          {
                            name: "Rent outstanding",
                            value: books.rentOutstandingCents,
                            hint: arrears.length
                              ? `${arrears.length} still to pay`
                              : "All in",
                            warn: books.rentOutstandingCents > 0,
                          },
                          {
                            name: "Vacancy",
                            value: books.vacancyCents,
                            hint: vacant.length
                              ? `${vacant.length} of ${openUnits.length} ${
                                  vacant.length === 1 ? "unit" : "units"
                                } empty`
                              : "Every unit is let",
                            warn: books.vacancyCents > 0,
                          },
                        ]
                      : [
                          {
                            name: "Rent collected",
                            value: books.rentCollectedCents,
                            hint: "As recorded that month",
                          },
                        ]),
                    {
                      name: "Total costs",
                      value: books.expensesCents,
                      hint: `${rands(books.fixedCents)} fixed · ${rands(
                        books.variableCents,
                      )} variable`,
                    },
                    {
                      name: "Net",
                      value: books.netCents,
                      hint:
                        books.netCents >= 0
                          ? "Income above costs"
                          : "Costs above income",
                      warn: books.netCents < 0,
                    },
                  ].map((tile) => (
                    <article key={tile.name}>
                      <p>{tile.name}</p>
                      <strong className={tile.warn ? "sp-money-down" : ""}>
                        {rands(tile.value)}
                      </strong>
                      <small>{tile.hint}</small>
                    </article>
                  ))}
                </div>
                {!liveMonth && (
                  <p className="sp-muted">
                    Rent expected and outstanding are tracked for the month in
                    progress, because the rent register says how things stand
                    today rather than how they stood in a closed month. This
                    month shows what was recorded at the time.
                  </p>
                )}
              </section>

              <section className="sp-panel">
                <h2>Where the money went</h2>
                <div className="sp-table-wrap">
                  <table className="sp-responsive-table" role="table">
                    <thead role="rowgroup">
                      <tr role="row">
                        <th role="columnheader" scope="col">
                          Category
                        </th>
                        <th role="columnheader" scope="col">
                          Fixed
                        </th>
                        <th role="columnheader" scope="col">
                          Variable
                        </th>
                        <th role="columnheader" scope="col">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {books.expensesByCategory.map((row) => (
                        <tr key={row.category} role="row">
                          <td data-label="Category" role="cell">
                            <strong>{CATEGORY_LABELS[row.category]}</strong>
                            <small className="sp-block">
                              {CATEGORY_HELP[row.category]}
                            </small>
                          </td>
                          <td data-label="Fixed" role="cell">
                            {rands(row.fixedCents)}
                          </td>
                          <td data-label="Variable" role="cell">
                            {rands(row.variableCents)}
                          </td>
                          <td data-label="Total" role="cell">
                            <strong>{rands(row.totalCents)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {liveMonth && vacant.length > 0 && (
                <section className="sp-panel">
                  <div className="sp-section-head">
                    <h2>Empty units</h2>
                    <span className="sp-badge is-warning">
                      {rands(books.vacancyCents)} a month
                    </span>
                  </div>
                  <p className="sp-muted">
                    Nobody owes this: it is rent the property is not earning.
                    Enrol a resident from People to let one of these.
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
                            Rent not being earned
                          </th>
                        </tr>
                      </thead>
                      <tbody role="rowgroup">
                        {vacant.map((u) => (
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
                            <td data-label="Rent not being earned" role="cell">
                              {rands(u.rentCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {liveMonth && arrears.length > 0 && (
                <section className="sp-panel">
                  <div className="sp-section-head">
                    <h2>Rent outstanding</h2>
                    <span className="sp-badge is-warning">
                      {rands(books.rentOutstandingCents)}
                    </span>
                  </div>
                  <p className="sp-muted">
                    Mark a unit paid in Properties and the receipt lands in
                    these books automatically.
                  </p>
                  <div className="sp-table-wrap">
                    <table className="sp-responsive-table" role="table">
                      <thead role="rowgroup">
                        <tr role="row">
                          <th role="columnheader" scope="col">
                            Unit
                          </th>
                          <th role="columnheader" scope="col">
                            Resident
                          </th>
                          <th role="columnheader" scope="col">
                            Monthly rent
                          </th>
                          <th role="columnheader" scope="col">
                            {periodLabel(period)}
                          </th>
                        </tr>
                      </thead>
                      <tbody role="rowgroup">
                        {arrears.map((u) => (
                          <tr key={u.id} role="row">
                            <td data-label="Unit" role="cell">
                              <strong>{u.label}</strong>
                              <small className="sp-block">
                                {
                                  state.properties.find(
                                    (p) => p.id === u.propertyId,
                                  )?.name
                                }
                              </small>
                            </td>
                            <td data-label="Resident" role="cell">
                              {u.residentName}
                            </td>
                            <td data-label="Monthly rent" role="cell">
                              {rands(u.rentCents)}
                            </td>
                            <td data-label={periodLabel(period)} role="cell">
                              <button
                                disabled={busy}
                                className="sp-badge"
                                onClick={() =>
                                  void act({
                                    action: "rent",
                                    unitId: u.id,
                                    paid: true,
                                  })
                                }
                              >
                                Mark paid
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <section className="sp-panel">
                <div className="sp-section-head">
                  <h2>
                    Every entry{" "}
                    <span className="sp-muted">({monthEntries.length})</span>
                  </h2>
                  <button
                    className="sp-secondary"
                    onClick={() => open("ledgerEntry")}
                  >
                    <Plus size={15} />
                    Record money
                  </button>
                </div>
                {!monthEntries.length ? (
                  empty(
                    "Nothing recorded for this month.",
                    "Log the security contract, the wages, the water bill and anything else the property costs to run. Rent arrives on its own when you mark a unit paid.",
                    "ledgerEntry",
                    "Record the first entry",
                  )
                ) : (
                  <div className="sp-table-wrap">
                    <table className="sp-responsive-table" role="table">
                      <thead role="rowgroup">
                        <tr role="row">
                          <th role="columnheader" scope="col">
                            What
                          </th>
                          <th role="columnheader" scope="col">
                            Category
                          </th>
                          <th role="columnheader" scope="col">
                            Recorded
                          </th>
                          <th role="columnheader" scope="col">
                            Amount
                          </th>
                          <th role="columnheader" scope="col">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody role="rowgroup">
                        {monthEntries.map((entry) => (
                          <tr key={entry.id} role="row">
                            <td data-label="What" role="cell">
                              <strong>{entry.description}</strong>
                              {entry.propertyName ? (
                                <small className="sp-block">
                                  {entry.propertyName}
                                </small>
                              ) : null}
                            </td>
                            <td data-label="Category" role="cell">
                              <span className="sp-badge">
                                {CATEGORY_LABELS[entry.category]}
                              </span>{" "}
                              <span className="sp-badge">
                                {NATURE_LABELS[entry.nature]}
                              </span>
                            </td>
                            <td data-label="Recorded" role="cell">
                              {new Date(entry.createdAt).toLocaleDateString(
                                "en-ZA",
                              )}
                              <small className="sp-block">
                                {entry.recordedBy}
                              </small>
                            </td>
                            <td data-label="Amount" role="cell">
                              <strong
                                className={
                                  entry.kind === "expense"
                                    ? "sp-money-down"
                                    : "sp-money-up"
                                }
                              >
                                {entry.kind === "expense" ? "−" : "+"}
                                {rands(entry.amountCents)}
                              </strong>
                            </td>
                            <td data-label="Actions" role="cell">
                              {entry.unitId ? (
                                <small className="sp-muted">
                                  From the rent register
                                </small>
                              ) : (
                                <button
                                  disabled={busy}
                                  className="sp-text-button"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Remove "${entry.description}" from the books?`,
                                      )
                                    )
                                      void act({
                                        action: "ledgerRemove",
                                        id: entry.id,
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
                )}
              </section>
            </>
          )}
          {view === "brand" && office && (
            <CompanyIdentity
              state={state}
              busy={busy}
              demo={Boolean(demo)}
              onSaveName={(name) => void act({ action: "companyName", name })}
              onRemoveLogo={() => void act({ action: "logoRemove" })}
              onUploaded={(next) => {
                setState(next);
                setError("");
                setNotice("Logo saved for everyone in your organisation.");
              }}
              onError={setError}
            />
          )}
          {view === "brand" && office && (
            <BrandStudio
              saved={savedTheme}
              draft={theme}
              busy={busy}
              onDraft={setThemeDraft}
              onSave={async (next) => {
                const saved = await act({
                  action: "branding",
                  primary: next.primary,
                  accent: next.accent,
                });
                // The refreshed state carries the new colours, so the draft
                // has nothing left to say.
                if (saved) setThemeDraft(null);
              }}
            />
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
              visitor: "Request a guest visit",
              propertyLimits: "Visitor limits",
              report: "Log an issue",
              contractor: "Add a maintenance contact",
              ledgerEntry: "Record money",
              propertyUpdate: "Edit property",
              unitUpdate: "Edit unit",
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
                    {/*
                      Only a manager may create office accounts, so reception
                      is not offered these two - the server refuses them
                      anyway, and an option that always fails is a trap.
                    */}
                    {manager && (
                      <>
                        <option value="reception">Reception</option>
                        <option value="manager">Property manager</option>
                      </>
                    )}
                  </select>
                  {inviteRole === "reception" && (
                    <small className="sp-muted">
                      The front desk for one property: residents, passes,
                      notices and documents, but never the books or the
                      subscription. Uses one of your plan&rsquo;s sign-ins.
                    </small>
                  )}
                </label>
                {inviteRole !== "manager" && propertySelect}
                {inviteRole === "tenant" && (
                  <label>
                    Vacant unit
                    <select name="unitId" required>
                      <option value="">Select a unit</option>
                      {openUnits
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
            {modal === "visitor" &&
              (() => {
                const property = state.properties.find(
                  (p) => p.id === selectedProperty,
                );
                const student = property?.type === "student_accommodation";
                const sleepover = visitType !== "daily";
                const nightsLeft = allowance
                  ? allowance.sleepoverNightsPerMonth - allowance.nightsUsed
                  : 0;
                return (
                  <>
                    {propertySelect}
                    <Field name="visitorName">Visitor’s full name</Field>
                    <Field name="phone" type="tel">
                      Visitor’s phone number
                    </Field>
                    <label>
                      Visitor’s email address <em>(optional)</em>
                      <input
                        name="visitorEmail"
                        type="email"
                        maxLength={254}
                        autoCapitalize="none"
                        spellCheck={false}
                      />
                      <small>
                        If you give it, your guest gets their own copy of the
                        pass and can check they are on the system before they
                        travel. Leave it blank and only you receive the pass.
                      </small>
                    </label>

                    <label>
                      Visitor’s identity document
                      <select
                        name="idType"
                        value={idType}
                        onChange={(e) => setIdType(e.target.value as IdType)}
                      >
                        {student && (
                          <option value="student_number">Student number</option>
                        )}
                        <option value="sa_id">South African ID number</option>
                        <option value="passport">Passport number</option>
                      </select>
                    </label>
                    <label>
                      {idType === "sa_id"
                        ? "ID number"
                        : idType === "passport"
                          ? "Passport number"
                          : "Student number"}
                      <input
                        name="idNumber"
                        required
                        maxLength={80}
                        inputMode={idType === "sa_id" ? "numeric" : "text"}
                        autoCapitalize="characters"
                        spellCheck={false}
                      />
                      <small>
                        {idType === "sa_id"
                          ? "13 digits, exactly as it appears on the document."
                          : idType === "passport"
                            ? "6 to 15 letters and digits."
                            : "Their student number, keeping any leading zeroes."}{" "}
                        Security checks this against the document your guest
                        brings.
                      </small>
                    </label>

                    <label>
                      Visit type
                      <select
                        name="visitType"
                        value={visitType}
                        onChange={(e) =>
                          setVisitType(e.target.value as VisitType)
                        }
                      >
                        <option value="daily">Day visit</option>
                        <option value="sleepover">Sleepover · one night</option>
                        <option value="extended_sleepover">
                          Extended sleepover · several nights
                        </option>
                      </select>
                    </label>
                    {visitType === "extended_sleepover" && (
                      <label>
                        Number of nights
                        <input
                          name="nights"
                          type="number"
                          required
                          min={2}
                          max={allowance?.maxConsecutiveNights || 31}
                          step={1}
                          defaultValue={2}
                        />
                      </label>
                    )}

                    <Field name="visitDate" type="date" defaultValue={day()}>
                      {sleepover ? "Arrival date" : "Visit date"}
                    </Field>
                    <div className="sp-two-col">
                      <Field
                        name="arrival"
                        type="time"
                        defaultValue={sleepover ? "18:00" : "09:00"}
                      >
                        Arrival (SAST)
                      </Field>
                      <Field
                        name="departure"
                        type="time"
                        defaultValue={sleepover ? "09:00" : "18:00"}
                      >
                        {sleepover
                          ? "Departure, final day"
                          : "Departure (SAST)"}
                      </Field>
                    </div>

                    {allowance && (
                      <p className="sp-muted">
                        Your unit this month:{" "}
                        <strong>
                          {allowance.nightsUsed} of{" "}
                          {allowance.sleepoverNightsPerMonth}
                        </strong>{" "}
                        sleepover nights used
                        {nightsLeft > 0
                          ? ` (${nightsLeft} left)`
                          : " (none left)"}
                        , <strong>{allowance.activeGuests}</strong> of{" "}
                        {allowance.maxActiveGuests} guest passes active, and up
                        to {allowance.maxConsecutiveNights} consecutive nights
                        per sleepover. Your property manager sets these limits.
                      </p>
                    )}
                    <label>
                      Confirm with your password
                      <input
                        name="password"
                        type="password"
                        required
                        maxLength={128}
                        autoComplete="current-password"
                      />
                      <small>
                        A guest enters the building in your name, so SangoPass
                        checks it is really you asking, not someone using your
                        unlocked phone.
                      </small>
                    </label>

                    <small>
                      Share the pass only with your intended guest. It is valid
                      for one visit. Only the guard or reception can scan it.
                    </small>
                  </>
                );
              })()}

            {modal === "propertyLimits" && (
              <>
                {propertySelect}
                <label>
                  Sleepover nights per unit each month
                  <input
                    key={`nights-${selectedProperty}`}
                    name="sleepoverNightsPerMonth"
                    type="number"
                    required
                    min={0}
                    max={31}
                    step={1}
                    defaultValue={
                      state.properties.find((p) => p.id === selectedProperty)
                        ?.sleepoverNightsPerMonth ?? 8
                    }
                  />
                  <small>
                    Counted against the month a stay begins in. Set 0 to
                    disallow sleepovers entirely.
                  </small>
                </label>
                <label>
                  Longest single sleepover, in nights
                  <input
                    key={`consec-${selectedProperty}`}
                    name="maxConsecutiveNights"
                    type="number"
                    required
                    min={0}
                    max={31}
                    step={1}
                    defaultValue={
                      state.properties.find((p) => p.id === selectedProperty)
                        ?.maxConsecutiveNights ?? 3
                    }
                  />
                </label>
                <label>
                  Guest passes a unit may hold at once
                  <input
                    key={`guests-${selectedProperty}`}
                    name="maxActiveGuests"
                    type="number"
                    required
                    min={1}
                    max={20}
                    step={1}
                    defaultValue={
                      state.properties.find((p) => p.id === selectedProperty)
                        ?.maxActiveGuests ?? 2
                    }
                  />
                  <small>
                    Counts passes that are upcoming or checked in. Checked-out
                    and cancelled passes free the slot.
                  </small>
                </label>
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
                  How urgent is it?
                  <select
                    name="urgency"
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value as Urgency)}
                  >
                    <option value="emergency">Emergency</option>
                    <option value="urgent">Urgent</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                  <small>{URGENCY_HELP[urgency]}</small>
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

            {modal === "ledgerEntry" && (
              <>
                <label>
                  Money in or money out
                  <select
                    name="kind"
                    value={entryKind}
                    onChange={(e) => setEntryKind(e.target.value as LedgerKind)}
                  >
                    <option value="expense">A cost the property paid</option>
                    <option value="income">Money the property received</option>
                  </select>
                </label>
                <label>
                  Category
                  <select name="category" defaultValue="utilities">
                    {EXPENSE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                  <small>
                    {entryKind === "income"
                      ? "Rent from a unit is recorded by marking it paid in Properties, not here."
                      : "Pick the one a bookkeeper would expect."}
                  </small>
                </label>
                <label>
                  Fixed or variable
                  <select
                    name="nature"
                    value={entryNature}
                    onChange={(e) =>
                      setEntryNature(e.target.value as LedgerNature)
                    }
                  >
                    <option value="fixed">{NATURE_LABELS.fixed}</option>
                    <option value="variable">{NATURE_LABELS.variable}</option>
                  </select>
                  <small>{NATURE_HELP[entryNature]}</small>
                </label>
                <Field name="description">What was it for?</Field>
                <Field name="amount" type="number">
                  Amount (ZAR)
                </Field>
                <label>
                  Month
                  <select name="period" defaultValue={period}>
                    {periods
                      .filter((option) => option <= currentPeriod())
                      .map((option) => (
                        <option key={option} value={option}>
                          {periodLabel(option)}
                        </option>
                      ))}
                  </select>
                  <small>
                    The month the money moved, which is not always the month you
                    are recording it in.
                  </small>
                </label>
                <label>
                  Property <em>(optional)</em>
                  <select name="propertyId" defaultValue="">
                    <option value="">Across the organisation</option>
                    {openProperties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {modal === "propertyUpdate" && (
              <>
                <input type="hidden" name="id" value={selectedProperty} />
                <Field
                  name="name"
                  defaultValue={editingProperty?.name}
                  key={`name-${selectedProperty}`}
                >
                  Property name
                </Field>
                <Field
                  name="address"
                  defaultValue={editingProperty?.address}
                  key={`address-${selectedProperty}`}
                >
                  Street address & city
                </Field>
                <label>
                  Property type
                  <select
                    name="type"
                    key={`type-${selectedProperty}`}
                    defaultValue={editingProperty?.type}
                  >
                    <option value="apartment">
                      Apartments / residential estate
                    </option>
                    <option value="student_accommodation">
                      Student accommodation
                    </option>
                  </select>
                  <small>
                    Changing this changes what future residents are enrolled
                    with and which identity documents their guests may present.
                    Residents already enrolled keep the usernames they have.
                  </small>
                </label>
              </>
            )}
            {modal === "unitUpdate" && (
              <>
                <input type="hidden" name="id" value={editing} />
                <Field
                  name="label"
                  defaultValue={editingUnit?.label}
                  key={`label-${editing}`}
                >
                  Unit / room number
                </Field>
                <Field
                  name="rent"
                  type="number"
                  defaultValue={(editingUnit?.rentCents ?? 0) / 100}
                  key={`rent-${editing}`}
                >
                  Monthly rent (ZAR)
                </Field>
                <small>
                  The new rent applies from now on. Rent already received keeps
                  the amount it was received at, so past months do not move.
                </small>
              </>
            )}
            {modal === "contractor" && (
              <>
                <Field name="name">Name</Field>
                <label>
                  Trade
                  <select name="trade">
                    {TRADES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  In-house or contractor
                  <select name="kind">
                    <option value="contractor">Outside contractor</option>
                    <option value="in_house">In-house staff</option>
                  </select>
                </label>
                <Field name="company" required={false}>
                  Company <em>(optional)</em>
                </Field>
                <Field name="phone" type="tel">
                  Phone number
                </Field>
                <Field name="email" type="email" required={false}>
                  Email <em>(optional)</em>
                </Field>
                <Field name="notes" required={false}>
                  Notes <em>(optional)</em>
                </Field>
                <small>
                  A contact card only. Nobody signs in with this and it grants
                  no access.
                </small>
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
            {pass.entryCode && (
              <div className="sp-gate-code">
                <span className="sp-eyebrow">GATE CODE · NO PHONE NEEDED</span>
                <strong>{formatEntryCode(pass.entryCode)}</strong>
                <small>
                  {tenant
                    ? "Texted to your guest. If it does not arrive, read it to them — with their identity document, it is all they need at the gate."
                    : "The visitor presents this at the gate when they have no phone to scan."}
                </small>
                <div className="sp-gate-code-actions">
                  <button
                    className="sp-light"
                    onClick={() => void copy(formatEntryCode(pass.entryCode))}
                  >
                    <Copy size={15} />
                    Copy code
                  </button>
                </div>
              </div>
            )}
            <p>
              {pass.nights > 0 ? (
                <>
                  Arrive {pass.visitDate} · {pass.arrival}
                  <br />
                  Leave {pass.endDate} · {pass.departure} SAST
                  <br />
                  {pass.nights} {pass.nights === 1 ? "night" : "nights"}
                </>
              ) : (
                <>
                  {pass.visitDate} · {pass.arrival}–{pass.departure} SAST
                  <br />
                  Day visit
                </>
              )}
            </p>
            <p className="sp-muted">
              {pass.idNumber
                ? `${idLabel(pass.idType)} ${pass.idNumber}`
                : "Identity not recorded"}
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
            {tenant && (
              <small>
                A copy has been emailed to you, and to your guest if you gave
                their address. Only the guard or reception can scan it: if your
                guest has no phone, show this pass to them yourself.
              </small>
            )}
            {notice && <p role="status">{notice}</p>}
          </div>
        </Dialog>
      )}
    </div>
  );
}
