"use client";

import DemoModeBanner from "@/components/admin/DemoModeBanner";
import SetupChecklist from "@/components/admin/SetupChecklist";
import DashboardView from "@/components/admin/dashboard/DashboardView";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";

// /admin — owner & admin dashboard. The visual dashboard lives in DashboardView (real data from
// GET /api/admin/dashboard); the setup checklist and the trial banner stay on top as before.
export default function AdminOverviewPage() {
  const { userRole } = useAuth();
  const isOwner = userRole?.toUpperCase() === "OWNER";
  const [trialEndsAt, setTrialEndsAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    fetch("/api/billing/trial", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setTrialEndsAt(j?.state === "ACTIVE" ? (j?.endsAt ?? null) : undefined); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [isOwner]);

  return (
    <div className="space-y-6">
      <SetupChecklist />
      {isOwner && trialEndsAt !== undefined && <DemoModeBanner trialEndsAt={trialEndsAt} />}
      <DashboardView />
    </div>
  );
}
