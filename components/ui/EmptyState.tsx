import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Primary call-to-action, e.g. a <Link> or <button>. */
  action?: ReactNode;
  className?: string;
}

/** Helpful empty state: says what is missing, why it matters and what to do next. */
export default function EmptyState({ icon: Icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700 ${className}`}
    >
      {Icon ? (
        <div className="mb-3 rounded-full bg-[var(--brand,#10b981)]/10 p-3 text-[var(--brand,#10b981)]">
          <Icon className="h-6 w-6" aria-hidden />
        </div>
      ) : null}
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
