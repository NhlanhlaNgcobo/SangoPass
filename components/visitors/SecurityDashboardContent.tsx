"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  CalendarCheck,
  Users,
  LogOut as CheckOutIcon,
  Search,
} from "lucide-react";
import { localDate } from "@/lib/utils/locale";
import Button from "@/components/ui/Button";
import StatCard from "@/components/dashboard/StatCard";
import LogReportButton from "@/components/reports/LogReportButton";
import ScanQrCodeButton from "@/components/visitors/ScanQrCodeButton";
import VisitorStatusBadge from "@/components/visitors/VisitorStatusBadge";
import {
  canCheckIn,
  checkInInvitation,
  checkOutInvitation,
  getDisplayStatus,
  getInvitations,
  searchInvitations,
} from "@/lib/mock/visitorsStore";
import type { VisitorInvitation } from "@/types";

function todayStr(): string {
  return localDate();
}

export default function SecurityDashboardContent() {
  const [invitations, setInvitations] = useState<VisitorInvitation[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VisitorInvitation[] | null>(null);
  const [searched, setSearched] = useState(false);

  function refresh() {
    setInvitations(getInvitations());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of demo visitors from localStorage on mount
    refresh();
  }, []);

  function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResults(searchInvitations(query));
    setSearched(true);
  }

  function handleCheckIn(id: string) {
    const updated = checkInInvitation(id);
    setInvitations(updated);
    setResults((prev) =>
      prev ? prev.map((r) => updated.find((u) => u.id === r.id) ?? r) : prev,
    );
  }

  function handleCheckOut(id: string) {
    const updated = checkOutInvitation(id);
    setInvitations(updated);
    setResults((prev) =>
      prev ? prev.map((r) => updated.find((u) => u.id === r.id) ?? r) : prev,
    );
  }

  const today = todayStr();
  const expectedToday = invitations.filter((i) => i.visitDate === today);
  const currentlyInside = invitations.filter(
    (i) => getDisplayStatus(i) === "checked_in",
  );
  const checkedOutToday = invitations.filter(
    (i) =>
      i.status === "checked_out" &&
      i.checkedOutAt &&
      localDate(new Date(i.checkedOutAt)) === today,
  );

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Welcome to your gate desk.
          </h1>
          <p className="text-sm text-slate-500">
            Verify and manage visitors at your assigned property.
          </p>
        </div>
        <div id="scan-qr" className="flex scroll-mt-6 flex-wrap gap-3">
          <LogReportButton role="security" />
          <ScanQrCodeButton
            onVerified={(invitation) => {
              setQuery(invitation.referenceNumber);
              setResults([invitation]);
              setSearched(true);
              refresh();
            }}
          />
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Expected Today"
          value={String(expectedToday.length)}
          icon={CalendarCheck}
        />
        <StatCard
          title="Currently Inside"
          value={String(currentlyInside.length)}
          icon={Users}
        />
        <StatCard
          title="Checked Out Today"
          value={String(checkedOutToday.length)}
          icon={CheckOutIcon}
        />
      </div>

      <section
        id="manual-search"
        className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5"
      >
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-blue-600" />
          <h2 className="font-semibold text-slate-900">Manual Search</h2>
        </div>
        <p className="mb-5 text-sm text-slate-500">
          Find the invitation, confirm the visitor’s details, then check them
          in. Record check-out when they leave.
        </p>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            aria-label="Search visitor invitations"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by visitor name, phone, or reference number"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <Button type="submit">Search</Button>
        </form>

        {searched && (
          <div className="mt-4">
            {results && results.length === 0 ? (
              <p className="text-sm text-slate-500">
                No matching invitation found. Check the spelling or try a
                different reference number.
              </p>
            ) : (
              <div className="space-y-3">
                {results?.map((invitation) => {
                  const status = getDisplayStatus(invitation);
                  return (
                    <div
                      key={invitation.id}
                      className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {invitation.visitorName}
                        </p>
                        <p className="text-sm text-slate-500">
                          Visiting {invitation.tenantName} ·{" "}
                          {invitation.unitNumber}, {invitation.propertyName}
                        </p>
                        <p className="text-sm text-slate-500">
                          Valid {invitation.visitDate}{" "}
                          {invitation.expectedArrival}–
                          {invitation.expectedDeparture} · Ref{" "}
                          {invitation.referenceNumber}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <VisitorStatusBadge status={status} />
                        {status === "upcoming" && (
                          <Button
                            disabled={!canCheckIn(invitation)}
                            title={
                              !canCheckIn(invitation)
                                ? "Check-in is available during the scheduled visit time (SAST)"
                                : undefined
                            }
                            onClick={() => handleCheckIn(invitation.id)}
                          >
                            Check In
                          </Button>
                        )}
                        {status === "checked_in" && (
                          <Button
                            variant="secondary"
                            onClick={() => handleCheckOut(invitation.id)}
                          >
                            Check Out
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
