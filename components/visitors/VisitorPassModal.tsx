"use client";

import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, X } from "lucide-react";
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-100"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 flex items-center justify-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            GatePass Visitor Pass
          </span>
        </div>

        <h2 className="text-center text-xl font-bold text-slate-900">
          {invitation.visitorName}
        </h2>
        <div className="mt-1 flex justify-center">
          <VisitorStatusBadge status={status} />
        </div>

        <dl className="mt-5 space-y-2 text-sm">
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
            value={`GATEPASS-PASS:${invitation.referenceNumber}:${invitation.secureToken}`}
            size={160}
          />
        </div>

        <p className="text-center text-sm text-slate-500">Reference</p>
        <p className="text-center text-lg font-semibold tracking-wide text-slate-900">
          {invitation.referenceNumber}
        </p>
      </div>
    </div>
  );
}
