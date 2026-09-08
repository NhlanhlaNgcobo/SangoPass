"use client";
import { QRCodeSVG } from "qrcode.react";
import Brand from "@/components/ui/Brand";
export default function GuestPass({
  pass,
  expired,
}: {
  expired: boolean;
  pass: {
    visitorName: string;
    propertyName: string;
    reference: string;
    token: string;
    visitDate: string;
    arrival: string;
    departure: string;
    status: string;
  };
}) {
  return (
    <main
      id="main-content"
      className="sp-shell"
      style={{ display: "grid", placeItems: "center", padding: 24 }}
    >
      <article
        className="sp-panel sp-pass"
        style={{ width: "100%", maxWidth: 420, padding: 36 }}
      >
        <Brand />
        <span className="sp-eyebrow">YOUR PERSONAL VISITOR PASS</span>
        <h1 style={{ fontSize: 28 }}>{pass.visitorName}</h1>
        <p>{pass.propertyName}</p>
        {!expired && pass.status === "upcoming" ? (
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
        <p>
          {pass.visitDate}
          <br />
          {pass.arrival}–{pass.departure} SAST
        </p>
        <small>
          Show this pass to security on arrival. Valid for one visit during the
          stated time. Keep this link private.
        </small>
        <button className="sp-primary" onClick={() => window.print()}>
          Print / save as PDF
        </button>
        <small>A better welcome, every day.</small>
      </article>
    </main>
  );
}
