"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import TopNav from "@/components/layout/TopNav";
import { getDemoRole } from "@/lib/utils/demoAuth";
import type { Role } from "@/types";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const currentRole = getDemoRole();
    if (!currentRole) {
      router.replace("/login");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the demo role on mount
    setRole(currentRole);
  }, [router]);

  if (!role) {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        role={role}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav role={role} onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="flex-1 bg-slate-50 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
