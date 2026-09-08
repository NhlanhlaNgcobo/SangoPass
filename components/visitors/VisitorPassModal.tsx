"use client";

import { useDialog } from "@/lib/utils/useDialog";

import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { encodePass } from "@/lib/utils/visitorPass";
import { downloadPass } from "@/lib/utils/downloadPass";
import { QRCodeSVG } from "qrcode.react";
import { X } from "lucide-react";
import Brand from "@/components/ui/Brand";
import VisitorStatusBadge from "@/components/visitors/VisitorStatusBadge";
import { getDisplayStatus } from "@/lib/mock/visitorsStore";
import type { VisitorInvitation } from "@/types";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function VisitorPassModal({
  invitation,
  onClose,
}: {
  invitation: VisitorInvitation;
  onClose: () => void;
}) {
  const status = getDisplayStatus(invitation);
  const qr = useRef<SVGSVGElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!qr.current) return;
    setBusy(true);
    try {
      await downloadPass(qr.current, invitation);
      setMessage("Your pass is ready to share.");
    } catch {
      setMessage("Could not download the pass. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `SangoPass visitor invitation\n${invitation.visitorName}\n${invitation.propertyName}, ${invitation.unitNumber}\n${invitation.visitDate} ${invitation.expectedArrival}–${invitation.expectedDeparture} SAST\nReference: ${invitation.referenceNumber}`,
      );
      setMessage("Visit details copied.");
    } catch {
      setMessage("Copy is unavailable. Download your pass to share it.");
    }
  }

  const dialog = useDialog(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        {...dialog}
        aria-label="SangoPass visitor pass"
        className="relative max-h-[90dvh] overflow-y-auto w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-100"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 flex items-center justify-center gap-2">
          <Brand />
        </div>

        <h2 className="text-center text-xl font-bold text-slate-900">
          {invitation.visitorName}
        </h2>
        <div className="mt-1 flex justify-center">
          <VisitorStatusBadge status={status} />
        </div>

        <dl className="pass-details mt-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Visiting</dt>
            <dd className="font-medium text-slate-900">
              {invitation.tenantName}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Unit</dt>
            <dd className="font-medium text-slate-900">
              {invitation.unitNumber}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Property</dt>
            <dd className="font-medium text-slate-900">
              {invitation.propertyName}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Date</dt>
            <dd className="font-medium text-slate-900">
              {formatDate(invitation.visitDate)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Valid</dt>
            <dd className="font-medium text-slate-900">
              {invitation.expectedArrival} – {invitation.expectedDeparture}
            </dd>
          </div>
        </dl>

        <div className="my-5 flex justify-center rounded-lg bg-slate-50 p-4">
          <QRCodeSVG
            ref={qr}
            value={encodePass(invitation)}
            marginSize={4}
            size={160}
            fgColor="#143e35"
            bgColor="#f6f7f3"
          />
        </div>

        <p className="text-center text-sm text-slate-500">Reference</p>
        <p className="text-center text-lg font-semibold tracking-wide text-slate-900">
          {invitation.referenceNumber}
        </p>
        <div className="pass-actions">
          <Button onClick={save} disabled={busy}>
            {busy ? "Preparing…" : "Download pass"}
          </Button>
          <Button variant="secondary" onClick={copy}>
            Copy details
          </Button>
        </div>
        {message && (
          <p role="status" className="mt-3 text-center text-xs text-slate-500">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
