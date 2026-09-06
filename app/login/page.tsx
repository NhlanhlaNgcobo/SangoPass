"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck, User, Shield, Building2, LayoutGrid } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { setDemoRole } from "@/lib/utils/demoAuth";
import type { Role } from "@/types";

const ROLE_OPTIONS: { role: Role; label: string; icon: typeof User }[] = [
  { role: "tenant", label: "Continue as Tenant", icon: User },
  { role: "security", label: "Continue as Security", icon: Shield },
  { role: "manager", label: "Continue as Property Manager", icon: Building2 },
  { role: "admin", label: "Continue as Super Admin", icon: LayoutGrid },
];

export default function LoginPage() {
  const router = useRouter();

  function handleContinue(role: Role) {
    setDemoRole(role);
    router.push("/dashboard");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-blue-600" />
            <span className="text-xl font-semibold tracking-tight">
              GatePass
            </span>
          </Link>
          <p className="text-sm text-slate-500">
            Preview build — sign-in is not connected yet
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold text-slate-900">
            Choose a role to preview
          </h1>
          <p className="mb-6 text-sm text-slate-600">
            Real login with email and password arrives once accounts are
            connected. For now, pick a role to see its dashboard.
          </p>

          <div className="flex flex-col gap-3">
            {ROLE_OPTIONS.map(({ role, label, icon: Icon }) => (
              <Button
                key={role}
                variant="secondary"
                className="w-full justify-start"
                onClick={() => handleContinue(role)}
              >
                <Icon className="h-4 w-4 text-slate-500" />
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
