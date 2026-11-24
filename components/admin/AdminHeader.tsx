"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sun, Moon, ChevronDown, UserCircle, Home, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { adminLinks } from "@/lib/navigation";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useClubSettings } from "@/context/ClubSettingsContext";
import NotificationBell from "@/components/layout/NotificationBell";
import GlobalSearch from "@/components/admin/GlobalSearch";
import Tooltip from "@/components/ui/Tooltip";

interface Props {
  onMobileMenu: () => void;
  role: "ADMIN" | "OWNER";
  locked?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function AdminHeader({ onMobileMenu, role, locked = false, collapsed = false, onToggleCollapse }: Props) {
  const pathname = usePathname();
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { name: clubName, logoUrl } = useClubSettings();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, []);

  const current = adminLinks.find((l) => (l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href)));
  const avatar = typeof user?.avatar === "string" ? user.avatar : typeof user?.image === "string" ? (user.image as string) : null;
  const initials = (user?.name ?? "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  return (
    <header className="theme-nav sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--border-light)] bg-card px-3 backdrop-blur sm:px-6">
      <button onClick={onMobileMenu} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted lg:hidden" aria-label="Ouvrir le menu">
        <Menu size={20} className="text-primary" />
      </button>
      {onToggleCollapse && (
        <Tooltip label={collapsed ? "Déployer le menu" : "Réduire le menu"} side="bottom" className="hidden lg:inline-flex">
          <button onClick={onToggleCollapse} aria-label={collapsed ? "Déployer le menu" : "Réduire le menu"} aria-pressed={collapsed} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted">
            {collapsed ? <PanelLeftOpen size={18} className="text-primary" /> : <PanelLeftClose size={18} className="text-primary" />}
          </button>
        </Tooltip>
      )}

      <div className="hidden min-w-0 items-center gap-3 md:flex">
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--border-light)] bg-muted/30">
          {logoUrl ? <Image src={logoUrl} alt="" width={36} height={36} className="h-full w-full object-cover" /> : <span className="text-xs font-bold text-[var(--primary)]">{(clubName || "C").charAt(0)}</span>}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-primary">{clubName || "Mon club"}</p>
          <p className="truncate text-xs text-muted">{locked ? "Réactiver mon club" : current?.name ?? "Tableau de bord"}</p>
        </div>
      </div>

      {!locked && <div className="hidden flex-1 justify-start px-2 sm:flex"><GlobalSearch role={role} /></div>}
      <div className="flex-1 sm:hidden" />

      {!locked && (
        <div className="flex items-center gap-1 sm:gap-2">
          <span className="hidden whitespace-nowrap rounded-lg px-2 text-xs capitalize text-muted xl:block">{today}</span>
          <Tooltip label={isDark ? "Mode clair" : "Mode sombre"} side="bottom">
            <button onClick={toggleTheme} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted" aria-label="Basculer le mode clair / sombre">
              {isDark ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-primary" />}
            </button>
          </Tooltip>
          <NotificationBell />
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu} className="flex items-center gap-2 rounded-full border border-[var(--border-light)] p-1 pr-2.5 transition hover:border-[var(--primary)]/50 hover:bg-muted">
              <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[var(--primary)] text-xs font-bold text-[var(--brand-contrast)]">
                {avatar ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={avatar} alt="" className="h-full w-full object-cover" /> : initials}
              </span>
              <span className="hidden text-left leading-tight lg:block">
                <span className="block max-w-[120px] truncate text-xs font-semibold text-primary">{user?.name}</span>
                <span className="block text-[10px] uppercase tracking-wide text-muted">{role === "OWNER" ? "Propriétaire" : "Administrateur"}</span>
              </span>
              <ChevronDown size={14} className="hidden text-muted lg:block" aria-hidden />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-[var(--border-light)] bg-[var(--bg-card)] p-1.5 shadow-xl">
                <p className="truncate px-3 py-2 text-xs text-muted">{user?.email}</p>
                <Link role="menuitem" href="/admin/profile" onClick={() => setMenu(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-primary hover:bg-muted"><UserCircle size={15} /> Mon profil</Link>
                <Link role="menuitem" href="/" onClick={() => setMenu(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-primary hover:bg-muted"><Home size={15} /> Site public</Link>
                <button role="menuitem" onClick={() => { setMenu(false); void logout(); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-500 hover:bg-rose-500/10"><LogOut size={15} /> Déconnexion</button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
