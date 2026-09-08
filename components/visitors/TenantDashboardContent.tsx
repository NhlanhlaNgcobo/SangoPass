"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Users, History } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import Button from "@/components/ui/Button";
import LogReportButton from "@/components/reports/LogReportButton";
import InviteVisitorModal from "@/components/visitors/InviteVisitorModal";
import VisitorPassModal from "@/components/visitors/VisitorPassModal";
import VisitorStatusBadge from "@/components/visitors/VisitorStatusBadge";
import {
  cancelInvitation,
  getDisplayStatus,
  getInvitations,
} from "@/lib/mock/visitorsStore";
import type { VisitorInvitation } from "@/types";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function VisitorRow({
  invitation,
  onCancel,
  onViewPass,
}: {
  invitation: VisitorInvitation;
  onCancel?: (id: string) => void;
  onViewPass: (invitation: VisitorInvitation) => void;
}) {
  const status = getDisplayStatus(invitation);
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-slate-900">{invitation.visitorName}</p>
        <p className="text-sm text-slate-500">
          {formatDate(invitation.visitDate)} · {invitation.expectedArrival}–
          {invitation.expectedDeparture} · {invitation.referenceNumber}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <VisitorStatusBadge status={status} />
        <Button variant="ghost" onClick={() => onViewPass(invitation)}>
          View Pass
        </Button>
        {status === "upcoming" && onCancel && (
          <Button variant="secondary" onClick={() => onCancel(invitation.id)}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="py-4 text-sm text-slate-500">{text}</p>;
}

export default function TenantDashboardContent() {
  const [invitations, setInvitations] = useState<VisitorInvitation[]>([]);
  const [passInvitation, setPassInvitation] =
    useState<VisitorInvitation | null>(null);

  function refresh() {
    setInvitations(getInvitations());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of demo visitors from localStorage on mount
    refresh();
  }, []);

  function handleCancel(id: string) {
    setInvitations(cancelInvitation(id));
  }

  const upcoming = invitations.filter(
    (i) => getDisplayStatus(i) === "upcoming",
  );
  const active = invitations.filter(
    (i) => getDisplayStatus(i) === "checked_in",
  );
  const history = invitations.filter((i) =>
    ["checked_out", "cancelled", "expired"].includes(getDisplayStatus(i)),
  );

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Welcome home, Thabo.
          </h1>
          <p className="text-sm text-slate-500">
            Riverside Student Residence · Room 101
          </p>
        </div>
        <div id="invite-visitor" className="flex scroll-mt-6 gap-3">
          <LogReportButton role="tenant" />
          <InviteVisitorModal
            onCreated={() => {
              refresh();
            }}
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          title="Upcoming visits"
          value={String(upcoming.length)}
          icon={CalendarClock}
          hint="Your next guests, all in one place"
        />
        <StatCard
          title="Currently visiting"
          value={String(active.length)}
          icon={Users}
          hint="Guests who have checked in"
        />
        <StatCard
          title="Past visits"
          value={String(history.length)}
          icon={History}
          hint="Your visitor history"
        />
      </div>
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-2 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-blue-600" />
            <h2 className="font-semibold text-slate-900">Upcoming Visitors</h2>
          </div>
          {upcoming.length === 0 ? (
            <EmptyRow text="No upcoming visitors." />
          ) : (
            upcoming.map((invitation) => (
              <VisitorRow
                key={invitation.id}
                invitation={invitation}
                onCancel={handleCancel}
                onViewPass={setPassInvitation}
              />
            ))
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-2 flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            <h2 className="font-semibold text-slate-900">Active Visitors</h2>
          </div>
          {active.length === 0 ? (
            <EmptyRow text="No visitors currently checked in." />
          ) : (
            active.map((invitation) => (
              <VisitorRow
                key={invitation.id}
                invitation={invitation}
                onViewPass={setPassInvitation}
              />
            ))
          )}
        </section>

        <section
          id="history"
          className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5"
        >
          <div className="mb-2 flex items-center gap-2">
            <History className="h-4 w-4 text-blue-600" />
            <h2 className="font-semibold text-slate-900">Visitor History</h2>
          </div>
          {history.length === 0 ? (
            <EmptyRow text="No past visits yet." />
          ) : (
            history.map((invitation) => (
              <VisitorRow
                key={invitation.id}
                invitation={invitation}
                onViewPass={setPassInvitation}
              />
            ))
          )}
        </section>
      </div>

      {passInvitation && (
        <VisitorPassModal
          invitation={passInvitation}
          onClose={() => setPassInvitation(null)}
        />
      )}
    </div>
  );
}
