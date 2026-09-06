"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import { getPlatformActivity, type ActivityEntry } from "@/lib/mock/activityFeed";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminActivityPage() {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of demo activity from localStorage on mount
    setActivity(getPlatformActivity());
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">
          Platform Activity
        </h1>
        <p className="text-sm text-slate-500">
          Visitor and report activity across every organization.
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        Preview data — stored in this browser only, not yet connected to a
        real database.
      </div>

      {activity.length === 0 ? (
        <p className="text-sm text-slate-500">No activity yet.</p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <ul className="divide-y divide-slate-100">
            {activity.map((entry, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <Badge color={entry.type === "report" ? "amber" : "blue"}>
                    {entry.type === "report" ? "Report" : "Visitor"}
                  </Badge>
                  <span className="text-sm text-slate-700">{entry.text}</span>
                </div>
                <span className="whitespace-nowrap text-sm text-slate-400">
                  {formatTime(entry.time)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
