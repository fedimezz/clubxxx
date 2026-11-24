"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminSectionTabs from "@/components/admin/AdminSectionTabs";
import { ToastProvider } from "@/components/ui/Toast";
import "./admin-ui.css";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { isLoggedIn, userRole, isLoading } = useAuth();
    const [mobileOpen, setMobileOpen] = useState(false);
    // Collapsed (icon rail) sidebar on desktop; remembered per browser (storage can be unavailable).
    const [collapsed, setCollapsed] = useState(false);
    useEffect(() => {
        try { setCollapsed(localStorage.getItem("clubx.admin.sidebar") === "collapsed"); } catch { /* ignore */ }
    }, []);
    const toggleCollapsed = () => setCollapsed((c) => {
        const next = !c;
        try { localStorage.setItem("clubx.admin.sidebar", next ? "collapsed" : "expanded"); } catch { /* ignore */ }
        return next;
    });
    const [accessReady, setAccessReady] = useState(false);
    const [clubLocked, setClubLocked] = useState(false);
    const [accessError, setAccessError] = useState(false);

    const roleUpper = userRole?.toUpperCase() ?? null;
    const isAuthorized =
        isLoggedIn && (roleUpper === "ADMIN" || roleUpper === "OWNER");

    // Guided website setup gate. A brand-new owner (phase "initial") must
    // personalise the club's website FIRST: until they publish it, every other
    // /admin page redirects to the wizard and the sidebar only shows the wizard.
    // null = not known yet (loading / not an owner).
    const isOwner = roleUpper === "OWNER";
    const [setupPhase, setSetupPhase] = useState<string | null>(null);
    // Encoded as "<phase>" or "<phase>:<mode>" so the existing phase checks keep working.
    const readSetupPhase = () =>
        fetch("/api/admin/website-setup", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => {
                if (!j?.phase) return "unknown";
                // Not chosen yet (right after payment): the owner must pick a way to build the site first.
                if (j.phase === "initial" && !j.websiteSetupMode) return "choose";
                // PRO / MANUAL: no forced wizard — the dashboard is available straight away.
                if (j.phase === "initial" && j.websiteSetupMode !== "WIZARD") return "free";
                return j.phase as string;
            })
            .catch(() => "unknown");

    const readAccessState = () =>
        fetch("/api/billing/trial", { credentials: "include", cache: "no-store" })
            .then(async (response) => {
                const data = await response.json().catch(() => null);
                if (!response.ok || !data) throw new Error("État du club indisponible.");
                setClubLocked(data.accessState === "TRIAL_EXPIRED" || data.accessState === "SUSPENDED");
                setAccessError(false);
                setAccessReady(true);
            })
            .catch(() => {
                setAccessError(true);
                setAccessReady(true);
            });

    useEffect(() => {
        if (!isOwner) {
            setAccessReady(true);
            return;
        }
        void readAccessState();
    }, [isOwner]);

    useEffect(() => {
        if (!isOwner || !accessReady || clubLocked) return;
        let cancelled = false;
        readSetupPhase().then((phase) => { if (!cancelled) setSetupPhase(phase); });
        return () => { cancelled = true; };
    }, [isOwner, accessReady, clubLocked]);

    const wizardRequired = isOwner && (setupPhase === "initial" || setupPhase === "choose");
    const onWizardPage =
        pathname.startsWith("/admin/get-started") ||
        (setupPhase !== "choose" && pathname.startsWith("/admin/website-setup"));
    const waitingForSetupCheck = isOwner && (!accessReady || (!clubLocked && setupPhase === null));

    // Off the wizard while setup looks unfinished: re-read the phase from the
    // server before bouncing back (the wizard navigates away right after
    // publishing, so the cached "initial" may be stale).
    useEffect(() => {
        if (!accessReady || clubLocked || !wizardRequired || onWizardPage) return;
        let cancelled = false;
        readSetupPhase().then((phase) => {
            if (cancelled) return;
            // Always store the fresh value: the owner may have just chosen a mode on
            // /admin/get-started, and a stale "choose" would otherwise keep the spinner up.
            setSetupPhase(phase);
            if (phase === "choose") router.replace("/admin/get-started");
            else if (phase === "initial") router.replace("/admin/website-setup");
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessReady, clubLocked, wizardRequired, onWizardPage, pathname]);

    useEffect(() => {
        if (!accessReady || !clubLocked || pathname === "/admin/reactivate" || pathname.startsWith("/admin/profile")) return;
        router.replace("/admin/reactivate");
    }, [accessReady, clubLocked, pathname, router]);

    useEffect(() => {
        if (!accessReady || clubLocked || pathname !== "/admin/reactivate") return;
        router.replace("/admin");
    }, [accessReady, clubLocked, pathname, router]);

    useEffect(() => {
        if (isLoading) return;
        if (!isLoggedIn) {
            // Send unauthenticated users to the member/club login, NOT to the
            // platform super-admin login. /platform/login is only for SUPER_ADMIN.
            router.replace("/user/login");
            return;
        }
        if (!isAuthorized) {
            router.replace("/dashboard");
        }
    }, [isLoading, isLoggedIn, isAuthorized, router]);

    if (isLoading) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-primary z-50">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
                    <p className="text-sm text-muted">Vérification des accès...</p>
                </div>
            </div>
        );
    }

    if (isOwner && accessError) {
        return (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-primary px-6 text-center">
                <p className="text-sm text-muted">Impossible de vérifier l&apos;état de votre club.</p>
                <button
                    type="button"
                    onClick={() => { setAccessReady(false); void readAccessState(); }}
                    className="rounded-full bg-[var(--primary)] px-5 py-2 text-sm font-bold text-white"
                >
                    Réessayer
                </button>
            </div>
        );
    }

    // As with the dashboard layout, this is a fast client-side UX check.
    // The actual access control for /admin/* happens in proxy.ts, which
    // verifies the httpOnly cookie's JWT before the request ever reaches here.
    if (!isAuthorized || waitingForSetupCheck || (wizardRequired && !onWizardPage)) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-primary z-50">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
                    <p className="text-sm text-muted">Vérification des accès...</p>
                </div>
            </div>
        );
    }

    return (
        <ToastProvider>
            <div className="clubx-admin fixed inset-0 z-50 flex bg-primary overflow-hidden">
                <AdminSidebar
                    collapsed={collapsed}
                    role={roleUpper as "ADMIN" | "OWNER"}
                    mobileOpen={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    wizardOnly={wizardRequired}
                    locked={clubLocked}
                />
                <div className={`flex-1 ${collapsed ? "lg:ml-[76px]" : "lg:ml-72"} flex flex-col min-w-0 overflow-hidden transition-[margin] duration-200`}>
                    <AdminHeader
                        onMobileMenu={() => setMobileOpen(true)}
                        role={roleUpper as "ADMIN" | "OWNER"}
                        locked={clubLocked}
                        collapsed={collapsed}
                        onToggleCollapse={toggleCollapsed}
                    />
                    <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
                        {!clubLocked && !wizardRequired && <AdminSectionTabs role={roleUpper as "ADMIN" | "OWNER"} />}
                        {children}
                    </main>
                </div>
            </div>
        </ToastProvider>
    );
}