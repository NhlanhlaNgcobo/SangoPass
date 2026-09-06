"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";

export default function UpgradePlanButton({
  planName,
  isContactSales = false,
}: {
  planName: string;
  isContactSales?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant={isContactSales ? "primary" : "secondary"}
        className="w-full justify-center"
        onClick={() => setIsOpen(true)}
      >
        {isContactSales ? "Contact Sales" : `Upgrade to ${planName}`}
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
            <h2 className="mb-2 text-lg font-semibold text-slate-900">
              {isContactSales ? "Let's talk Portfolio" : "Plan changes coming soon"}
            </h2>
            <p className="mb-5 text-sm text-slate-600">
              {isContactSales
                ? "Portfolio pricing is tailored to your unit count and team size. This would normally open a call-booking form — billing isn't connected yet, so consider this a placeholder for that flow."
                : `Self-serve plan upgrades aren't wired up yet — this button previews where switching to ${planName} will happen once billing is connected.`}
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
