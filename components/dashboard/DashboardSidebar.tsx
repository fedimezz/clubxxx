// src/components/dashboard/DashboardSidebar.tsx
"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useClubSettings } from "@/context/ClubSettingsContext";
import { ClubLogo } from "@/components/ClubLogo";
import MemberNav from "@/components/member/MemberNav";
import MemberVipCard from "@/components/member/MemberVipCard";

export default function DashboardSidebar() {
  const { userRole, logout } = useAuth();
  const { name: clubName, logoUrl } = useClubSettings();
  const isCoach = userRole?.toUpperCase() === "COACH";

  return (
    <aside className="mx-sidebar hidden lg:flex fixed left-0 top-0 h-screen w-64 border-r border-border z-20 flex-col overflow-hidden">
      <Link href="/dashboard" className="flex items-center gap-3 px-5 pt-6 pb-5 flex-shrink-0" aria-label="Tableau de bord">
        <ClubLogo logoUrl={logoUrl} clubName={clubName} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold leading-tight text-primary">{clubName}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--primary)]">
            {isCoach ? "Espace coach" : "Espace membre"}
          </p>
        </div>
      </Link>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        <MemberNav />
      </div>

      {!isCoach && (
        <div className="px-3 pb-3 flex-shrink-0">
          <MemberVipCard />
        </div>
      )}

      <div className="border-t border-border p-3 flex-shrink-0">
        <button
          onClick={() => void logout()}
          className="mx-nav w-full text-danger hover:!bg-danger/10"
        >
          <LogOut size={19} aria-hidden />
          <span>Déconnexion</span>
        </button>
        <p className="mt-2 px-3 text-[10px] text-muted">Propulsé par ClubX</p>
      </div>
    </aside>
  );
}
