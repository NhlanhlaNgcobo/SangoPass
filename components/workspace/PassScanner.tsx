"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, IdCard, KeyRound, Upload, X } from "lucide-react";
import { formatEntryCode, normaliseEntryCode } from "@/lib/shared/passcode";
export default function PassScanner({
  onScan,
  onCode,
  onIdNumber,
}: {
  onScan: (value: string) => boolean;
  /**
   * A guest with no smartphone has no QR to show, only the code they were
   * texted. Verifying it is the same act as scanning - confirm this pass
   * belongs here, then decide - so it sits beside the camera rather than
   * hidden behind the search box.
   */
  onCode: (code: string) => boolean;
  /**
   * The last resort, and the one that works when everything else has failed:
   * the card in the visitor's hand. They forgot the pass, never got the text,
   * and cannot remember the reference - but they are holding a document with
   * a number on it, and that number is on the booking.
   */
  onIdNumber: (value: string) => boolean;
}) {
  const [camera, setCamera] = useState(false),
    [error, setError] = useState(""),
    [typed, setTyped] = useState(""),
    [document_, setDocument] = useState(""),
    [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    input = useRef<HTMLInputElement>(null),
    scan = useRef(onScan);
  useEffect(() => {
    scan.current = onScan;
  }, [onScan]);
  useEffect(() => {
    if (!camera) return;
    let stopped = false,
      frame = 0;
    let stream: MediaStream | undefined;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Camera access requires HTTPS or localhost. Upload a QR image instead.",
          );
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const element = video.current;
        if (!element) return;
        element.srcObject = stream;
        await element.play();
        const { default: jsQR } = await import("jsqr");
        const canvas = document.createElement("canvas"),
          ctx = canvas.getContext("2d", { willReadFrequently: true });
        let last = 0;
        function tick(time: number) {
          if (stopped) return;
          if (ctx && element && element.readyState >= 2 && time - last > 300) {
            last = time;
            canvas.width = 640;
            canvas.height = Math.round(
              (element.videoHeight / element.videoWidth) * 640,
            );
            if (canvas.height) {
              ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
              const pixels = ctx.getImageData(
                  0,
                  0,
                  canvas.width,
                  canvas.height,
                ),
                code = jsQR(pixels.data, pixels.width, pixels.height);
              if (code) {
                if (scan.current(code.data)) {
                  setCamera(false);
                  return;
                }
                setError(
                  "This QR pass is not in your assigned workspace. Refresh or search by reference.",
                );
              }
            }
          }
          frame = requestAnimationFrame(tick);
        }
        frame = requestAnimationFrame(tick);
      } catch (e) {
        stream?.getTracks().forEach((t) => t.stop());
        if (!stopped) {
          setError(
            e instanceof Error
              ? e.message
              : "Camera unavailable. Try uploading an image.",
          );
          setCamera(false);
        }
      }
    }
    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camera]);
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 12 * 1024 * 1024)
        throw new Error("Choose an image smaller than 12 MB.");
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height),
        { default: jsQR } = await import("jsqr");
      const code = jsQR(pixels.data, pixels.width, pixels.height);
      if (!code)
        throw new Error("No QR code found. Use a clear image of the pass.");
      if (!scan.current(code.data))
        throw new Error(
          "This pass is not in your assigned workspace. Refresh or search by reference.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read the image.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  function checkDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const value = document_.trim();
    // Four is the most the mask leaves readable, so fewer than that would
    // match half the register rather than narrow it.
    if (value.length < 4) {
      setError("Type at least the last four characters of their document.");
      return;
    }
    if (!onIdNumber(value)) {
      setError(
        "No pass at this property carries that identity number. Check the document, or search by the visitor name.",
      );
      return;
    }
    setDocument("");
  }

  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const code = normaliseEntryCode(typed);
    if (!code) {
      setError(
        "A gate code is eight characters, like 4XKD-9PWH. Check what your visitor is reading out.",
      );
      return;
    }
    if (!onCode(code)) {
      setError(
        `No pass at this property has the code ${formatEntryCode(code)}. Check the code, or search by the visitor's name or identity number.`,
      );
      return;
    }
    setTyped("");
  }
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="sp-row">
        <button
          className="sp-secondary"
          onClick={() => {
            setError("");
            setCamera(!camera);
          }}
        >
          {camera ? <X size={16} /> : <Camera size={16} />}{" "}
          {camera ? "Stop camera" : "Scan a pass"}
        </button>
        <button
          className="sp-secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
          {busy ? "Reading…" : "Upload QR image"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-label="QR pass image"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </div>
      <form className="sp-code-check" onSubmit={checkDocument}>
        <label>
          <span>Identity number</span>
          <input
            value={document_}
            onChange={(e) => setDocument(e.target.value)}
            placeholder="8001015009087"
            aria-label="Identity number on the document the visitor is holding"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={80}
          />
        </label>
        <button
          className="sp-secondary"
          type="submit"
          disabled={document_.trim().length < 4}
        >
          <IdCard size={15} />
          Find by ID
        </button>
        <small className="sp-muted">
          For a visitor who arrives with no pass and no code. The whole number
          off the card, or just its last four characters — the full number never
          reaches this screen, so both find the same booking.
        </small>
      </form>
      <form className="sp-code-check" onSubmit={verify}>
        <label>
          <span>Gate code</span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="4XKD-9PWH"
            aria-label="Gate code the visitor is presenting"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
          />
        </label>
        <button className="sp-secondary" type="submit" disabled={!typed.trim()}>
          <KeyRound size={15} />
          Check code
        </button>
        <small className="sp-muted">
          For a guest arriving without a phone. Their host can read it to them.
        </small>
      </form>
      {camera && (
        <video
          ref={video}
          muted
          playsInline
          style={{
            width: "100%",
            maxWidth: 480,
            borderRadius: 12,
            marginTop: 16,
          }}
        />
      )}
      {error && (
        <p role="alert" className="sp-error">
          {error}
        </p>
      )}
    </div>
  );
}
