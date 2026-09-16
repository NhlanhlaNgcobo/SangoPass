"use client";
import { useState } from "react";
import Brand from "@/components/ui/Brand";
import type { WorkspaceState } from "@/types/workspace";

/** The URL a member's dashboard asks for the company logo. */
export const logoUrl = (orgId: string, stamp: string) =>
  `/api/branding/logo?org=${encodeURIComponent(orgId)}&v=${encodeURIComponent(stamp)}`;

type Organisation = WorkspaceState["organisation"];

/**
 * The mark at the top of every dashboard: the company's own, or SangoPass.
 *
 * One component rather than two so that the preview a manager studies in the
 * Brand panel is the same code as the sidebar it is previewing. A preview that
 * is merely a close imitation is worse than none - it is a promise about what
 * everyone else will see, and it was quietly wrong before.
 *
 * Three things a plain <img> got wrong here:
 *
 *   - Shape. A logo is any proportion at all, and bounding it by height alone
 *     rendered a square badge at a third of the area of a wordmark and a tall
 *     crest as a sliver. It now fits inside a slot of one fixed size, so every
 *     shape is given the same room and none of them distorts.
 *   - Space. Letting the image set its own height moved the whole sidebar as
 *     it loaded, and moved it to a different place for each company. The slot
 *     is a fixed height whether the image has arrived, is loading, or failed.
 *   - Failure. A logo whose bytes have gone missing used to leave the broken
 *     image glyph in the corner of every dashboard in the organisation. It now
 *     falls back to the SangoPass mark, which is what the dashboard shows when
 *     there is no logo anyway.
 */
export default function OrgLogo({
  organisation,
  orgId,
  show,
}: {
  organisation: Organisation;
  orgId: string;
  /** False in the demo, and for an organisation that has not uploaded one. */
  show: boolean;
}) {
  const stamp = organisation.logoUpdatedAt;
  const [broken, setBroken] = useState("");

  if (!show || !stamp || broken === stamp) return <Brand light />;

  const { logoWidth: width, logoHeight: height } = organisation;
  return (
    <span
      className={`sp-logo-plate ${organisation.logoPlate ? "is-plated" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="sp-org-logo"
        src={logoUrl(orgId, stamp)}
        alt={organisation.name}
        // The image's own proportions, so the browser knows the shape of the
        // box before a byte of it arrives. Absent for a logo uploaded before
        // the product measured them, where the slot alone holds the space.
        {...(width > 0 && height > 0 ? { width, height } : {})}
        onError={() => setBroken(stamp)}
        /*
          onError alone is not enough. The browser starts fetching from the
          server-rendered markup, so a logo whose file has gone missing fails
          long before React has hydrated and attached that handler - and the
          event, having no listener, is simply lost. Every dashboard in the
          organisation then carries a broken-image glyph where the company
          mark should be.

          An image that has finished with no width is one that failed, so the
          outcome is read here rather than waited for.
        */
        ref={(node) => {
          if (node?.complete && node.naturalWidth === 0) setBroken(stamp);
        }}
      />
    </span>
  );
}
