"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import Brand from "@/components/ui/Brand";
export default function RecoveryForm({ token }: { token?: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${token ? "reset" : "forgot"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(new FormData(e.currentTarget)),
          token,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to connect.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      id="main-content"
      className="sp-shell"
      style={{ display: "grid", placeItems: "center", padding: 24 }}
    >
      <section
        className="sp-panel"
        style={{ maxWidth: 440, width: "100%", padding: 32 }}
      >
        <Brand />
        <h1 style={{ fontSize: 28, marginTop: 28 }}>A fresh start.</h1>
        {done ? (
          <p style={{ margin: "20px 0" }} role="status">
            {token
              ? "Your password has been changed. Sign in with your new password."
              : "If an account exists for that email, we’ll send a private recovery link."}
          </p>
        ) : (
          <form className="sp-form" onSubmit={submit}>
            <label>
              {token
                ? "New password (at least 12 characters)"
                : "Your email address"}
              <input
                name={token ? "password" : "email"}
                type={token ? "password" : "email"}
                autoComplete={token ? "new-password" : "email"}
                minLength={token ? 12 : undefined}
                maxLength={token ? 128 : 254}
                required
              />
            </label>
            {error && (
              <p className="sp-error" role="alert">
                {error}
              </p>
            )}
            <button disabled={busy} className="sp-primary">
              {busy
                ? "Please wait…"
                : token
                  ? "Save new password"
                  : "Send recovery link"}
            </button>
          </form>
        )}
        <Link href="/login" className="sp-text-button">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
