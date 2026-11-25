"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarCheck, CalendarX, History, Loader2, RefreshCw, Search, Ban } from "lucide-react";

import BookingTabs from "@/components/bookings/BookingTabs";
import BookingCard, { type Booking } from "@/components/bookings/BookingCard";
import BookingDetailsModal from "@/components/bookings/BookingDetailsModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { ACTIVITY_LABELS } from "@/components/member/DashboardWidgets";
import { filterBookings, type BookingTab } from "@/lib/booking-status";

interface BookingsData {
  upcoming: Booking[];
  past: Booking[];
  cancelled: Booking[];
  timeZone?: string;
}

const EMPTY: Record<BookingTab, { title: string; description: string }> = {
  upcoming: { title: "Aucune réservation à venir", description: "Choisissez une séance dans le planning de votre club pour la retrouver ici." },
  past: { title: "Pas encore d’historique", description: "Vos séances passées apparaîtront ici une fois la semaine terminée." },
  cancelled: { title: "Aucune réservation annulée", description: "Les réservations que vous annulez sont conservées ici." },
};

function BookingsContent() {
  const toast = useToast();
  const [data, setData] = useState<BookingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<BookingTab>("upcoming");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [toCancel, setToCancel] = useState<Booking | null>(null);
  const [details, setDetails] = useState<Booking | null>(null);
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("ALL");
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Keep statuses ("En cours", "Terminée") fresh without a reload.
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const fetchBookings = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setIsRefreshing(true);
    try {
      const res = await fetch("/api/bookings", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json) {
        setData(json);
        setLoadError(null);
      } else {
        const msg = json?.error || "Impossible de charger vos réservations.";
        if (showLoading) setLoadError(msg);
        else toast.error(msg);
      }
    } catch {
      const msg = "Connexion impossible. Vérifiez votre réseau.";
      if (showLoading) setLoadError(msg);
      else toast.error(msg);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchBookings(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cancellation goes through the existing endpoint; nothing is shown as cancelled until it answers OK.
  const confirmCancel = async () => {
    if (!toCancel) return;
    const sessionId = toCancel.sessionId;
    setCancellingId(sessionId);
    try {
      const res = await fetch("/api/dashboard/schedule/book", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Réservation annulée.");
        setToCancel(null);
        setDetails(null);
        void fetchBookings(false);
      } else {
        toast.error(json.error || "L’annulation a échoué. Réessayez.");
        setToCancel(null);
      }
    } catch {
      toast.error("Connexion impossible. Votre réservation n’a pas été modifiée.");
      setToCancel(null);
    } finally {
      setCancellingId(null);
    }
  };

  const activities = useMemo(() => {
    if (!data) return [] as string[];
    return Array.from(new Set([...data.upcoming, ...data.past, ...data.cancelled].map((b) => b.session.activity))).sort();
  }, [data]);

  const list = useMemo(
    () => (data ? filterBookings(data[activeTab], { query, activity, activityLabels: ACTIVITY_LABELS }) : []),
    [data, activeTab, query, activity]
  );

  if (loading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Chargement de vos réservations">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" rounded="rounded-2xl" />)}</div>
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" rounded="rounded-2xl" />)}
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="mx-auto mt-10 max-w-md">
        <EmptyState
          icon={AlertTriangle}
          title="Impossible d’afficher vos réservations"
          description={loadError ?? "Une erreur est survenue."}
          action={<button onClick={() => void fetchBookings(true)} className="mx-cta px-5 py-2.5 text-sm"><RefreshCw size={15} aria-hidden />Réessayer</button>}
        />
      </div>
    );
  }

  const counts = { upcoming: data.upcoming.length, past: data.past.length, cancelled: data.cancelled.length };
  const filtering = query.trim() !== "" || activity !== "ALL";
  const overview = [
    { key: "upcoming" as const, label: "À venir", icon: CalendarCheck, tint: "green" },
    { key: "past" as const, label: "Historique", icon: History, tint: "blue" },
    { key: "cancelled" as const, label: "Annulées", icon: Ban, tint: "purple" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-primary sm:text-4xl">Mes réservations</h1>
          <p className="mt-1 text-muted">Consultez, gérez et retrouvez toutes vos séances réservées.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void fetchBookings(false)} disabled={isRefreshing} className="mx-ghost px-4 py-2.5 text-sm">
            {isRefreshing ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <RefreshCw size={15} aria-hidden />}
            {isRefreshing ? "Actualisation…" : "Actualiser"}
          </button>
          <Link href="/dashboard/schedule" className="mx-cta px-4 py-2.5 text-sm">Réserver une séance</Link>
        </div>
      </div>

      <section aria-label="Aperçu" className="grid gap-3 sm:grid-cols-3">
        {overview.map(({ key, label, icon: Icon, tint }, i) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`mx-kpi mx-tint-${tint} mx-rise flex items-center gap-3 p-4 text-left`} style={{ ["--i" as string]: i } as React.CSSProperties} aria-pressed={activeTab === key}>
            <span className="mx-kpi-icon"><Icon size={22} aria-hidden /></span>
            <span>
              <span className="block text-3xl font-extrabold leading-none text-primary">{counts[key]}</span>
              <span className="text-sm text-muted">{label}</span>
            </span>
          </button>
        ))}
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <BookingTabs active={activeTab} onChange={setActiveTab} counts={counts} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-64">
            <label htmlFor="booking-search" className="sr-only">Rechercher une réservation</label>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input id="booking-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Activité, coach, lieu…" className="mx-input pl-9" />
          </div>
          <div>
            <label htmlFor="booking-activity" className="sr-only">Filtrer par activité</label>
            <select id="booking-activity" value={activity} onChange={(e) => setActivity(e.target.value)} className="mx-input sm:w-48">
              <option value="ALL">Toutes les activités</option>
              {activities.map((a) => <option key={a} value={a}>{ACTIVITY_LABELS[a] ?? a}</option>)}
            </select>
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        filtering ? (
          <EmptyState icon={Search} title="Aucun résultat" description="Aucune réservation ne correspond à votre recherche." action={<button onClick={() => { setQuery(""); setActivity("ALL"); }} className="mx-ghost px-4 py-2 text-sm">Effacer les filtres</button>} />
        ) : (
          <EmptyState
            icon={CalendarX}
            title={EMPTY[activeTab].title}
            description={EMPTY[activeTab].description}
            action={activeTab !== "past" ? <Link href="/dashboard/schedule" className="mx-cta px-5 py-2.5 text-sm">Voir le planning</Link> : undefined}
          />
        )
      ) : (
        <ul className="space-y-3" aria-live="polite">
          {list.map((booking) => (
            <li key={booking.id}>
              <BookingCard
                booking={booking}
                tab={activeTab}
                nowMs={nowMs}
                onDetails={setDetails}
                onCancel={() => setToCancel(booking)}
                cancelling={cancellingId === booking.sessionId}
              />
            </li>
          ))}
        </ul>
      )}

      {details && (
        <BookingDetailsModal
          booking={details}
          tab={activeTab}
          nowMs={nowMs}
          timeZone={data.timeZone ?? "Africa/Tunis"}
          cancelling={cancellingId === details.sessionId}
          onClose={() => setDetails(null)}
          onCancel={() => setToCancel(details)}
        />
      )}

      {toCancel && (
        <ConfirmDialog
          title="Annuler cette réservation ?"
          description={`${ACTIVITY_LABELS[toCancel.session.activity] ?? toCancel.session.activity} · ${toCancel.session.startTime} – ${toCancel.session.endTime}. Votre place sera libérée pour les autres membres.`}
          confirmLabel="Oui, annuler"
          cancelLabel="Garder ma place"
          loading={cancellingId === toCancel.sessionId}
          onConfirm={() => void confirmCancel()}
          onCancel={() => setToCancel(null)}
        />
      )}
    </div>
  );
}

export default function BookingsPage() {
  return (
    <ToastProvider>
      <BookingsContent />
    </ToastProvider>
  );
}
