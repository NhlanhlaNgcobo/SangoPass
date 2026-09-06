"use client";

import { useRouter } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { ROLE_LABELS, clearDemoRole } from "@/lib/utils/demoAuth";
import type { Role } from "@/types";

interface TopNavProps {
  role: Role;
  onMenuClick: () => void;
}

export default function TopNav({ role, onMenuClick }: TopNavProps) {
  const router = useRouter();

  function handleLogout() {
    clearDemoRole();
    router.push("/login");
  }

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium text-slate-500">
          {ROLE_LABELS[role]} Dashboard
        </span>
      </div>

      <button
        onClick={handleLogout}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Log out</span>
      </button>
    </header>
  );
}
