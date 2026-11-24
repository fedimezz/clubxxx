// Loading placeholder. Pure CSS pulse; respects prefers-reduced-motion via Tailwind's motion-safe.
export function Skeleton({ className = "", rounded = "rounded-lg" }: { className?: string; rounded?: string }) {
  return (
    <div
      aria-hidden
      className={`motion-safe:animate-pulse bg-slate-200/80 dark:bg-slate-700/50 ${rounded} ${className}`}
    />
  );
}

/** A block of `lines` text-line skeletons (last one shorter). */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-label="Chargement">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export default Skeleton;
