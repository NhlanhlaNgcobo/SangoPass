"use client";

import { useState } from "react";
import { ScanLine, X } from "lucide-react";
import Button from "@/components/ui/Button";

export default function ScanQrCodeButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <ScanLine className="h-4 w-4" />
        Scan QR Code
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <ScanLine className="mx-auto mb-3 h-8 w-8 text-blue-600" />
            <h2 className="mb-2 text-lg font-semibold text-slate-900">
              Camera scanning is coming soon
            </h2>
            <p className="mb-5 text-sm text-slate-600">
              Live camera QR scanning is planned for a future update. For
              now, use Manual Search below to look up a visitor by name,
              phone number, or reference number.
            </p>
            <Button className="w-full" onClick={() => setIsOpen(false)}>
              Got it
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
