"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { InvitationDetails } from "@/lib/server/notifications";
import Brand from "@/components/ui/Brand";
export default function AuthForm({
  mode,
  token = "",
  propertyCode = "",
  invitation,
  showcase = false,
}: {
  mode: "login" | "register" | "join" | "tenant-login";
  propertyCode?: string;
  invitation?: InvitationDetails;
  token?: string;
  /** Showcase deployment: accounts are not stored, so say so up front. */
  showcase?: boolean;
}) {
  const router = useRouter();
  const isLogin = mode === "login" || mode === "tenant-login";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const input = Object.fromEntries(new FormData(event.currentTarget));
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, token }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.push(
        "/workspace" +
          (result.orgId ? "?org=" + encodeURIComponent(result.orgId) : ""),
      );
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to connect. Please try again.",
      );
      setBusy(false);
    }
  }
  return (
    <main id="main-content" className="sp-auth">
      <div className="sp-auth-form">
        <Link href="/" aria-label="SangoPass home">
          <Brand />
        </Link>
        <div className="sp-auth-inner">
          {showcase && (
            <p className="sp-showcase-note" role="status">
              This is a public demonstration of SangoPass. Accounts here are not
              stored and sign-in is switched off.{" "}
              <Link href="/demo">Open the interactive demo</Link> to see the
              whole product with sample data.
            </p>
          )}
          <span className="sp-eyebrow">A better way to belong</span>
          <h1>
            {isLogin
              ? "Welcome home."
              : mode === "join"
                ? "Your community awaits."
                : "Make room for better."}
          </h1>
          <p>
            {isLogin
              ? mode === "tenant-login"
                ? "Sign in with your assigned username, or your student number if you stay in student accommodation."
                : "Sign in to your management or security workspace."
              : mode === "join"
                ? invitation?.existingAccount
                  ? "Use your existing SangoPass password to activate this property access."
                  : "You’ve been added to your community. Create your own password to activate your account."
                : "Bring your properties, people and access together. Start with a 14-day trial, no card required."}
          </p>
          <form onSubmit={submit} className="sp-form">
            {!isLogin && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                />
              </label>
            )}
            {mode === "register" && (
              <label>
                Organisation name
                <input
                  name="organisation"
                  required
                  maxLength={120}
                  placeholder="e.g. Ubuntu Living"
                  autoComplete="organization"
                />
              </label>
            )}
            {mode === "tenant-login" ? (
              <>
                <label>
                  Property code
                  <input
                    name="propertyCode"
                    required
                    maxLength={40}
                    defaultValue={propertyCode}
                    autoComplete="organization"
                    spellCheck={false}
                  />
                </label>
                <label>
                  Username / student number
                  <input
                    name="username"
                    autoComplete="username"
                    required
                    maxLength={80}
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </label>
                <small>
                  Your welcome email includes your property code and personal
                  login link.
                </small>
              </>
            ) : (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  defaultValue={invitation?.email}
                  readOnly={Boolean(invitation)}
                />
              </label>
            )}
            {invitation && (
              <div className="sp-enrolment-summary">
                <strong>
                  {invitation.propertyName || invitation.orgName}
                  {invitation.unitLabel
                    ? " · Unit " + invitation.unitLabel
                    : ""}
                </strong>
                {invitation.username && (
                  <p>
                    Your username / student number:{" "}
                    <strong>{invitation.username}</strong>
                  </p>
                )}
                <small>
                  Your property and unit are assigned by your administrator.
                </small>
              </div>
            )}
            <label>
              {mode === "join" && !invitation?.existingAccount
                ? "Create your password"
                : "Password"}
              <input
                name="password"
                type="password"
                autoComplete={
                  isLogin || invitation?.existingAccount
                    ? "current-password"
                    : "new-password"
                }
                minLength={isLogin ? undefined : 12}
                maxLength={128}
                required
              />
            </label>
            {!isLogin && (
              <small>
                Use at least 12 characters. A memorable phrase works well.
              </small>
            )}
            {error && (
              <p role="alert" className="sp-error">
                {error}
              </p>
            )}
            <button disabled={busy} className="sp-primary">
              {busy
                ? "Please wait…"
                : isLogin
                  ? "Sign in"
                  : mode === "join"
                    ? "Join your organisation"
                    : "Create your workspace"}
            </button>
          </form>
          <p>
            {isLogin ? (
              mode === "tenant-login" ? (
                <>
                  <Link href="/login">Management & security sign in</Link>
                </>
              ) : (
                <>
                  New to SangoPass?{" "}
                  <Link href="/register">Create a workspace</Link>
                </>
              )
            ) : (
              <>
                Already registered? <Link href="/login">Sign in</Link>
              </>
            )}
          </p>
          {mode === "login" && (
            <p>
              Resident or student?{" "}
              <Link href="/tenant/login">Tenant sign in</Link>
            </p>
          )}
          {isLogin && (
            <p>
              <Link href="/forgot">Forgot your password?</Link>
            </p>
          )}
          <Link href="/demo" className="sp-subtle">
            Explore the demo first →
          </Link>
        </div>
        <small>Built for South African communities. Together, we belong.</small>
      </div>
      <div className="sp-auth-image">
        <Image
          src="/brand/community-sa.webp"
          alt="Neighbours from diverse backgrounds together in a South African residential community"
          fill
          priority
          sizes="50vw"
        />
        <div>
          <span>One community. Every welcome.</span>
          <p>From the first arrival to everyday living.</p>
        </div>
      </div>
    </main>
  );
}
