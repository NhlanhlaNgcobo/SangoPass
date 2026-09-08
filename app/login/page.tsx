"use client";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  User,
  Shield,
  LayoutGrid,
} from "lucide-react";
import Brand from "@/components/ui/Brand";
import { setDemoRole } from "@/lib/utils/demoAuth";
import type { Role } from "@/types";
const roles = [
  {
    role: "manager" as Role,
    title: "Property manager",
    description: "Your properties, people and daily operations.",
    icon: Building2,
  },
  {
    role: "tenant" as Role,
    title: "Resident",
    description: "Invite a guest. Feel right at home.",
    icon: User,
  },
  {
    role: "security" as Role,
    title: "Security team",
    description: "A clear view of every arrival and departure.",
    icon: Shield,
  },
  {
    role: "admin" as Role,
    title: "Platform admin",
    description: "Oversee organisations across SangoPass.",
    icon: LayoutGrid,
  },
];
export default function LoginPage() {
  const router = useRouter();
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
          <p className="eyebrow">YOUR COMMUNITY STARTS HERE</p>
          <h1>
            Make yourself
            <br />
            at home.
          </h1>
          <p>Choose a role to explore your SangoPass workspace.</p>
          <div className="role-options">
            {roles.map(({ role, title, description, icon: Icon }) => (
              <button
                key={role}
                onClick={() => {
                  setDemoRole(role);
                  router.push("/dashboard/" + role);
                }}
              >
                <span className="feature-icon">
                  <Icon size={21} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
          <p className="demo-note">
            <span className="live-dot" /> Interactive demo · Sample data, no
            account required.
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
          preload
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
