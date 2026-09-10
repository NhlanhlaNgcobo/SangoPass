import Brand from "@/components/ui/Brand";
import { BadgeCheck, CalendarClock, Clock, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { formatEntryCode } from "@/lib/shared/passcode";
import { ID_LABELS } from "@/lib/shared/identity";
import {
  KIND_LABELS,
  STANDING_LABELS,
  describeDays,
  standing,
  type RegularKind,
} from "@/lib/shared/regulars";
import type { IdType } from "@/types/workspace";

export interface RegularPassView {
  personName: string;
  occupation: string;
  employer: string;
  propertyName: string;
  unitLabel: string | null;
  kind: RegularKind;
  reference: string;
  token: string;
  entryCode: string;
  idType: IdType;
  /** Already masked by the server; only the last four characters. */
  idNumber: string;
  days: string;
  fromTime: string;
  toTime: string;
  startDate: string;
  endDate: string;
  revokedAt: string | null;
}

/**
 * The printable pass for somebody who works here.
 *
 * Its own page rather than a longer guest pass, because what it has to say is
 * different: a guest pass names one window, and this names a week, a pair of
 * hours and a date it stops working. The rest is the same on purpose - the
 * QR, the gate code and the masked document, so a guard reads one layout.
 *
 * A capability link, so it carries no phone number, no host account and all
 * but the last four characters of the identity document.
 */
export default function RegularPass({
  pass,
  today,
}: {
  pass: RegularPassView;
  today: string;
}) {
  const mark = standing(pass, today);
  const live = mark === "active";
  const code = formatEntryCode(pass.entryCode);

  return (
    <main id="main-content" className="sp-shell sp-guest-page">
      <article
        className="sp-panel sp-pass"
        style={{ width: "100%", maxWidth: 420 }}
      >
        <Brand />
        <span className={`sp-badge${live ? " success" : ""}`}>
          {STANDING_LABELS[mark]}
        </span>

        <p className="sp-eyebrow">REGULAR PASS</p>
        <h1>{pass.personName}</h1>
        <p className="sp-muted">
          {pass.occupation}
          {pass.employer ? ` · ${pass.employer}` : ""} ·{" "}
          {KIND_LABELS[pass.kind]}
        </p>
        <p className="sp-muted">
          {pass.propertyName}
          {pass.unitLabel ? ` · ${pass.unitLabel}` : ""}
        </p>

        <dl className="sp-pass-facts">
          <div>
            <dt>
              <CalendarClock size={15} aria-hidden /> Days
            </dt>
            <dd>{describeDays(pass.days)}</dd>
          </div>
          <div>
            <dt>
              <Clock size={15} aria-hidden /> Hours
            </dt>
            <dd>
              {pass.fromTime} to {pass.toTime} SAST
            </dd>
          </div>
          <div>
            <dt>Valid</dt>
            <dd>
              {pass.startDate} to {pass.endDate}
            </dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>{pass.reference}</dd>
          </div>
          <div>
            <dt>{ID_LABELS[pass.idType]}</dt>
            <dd>{pass.idNumber || "Not recorded"}</dd>
          </div>
        </dl>

        {live ? (
          <>
            <div className="sp-pass-qr">
              <QRCodeSVG
                value={`SANGOPASS-LIVE:${pass.reference}:${pass.token}`}
                size={200}
                level="M"
              />
            </div>
            {code && (
              <div className="sp-pass-code">
                <p>No phone with you? Give this code at the gate.</p>
                <strong>{code}</strong>
              </div>
            )}
            <p className="sp-muted">
              <BadgeCheck size={15} aria-hidden /> Show this to the guard or
              reception on arrival, and bring the identity document above. Only
              the guard or reception records an arrival.
            </p>
          </>
        ) : (
          <p className="sp-muted">
            <XCircle size={15} aria-hidden />{" "}
            {mark === "revoked"
              ? "This pass has been withdrawn by the office."
              : mark === "expired"
                ? `This pass ended on ${pass.endDate}. The office has to renew it.`
                : `This pass starts on ${pass.startDate}.`}
          </p>
        )}

        <p className="sp-muted sp-pass-private">
          Keep this link and code private: anyone holding them can see this
          pass.
        </p>
      </article>
    </main>
  );
}
