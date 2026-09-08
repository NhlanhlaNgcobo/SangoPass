import type { LucideIcon } from "lucide-react";
export default function StatCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <h3>{title}</h3>
        <span className="stat-icon">
          <Icon size={17} strokeWidth={1.7} />
        </span>
      </div>
      <p className="stat-value">{value}</p>
      {hint && <p className="stat-hint">{hint}</p>}
    </div>
  );
}
