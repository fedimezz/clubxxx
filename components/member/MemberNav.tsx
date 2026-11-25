"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Shield, Smartphone } from "lucide-react";
import { coachLinks, dashboardLinks, isLinkActive } from "@/lib/navigation";
import { useAuth } from "@/context/AuthContext";
import { useMemberShell } from "@/components/member/MemberShell";

/** Navigation list shared by the desktop sidebar and the mobile drawer (single source: lib/navigation). */
export default function MemberNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { userRole } = useAuth();
  const { unreadCount } = useMemberShell();
  const roleUpper = userRole?.toUpperCase();
  const isAdmin = roleUpper === "ADMIN" || roleUpper === "OWNER";
  const links = roleUpper === "COACH" ? coachLinks : dashboardLinks;

  return (
    <nav aria-label="Navigation principale" className="space-y-1">
      {links.map((link) => {
        const Icon = link.icon;
        const active = isLinkActive(pathname, link.href);
        const isNotifications = link.href === "/dashboard/notifications";
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className="mx-nav"
          >
            <Icon size={19} className="shrink-0" aria-hidden />
            <span className="truncate">{link.name}</span>
            {isNotifications && unreadCount > 0 && (
              <span className="mx-badge" aria-label={`${unreadCount} non lues`}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        );
      })}

      {isAdmin && (
        <>
          <div className="my-3 border-t border-border" />
          <Link href="/admin" onClick={onNavigate} className="mx-nav border border-[var(--primary)]/30 text-[var(--primary)]">
            <Shield size={19} className="shrink-0" aria-hidden />
            <span className="truncate">Admin Dashboard</span>
          </Link>
        </>
      )}

      <div className="my-3 border-t border-border" />
      <Link href="/" onClick={onNavigate} className="mx-nav">
        <Home size={19} className="shrink-0" aria-hidden />
        <span className="truncate">Accueil du site</span>
      </Link>
      <Link href="/download" onClick={onNavigate} className="mx-nav">
        <Smartphone size={19} className="shrink-0" aria-hidden />
        <span className="truncate">Application mobile</span>
      </Link>
    </nav>
  );
}
