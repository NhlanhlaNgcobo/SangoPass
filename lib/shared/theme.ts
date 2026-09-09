/**
 * Organisation brand colours.
 *
 * A manager picks two colours that match their company; everything else the
 * interface needs - the text that sits on top of them, the hover shade, the
 * muted sidebar tints - is derived here rather than picked, so a bad pair
 * cannot produce unreadable text. The derivation runs on the server (to
 * validate) and in the browser (to preview live before saving), so this module
 * stays free of both server and React imports.
 */

export interface BrandTheme {
  primary: string;
  accent: string;
}

/** The SangoPass forest/lime pair. Every organisation starts here. */
export const DEFAULT_THEME: BrandTheme = {
  primary: "#143E35",
  accent: "#D5ED9F",
};

export interface ThemePreset extends BrandTheme {
  id: string;
  name: string;
}

/** Starting points offered next to the custom pickers. */
export const THEME_PRESETS: ThemePreset[] = [
  { id: "sangopass", name: "SangoPass", ...DEFAULT_THEME },
  { id: "ocean", name: "Ocean", primary: "#123A5C", accent: "#9FD8ED" },
  { id: "plum", name: "Plum", primary: "#3D1F42", accent: "#E7C6F0" },
  { id: "clay", name: "Clay", primary: "#5C2D1B", accent: "#F2C9A0" },
  { id: "ink", name: "Ink", primary: "#1F2430", accent: "#C7D2E8" },
  { id: "vineyard", name: "Vineyard", primary: "#4A1D30", accent: "#F0BFC9" },
];

/**
 * Accepts "#abc", "#aabbcc" or the same without the hash, and returns the
 * canonical six-digit form. Returns null for anything else - a caller decides
 * whether that is a validation error or a reason to fall back to the default.
 */
export function normaliseHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$/.test(raw) && !/^[0-9a-fA-F]{6}$/.test(raw))
    return null;
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return `#${full.toUpperCase()}`;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
  return (
    "#" +
    rgb
      .map((c) =>
        Math.max(0, Math.min(255, Math.round(c)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_TEXT = "#FFFFFF";
const DARK_TEXT = "#132119";

/** Whichever of near-white or near-black reads better on the given colour. */
export function readableOn(background: string): string {
  return contrast(background, LIGHT_TEXT) >= contrast(background, DARK_TEXT)
    ? LIGHT_TEXT
    : DARK_TEXT;
}

/** Moves a colour towards white (positive) or black (negative) by a ratio. */
export function shade(hex: string, amount: number): string {
  const target = amount >= 0 ? 255 : 0;
  const weight = Math.abs(amount);
  return toHex(
    channels(hex).map((c) => c + (target - c) * weight) as [
      number,
      number,
      number,
    ],
  );
}

/**
 * A hover shade that stays visible in both directions: a dark brand lifts
 * towards white, a light one settles towards black.
 */
export function hoverShade(hex: string): string {
  return shade(hex, luminance(hex) < 0.4 ? 0.14 : -0.12);
}

/** Contrast of the body text each surface will carry, for the warning line. */
export function themeContrast(theme: BrandTheme) {
  return {
    primary: contrast(theme.primary, readableOn(theme.primary)),
    accent: contrast(theme.accent, readableOn(theme.accent)),
    /**
     * The accent is also used as a highlight sitting directly on the primary
     * (the active navigation pill, the hero eyebrow), so those two must be
     * distinguishable from each other as well.
     */
    pair: contrast(theme.primary, theme.accent),
  };
}

/** WCAG AA for normal text. */
export const AA = 4.5;
/** WCAG AA for large text and non-text boundaries. */
export const AA_LARGE = 3;

/**
 * True when the pair is safe to ship: text reads on both surfaces and the
 * accent is still visible against the primary it sits on.
 */
export function themeReadable(theme: BrandTheme): boolean {
  const c = themeContrast(theme);
  return c.primary >= AA && c.accent >= AA && c.pair >= AA_LARGE;
}

/**
 * The custom properties `.sp-shell` carries. Everything the workspace paints
 * with a brand colour reads one of these, so a single inline style on the
 * shell re-themes the whole dashboard.
 *
 * Accepts a missing or partial theme and falls back to the SangoPass pair:
 * this paints the entire interface, so a state that predates the theme field -
 * a demo world restored from an older session, say - must degrade to the
 * default colours rather than take the workspace down with it.
 */
export function themeVariables(
  theme: Partial<BrandTheme> | null | undefined,
): Record<string, string> {
  const { primary, accent } = resolveTheme(theme);
  return {
    "--sp-forest": primary,
    "--sp-forest-hover": hoverShade(primary),
    "--sp-on-forest": readableOn(primary),
    "--sp-lime": accent,
    // The company's own primary on its own accent looks deliberate where plain
    // black does not, so it wins whenever it is legible. That also reproduces
    // the original forest-on-lime pairing exactly for the default theme.
    "--sp-on-lime":
      contrast(accent, primary) >= AA ? primary : readableOn(accent),
  };
}

/** Falls back per field, so one bad stored value cannot blank the interface. */
export function resolveTheme(
  theme: Partial<BrandTheme> | null | undefined,
): BrandTheme {
  return {
    primary: normaliseHex(theme?.primary) || DEFAULT_THEME.primary,
    accent: normaliseHex(theme?.accent) || DEFAULT_THEME.accent,
  };
}
