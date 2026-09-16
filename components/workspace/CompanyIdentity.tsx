"use client";
import { useRef, useState, type FormEvent } from "react";
import { Check, ImageUp, Trash2 } from "lucide-react";
import OrgLogo from "./OrgLogo";
import type { WorkspaceState } from "@/types/workspace";

export { logoUrl } from "./OrgLogo";

/**
 * The company's name and logo, above the colours.
 *
 * The name is what everyone in the organisation sees in their account
 * switcher, and the logo replaces the SangoPass mark at the top of every
 * dashboard in it - so both are saved for everyone, exactly as the colours
 * are, and the panel says so before anyone presses anything.
 *
 * The preview is the sidebar's own component on the sidebar's own colour, at
 * the sidebar's own width. A manager choosing a logo is really asking one
 * question - what will my residents see? - and anything less than the real
 * thing answers it wrongly.
 */
export default function CompanyIdentity({
  state,
  busy,
  demo,
  onSaveName,
  onRemoveLogo,
  onPlate,
  onUploaded,
  onError,
}: {
  state: WorkspaceState;
  busy: boolean;
  demo: boolean;
  onSaveName: (name: string) => void;
  onRemoveLogo: () => void;
  onPlate: (plate: boolean) => void;
  onUploaded: (next: WorkspaceState) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(state.organisation.name);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const organisation = state.organisation;
  const orgId = state.membership.orgId;
  const stamp = organisation.logoUpdatedAt;
  const renamed = name.trim() !== organisation.name && name.trim() !== "";
  const { logoWidth: width, logoHeight: height } = organisation;

  /**
   * What the manager will notice about their own file, in their words.
   *
   * Said because the shape of a logo decides how much of the sidebar it can
   * fill, and a manager who uploads a square badge and finds it smaller than
   * they expected deserves to know why rather than to assume it is broken.
   */
  function shapeNote(): string | null {
    if (!width || !height) return null;
    const ratio = width / height;
    if (ratio >= 2.2)
      return `${width} × ${height} — a wide mark, which fills the space best.`;
    if (ratio >= 1.25)
      return `${width} × ${height} — a landscape mark, which sits comfortably.`;
    if (ratio > 0.8)
      return `${width} × ${height} — close to square, so it shows smaller than a wide logo would. A version with the name beside the symbol would fill the space.`;
    return `${width} × ${height} — taller than it is wide, so it shows narrow. A version laid out sideways would fill the space.`;
  }

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

  const note = shapeNote();

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
          <span className="sp-identity-caption">How everyone sees it</span>
          {/*
            The sidebar, at its real width and on the real colour, rather than
            a chip that suggests one. The same component draws both.
          */}
          <div
            className="sp-identity-chip"
            style={{ background: organisation.theme.primary }}
          >
            <div className="sp-brand-link">
              <OrgLogo organisation={organisation} orgId={orgId} show={!demo} />
            </div>
          </div>
          {note && <small className="sp-identity-shape">{note}</small>}
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
              PNG, JPEG or WebP, under 2 MB, at least 48 pixels on its shorter
              side. A wide logo on a transparent background fills the space
              best.
            </small>
          </label>

          {/*
            Offered only once there is a logo to seat, and defaulted on upload
            from whether the file can carry transparency at all. A logo drawn
            in dark ink vanishes against a dark brand colour, and one exported
            flat on white shows as a slab - and the file cannot tell us which
            of those it is, so the person who owns it says.
          */}
          {stamp && (
            <fieldset className="sp-logo-backing">
              <legend>How it sits</legend>
              <div className="sp-choice-row">
                <label
                  className={`sp-choice ${organisation.logoPlate ? "" : "is-chosen"}`}
                >
                  <input
                    type="radio"
                    name="logo-backing"
                    checked={!organisation.logoPlate}
                    disabled={busy || uploading}
                    onChange={() => onPlate(false)}
                  />
                  <span>
                    <strong>Straight on your colour</strong>
                    <small>For a logo on a transparent background.</small>
                  </span>
                </label>
                <label
                  className={`sp-choice ${organisation.logoPlate ? "is-chosen" : ""}`}
                >
                  <input
                    type="radio"
                    name="logo-backing"
                    checked={organisation.logoPlate}
                    disabled={busy || uploading}
                    onChange={() => onPlate(true)}
                  />
                  <span>
                    <strong>On a light plate</strong>
                    <small>
                      For a dark logo, or one with a white background.
                    </small>
                  </span>
                </label>
              </div>
            </fieldset>
          )}
        </div>
      </div>
    </section>
  );
}
