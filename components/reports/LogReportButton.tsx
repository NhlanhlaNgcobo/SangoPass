"use client";

import { useDialog } from "@/lib/utils/useDialog";

import { useState, type FormEvent } from "react";
import { MessageSquarePlus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { addReport } from "@/lib/mock/reportsStore";
import type { ReportCategory, Role } from "@/types";

const CATEGORY_OPTIONS: { value: ReportCategory; label: string }[] = [
  { value: "complaint", label: "Complaint" },
  { value: "maintenance", label: "Maintenance Issue" },
  { value: "suggestion", label: "Suggestion" },
];

export default function LogReportButton({ role }: { role: Role }) {
  const [isOpen, setIsOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ReportCategory>("maintenance");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  function resetForm() {
    setName("");
    setCategory("maintenance");
    setLocation("");
    setDescription("");
    setError("");
    setSubmitted(false);
  }

  function handleClose() {
    setIsOpen(false);
    resetForm();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      setError("Please enter your name and a description.");
      return;
    }
    addReport({
      category,
      description: description.trim(),
      submittedBy: name.trim(),
      role,
      location: location.trim() || undefined,
    });
    setError("");
    setSubmitted(true);
  }

  const selectedLabel = CATEGORY_OPTIONS.find(
    (opt) => opt.value === category,
  )?.label;

  const dialog = useDialog(isOpen, handleClose);

  return (
    <>
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        <MessageSquarePlus className="h-4 w-4" />
        Log a Report
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={handleClose}
            aria-hidden="true"
          />
          <div
            {...dialog}
            aria-label="Log a report"
            className="relative max-h-[90dvh] overflow-y-auto w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <button
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {submitted ? (
              <div className="py-4 text-center">
                <h2 className="mb-2 text-lg font-semibold text-slate-900">
                  Report submitted
                </h2>
                <p className="mb-6 text-sm text-slate-600">
                  Thanks — your {selectedLabel?.toLowerCase()} has been logged
                  and the property manager will follow up.
                </p>
                <Button onClick={handleClose} className="w-full">
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h2 className="mb-1 text-lg font-semibold text-slate-900">
                  Log a Report
                </h2>
                <p className="mb-4 text-sm text-slate-500">
                  Let the property manager know about a complaint, maintenance
                  issue, or suggestion.
                </p>

                <div className="mb-4">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    What type of report is this?
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {CATEGORY_OPTIONS.map((opt) => (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setCategory(opt.value)}
                        className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors sm:text-sm ${
                          category === opt.value
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="mb-4 block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Your name
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="e.g. Thabo M."
                  />
                </label>

                <label className="mb-4 block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Location{" "}
                    <span className="font-normal text-slate-400">
                      (optional)
                    </span>
                  </span>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="e.g. Room 103, 2nd floor elevator"
                  />
                </label>

                <label className="mb-2 block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Description
                  </span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Describe the issue or suggestion..."
                  />
                </label>

                {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

                <Button type="submit" className="mt-2 w-full">
                  Submit Report
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
