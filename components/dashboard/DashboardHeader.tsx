"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Bell, Menu, ChevronDown, X, LogOut, Sun, Moon, Search, User, Settings } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useClubSettings } from "@/context/ClubSettingsContext";
import { ClubLogo } from "@/components/ClubLogo";
import MemberNav from "@/components/member/MemberNav";
import { useMemberShell } from "@/components/member/MemberShell";

export default function DashboardHeader() {
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const { logout, userRole, user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { name: clubName, logoUrl } = useClubSettings();
  const { notifications, unreadCount, loading } = useMemberShell();
  const isCoach = userRole?.toUpperCase() === "COACH";

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const t = event.target as HTMLElement;
      if (!t.closest(".notifications-dropdown")) setShowNotifications(false);
      if (!t.closest(".profile-dropdown")) setShowProfile(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setShowNotifications(false);
        setShowProfile(false);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    // Members search sessions (activity / coach) in the planning; coaches have no planning page.
    router.push(isCoach ? "/dashboard/coach" : q ? `/dashboard/schedule?q=${encodeURIComponent(q)}` : "/dashboard/schedule");
  };

  const avatar = typeof user?.avatar === "string" && user.avatar.startsWith("https://") ? user.avatar : null;
  const initial = user?.name?.trim()?.charAt(0)?.toUpperCase() || "?";

  return (
    <>
      <header className="relative z-30 flex-shrink-0 border-b border-border bg-[var(--bg-secondary)]/90 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden rounded-lg p-2 hover:bg-muted transition-colors" aria-label="Ouvrir le menu">
            <Menu size={20} className="text-primary" />
          </button>

          {!isCoach ? (
            <form onSubmit={submitSearch} role="search" className="relative hidden max-w-md flex-1 sm:block">
              <label htmlFor={searchId} className="sr-only">Rechercher une activité ou un coach</label>
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input
                id={searchId}
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher une activité, un coach…"
                className="mx-input !rounded-xl !py-2 pl-10 pr-14"
                autoComplete="off"
              />
              <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted md:block">⌘ K</kbd>
            </form>
          ) : (
            <p className="hidden text-sm font-semibold text-primary sm:block">{clubName}</p>
          )}
          <p className="min-w-0 flex-1 truncate text-base font-bold text-primary sm:hidden">{clubName}</p>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button onClick={toggleTheme} className="rounded-lg p-2 hover:bg-muted transition-colors" aria-label="Basculer le thème">
              {isDark ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-primary" />}
            </button>

            <div className="relative notifications-dropdown">
              <button
                onClick={() => { setShowNotifications((v) => !v); setShowProfile(false); }}
                className="relative rounded-lg p-2 hover:bg-muted transition-colors"
                aria-label={unreadCount > 0 ? `${unreadCount} notifications non lues` : "Notifications"}
                aria-expanded={showNotifications}
                aria-haspopup="true"
              >
                <Bell size={20} className={unreadCount > 0 ? "text-primary" : "text-muted"} />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 h-[18px] min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-[var(--bg-secondary)]">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card shadow-2xl">
                  <div className="flex items-center justify-between border-b border-border p-3">
                    <div>
                      <h3 className="font-semibold text-primary">Notifications</h3>
                      {unreadCount > 0 && <p className="mt-0.5 text-[11px] font-medium text-red-500">{unreadCount} non lue{unreadCount > 1 ? "s" : ""}</p>}
                    </div>
                    <Link href="/dashboard/notifications" onClick={() => setShowNotifications(false)} className="text-xs font-semibold text-[var(--primary)] hover:underline">Tout voir</Link>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {loading ? (
                      <div className="p-3 text-sm text-muted">Chargement…</div>
                    ) : notifications.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted">Aucune notification pour le moment.</div>
                    ) : (
                      notifications.map((item) => (
                        <div key={item.id} className={`border-b border-border p-3 last:border-0 ${item.isRead ? "" : "bg-muted/40"}`}>
                          <div className="flex items-start gap-2">
                            {!item.isRead && <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-red-500" aria-label="Non lue" />}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-primary">{item.title}</p>
                              {item.message && <p className="mt-1 line-clamp-2 text-xs text-muted">{item.message}</p>}
                              <p className="mt-1 text-[11px] text-muted">
                                {new Date(item.sentAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative profile-dropdown">
              <button
                onClick={() => { setShowProfile((v) => !v); setShowNotifications(false); }}
                className="flex items-center gap-2.5 rounded-xl p-1.5 pr-2 hover:bg-muted transition-colors"
                aria-label="Menu du profil"
                aria-expanded={showProfile}
                aria-haspopup="true"
              >
                <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--primary)] text-sm font-bold text-[var(--brand-contrast)]">
                  {avatar ? <Image src={avatar} alt="" width={36} height={36} className="h-full w-full object-cover" /> : initial}
                </span>
                <span className="hidden max-w-[150px] text-left md:block">
                  <span className="block truncate text-xs font-semibold text-primary">{user?.name || "Mon profil"}</span>
                  <span className="block truncate text-[11px] text-muted">{isCoach ? "Coach" : "Membre"}</span>
                </span>
                <ChevronDown size={16} className="hidden text-muted sm:block" aria-hidden />
              </button>
              {showProfile && (
                <div role="menu" className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-border bg-card p-1.5 shadow-2xl">
                  <Link role="menuitem" href="/dashboard/profile" onClick={() => setShowProfile(false)} className="mx-nav"><User size={17} aria-hidden />Mon profil</Link>
                  <Link role="menuitem" href="/dashboard/settings" onClick={() => setShowProfile(false)} className="mx-nav"><Settings size={17} aria-hidden />Paramètres</Link>
                  <div className="my-1 border-t border-border" />
                  <button role="menuitem" onClick={() => void logout()} className="mx-nav w-full text-danger hover:!bg-danger/10"><LogOut size={17} aria-hidden />Déconnexion</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden animate-fade-in" onClick={() => setMobileMenuOpen(false)} aria-hidden />
          <aside className="mx-sidebar fixed left-0 top-0 z-50 h-full w-72 max-w-[85vw] overflow-y-auto border-r border-border lg:hidden animate-slide-in" aria-label="Menu">
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <ClubLogo logoUrl={logoUrl} clubName={clubName} size="md" />
                <p className="truncate text-lg font-extrabold text-primary">{clubName}</p>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="rounded-lg p-2 hover:bg-muted" aria-label="Fermer le menu"><X size={20} className="text-primary" /></button>
            </div>
            <div className="px-3 pb-3"><MemberNav onNavigate={() => setMobileMenuOpen(false)} /></div>
            <div className="border-t border-border p-3">
              <button onClick={() => void logout()} className="mx-nav w-full text-danger hover:!bg-danger/10"><LogOut size={19} aria-hidden /><span>Déconnexion</span></button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
