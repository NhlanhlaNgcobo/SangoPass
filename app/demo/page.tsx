import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Shield,
  User,
} from "lucide-react";
import Brand from "@/components/ui/Brand";
import { PERSONAS } from "@/lib/demo/world";

export const metadata = {
  title: "Try SangoPass | Interactive demo",
  description:
    "Walk through SangoPass as a property manager, a resident or the guard at the gate. Sample data, no account needed.",
};

const ICONS = {
  manager: Building2,
  tenant: User,
  security: Shield,
} as const;

export default function DemoPage() {
  return (
    <main id="main-content" className="login-page">
      <div className="login-panel">
        <Link href="/">
          <Brand />
        </Link>
        <div className="login-content">
          <Link href="/" className="text-link">
            <ArrowLeft size={15} /> Back to home
          </Link>
          <p className="eyebrow">SEE IT WORKING</p>
          <h1>
            Step into
            <br />
            Ubuntu Living.
          </h1>
          <p>
            A sample estate with two properties, real residents and a week of
            arrivals. Pick who you are — you can switch at any time and the
            data follows you.
          </p>
          <div className="role-options">
            {PERSONAS.map((persona) => {
              const Icon = ICONS[persona.role];
              return (
                <Link key={persona.id} href={`/demo/${persona.role}`}>
                  <span className="feature-icon">
                    <Icon size={21} />
                  </span>
                  <span>
                    <strong>{persona.title}</strong>
                    <small>{persona.blurb}</small>
                  </span>
                  <ArrowUpRight size={18} />
                </Link>
              );
            })}
          </div>
          <p className="demo-note">
            <span className="live-dot" /> Everything runs in your browser.
            Nothing is saved, nothing is sent, and no account is created.
          </p>
        </div>
        <p className="login-footer">SangoPass · A better welcome, every day.</p>
      </div>
      <div className="login-visual">
        <Image
          src="/brand/student-life-sa.webp"
          alt="South African university friends chatting outside their residence"
          fill
          sizes="50vw"
          priority
          className="object-cover"
        />
        <div className="login-quote">
          <span className="eyebrow">LESS FRICTION. MORE CONNECTION.</span>
          <h2>
            Good living starts
            <br />
            at the entrance.
          </h2>
          <p>One simple place to bring your community together.</p>
        </div>
      </div>
    </main>
  );
}
