"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const [role, setRole] = useState<Role | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const currentRole = getDemoRole();
    if (!currentRole) {
      router.replace("/login");
      return;
    }
    const requestedRole = pathname.split("/")[2];
    if (requestedRole && requestedRole !== currentRole) {
      router.replace(`/dashboard/${currentRole}`);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the demo role on mount
    setRole(currentRole);
  }, [router, pathname]);

  if (!role) {
    return (
      <main
        id="main-content"
        className="flex min-h-screen items-center justify-center text-sm text-slate-500"
        role="status"
      >
        Opening your SangoPass workspace…
      </main>
    );
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
        <main id="main-content" className="app-main flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
