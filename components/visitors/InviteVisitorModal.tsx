"use client";

import { useState, type FormEvent } from "react";
import { UserPlus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import VisitorPassModal from "@/components/visitors/VisitorPassModal";
import { addInvitation, DEMO_TENANT } from "@/lib/mock/visitorsStore";
import type { VisitorInvitation } from "@/types";

interface FormState {
  visitorName: string;
  visitorPhone: string;
  visitorEmail: string;
  vehicleRegistration: string;
  reasonForVisit: string;
  visitDate: string;
  expectedArrival: string;
  expectedDeparture: string;
}

const EMPTY_FORM: FormState = {
  visitorName: "",
  visitorPhone: "",
  visitorEmail: "",
  vehicleRegistration: "",
  reasonForVisit: "",
  visitDate: "",
  expectedArrival: "",
  expectedDeparture: "",
};

export default function InviteVisitorModal({
  onCreated,
}: {
  onCreated: (invitation: VisitorInvitation) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<VisitorInvitation | null>(null);
  const [showPass, setShowPass] = useState(false);

  function updateField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleClose() {
    setIsOpen(false);
    setForm(EMPTY_FORM);
    setError("");
    setCreated(null);
    setShowPass(false);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (
      !form.visitorName.trim() ||
      !form.visitorPhone.trim() ||
      !form.visitDate ||
      !form.expectedArrival ||
      !form.expectedDeparture
    ) {
      setError("Please fill in all required fields.");
      return;
    }

    if (form.expectedDeparture <= form.expectedArrival) {
      setError("Expected departure must be after the expected arrival time.");
      return;
    }

    const invitation = addInvitation({
      visitorName: form.visitorName.trim(),
      visitorPhone: form.visitorPhone.trim(),
      visitorEmail: form.visitorEmail.trim() || undefined,
      vehicleRegistration: form.vehicleRegistration.trim() || undefined,
      reasonForVisit: form.reasonForVisit.trim() || undefined,
      visitDate: form.visitDate,
      expectedArrival: form.expectedArrival,
      expectedDeparture: form.expectedDeparture,
      ...DEMO_TENANT,
    });

    setError("");
    setCreated(invitation);
    onCreated(invitation);
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Invite Visitor
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={handleClose}
            aria-hidden="true"
          />
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <button
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {created ? (
              <div className="py-4 text-center">
                <h2 className="mb-1 text-lg font-semibold text-slate-900">
                  Invitation Created Successfully
                </h2>
                <p className="mb-4 text-sm text-slate-500">Visitor</p>
                <p className="mb-4 text-base font-medium text-slate-900">
                  {created.visitorName}
                </p>
                <p className="mb-1 text-sm text-slate-500">Reference</p>
                <p className="mb-6 text-xl font-semibold tracking-wide text-slate-900">
                  {created.referenceNumber}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setShowPass(true)}
                  >
                    View Pass
                  </Button>
                  <Button className="flex-1" onClick={handleClose}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h2 className="mb-1 text-lg font-semibold text-slate-900">
                  Invite Visitor
                </h2>
                <p className="mb-4 text-sm text-slate-500">
                  {DEMO_TENANT.unitNumber}, {DEMO_TENANT.propertyName}
                </p>

                <label className="mb-3 block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Visitor full name
                  </span>
                  <input
                    value={form.visitorName}
                    onChange={(e) =>
                      updateField("visitorName", e.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="e.g. Karabo S."
                  />
                </label>

                <label className="mb-3 block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Phone number
                  </span>
                  <input
                    value={form.visitorPhone}
                    onChange={(e) =>
                      updateField("visitorPhone", e.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="082 123 4567"
                  />
                </label>

                <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Visit date
                    </span>
                    <input
                      type="date"
                      value={form.visitDate}
                      onChange={(e) =>
                        updateField("visitDate", e.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Arrival
                    </span>
                    <input
                      type="time"
                      value={form.expectedArrival}
                      onChange={(e) =>
                        updateField("expectedArrival", e.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Departure
                    </span>
                    <input
                      type="time"
                      value={form.expectedDeparture}
                      onChange={(e) =>
                        updateField("expectedDeparture", e.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <label className="mb-3 block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Email{" "}
                    <span className="font-normal text-slate-400">
                      (optional)
                    </span>
                  </span>
                  <input
                    type="email"
                    value={form.visitorEmail}
                    onChange={(e) =>
                      updateField("visitorEmail", e.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="visitor@example.com"
                  />
                </label>

                <label className="mb-3 block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Vehicle registration{" "}
                    <span className="font-normal text-slate-400">
                      (optional)
                    </span>
                  </span>
                  <input
                    value={form.vehicleRegistration}
                    onChange={(e) =>
                      updateField("vehicleRegistration", e.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="e.g. CA 123-456"
                  />
                </label>

                <label className="mb-2 block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Reason for visit{" "}
                    <span className="font-normal text-slate-400">
                      (optional)
                    </span>
                  </span>
                  <input
                    value={form.reasonForVisit}
                    onChange={(e) =>
                      updateField("reasonForVisit", e.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="e.g. Family visit"
                  />
                </label>

                {error && (
                  <p className="mb-3 text-sm text-red-600">{error}</p>
                )}

                <Button type="submit" className="mt-2 w-full">
                  Create Invitation
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {showPass && created && (
        <VisitorPassModal
          invitation={created}
          onClose={() => setShowPass(false)}
        />
      )}
    </>
  );
}
