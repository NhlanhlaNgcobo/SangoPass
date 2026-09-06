import Link from "next/link";
import { ShieldCheck, QrCode, ClipboardList } from "lucide-react";
import Button from "@/components/ui/Button";

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            <span className="text-lg font-semibold tracking-tight">
              GatePass
            </span>
          </div>
          <Link href="/login">
            <Button>Log in</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Know who comes and goes.
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            GatePass replaces paper visitor books, WhatsApp messages, and
            spreadsheets with a simple digital visitor management system for
            student accommodations, apartments, and residential complexes.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/login">
              <Button className="px-6 py-3 text-base">Get started</Button>
            </Link>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 sm:grid-cols-3">
            <div className="flex flex-col items-start gap-3">
              <span className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
                <ClipboardList className="h-5 w-5" />
              </span>
              <h3 className="font-semibold text-slate-900">
                Invite visitors
              </h3>
              <p className="text-sm text-slate-600">
                Tenants create a visitor invitation in seconds and send a
                digital pass automatically.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <span className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
                <QrCode className="h-5 w-5" />
              </span>
              <h3 className="font-semibold text-slate-900">
                Scan at the gate
              </h3>
              <p className="text-sm text-slate-600">
                Security scans a QR code or searches manually to verify and
                check visitors in.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <span className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <h3 className="font-semibold text-slate-900">
                Full visibility
              </h3>
              <p className="text-sm text-slate-600">
                Property managers get a complete, accountable record of
                every visitor&apos;s activity.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-6">
        <p className="text-center text-sm text-slate-500">
          &copy; {new Date().getFullYear()} GatePass
        </p>
      </footer>
    </div>
  );
}
