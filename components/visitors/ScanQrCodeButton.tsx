"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ScanLine, Upload, X } from "lucide-react";
import Button from "@/components/ui/Button";
import VisitorStatusBadge from "@/components/visitors/VisitorStatusBadge";
import { useDialog } from "@/lib/utils/useDialog";
import { getInvitations, getDisplayStatus } from "@/lib/mock/visitorsStore";
import { findPass } from "@/lib/utils/visitorPass";
import type { VisitorInvitation } from "@/types";
export default function ScanQrCodeButton({
  onVerified,
}: {
  onVerified: (invitation: VisitorInvitation) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState<VisitorInvitation | null>(null);
  const [reading, setReading] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const dialog = useDialog(isOpen, close);
  function close() {
    generation.current++;
    setCamera(false);
    setIsOpen(false);
    stream.current?.getTracks().forEach((t) => t.stop());
  }
  function open() {
    setError("");
    setFound(null);
    setCamera(false);
    setReading(false);
    setIsOpen(true);
  }
  const verify = useCallback((payload: string) => {
    const invitation = findPass(payload, getInvitations());
    if (!invitation) {
      setError(
        "This pass was not found in this demo workspace. Use a SangoPass pass created in this browser, or use manual search.",
      );
      return false;
    }
    setFound(invitation);
    setError("");
    setCamera(false);
    stream.current?.getTracks().forEach((t) => t.stop());
    return true;
  }, []);
  useEffect(() => {
    if (!isOpen || !camera) return;
    let stopped = false;
    let frame = 0;
    let media: MediaStream | null = null;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Camera access needs HTTPS or localhost. You can upload a QR image instead.",
          );
        media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        const element = video.current;
        if (!element) return;
        element.srcObject = media;
        await element.play();
        const { default: jsQR } = await import("jsqr");
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        let last = 0;
        function scan(now: number) {
          if (stopped) return;
          if (ctx && element && element.readyState >= 2 && now - last > 250) {
            last = now;
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
              );
              const code = jsQR(pixels.data, pixels.width, pixels.height, {
                inversionAttempts: "dontInvert",
              });
              if (code && verify(code.data)) return;
            }
          }
          frame = requestAnimationFrame(scan);
        }
        frame = requestAnimationFrame(scan);
      } catch (e) {
        media?.getTracks().forEach((t) => t.stop());
        if (!stopped) {
          setError(
            e instanceof Error && e.message.includes("HTTPS")
              ? e.message
              : "Camera unavailable or permission declined. Upload a QR image or use manual search.",
          );
          setCamera(false);
        }
      }
    }
    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      media?.getTracks().forEach((t) => t.stop());
    };
  }, [isOpen, camera, verify]);
  async function readFile(file: File) {
    const ticket = ++generation.current;
    setCamera(false);
    setError("");
    setReading(true);
    let bitmap: ImageBitmap | null = null;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Choose an image smaller than 10 MB.");
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx)
        throw new Error("Image reading is unavailable in this browser.");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const { default: jsQR } = await import("jsqr");
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(pixels.data, pixels.width, pixels.height);
      if (generation.current !== ticket) return;
      if (!code)
        throw new Error(
          "No QR code found. Try a clear image of the complete pass.",
        );
      verify(code.data);
    } catch (e) {
      if (generation.current === ticket)
        setError(
          e instanceof Error
            ? e.message
            : "Could not read this image. Try PNG or JPEG.",
        );
    } finally {
      bitmap?.close();
      if (generation.current === ticket) setReading(false);
    }
  }
  return (
    <>
      <Button onClick={open}>
        <ScanLine size={17} />
        Scan QR code
      </Button>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />
          <div
            {...dialog}
            aria-label="Scan a visitor pass"
            className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
          >
            <button
              onClick={close}
              aria-label="Close scanner"
              className="absolute right-4 top-4 p-1 text-slate-500"
            >
              <X size={20} />
            </button>
            <p className="eyebrow mb-3">A SMOOTHER ARRIVAL</p>
            <h2 className="mb-3 text-xl font-semibold">Scan a visitor pass</h2>
            <p className="mb-5 text-sm leading-6 text-slate-500">
              Point your camera at a SangoPass QR code or upload a pass image.
              Demo passes are verified against this browser’s visitor records.
            </p>
            {found ? (
              <div className="rounded-xl bg-slate-50 p-5">
                <p className="mb-3 font-semibold">{found.visitorName}</p>
                <VisitorStatusBadge status={getDisplayStatus(found)} />
                <p className="my-4 text-xs leading-6 text-slate-500">
                  {found.propertyName} · {found.unitNumber}
                  <br />
                  {found.visitDate} · {found.expectedArrival}–
                  {found.expectedDeparture}
                </p>
                <Button
                  onClick={() => {
                    onVerified(found);
                    close();
                  }}
                >
                  Review visitor
                </Button>
              </div>
            ) : (
              <>
                {camera && (
                  <video
                    ref={video}
                    playsInline
                    muted
                    className="scan-video mb-4"
                    aria-label="Live camera preview"
                  />
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => {
                      setError("");
                      setCamera(!camera);
                    }}
                    disabled={reading}
                  >
                    <Camera size={17} />
                    {camera ? "Stop camera" : "Start camera"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={reading}
                    onClick={() => upload.current?.click()}
                  >
                    <Upload size={17} />
                    {reading ? "Reading…" : "Upload image"}
                  </Button>
                  <input
                    ref={upload}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    aria-label="Upload QR pass image"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void readFile(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </>
            )}
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-800"
              >
                {error}
              </p>
            )}
            <Button variant="ghost" className="mt-4" onClick={close}>
              Back to manual search
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
