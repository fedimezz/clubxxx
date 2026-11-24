// ClubX product wordmark for the admin shell. Pure markup (no image request), colours come from the
// admin skin tokens so it works in light and dark mode.
export default function ClubXLogo({ variant = "full", className = "" }: { variant?: "full" | "mark"; className?: string }) {
  if (variant === "mark") {
    return (
      <span className={`grid h-10 w-10 place-items-center rounded-xl border border-[var(--border-medium)] bg-[var(--bg-card)] text-xl font-black text-[var(--primary)] ${className}`} aria-label="ClubX" role="img">
        X
      </span>
    );
  }
  return (
    <span className={`inline-flex flex-col leading-none ${className}`}>
      <span className="text-[1.7rem] font-black tracking-tight text-[var(--text-primary)]" aria-label="ClubX">
        Club<span className="text-[var(--primary)] [text-shadow:0_0_18px_rgb(var(--glow)/0.55)]">X</span>
      </span>
      <span className="mt-1 text-[10px] font-medium tracking-wide text-[var(--text-muted)]">Manage • Grow • Inspire</span>
    </span>
  );
}
