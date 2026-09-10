"use client";
import { useRef, useState, type FormEvent } from "react";
import { Check, ImageUp, Trash2 } from "lucide-react";
import Brand from "@/components/ui/Brand";
import type { WorkspaceState } from "@/types/workspace";

/** The URL a member's dashboard asks for the company logo. */
export const logoUrl = (orgId: string, stamp: string) =>
  `/api/branding/logo?org=${encodeURIComponent(orgId)}&v=${encodeURIComponent(stamp)}`;

/**
 * The company's name and logo, above the colours.
 *
 * The name is what everyone in the organisation sees in their account
 * switcher, and the logo replaces the SangoPass mark at the top of every
 * dashboard in it - so both are saved for everyone, exactly as the colours
 * are, and the panel says so before anyone presses anything.
 */
export default function CompanyIdentity({
  state,
  busy,
  demo,
  onSaveName,
  onRemoveLogo,
  onUploaded,
  onError,
}: {
  state: WorkspaceState;
  busy: boolean;
  demo: boolean;
  onSaveName: (name: string) => void;
  onRemoveLogo: () => void;
  onUploaded: (next: WorkspaceState) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(state.organisation.name);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const orgId = state.membership.orgId;
  const stamp = state.organisation.logoUpdatedAt;
  const renamed = name.trim() !== state.organisation.name && name.trim() !== "";

  async function upload(file?: File) {
    if (!file) return;
    if (demo) {
      onError(
        "The demo keeps nothing, so there is nowhere to put a logo. Uploading works on a real account.",
      );
      return;
    }
    setUploading(true);
    try {
      const data = new FormData();
      data.set("orgId", orgId);
      data.set("file", file);
      const response = await fetch("/api/branding/logo", {
        method: "POST",
        body: data,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      onUploaded(payload.state as WorkspaceState);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Unable to upload that image.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (renamed) onSaveName(name.trim());
  }

  return (
    <section className="sp-panel">
      <div className="sp-section-head">
        <h2>Your company</h2>
      </div>
      <p className="sp-muted sp-brand-intro">
        Your name and logo sit at the top of every dashboard in{" "}
        <strong>your organisation</strong> — your residents, your security team
        and your reception desk all see them, in place of the SangoPass mark.
      </p>

      <div className="sp-identity">
        <div className="sp-identity-preview">
          <span className="sp-muted">How it appears</span>
          <div
            className="sp-identity-chip"
            style={{ background: state.organisation.theme.primary }}
          >
            {stamp ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl(orgId, stamp)}
                alt={`${state.organisation.name} logo`}
              />
            ) : (
              <Brand light />
            )}
          </div>
        </div>

        <div className="sp-identity-actions">
          <label>
            <span>Company name</span>
            <form className="sp-inline-form" onSubmit={save}>
              <input
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                aria-label="Company name"
              />
              <button className="sp-secondary" disabled={busy || !renamed}>
                <Check size={15} />
                Save name
              </button>
            </form>
          </label>

          <label>
            <span>Logo</span>
            <div className="sp-inline-form">
              <button
                type="button"
                className="sp-secondary"
                disabled={busy || uploading}
                onClick={() => input.current?.click()}
              >
                <ImageUp size={15} />
                {uploading
                  ? "Uploading…"
                  : stamp
                    ? "Replace logo"
                    : "Upload a logo"}
              </button>
              {stamp && (
                <button
                  type="button"
                  className="sp-text-button danger"
                  disabled={busy || uploading}
                  onClick={onRemoveLogo}
                >
                  <Trash2 size={15} />
                  Remove
                </button>
              )}
              <input
                ref={input}
                type="file"
                className="sr-only"
                tabIndex={-1}
                accept="image/png,image/jpeg,image/webp"
                aria-label="Company logo image"
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </div>
            <small className="sp-muted">
              PNG, JPEG or WebP, under 2 MB. A wide logo on a transparent
              background sits best against your primary colour.
            </small>
          </label>
        </div>
      </div>
    </section>
  );
}
