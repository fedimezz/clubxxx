"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { Loader2 } from "lucide-react";
import { MemberShellProvider } from "@/components/member/MemberShell";
import "./member-ui.css";

export default function DashboardLayout({
                                          children,
                                        }: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isLoggedIn, userRole, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isLoggedIn) {
      router.replace("/user/login");
      return;
    }

    const roleUpper = userRole?.toUpperCase();
    if (roleUpper === "ADMIN" || roleUpper === "OWNER") {
      router.replace("/admin");
    }
  }, [isLoading, isLoggedIn, userRole, router]);

  const roleUpper = userRole?.toUpperCase();
  const authorized =
      !isLoading && isLoggedIn && roleUpper !== "ADMIN" && roleUpper !== "OWNER";

  if (isLoading || !authorized) {
    return (
        <div className="clubx-member flex items-center justify-center min-h-screen bg-[var(--bg-primary)]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={44} className="animate-spin text-[var(--primary)]" />
            <p className="text-sm text-muted">Chargement du tableau de bord...</p>
          </div>
        </div>
    );
  }

  return (
      <MemberShellProvider>
        <div className="clubx-member h-screen overflow-hidden bg-[var(--bg-primary)] text-primary">
          <DashboardSidebar />
          <div className="lg:pl-64 flex flex-col h-full">
            <DashboardHeader />
            <main id="main-content" className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 pb-10">
              <div className="max-w-7xl mx-auto">
                {children}
              </div>
            </main>
          </div>
        </div>
      </MemberShellProvider>
  );
}
