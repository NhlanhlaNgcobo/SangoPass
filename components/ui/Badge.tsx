import type { ReactNode } from "react";

type BadgeColor = "green" | "amber" | "red" | "slate" | "blue";

const COLOR_CLASSES: Record<BadgeColor, string> = {
  green: "bg-green-50 text-green-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  slate: "bg-slate-100 text-slate-600",
  blue: "bg-blue-50 text-blue-700",
};

export default function Badge({
  children,
  color,
}: {
  children: ReactNode;
  color: BadgeColor;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${COLOR_CLASSES[color]}`}
    >
      {children}
    </span>
  );
}
