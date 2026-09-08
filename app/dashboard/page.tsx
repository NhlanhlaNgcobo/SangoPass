"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getDashboardPath, getDemoRole } from "@/lib/utils/demoAuth";

export default function DashboardRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const role = getDemoRole();
    router.replace(role ? getDashboardPath(role) : "/demo");
  }, [router]);

  return null;
}
