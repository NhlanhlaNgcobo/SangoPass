"use client";

import { useState } from "react";
import { useDemoProperties, updateDemoUnit } from "@/lib/mock/propertiesStore";
import Badge from "@/components/ui/Badge";
import type { RentFrequency, UnitSummary } from "@/types";

const FREQUENCY_LABELS: Record<RentFrequency, string> = {
  monthly: "Monthly",
  annual: "Annually",
  per_semester: "Per Semester",
};

function formatCurrency(amount: number): string {
  return `R${amount.toLocaleString("en-ZA")}`;
}

export default function UnitsTable({ units }: { units: UnitSummary[] }) {
  const properties = useDemoProperties();
  const [error, setError] = useState("");
  const ids = new Set(units.map((unit) => unit.id));
  const rows = properties
    .flatMap((p) => p.units)
    .filter((unit) => ids.has(unit.id));
  function updateFrequency(id: string, frequency: RentFrequency) {
    try {
      updateDemoUnit(id, { rentFrequency: frequency });
      setError("");
    } catch {
      setError("Could not save your change. Please try again.");
    }
  }
  function toggleRentStatus(id: string) {
    const unit = rows.find((u) => u.id === id);
    if (!unit) return;
    try {
      updateDemoUnit(id, {
        rentPaid: !unit.rentPaid,
        outstandingAmount: unit.rentPaid ? unit.rentAmount : 0,
      });
      setError("");
    } catch {
      setError("Could not save your change. Please try again.");
    }
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      {error && (
        <p role="alert" className="p-4 text-sm text-red-600">
          {error}
        </p>
      )}
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Unit</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Tenant</th>
            <th className="px-4 py-3">Rent</th>
            <th className="px-4 py-3">Frequency</th>
            <th className="px-4 py-3">Rent Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((unit) => (
            <tr key={unit.id}>
              <td className="px-4 py-3 font-medium text-slate-900">
                {unit.unitNumber}
              </td>
              <td className="px-4 py-3">
                <Badge color={unit.status === "occupied" ? "slate" : "green"}>
                  {unit.status === "occupied" ? "Occupied" : "Vacant"}
                </Badge>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {unit.tenantName ?? "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {unit.rentAmount ? formatCurrency(unit.rentAmount) : "—"}
              </td>
              <td className="px-4 py-3">
                {unit.status === "occupied" ? (
                  <select
                    aria-label={`Rent frequency for ${unit.unitNumber}`}
                    value={unit.rentFrequency ?? "monthly"}
                    onChange={(e) =>
                      updateFrequency(unit.id, e.target.value as RentFrequency)
                    }
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
                  >
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3">
                {unit.status === "occupied" ? (
                  <button
                    aria-label={`Mark rent ${unit.rentPaid ? "outstanding" : "paid"} for ${unit.unitNumber}`}
                    onClick={() => toggleRentStatus(unit.id)}
                  >
                    <Badge color={unit.rentPaid ? "green" : "red"}>
                      {unit.rentPaid
                        ? "Paid"
                        : `Outstanding${
                            unit.outstandingAmount
                              ? ` (${formatCurrency(unit.outstandingAmount)})`
                              : ""
                          }`}
                    </Badge>
                  </button>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
