import type { ReactNode } from "react";

/**
 * CSS-only tooltip (no JS, works on hover and keyboard focus). Wrap an interactive element;
 * `label` is also exposed to assistive tech through aria-label on the wrapper's trigger — pass
 * `aria-label` on the child itself when it is icon-only.
 */
export default function Tooltip({
  label,
  children,
  side = "top",
  className = "",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "right";
  className?: string;
}) {
  const pos =
    side === "top"
      ? "bottom-full left-1/2 mb-1.5 -translate-x-1/2"
      : side === "bottom"
        ? "top-full left-1/2 mt-1.5 -translate-x-1/2"
        : "left-full top-1/2 ml-2 -translate-y-1/2";
  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 dark:bg-slate-100 dark:text-slate-900 ${pos}`}
      >
        {label}
      </span>
    </span>
  );
}
