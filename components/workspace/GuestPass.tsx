"use client";
import { QRCodeSVG } from "qrcode.react";
import { BadgeCheck, CalendarClock, Moon, Sun, XCircle } from "lucide-react";
import Brand from "@/components/ui/Brand";
import { formatEntryCode } from "@/lib/shared/passcode";
import type { IdType, VisitType } from "@/types/workspace";

const ID_LABELS: Record<IdType, string> = {
  sa_id: "SA ID number",
  passport: "Passport",
  student_number: "Student number",
};

export interface GuestPassView {
  visitorName: string;
  propertyName: string;
  reference: string;
  token: string;
  /** The gate code. Empty on a pass issued before entry codes existed. */
  entryCode: string;
  idType: IdType;
  /** Already masked by the server; only the last four characters. */
  idNumber: string;
  visitType: VisitType;
  visitDate: string;
  endDate: string;
  arrival: string;
  departure: string;
  nights: number;
  status: string;
}

function nightsLabel(nights: number) {
  return `${nights} ${nights === 1 ? "night" : "nights"}`;
}

export default function GuestPass({
  pass,
  expired,
}: {
  expired: boolean;
  pass: GuestPassView;
}) {
  const sleepover = pass.visitType !== "daily";
  const live = !expired && pass.status === "upcoming";
  const admitted = pass.status === "checked_in";
  const cancelled = pass.status === "cancelled";

  const headline = cancelled
    ? "This visit was cancelled"
    : expired && pass.status === "upcoming"
      ? "This pass has expired"
      : pass.status === "checked_out"
        ? "Visit complete"
        : admitted
          ? "You are checked in"
          : "You are registered";

  const explanation = cancelled
    ? "Your host cancelled this visit. Ask them to send you a new pass."
    : expired && pass.status === "upcoming"
      ? "The visit window has passed. Ask your host for a new pass if you still need to visit."
      : pass.status === "checked_out"
        ? "You have been checked out. Thank you for visiting."
        : admitted
          ? "Security has admitted you. Keep this pass until you check out."
          : "Your host has registered you and security can see your booking. Show this pass at the gate.";

  return (
    <main id="main-content" className="sp-shell sp-guest-page">
      <article
        className="sp-panel sp-pass"
        style={{ width: "100%", maxWidth: 420 }}
      >
        <Brand />
        <span className="sp-eyebrow">YOUR PERSONAL VISITOR PASS</span>

        <p
          className={cancelled || (expired && !admitted) ? "sp-error" : ""}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 600,
            margin: 0,
          }}
        >
          {cancelled || (expired && pass.status === "upcoming") ? (
            <XCircle size={18} aria-hidden />
          ) : (
            <BadgeCheck size={18} aria-hidden />
          )}
          {headline}
        </p>

        <h1 style={{ fontSize: 28 }}>{pass.visitorName}</h1>
        <p>{pass.propertyName}</p>

        <p className="sp-muted" style={{ margin: 0 }}>
          {ID_LABELS[pass.idType]}{" "}
          {pass.idNumber ? (
            <strong style={{ letterSpacing: 1 }}>{pass.idNumber}</strong>
          ) : (
            <em>not recorded</em>
          )}
        </p>

        <p
          className="sp-muted"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: 0,
          }}
        >
          {sleepover ? (
            <Moon size={16} aria-hidden />
          ) : (
            <Sun size={16} aria-hidden />
          )}
          {sleepover
            ? `Sleepover · ${nightsLabel(pass.nights)}`
            : "Day visit"}
        </p>

        {live ? (
          <QRCodeSVG
            value={`SANGOPASS-LIVE:${pass.reference}:${pass.token}`}
            size={220}
            level="M"
          />
        ) : (
          <span className="sp-badge">
            {expired && pass.status === "upcoming"
              ? "Expired"
              : pass.status.replaceAll("_", " ")}
          </span>
        )}

        <strong>{pass.reference}</strong>

        {/*
          The whole reason this exists: a guest who arrives without a
          smartphone has nothing to scan. The code is theirs to say out loud,
          so it is set as large as the QR and never abbreviated.
        */}
        {live && pass.entryCode && (
          <div className="sp-gate-code">
            <span className="sp-eyebrow">GATE CODE · NO PHONE NEEDED</span>
            <strong>{formatEntryCode(pass.entryCode)}</strong>
            <small>
              Give this code and your identity document at the gate. It works
              on its own — you do not have to show anything on a screen.
            </small>
          </div>
        )}

        <p
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            justifyContent: "center",
          }}
        >
          <CalendarClock size={16} aria-hidden style={{ marginTop: 4 }} />
          <span>
            Arrive {pass.visitDate} · {pass.arrival}
            <br />
            {sleepover ? `Leave ${pass.endDate} · ` : "Leave by "}
            {pass.departure} SAST
          </span>
        </p>

        <small>{explanation}</small>
        <small>
          Bring the identity document your host registered for you. Keep this
          link private: anyone holding it can see this pass.
        </small>

        <button className="sp-primary" onClick={() => window.print()}>
          Print / save as PDF
        </button>
        <small>A better welcome, every day.</small>
      </article>
    </main>
  );
}
