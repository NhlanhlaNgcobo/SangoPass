"use client";

import { useDialog } from "@/lib/utils/useDialog";

import { useState, type FormEvent } from "react";
import { UserPlus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { addTenant } from "@/lib/mock/tenantsStore";
import { useDemoProperties } from "@/lib/mock/propertiesStore";
import type { TenantSummary } from "@/types";

export default function AddTenantModal({
  onCreated,
}: {
  onCreated: (tenant: TenantSummary) => void;
}) {
  const properties = useDemoProperties();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [propertyName, setPropertyName] = useState(properties[0].name);
  const [unitNumber, setUnitNumber] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<TenantSummary | null>(null);

  const selectedProperty = properties.find((p) => p.name === propertyName);
  const requiresStudentNumber =
    selectedProperty?.propertyType === "student_accommodation";

  function resetForm() {
    setName("");
    setPropertyName(properties[0].name);
    setUnitNumber("");
    setStudentNumber("");
    setError("");
    setCreated(null);
  }

  function handleClose() {
    setIsOpen(false);
    resetForm();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!name.trim() || !propertyName || !unitNumber.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    if (requiresStudentNumber && !studentNumber.trim()) {
      setError("Student number is required for student accommodations.");
      return;
    }

    try {
      const tenant = addTenant({
        name: name.trim(),
        propertyName,
        unitNumber: unitNumber.trim(),
        studentNumber: requiresStudentNumber ? studentNumber.trim() : undefined,
      });

      setError("");
      setCreated(tenant);
      onCreated(tenant);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save the resident. Please try again.",
      );
    }
  }

  const dialog = useDialog(isOpen, handleClose);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Add resident
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
            aria-label="Add a resident"
            className="relative max-h-[90dvh] overflow-y-auto w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <button
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {created ? (
              <div className="py-4 text-center">
                <h2 className="mb-2 text-lg font-semibold text-slate-900">
                  Tenant added
                </h2>
                <p className="mb-6 text-sm text-slate-600">
                  {created.name} has been added to {created.unitNumber},{" "}
                  {created.propertyName}.
                </p>
                <Button onClick={handleClose} className="w-full">
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h2 className="mb-4 text-lg font-semibold text-slate-900">
                  Add resident
                </h2>

                <label className="mb-3 block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Full name
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="e.g. Naledi B."
                  />
                </label>

                <label className="mb-3 block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Property
                  </span>
                  <select
                    value={propertyName}
                    onChange={(e) => {
                      setPropertyName(e.target.value);
                      setStudentNumber("");
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    {properties.map((property) => (
                      <option key={property.id} value={property.name}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mb-3 block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Unit number
                  </span>
                  <select
                    value={unitNumber}
                    onChange={(e) => setUnitNumber(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Choose a vacant unit</option>
                    {selectedProperty?.units
                      .filter((unit) => unit.status === "vacant")
                      .map((unit) => (
                        <option key={unit.id} value={unit.unitNumber}>
                          {unit.unitNumber}
                        </option>
                      ))}
                  </select>
                </label>

                {requiresStudentNumber && (
                  <label className="mb-2 block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Student number
                    </span>
                    <input
                      value={studentNumber}
                      onChange={(e) => setStudentNumber(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="e.g. ST-2024-01234"
                    />
                    <span className="mt-1 block text-xs text-slate-400">
                      Required for student accommodations.
                    </span>
                  </label>
                )}

                {error && (
                  <p className="mb-3 mt-2 text-sm text-red-600">{error}</p>
                )}

                <Button type="submit" className="mt-2 w-full">
                  Add resident
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
