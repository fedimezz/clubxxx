"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogOut, X, UserCircle, Home, ChevronDown, Sparkles, Wallet, Smartphone, LockKeyhole,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useClubSettings } from "@/context/ClubSettingsContext";
import Tooltip from "@/components/ui/Tooltip";
import { tabActive, visibleGroups, type AdminGroup } from "@/lib/admin-nav";

// One sidebar link per group: the group's pages are reachable as tabs on the page itself
// (components/admin/AdminSectionTabs.tsx), so the menu stays short.
interface Props {
  role: "ADMIN" | "OWNER";
  mobileOpen?: boolean;
  onClose?: () => void;
  // First-time owner who hasn't finished the guided website setup yet: the
  // only thing they can open is the setup assistant (the layout also redirects).
  wizardOnly?: boolean;
  locked?: boolean;
  /** Desktop icon-only rail. The mobile drawer is always expanded. */
  collapsed?: boolean;
}

const WIZARD_ONLY_GROUPS: AdminGroup[] = [
  { id: "setup", name: "Assistant du site", icon: Sparkles, tabs: [{ name: "Assistant du site", href: "/admin/website-setup", ownerOnly: true }] },
];

export default function AdminSidebar({ role, mobileOpen, onClose, wizardOnly = false, locked = false, collapsed = false }: Props) {
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const { name: clubName, logoUrl, loading: clubLoading } = useClubSettings();

  const groups = useMemo<AdminGroup[]>(
    () => (wizardOnly ? WIZARD_ONLY_GROUPS : visibleGroups(role)),
    [role, wizardOnly]
  );
  const onProfile = pathname.startsWith("/admin/profile");
  const groupActive = (g: AdminGroup) => g.tabs.some((t) => tabActive(pathname, t));

  const handleLogout = () => {
    onClose?.();
    void logout();
  };

  const renderGroup = (g: AdminGroup) => {
    const Icon = g.icon;
    const href = g.tabs[0].href;
    const active = groupActive(g);
    if (locked) {
      return (
        <div key={g.id} title="Verrouillé jusqu'à la réactivation du club" aria-disabled="true"
          className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-400 opacity-70">
          <Icon size={18} className="flex-shrink-0" />
          <span className="truncate">{g.name}</span>
          <LockKeyhole size={14} className="ml-auto flex-shrink-0" aria-label="Verrouillé" />
        </div>
      );
    }
    return (
      <Link key={g.id} href={href} onClick={onClose} aria-current={active ? "page" : undefined} className="admin-nav-item !py-2.5 !text-sm">
        <Icon size={18} className="flex-shrink-0" />
        <span className="truncate">{g.name}</span>
        {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary)]" />}
      </Link>
    );
  };

  const ownerName = user?.name ?? "";
  const displayClub = !clubLoading && clubName ? clubName : ownerName || "Mon club";
  const clubInitial = displayClub.trim().charAt(0).toUpperCase() || "C";

