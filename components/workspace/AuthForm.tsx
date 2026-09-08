"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Brand from "@/components/ui/Brand";
export default function AuthForm({
  mode,
  token = "",
}: {
  mode: "login" | "register" | "join";
  token?: string;
}) {
  const router = useRouter();
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
      router.push("/workspace");
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
          <span className="sp-eyebrow">A better way to belong</span>
          <h1>
            {mode === "login"
              ? "Welcome home."
              : mode === "join"
                ? "Your community awaits."
                : "Make room for better."}
          </h1>
          <p>
            {mode === "login"
              ? "Sign in to your SangoPass workspace."
              : mode === "join"
                ? "Accept your invitation using the email your manager invited. Already have an account? Use your existing password."
                : "Bring your properties, people and access together. Start with a 14-day trial, no card required."}
          </p>
          <form onSubmit={submit} className="sp-form">
            {mode !== "login" && (
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
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "login" ? undefined : 12}
                maxLength={128}
                required
              />
            </label>
            {mode !== "login" && (
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
                : mode === "login"
                  ? "Sign in"
                  : mode === "join"
                    ? "Join your organisation"
                    : "Create your workspace"}
            </button>
          </form>
          <p>
            {mode === "login" ? (
              <>
                New to SangoPass?{" "}
                <Link href="/register">Create a workspace</Link>
              </>
            ) : (
              <>
                Already registered? <Link href="/login">Sign in</Link>
              </>
            )}
          </p>
          {mode === "login" && (
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
