import type { LucideIcon } from "lucide-react";

interface PlaceholderCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export default function PlaceholderCard({
  title,
  description,
  icon: Icon,
}: PlaceholderCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="font-semibold text-slate-900">{title}</h3>
      </div>
      <p className="text-sm text-slate-500">{description}</p>
      <span className="mt-3 inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
        Coming soon
      </span>
    </div>
  );
}
