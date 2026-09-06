import Link from "next/link";
import {
  ShieldCheck,
  QrCode,
  ClipboardList,
  GraduationCap,
  Building2,
  ScanLine,
  Wallet,
  MessageSquarePlus,
  BarChart3,
  UserPlus,
  Send,
  DoorOpen,
  FileCheck,
} from "lucide-react";
import Button from "@/components/ui/Button";

const AUDIENCES = [
  {
    icon: GraduationCap,
    title: "Student Accommodations",
    description:
      "Manage hundreds of residents and their visitors without a paper sign-in book at reception. Reduce unauthorized access and give parents and management peace of mind.",
  },
  {
    icon: Building2,
    title: "Apartments & Complexes",
    description:
      "Give residents an easy way to invite guests, deliveries, and contractors — and give security a fast, reliable way to verify who's allowed in.",
  },
];

const HOW_IT_WORKS = [
  {
    icon: UserPlus,
    title: "Tenant invites a visitor",
    description: "A few taps — name, date, and arrival time.",
  },
  {
    icon: Send,
    title: "Visitor gets a digital pass",
    description: "Sent straight to their email with a QR code.",
  },
  {
    icon: DoorOpen,
    title: "Visitor arrives",
    description: "They show the pass at reception or the gate.",
  },
  {
    icon: ScanLine,
    title: "Security scans & checks in",
    description: "One scan verifies the invitation instantly.",
  },
  {
    icon: FileCheck,
    title: "Manager gets the full record",
    description: "Every arrival and departure, logged automatically.",
  },
];

const FEATURES = [
  {
    icon: ClipboardList,
    title: "Invite visitors",
    description:
      "Tenants create a visitor invitation in seconds and send a digital pass automatically.",
  },
  {
    icon: QrCode,
    title: "Digital QR passes",
    description:
      "Every invitation gets a secure, unique QR code — no shared links or guesswork.",
  },
  {
    icon: ScanLine,
    title: "Scan at the gate",
    description:
      "Security scans a QR code or searches manually to verify and check visitors in.",
  },
  {
    icon: Wallet,
    title: "Rent & payments",
    description:
      "Track rent paid and outstanding per tenant, with monthly, annual, or per-semester billing.",
  },
  {
    icon: MessageSquarePlus,
    title: "Maintenance & complaints",
    description:
      "Tenants and staff can log complaints, maintenance issues, or suggestions straight to management.",
  },
  {
    icon: BarChart3,
    title: "Full visibility",
    description:
      "Property managers get a complete, accountable record of every visitor and every property.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            <span className="text-lg font-semibold tracking-tight">
              GatePass
            </span>
          </div>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 sm:flex">
            <a href="#who-its-for" className="hover:text-slate-900">
              Who it&apos;s for
            </a>
            <a href="#how-it-works" className="hover:text-slate-900">
              How it works
            </a>
            <a href="#features" className="hover:text-slate-900">
              Features
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost">Log in</Button>
            </Link>
            <Link href="/login">
              <Button>Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Know who comes and goes.
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            GatePass replaces paper visitor books, WhatsApp messages, and
            spreadsheets with a simple digital visitor management system for
            student accommodations, apartments, and residential complexes.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login">
              <Button className="px-6 py-3 text-base">Get started</Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="secondary" className="px-6 py-3 text-base">
                See how it works
              </Button>
            </a>
          </div>
        </section>

        {/* Who it's for */}
        <section id="who-its-for" className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-center text-2xl font-semibold text-slate-900">
              Built for every kind of residence
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-500">
              Whether it&apos;s a 500-bed student residence or a small block
              of flats, GatePass works the same way.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {AUDIENCES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-xl border border-slate-200 p-6"
                >
                  <span className="mb-3 inline-flex rounded-lg bg-blue-50 p-2.5 text-blue-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="font-semibold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-center text-2xl font-semibold text-slate-900">
              How it works
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-500">
              From invitation to check-out, in five simple steps.
            </p>
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
              {HOW_IT_WORKS.map(({ icon: Icon, title, description }, i) => (
                <div key={title} className="flex flex-col items-start gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                      {i + 1}
                    </span>
                    <Icon className="h-4 w-4 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-slate-900">{title}</h3>
                  <p className="text-sm text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-center text-2xl font-semibold text-slate-900">
              Everything you need to run your property
            </h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex flex-col items-start gap-3">
                  <span className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="font-semibold text-slate-900">{title}</h3>
                  <p className="text-sm text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-slate-200 bg-blue-600">
          <div className="mx-auto max-w-3xl px-6 py-16 text-center">
            <h2 className="text-2xl font-semibold text-white">
              Ready to see GatePass in action?
            </h2>
            <p className="mt-2 text-blue-100">
              Get started in minutes — no paper, no spreadsheets.
            </p>
            <div className="mt-6">
              <Link href="/login">
                <Button
                  variant="secondary"
                  className="border-transparent bg-white px-6 py-3 text-base text-blue-700 hover:bg-blue-50"
                >
                  Get started
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            <span className="font-semibold text-slate-900">GatePass</span>
            <span className="text-sm text-slate-500">
              — Know who comes and goes.
            </span>
          </div>
          <p className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} GatePass
          </p>
        </div>
      </footer>
    </div>
  );
}
