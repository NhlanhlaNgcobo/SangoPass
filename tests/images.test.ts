/**
 * Reading an image's own header.
 *
 * Every case here is built byte by byte rather than loaded from a fixture, so
 * what each assertion depends on is visible in the test: which offset carries
 * the width, which bit says there is an alpha channel, and what a truncated or
 * mislabelled file looks like on the way in.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readImage } from "../lib/server/images";

const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];

function png(width: number, height: number, colourType = 6): Uint8Array {
  const bytes = new Uint8Array(26);
  bytes.set(PNG_MAGIC);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = colourType;
  return bytes;
}

/** A JPEG is a walk through segments, so the frame is put behind two others. */
function jpeg(width: number, height: number): Uint8Array {
  const head = [
    0xff,
    0xd8, // SOI
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00, // APP0, skipped by length
    0xff,
    0xc4,
    0x00,
    0x04,
    0x00,
    0x00, // DHT, in the SOF range but not a frame
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08, // SOF0
  ];
  const bytes = new Uint8Array(head.length + 4);
  bytes.set(head);
  const view = new DataView(bytes.buffer);
  view.setUint16(head.length, height);
  view.setUint16(head.length + 2, width);
  return bytes;
}

/** Lossless WebP: two 14-bit fields and an alpha bit, all little-endian. */
function webp(width: number, height: number, alpha: boolean): Uint8Array {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  const ascii = (text: string, at: number) =>
    bytes.set(
      [...text].map((c) => c.charCodeAt(0)),
      at,
    );
  ascii("RIFF", 0);
  view.setUint32(4, 22, true);
  ascii("WEBP", 8);
  ascii("VP8L", 12);
  view.setUint32(16, 10, true);
  bytes[20] = 0x2f;
  const packed =
    ((width - 1) & 0x3fff) |
    (((height - 1) & 0x3fff) << 14) |
    ((alpha ? 1 : 0) << 28);
  view.setUint32(21, packed >>> 0, true);
  return bytes;
}

test("an image states its own size and format", () => {
  assert.deepEqual(readImage(png(1600, 300)), {
    format: "png",
    width: 1600,
    height: 300,
    alpha: true,
  });
  assert.deepEqual(readImage(jpeg(1024, 768)), {
    format: "jpeg",
    width: 1024,
    height: 768,
    alpha: false,
  });
  assert.deepEqual(readImage(webp(400, 250, true)), {
    format: "webp",
    width: 400,
    height: 250,
    alpha: true,
  });
});

test("transparency is read from the file, not assumed", () => {
  // This is what decides whether a logo is seated on a plate, so each colour
  // type is checked rather than the two obvious ones.
  assert.equal(readImage(png(100, 100, 6))?.alpha, true, "truecolour + alpha");
  assert.equal(readImage(png(100, 100, 4))?.alpha, true, "grey + alpha");
  assert.equal(readImage(png(100, 100, 2))?.alpha, false, "truecolour");
  assert.equal(readImage(png(100, 100, 0))?.alpha, false, "greyscale");
  // A palette carries transparency in a chunk elsewhere in the file. Treated
  // as possibly transparent, because guessing the other way puts a white slab
  // on somebody's sidebar and guessing this way costs nothing.
  assert.equal(readImage(png(100, 100, 3))?.alpha, true, "palette");
  // JPEG has no transparency in any of its forms.
  assert.equal(readImage(jpeg(100, 100))?.alpha, false);
  assert.equal(readImage(webp(100, 100, false))?.alpha, false);
});

test("anything that is not one of the three is refused", () => {
  const nothing = [
    new Uint8Array(0),
    new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"),
    new TextEncoder().encode("%PDF-1.7"),
    new TextEncoder().encode("GIF89a"),
    // A PNG signature with no IHDR behind it: the shape of an attempt to get
    // past a check that only looks at the first eight bytes.
    new Uint8Array(PNG_MAGIC),
  ];
  for (const bytes of nothing) assert.equal(readImage(bytes), null);
});

test("a truncated header is refused rather than half-read", () => {
  for (const whole of [png(800, 600), jpeg(800, 600), webp(800, 600, true)])
    for (let cut = 1; cut < whole.length; cut += 1) {
      const facts = readImage(whole.subarray(0, cut));
      // Either it could not be read, or what came back is the truth - never a
      // size invented out of bytes that were not there.
      if (facts) {
        assert.equal(facts.width, 800, `width at ${cut} bytes`);
        assert.equal(facts.height, 600, `height at ${cut} bytes`);
      }
    }
});

test("a zero-sized image is not an image", () => {
  assert.equal(readImage(png(0, 100)), null);
  assert.equal(readImage(png(100, 0)), null);
});
