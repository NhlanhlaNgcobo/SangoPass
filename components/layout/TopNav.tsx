"use client";
import { useRouter, usePathname } from "next/navigation";
import { Menu, LogOut, ChevronRight, Building2 } from "lucide-react";
import { ROLE_LABELS, clearDemoRole } from "@/lib/utils/demoAuth";
import type { Role } from "@/types";
export default function TopNav({
  role,
  onMenuClick,
}: {
  role: Role;
  onMenuClick: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const segment = pathname.split("/")[3];
  const names: Record<string, string> = {
    properties: "Properties",
    "tenants-staff": "Residents & staff",
    visitors: "Visitors",
    billing: "Billing & plan",
    reports: "Reports & requests",
    organizations: "Organisations",
    activity: "Platform activity",
  };
  return (
    <header className="app-topnav">
      <div className="topnav-context">
        <button
          onClick={onMenuClick}
          className="p-1 lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <Building2 size={16} className="hidden sm:block" />
        <span>{ROLE_LABELS[role]}</span>
        <ChevronRight size={13} className="hidden sm:block" />
        <strong>{segment ? names[segment] || "Workspace" : "Overview"}</strong>
      </div>
      <div className="topnav-actions">
        <span className="demo-chip">Demo workspace</span>
        <button
          onClick={() => {
            clearDemoRole();
            router.push("/login");
          }}
          className="flex items-center gap-2 rounded-lg p-2 text-xs text-slate-500 hover:bg-slate-100"
          aria-label="Log out"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Log out</span>
        </button>
      </div>
    </header>
  );
}
