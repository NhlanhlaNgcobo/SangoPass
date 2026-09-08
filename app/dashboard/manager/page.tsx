"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Users,
  LogIn,
  Clock,
  Wallet,
  ArrowUpRight,
  ArrowRight,
  Building2,
} from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import LogReportButton from "@/components/reports/LogReportButton";
import { useDemoProperties } from "@/lib/mock/propertiesStore";
import { getInvitations, getDisplayStatus } from "@/lib/mock/visitorsStore";
import { localDate } from "@/lib/utils/locale";
import type { VisitorInvitation } from "@/types";
function activity(i: VisitorInvitation) {
  return {
    time: i.checkedOutAt || i.checkedInAt || i.createdAt,
    text:
      i.visitorName +
      (i.checkedOutAt
        ? " checked out"
        : i.checkedInAt
          ? " checked in"
          : i.status === "cancelled"
            ? " cancelled their visit"
            : " was invited"),
    property: i.propertyName,
  };
}
export default function ManagerDashboardPage() {
  const properties = useDemoProperties();
  const [invitations, setInvitations] = useState<VisitorInvitation[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialise the demo visitor store
    setInvitations(getInvitations());
  }, []);
  const units = properties.flatMap((p) => p.units);
  const occupied = units.filter((u) => u.status === "occupied");
  const outstanding = occupied.filter((u) => !u.rentPaid);
  const total = outstanding.reduce((n, u) => n + (u.outstandingAmount || 0), 0);
  const today = localDate();
  const visitors = invitations.filter((i) => i.visitDate === today).length;
  const inside = invitations.filter(
    (i) => getDisplayStatus(i) === "checked_in",
  ).length;
  const pending = invitations.filter(
    (i) => getDisplayStatus(i) === "upcoming",
  ).length;
  const recent = [...invitations]
    .map(activity)
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 5);
  return (
    <div>
      <div className="dashboard-welcome">
        <div>
          <p className="eyebrow">YOUR COMMUNITY AT A GLANCE</p>
          <h1>A little clarity for your day.</h1>
          <p>
            Welcome back. Here’s what’s happening across your demo portfolio.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LogReportButton role="manager" />
          <Link
            href="/dashboard/manager/tenants-staff"
            className="link-button dark"
          >
            Manage residents <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
      <div className="mb-5 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">
          Visitor overview
        </span>
        <span className="text-[10px] text-slate-500">Today · South Africa</span>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          title="Expected today"
          value={String(visitors)}
          icon={Users}
          hint="Visitor invitations for today"
        />
        <StatCard
          title="Currently inside"
          value={String(inside)}
          icon={LogIn}
          hint="Guests checked in"
        />
        <StatCard
          title="Upcoming visits"
          value={String(pending)}
          icon={Clock}
          hint="Invitations awaiting arrival"
        />
        <StatCard
          title="Portfolio occupancy"
          value={Math.round((occupied.length / units.length) * 100) + "%"}
          icon={Building2}
          hint={occupied.length + " of " + units.length + " units occupied"}
        />
      </div>
      <div className="dashboard-grid">
        <section className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <h2>The latest in your community</h2>
              <p>Recent visitor activity</p>
            </div>
            <Link href="/dashboard/manager/visitors">
              View all <ArrowUpRight size={13} />
            </Link>
          </div>
          {recent.length ? (
            recent.map((entry, i) => (
              <div className="activity-row" key={entry.text + entry.time}>
                <span
                  className="avatar"
                  style={{ background: i % 2 ? "#f0eddf" : "#eaf0e1" }}
                >
                  {entry.text
                    .split(" ")
                    .slice(0, 2)
                    .map((x) => x[0])
                    .join("")}
                </span>
                <div>
                  <strong>{entry.text}</strong>
                  <small>{entry.property}</small>
                </div>
                <time dateTime={entry.time}>
                  {new Date(entry.time).toLocaleString("en-ZA", {
                    timeZone: "Africa/Johannesburg",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            ))
          ) : (
            <p className="p-6 text-sm text-slate-500">
              No activity yet. New visitor invitations will appear here.
            </p>
          )}
        </section>
        <section className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <h2>Your properties</h2>
              <p>{properties.length} demo properties, one clear view</p>
            </div>
            <Link href="/dashboard/manager/properties">
              View all <ArrowUpRight size={13} />
            </Link>
          </div>
          {properties.map((p) => (
            <Link
              href={"/dashboard/manager/properties/" + p.id}
              className="property-mini"
              key={p.id}
            >
              <Image
                src={
                  p.propertyType === "apartment"
                    ? "/brand/courtyard.webp"
                    : "/brand/residence.webp"
                }
                alt="Illustrative property exterior"
                width={57}
                height={63}
              />
              <div className="min-w-0 flex-1">
                <strong>{p.name}</strong>
                <small>
                  {p.units.filter((u) => u.status === "occupied").length} /{" "}
                  {p.units.length} units occupied
                </small>
                <div className="occupancy-track">
                  <span
                    style={{
                      width:
                        (p.units.filter((u) => u.status === "occupied").length /
                          p.units.length) *
                          100 +
                        "%",
                    }}
                  />
                </div>
              </div>
              <ArrowUpRight size={14} />
            </Link>
          ))}
        </section>
      </div>
      <div className="dashboard-grid">
        <section className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <h2>Rent, without the guesswork</h2>
              <p>Sample balances across the demo portfolio</p>
            </div>
            <Wallet size={17} className="text-slate-400" />
          </div>
          <div className="grid grid-cols-2 gap-5 p-6">
            <div>
              <p className="text-[10px] text-slate-500">Residents up to date</p>
              <p className="stat-value mt-3">
                {occupied.length - outstanding.length}
                <span className="text-sm font-normal text-slate-400">
                  {" "}
                  / {occupied.length}
                </span>
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">Outstanding rent</p>
              <p className="stat-value mt-3">
                R {total.toLocaleString("en-ZA")}
              </p>
              <p className="stat-hint">
                {outstanding.length} residents with outstanding balances
              </p>
            </div>
          </div>
        </section>
        <section className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <h2>Make the next step simple</h2>
              <p>Quick links for everyday tasks</p>
            </div>
          </div>
          <div className="flex flex-col gap-4 p-6 text-xs text-slate-600">
            <Link
              className="flex justify-between"
              href="/dashboard/manager/visitors"
            >
              Review visitor invitations <ArrowRight size={15} />
            </Link>
            <Link
              className="flex justify-between"
              href="/dashboard/manager/reports"
            >
              Follow up on requests <ArrowRight size={15} />
            </Link>
            <Link
              className="flex justify-between"
              href="/dashboard/manager/billing"
            >
              Manage your organisation’s plan <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      </div>
      <div className="dashboard-banner">
        <div>
          <strong>Better spaces. Happier communities.</strong>
          <p>Keep the people and places you manage connected with SangoPass.</p>
        </div>
        <Link href="/dashboard/manager/properties">
          Explore your properties <ArrowUpRight size={16} />
        </Link>
      </div>
    </div>
  );
}
