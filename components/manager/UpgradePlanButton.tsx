"use client";
import { useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { useDialog } from "@/lib/utils/useDialog";
import { PLANS } from "@/lib/mock/plans";
import { changeDemoPlan } from "@/lib/mock/billingStore";
export default function UpgradePlanButton({
  planName,
  isContactSales = false,
}: {
  planName: string;
  isContactSales?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const dialog = useDialog(isOpen, () => setIsOpen(false));
  const plan = PLANS.find((p) => p.name === planName);
  function confirm() {
    if (!plan) return;
    try {
      changeDemoPlan(plan.id);
      setDone(true);
    } catch {
      setError(
        "Your browser could not save the plan. Please allow local storage and try again.",
      );
    }
  }
  return (
    <>
      <Button
        variant={isContactSales ? "primary" : "secondary"}
        className="w-full"
        onClick={() => {
          setDone(false);
          setError("");
          setIsOpen(true);
        }}
      >
        Explore {planName}
      </Button>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div
            {...dialog}
            aria-label="Change demo plan"
            className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
          >
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 p-1 text-slate-500"
            >
              <X size={20} />
            </button>
            {done ? (
              <>
                <CheckCircle2 className="mb-4 text-blue-600" size={30} />
                <h2 className="text-xl font-semibold">You’re on {planName}.</h2>
                <p className="my-4 text-sm text-slate-500">
                  Your demo plan has been updated. No payment was collected.
                </p>
                <Button onClick={() => setIsOpen(false)}>
                  Back to your workspace
                </Button>
              </>
            ) : (
              <>
                <p className="eyebrow mb-3">ROOM FOR YOUR COMMUNITY</p>
                <h2 className="text-xl font-semibold">Explore {planName}</h2>
                <p className="my-4 text-sm leading-6 text-slate-500">
                  {isContactSales
                    ? "Portfolio pricing is tailored to your organisation. Try the plan in this demo; a commercial quote will be needed before activation."
                    : plan?.priceLabel +
                      " for up to " +
                      plan?.unitCap +
                      " units and " +
                      plan?.seatCap +
                      " property manager seats."}
                </p>
                <div className="mb-5 rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-500">
                  This changes the demo plan only. No card is required and no
                  charge will be made.
                </div>
                {error && (
                  <p role="alert" className="mb-3 text-sm text-red-600">
                    {error}
                  </p>
                )}
                <Button onClick={confirm} className="w-full">
                  Use {planName} in demo
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
