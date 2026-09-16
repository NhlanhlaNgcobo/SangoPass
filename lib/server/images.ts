/**
 * What an uploaded image actually is, read from its own first bytes.
 *
 * A browser reports a file's type from its extension, so `file.type` is a
 * claim by whoever chose the filename rather than a fact about the bytes. This
 * reads the container header instead, which gives three things the logo needs
 * and could not otherwise have:
 *
 *   - the real format, so a file that says PNG and is not one is refused at
 *     the door rather than stored and served as an image that will never draw;
 *   - the pixel dimensions, so the dashboard can reserve exactly the right box
 *     before the bytes arrive, and so a 4-pixel sliver is caught on upload
 *     rather than discovered as a smudge in the sidebar;
 *   - whether the image carries transparency, which decides on its own whether
 *     the logo should sit straight on the company's brand colour or on a plate.
 *     A logo exported flat on white looks like a mistake on a dark sidebar, and
 *     the file itself is the only thing that knows which kind it is.
 *
 * Headers only. Nothing here decodes pixels: it reads a few dozen bytes at
 * known offsets, so a hostile 2 MB file costs the same as a small one.
 */

export type ImageFormat = "png" | "jpeg" | "webp";

export interface ImageFacts {
  format: ImageFormat;
  width: number;
  height: number;
  /** True when the image can have transparent pixels. */
  alpha: boolean;
}

/** The mime each format is served and stored as. */
export const FORMAT_MIME: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const be16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const be32 = (b: Uint8Array, at: number) =>
  ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const le16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const le24 = (b: Uint8Array, at: number) =>
  b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
const le32 = (b: Uint8Array, at: number) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

const starts = (b: Uint8Array, signature: number[], at = 0) =>
  b.length >= at + signature.length &&
  signature.every((byte, i) => b[at + i] === byte);

const ascii = (b: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...b.subarray(at, at + length));

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * PNG keeps its dimensions in IHDR, which the format requires to be the first
 * chunk - so it is always at a fixed offset and never needs searching for.
 *
 * Colour types 4 and 6 are the greyscale and truecolour forms that carry an
 * alpha channel; 3 is a palette, which carries transparency in an optional
 * tRNS chunk elsewhere in the file. Rather than walk the chunks for tRNS, a
 * palette is treated as possibly transparent: guessing "no alpha" wrongly puts
 * a white slab on somebody's sidebar, and guessing "alpha" wrongly costs
 * nothing at all.
 */
function png(bytes: Uint8Array): ImageFacts | null {
  if (!starts(bytes, PNG_MAGIC) || bytes.length < 26) return null;
  if (ascii(bytes, 12, 4) !== "IHDR") return null;
  const colourType = bytes[25];
  return {
    format: "png",
    width: be32(bytes, 16),
    height: be32(bytes, 20),
    alpha: colourType === 3 || colourType === 4 || colourType === 6,
  };
}

/**
 * JPEG has no fixed header: the size lives in a start-of-frame marker that
 * sits after however many other segments the encoder chose to write, so the
 * segments have to be walked.
 *
 * JPEG has no transparency in any of its forms, which is the whole reason a
 * company's JPEG logo needs a plate behind it.
 */
function jpeg(bytes: Uint8Array): ImageFacts | null {
  if (!starts(bytes, [0xff, 0xd8])) return null;
  let at = 2;
  // Enough left for a marker and the length that follows it. Each branch
  // below guards its own deeper reads, so this only has to be enough to keep
  // walking - a stricter bound here walks past the frame in a small file.
  while (at + 3 < bytes.length) {
    // Segments are separated by any number of 0xFF padding bytes.
    if (bytes[at] !== 0xff) {
      at += 1;
      continue;
    }
    let marker = bytes[at + 1];
    let head = at + 2;
    while (marker === 0xff && head < bytes.length) {
      marker = bytes[head];
      head += 1;
    }
    // Standalone markers: no length field follows them.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      at = head;
      continue;
    }
    const length = be16(bytes, head);
    if (length < 2) return null;
    // Every SOFn carries the frame size, except the four markers that share
    // the 0xC0-0xCF range without being frames at all.
    const frame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 && // DHT, Huffman tables
      marker !== 0xc8 && // JPG, reserved
      marker !== 0xcc; // DAC, arithmetic coding conditioning
    if (frame) {
      // The frame is [length 2][precision 1][height 2][width 2], so the last
      // byte this reads is head + 6.
      if (head + 6 >= bytes.length) return null;
      return {
        format: "jpeg",
        height: be16(bytes, head + 3),
        width: be16(bytes, head + 5),
        alpha: false,
      };
    }
    at = head + length;
  }
  return null;
}

/**
 * WebP is a RIFF container with three different ways of storing a picture, and
 * the dimensions sit in a different place in each.
 */
function webp(bytes: Uint8Array): ImageFacts | null {
  if (bytes.length < 30) return null;
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP")
    return null;
  const chunk = ascii(bytes, 12, 4);

  // Extended: a header chunk states the canvas size and flags what follows.
  if (chunk === "VP8X") {
    return {
      format: "webp",
      width: le24(bytes, 24) + 1,
      height: le24(bytes, 27) + 1,
      alpha: (bytes[20] & 0x10) !== 0,
    };
  }

  // Lossless: dimensions are packed as two 14-bit fields, and the alpha flag
  // is the bit immediately above them.
  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f || bytes.length < 25) return null;
    const packed = le32(bytes, 21);
    return {
      format: "webp",
      width: (packed & 0x3fff) + 1,
      height: ((packed >>> 14) & 0x3fff) + 1,
      alpha: ((packed >>> 28) & 1) !== 0,
    };
  }

  // Lossy: a keyframe, whose start code the spec fixes at 9d 01 2a.
  if (chunk === "VP8 ") {
    if (!starts(bytes, [0x9d, 0x01, 0x2a], 23)) return null;
    return {
      format: "webp",
      width: le16(bytes, 26) & 0x3fff,
      height: le16(bytes, 28) & 0x3fff,
      alpha: false,
    };
  }
  return null;
}

/**
 * Reads what the bytes say they are, or null when they are not an image this
 * product serves.
 *
 * The caller's declared mime is deliberately not consulted. This is the only
 * opinion that matters, and comparing the two is how a mislabelled file is
 * caught.
 */
export function readImage(bytes: Uint8Array): ImageFacts | null {
  const facts = png(bytes) ?? jpeg(bytes) ?? webp(bytes);
  if (!facts) return null;
  // A header that parses but describes nothing is a corrupt file, not an image
  // of zero size.
  if (!Number.isFinite(facts.width) || !Number.isFinite(facts.height))
    return null;
  if (facts.width < 1 || facts.height < 1) return null;
  return facts;
}
