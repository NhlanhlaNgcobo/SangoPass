"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UserPlus,
  History,
  ScanLine,
  Search,
  Building2,
  Users,
  UserCheck,
  ShieldCheck,
  LayoutGrid,
  Activity,
  X,
  type LucideIcon,
} from "lucide-react";
import { ROLE_LABELS, getDashboardPath } from "@/lib/utils/demoAuth";
import type { NavItem, Role } from "@/types";

interface SidebarNavItem extends NavItem {
  icon: LucideIcon;
}

function getNavItems(role: Role): SidebarNavItem[] {
  const dashboardHref = getDashboardPath(role);

  switch (role) {
    case "tenant":
      return [
        { label: "Dashboard", href: dashboardHref, icon: LayoutDashboard },
        { label: "Invite Visitor", href: dashboardHref, icon: UserPlus },
        { label: "Visitor History", href: dashboardHref, icon: History },
      ];
    case "security":
      return [
        { label: "Dashboard", href: dashboardHref, icon: LayoutDashboard },
        { label: "Scan QR Code", href: dashboardHref, icon: ScanLine },
        { label: "Manual Search", href: dashboardHref, icon: Search },
      ];
    case "manager":
      return [
        { label: "Dashboard", href: dashboardHref, icon: LayoutDashboard },
        {
          label: "Properties",
          href: "/dashboard/manager/properties",
          icon: Building2,
        },
        {
          label: "Visitors",
          href: "/dashboard/manager/visitors",
          icon: UserCheck,
        },
        {
          label: "Tenants & Staff",
          href: "/dashboard/manager/tenants-staff",
          icon: Users,
        },
        {
          label: "Reports",
          href: "/dashboard/manager/reports",
          icon: History,
        },
      ];
    case "admin":
      return [
        { label: "Dashboard", href: dashboardHref, icon: LayoutDashboard },
        {
          label: "Organizations",
          href: "/dashboard/admin/organizations",
          icon: ShieldCheck,
        },
        {
          label: "Properties",
          href: "/dashboard/admin/properties",
          icon: LayoutGrid,
        },
        {
          label: "Platform Activity",
          href: "/dashboard/admin/activity",
          icon: Activity,
        },
      ];
  }
}

interface SidebarProps {
  role: Role;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ role, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const navItems = getNavItems(role);
  const dashboardHref = getDashboardPath(role);

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
          <span className="text-lg font-semibold tracking-tight">
            GatePass
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <p className="px-4 pb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        {ROLE_LABELS[role]}
      </p>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== dashboardHref && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={label}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        {content}
      </aside>

      {/* Mobile slide-over sidebar */}
      {isOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
