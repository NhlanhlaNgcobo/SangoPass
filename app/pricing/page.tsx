import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Brand from "@/components/ui/Brand";
import PricingCards from "@/components/marketing/PricingCards";
export const metadata = { title: "Pricing | SangoPass" };
export default function PricingPage() {
  return (
    <div className="marketing min-h-screen">
      <header className="marketing-header">
        <Link href="/">
          <Brand />
        </Link>
        <Link href="/login" className="link-button dark">
          Explore the demo
        </Link>
      </header>
      <main id="main-content" className="marketing-width marketing-section">
        <Link href="/" className="text-link mb-10">
          <ArrowLeft size={16} /> Back to home
        </Link>
        <p className="eyebrow">GOOD LIVING. CLEAR PRICING.</p>
        <h1 className="mb-5 text-4xl font-medium sm:text-5xl">
          A plan for your kind of community.
        </h1>
        <p className="mb-10 max-w-xl text-sm leading-7 text-slate-500">
          From your first residence to a growing property portfolio. Choose the
          space and support your team needs.
        </p>
        <PricingCards />
        <div className="pricing-faq">
          <h2>Your questions, answered.</h2>
          {[
            [
              "What counts as a unit?",
              "A unit is a managed room or apartment. Choose a plan based on the total units in your organisation’s properties.",
            ],
            [
              "Does each resident need a paid seat?",
              "The listed seat limits apply to property managers. Residents and security teams have their own role-based experiences.",
            ],
            [
              "Can I try SangoPass before signing up?",
              "Yes. Explore the resident, security, property manager and platform admin workspaces using sample data. No card or account is needed for the demo.",
            ],
            [
              "Will selecting a plan charge me?",
              "No. Plan selection currently changes your demo workspace only. Live checkout will be available when payment processing is connected.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </main>
      <footer className="marketing-footer marketing-width">
        <Brand />
        <span>© {new Date().getFullYear()} SangoPass</span>
      </footer>
    </div>
  );
}
