"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import Brand from "@/components/ui/Brand";
import { ArrowUpRight } from "lucide-react";
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
  CreditCard,
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
        { label: "Overview", href: dashboardHref, icon: LayoutDashboard },
        {
          label: "Invite Visitor",
          href: `${dashboardHref}#invite-visitor`,
          icon: UserPlus,
        },
        {
          label: "Visitor History",
          href: `${dashboardHref}#history`,
          icon: History,
        },
      ];
    case "security":
      return [
        { label: "Overview", href: dashboardHref, icon: LayoutDashboard },
        {
          label: "Scan QR Code",
          href: `${dashboardHref}#scan-qr`,
          icon: ScanLine,
        },
        {
          label: "Manual Search",
          href: `${dashboardHref}#manual-search`,
          icon: Search,
        },
      ];
    case "manager":
      return [
        { label: "Overview", href: dashboardHref, icon: LayoutDashboard },
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
          label: "Residents & staff",
          href: "/dashboard/manager/tenants-staff",
          icon: Users,
        },
        {
          label: "Reports & requests",
          href: "/dashboard/manager/reports",
          icon: History,
        },
        {
          label: "Billing & Plan",
          href: "/dashboard/manager/billing",
          icon: CreditCard,
        },
      ];
    case "admin":
      return [
        { label: "Overview", href: dashboardHref, icon: LayoutDashboard },
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

  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [isOpen, onClose]);
  const content = (mobile = false) => (
    <div className="sidebar-inner">
      <div className="sidebar-brand">
        <Link href="/" aria-label="SangoPass home">
          <Brand light />
        </Link>
        {mobile && (
          <button
            ref={closeRef}
            onClick={onClose}
            className="p-1 text-white"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        )}
      </div>
      <div className="workspace-card">
        <span className="workspace-icon">
          <Building2 size={18} />
        </span>
        <div>
          <strong>
            {role === "admin"
              ? "SangoPass platform"
              : role === "manager"
                ? "Demo property portfolio"
                : "Riverside Residence"}
          </strong>
          <small>
            {role === "admin" ? "All organisations" : "Demo workspace"}
          </small>
        </div>
      </div>
      <p className="sidebar-caption">WORKSPACE</p>
      <nav className="sidebar-nav" aria-label="Workspace navigation">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== dashboardHref && pathname.startsWith(href + "/"));
          return (
            <Link
              key={label}
              href={href}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={"sidebar-link" + (active ? " active" : "")}
            >
              <Icon />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-help">
          <strong>A better everyday starts here.</strong>
          <p>Explore a workspace built around your role in the community.</p>
          <Link href="/demo">
            Explore another role <ArrowUpRight size={13} />
          </Link>
        </div>
        <div className="sidebar-user">
          <span className="avatar">
            {role === "tenant"
              ? "TM"
              : role === "security"
                ? "ST"
                : role === "admin"
                  ? "SA"
                  : "PM"}
          </span>
          <div>
            <strong>{ROLE_LABELS[role]}</strong>
            <small>SangoPass demo</small>
          </div>
        </div>
      </div>
    </div>
  );
  return (
    <>
      <aside className="app-sidebar desktop hidden">{content()}</aside>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const items =
              event.currentTarget.querySelectorAll<HTMLElement>(
                "a[href],button",
              );
            const first = items[0],
              last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
        >
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="app-sidebar absolute inset-y-0 left-0 w-[min(280px,85vw)] overflow-y-auto shadow-xl">
            {content(true)}
          </aside>
        </div>
      )}
    </>
  );
}
