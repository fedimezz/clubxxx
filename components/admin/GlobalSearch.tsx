"use client";

// Global admin search (Ctrl/Cmd + K): jumps to admin pages and finds members of the CURRENT club
// (GET /api/admin/members?search= — the server scopes it to the authenticated club).
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, User, CornerDownLeft, LayoutDashboard } from "lucide-react";
import { adminLinks } from "@/lib/navigation";

interface Hit { key: string; label: string; sub?: string; href: string; kind: "page" | "member" }
const OWNER_ONLY = new Set(["/admin/staff", "/admin/plans", "/admin/theme-requests", "/admin/promotions", "/admin/billing", "/admin/roles"]);

export default function GlobalSearch({ role }: { role: "ADMIN" | "OWNER" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); inputRef.current?.focus(); }
      if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
    };
    const onClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setMembers([]); setBusy(false); return; }
    setBusy(true);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/admin/members?search=${encodeURIComponent(term)}`, { credentials: "include", signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { members: [] }))
        .then((j) => setMembers((j.members ?? []).slice(0, 5).map((m: { id: string; name: string; email: string }) => ({
          key: `m-${m.id}`, label: m.name, sub: m.email, href: `/admin/members?search=${encodeURIComponent(m.email)}`, kind: "member" as const,
        }))))
        .catch(() => undefined)
        .finally(() => setBusy(false));
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const pages = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    return adminLinks
      .filter((l) => role === "OWNER" || !OWNER_ONLY.has(l.href))
      .filter((l) => !term || l.name.toLowerCase().includes(term))
      .slice(0, 6)
      .map((l) => ({ key: l.href, label: l.name, href: l.href, kind: "page" as const }));
  }, [q, role]);

  const hits = [...members, ...pages];
  useEffect(() => setCursor(0), [q, members.length]);

  const go = (h: Hit) => { setOpen(false); setQ(""); router.push(h.href); };

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(hits.length - 1, c + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
            if (e.key === "Enter" && hits[cursor]) go(hits[cursor]);
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls="admin-search-list"
          aria-label="Rechercher un membre ou une page"
          placeholder="Rechercher un membre, une page…"
          className="w-full rounded-full border border-[var(--border-light)] bg-[var(--bg-card)] py-2.5 pl-10 pr-16 text-sm text-primary placeholder:text-muted transition focus:border-[var(--primary)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--border-light)] px-1.5 py-0.5 text-[10px] text-muted sm:block">Ctrl K</kbd>
      </div>
      {open && (
        <ul id="admin-search-list" role="listbox" className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-[var(--border-light)] bg-[var(--bg-card)] p-1 shadow-xl">
          {busy && <li className="px-3 py-2 text-xs text-muted">Recherche…</li>}
          {!busy && hits.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">Aucun résultat pour « {q} »</li>}
          {hits.map((h, i) => (
            <li key={h.key} role="option" aria-selected={i === cursor}>
              <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => go(h)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === cursor ? "bg-[var(--primary)]/10" : ""}`}>
                {h.kind === "member" ? <User size={15} className="text-sky-500" aria-hidden /> : <LayoutDashboard size={15} className="text-muted" aria-hidden />}
                <span className="min-w-0 flex-1"><span className="block truncate font-medium text-primary">{h.label}</span>{h.sub && <span className="block truncate text-xs text-muted">{h.sub}</span>}</span>
                {i === cursor && <CornerDownLeft size={13} className="text-muted" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