const avatar = typeof user?.avatar === "string" ? user.avatar : typeof user?.image === "string" ? (user.image as string) : null;
  const initials = (user?.name ?? "?").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const roleLabel = role === "OWNER" ? "Propriétaire" : "Administrateur";

  const sidebarContent = (
    <div className="admin-sidebar flex h-full flex-col backdrop-blur-xl">
      {/* Club identity: the club's own name and logo (the ClubX product brand is not shown here) */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-5">
        <Link href="/admin" onClick={onClose} aria-label={`${displayClub} — tableau de bord`} className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-[var(--border-medium)] bg-[var(--bg-card)] text-lg font-black text-[var(--primary)]">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
            ) : clubInitial}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-base font-extrabold text-[var(--text-primary)]">{displayClub}</span>
            <span className="block truncate text-xs text-[var(--text-muted)]">{ownerName || roleLabel}</span>
          </span>
        </Link>
        {onClose && (
          <button onClick={onClose} aria-label="Fermer le menu" className="lg:hidden grid h-9 w-9 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)] flex-shrink-0">
            <X size={16} />
          </button>
        )}
      </div>

      {locked && (
        <div className="px-4 pb-1">
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-500">
            <LockKeyhole size={14} />
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Club verrouillé</span>
          </div>
          <Link href="/admin/reactivate" onClick={onClose} className="admin-cta mt-2 w-full py-2 text-xs"><Wallet size={13} aria-hidden /> Réactiver</Link>
        </div>
      )}

      {/* Navigation: one link per group */}
      <nav aria-label="Navigation d'administration" className="custom-scrollbar flex-1 space-y-1 overflow-y-auto p-3">
        {groups.map(renderGroup)}
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 space-y-2 border-t border-[var(--border-light)] p-3">
        {!locked && (
          <div className="grid grid-cols-2 gap-1">
            <Link href="/" onClick={onClose} className="admin-nav-item !gap-2 !px-2.5 !py-1.5 !text-[11px]"><Home size={14} />Site public</Link>
            {/* /download lives on the platform's main domain, not the club's subdomain. */}
            <a href={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/download`} onClick={onClose} className="admin-nav-item !gap-2 !px-2.5 !py-1.5 !text-[11px]"><Smartphone size={14} />Application</a>
          </div>
        )}

        {!locked ? (
          <Link
            href="/admin/profile"
            onClick={onClose}
            aria-label="Mon profil admin"
            aria-current={onProfile ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl border p-2 transition ${onProfile ? "border-[var(--primary)]/60 bg-[var(--primary)]/10" : "border-[var(--border-light)] hover:border-[var(--primary)]/40 hover:bg-[var(--bg-muted)]/50"}`}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--primary)] text-xs font-bold text-[var(--brand-contrast)]">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : initials}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{user?.name}</span>
              <span className="block truncate text-xs text-[var(--text-muted)]">{roleLabel}</span>
            </span>
            <ChevronDown size={15} className="text-[var(--text-muted)]" aria-hidden />
          </Link>
        ) : null}

        <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold text-rose-500 transition-colors hover:bg-rose-500/10">
          <LogOut size={16} />
          Déconnexion
        </button>
      </div>
    </div>
  );

  // Icon-only rail: one icon per group, tooltip-labelled.
  const railContent = (
    <div className="admin-sidebar flex h-full flex-col items-center py-3 backdrop-blur-xl">
      <Link href="/admin" aria-label={`${displayClub} — tableau de bord`} className="mb-3">
        <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl border border-[var(--border-medium)] bg-[var(--bg-card)] text-lg font-black text-[var(--primary)]">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
          ) : clubInitial}
        </span>
      </Link>
      <nav aria-label="Navigation d'administration" className="custom-scrollbar flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-2">
        {groups.map((g) => {
          const Icon = g.icon;
          const act = groupActive(g);
          return locked ? (
            <span key={g.id} aria-disabled="true" className="grid h-11 w-11 place-items-center rounded-xl text-slate-400 opacity-50"><Icon size={18} /></span>
          ) : (
            <Tooltip key={g.id} label={g.name} side="right">
              <Link href={g.tabs[0].href} aria-label={g.name} aria-current={act ? "page" : undefined} className="admin-nav-item !h-11 !w-11 !justify-center !p-0">
                <Icon size={18} />
              </Link>
            </Tooltip>
          );
        })}
      </nav>
      <div className="mt-2 flex flex-col items-center gap-1 border-t border-[var(--border-light)] pt-2">
        {!locked && (
          <Tooltip label="Mon profil admin" side="right">
            <Link href="/admin/profile" aria-label="Mon profil admin" aria-current={onProfile ? "page" : undefined} className="admin-nav-item !h-11 !w-11 !justify-center !p-0"><UserCircle size={18} /></Link>
          </Tooltip>
        )}
        <Tooltip label="Déconnexion" side="right">
          <button onClick={handleLogout} aria-label="Déconnexion" className="grid h-11 w-11 place-items-center rounded-xl text-rose-500 hover:bg-rose-500/10"><LogOut size={18} /></button>
        </Tooltip>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — width must match the `lg:ml-72` content offset in
          app/admin/layout.tsx; it was w-64 here, leaving a stale gap. */}
      <aside className={`hidden lg:flex fixed left-0 top-0 h-screen ${collapsed ? "w-[76px]" : "w-72"} border-r border-[var(--border-light)] z-20 flex-col shadow-xl transition-[width] duration-200`}>
        {collapsed ? railContent : sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 lg:hidden animate-fade-in"
            onClick={onClose}
          />
          <aside className="fixed left-0 top-0 h-full w-72 border-r border-[var(--border-light)] z-50 lg:hidden animate-slide-in flex flex-col shadow-2xl">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
