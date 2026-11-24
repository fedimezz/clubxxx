"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CreditCard, Banknote } from "lucide-react";
import BillingPeriodToggle from "@/components/billing/BillingPeriodToggle";
import CountrySelect from "@/components/payments/CountrySelect";
import ManualPaymentForm from "@/components/billing/ManualPaymentForm";
import PlanRowCard, { PlanRowList } from "@/components/pricing/PlanRowCard";
import { BILLING_PERIOD_SUFFIX, planPrice, yearlySavingsPercent, type BillingPeriod } from "@/lib/billing-period";

interface SaaSPlan {
  id: string;
  name: string;
  tier: string;
  priceMonthly: number;
  priceYearly: number | null;
  currency: string;
  limits: Record<string, unknown> | null;
}

interface AccessInfo {
  accessState: "ACTIVE" | "TRIAL" | "TRIAL_EXPIRED" | "SUSPENDED";
  canSelfReactivate: boolean;
  planUpgradesEnabled: boolean;
}

function limitFeature(key: string, value: unknown): string {
  const label = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase());
  if (typeof value === "boolean") return `${label} : ${value ? "inclus" : "non inclus"}`;
  if (typeof value === "number") return `${label} : ${value < 0 ? "illimité" : value.toLocaleString("fr-FR")}`;
  if (value === null) return `${label} : non disponible`;
  return `${label} : ${String(value)}`;
}

export default function ReactivateClubPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<SaaSPlan[]>([]);
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [country, setCountry] = useState("");
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [period, setPeriod] = useState<BillingPeriod>("MONTHLY");
  const [manualPlan, setManualPlan] = useState<SaaSPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentPending, setPaymentPending] = useState(false);
  const [paymentResult, setPaymentResult] = useState<string | null>(null);

  const bestSavings = useMemo(
    () => Math.max(0, ...plans.map((plan) => yearlySavingsPercent(plan))),
    [plans]
  );
  const yearlyAvailable = plans.some((plan) => planPrice(plan, "YEARLY") !== null);

  useEffect(() => {
    setPaymentResult(new URLSearchParams(window.location.search).get("payment"));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansResponse, accessResponse, countryResponse] = await Promise.all([
        fetch("/api/saas-plans", { cache: "no-store" }),
        fetch("/api/billing/trial", { credentials: "include", cache: "no-store" }),
        fetch("/api/payments/country", { cache: "no-store" }),
      ]);
      const [plansData, accessData, countryData] = await Promise.all([
        plansResponse.json().catch(() => null),
        accessResponse.json().catch(() => null),
        countryResponse.json().catch(() => null),
      ]);
      if (!plansResponse.ok || !Array.isArray(plansData?.plans)) {
        throw new Error(plansData?.error ?? "Impossible de charger les plans disponibles.");
      }
      if (!accessResponse.ok || !accessData?.accessState) {
        throw new Error(accessData?.error ?? "Impossible de vérifier l'état de votre club.");
      }
      setPlans(plansData.plans);
      setAccess(accessData);
      setCountry(typeof countryData?.countryCode === "string" ? countryData.countryCode : "");
      setStripeEnabled(countryData?.stripeEnabled === true);
      if (paymentResult === "success") setPaymentPending(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chargement impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  }, [paymentResult]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (paymentResult !== "success") return;
    let cancelled = false;
    const confirmActivation = async () => {
      for (let attempt = 0; attempt < 20 && !cancelled; attempt += 1) {
        try {
          const response = await fetch("/api/billing/trial", { credentials: "include", cache: "no-store" });
          const data = await response.json().catch(() => null);
          if (response.ok && ["ACTIVE", "TRIAL"].includes(data?.accessState)) {
            setPaymentPending(false);
            router.replace("/admin");
            return;
          }
        } catch (pollError) {
          console.error("Could not verify reactivation payment status:", pollError);
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (!cancelled) {
        setPaymentPending(false);
        setError("La confirmation du paiement prend plus de temps que prévu. Le club reste verrouillé jusqu'à sa confirmation. Actualisez cette page pour vérifier à nouveau.");
      }
    };
    void confirmActivation();
    return () => { cancelled = true; };
  }, [paymentResult, router]);

  const payByCard = async (plan: SaaSPlan) => {
    if (!access?.planUpgradesEnabled || busyPlanId) return;
    setBusyPlanId(plan.id);
    setError(null);
    try {
      const response = await fetch("/api/billing/reactivate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          billingPeriod: period,
          countryCode: country,
          payWith: "STRIPE",
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.paymentUrl !== "string") {
        throw new Error(data?.error ?? "Impossible de créer le paiement sécurisé.");
      }
      window.location.assign(data.paymentUrl);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Paiement impossible. Réessayez.");
    } finally {
      setBusyPlanId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-sm text-muted">
        <Loader2 className="h-5 w-5 animate-spin" /> Chargement des plans…
      </div>
    );
  }

  const cannotSelfReactivate = access?.canSelfReactivate === false;
  const upgradesDisabled = access?.planUpgradesEnabled === false;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">ClubX · Abonnement</p>
        <h1 className="text-3xl font-black text-primary">Réactiver mon club</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted">
          {access?.accessState === "TRIAL_EXPIRED"
            ? "Votre essai est terminé. Choisissez un plan pour réactiver votre club."
            : "Votre club est suspendu. Choisissez un plan pour réactiver votre club."}
          {" "}Vos membres, plannings, réservations et historiques sont conservés.
        </p>
      </header>

      {paymentResult === "cancelled" && (
        <p className="rounded-xl bg-amber-500/10 p-4 text-sm font-semibold text-amber-700">
          Paiement annulé. Votre club reste verrouillé ; vous pouvez choisir un plan et réessayer.
        </p>
      )}
      {paymentPending && (
        <p className="rounded-xl bg-sky-500/10 p-4 text-sm font-semibold text-sky-700">
          Paiement reçu. Vérification sécurisée en cours ; votre club s&apos;ouvrira dès que le paiement sera confirmé.
        </p>
      )}
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-500/10 p-4 text-sm text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={() => void loadData()} className="font-bold underline">Réessayer</button>
        </div>
      )}

      {cannotSelfReactivate ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm leading-6 text-muted">
          Ce club a été suspendu par la plateforme et ne peut pas être réactivé par un paiement automatique.
          Contactez le support ClubX pour obtenir de l&apos;aide.
        </div>
      ) : (
        <>
          {upgradesDisabled && (
            <p role="status" className="rounded-xl bg-amber-500/10 p-4 text-sm font-semibold text-amber-800">
              Les changements de plan sont temporairement désactivés. Contactez le support ClubX.
            </p>
          )}

          <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-card p-4">
            <div className="min-w-[220px] flex-1">
              <p className="mb-2 text-xs font-bold text-muted">Pays de paiement</p>
              <CountrySelect value={country} onChange={setCountry} />
            </div>
            <BillingPeriodToggle
              value={period}
              onChange={setPeriod}
              savingsPercent={bestSavings}
              yearlyAvailable={yearlyAvailable}
            />
          </div>

          {plans.length > 0 ? (
            <PlanRowList>
              {plans.map((plan) => {
                const price = planPrice(plan, period);
                const features = Object.entries(plan.limits ?? {}).map(([key, value]) => limitFeature(key, value));
                const isTunisia = country === "TN";
                const manualOnly = isTunisia || !stripeEnabled || plan.currency.toUpperCase() !== "USD";
                return (
                  <PlanRowCard
                    key={plan.id}
                    name={plan.name}
                    eyebrow={plan.tier}
                    description="Plan géré par ClubX"
                    features={features}
                    price={price === null ? "—" : `${price} ${plan.currency}`}
                    period={price === null ? undefined : BILLING_PERIOD_SUFFIX[period]}
                    current={manualPlan?.id === plan.id}
                    highlighted={manualPlan?.id === plan.id}
                    action={{
                      label: busyPlanId === plan.id
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Préparation…</>
                        : manualOnly
                          ? <><Banknote className="h-4 w-4" /> Choisir ce plan</>
                          : <><CreditCard className="h-4 w-4" /> Réactiver ce plan</>,
                      disabled: upgradesDisabled || price === null || (!manualOnly && !country) || busyPlanId !== null,
                      onClick: () => {
                        if (manualOnly) setManualPlan(plan);
                        else void payByCard(plan);
                      },
                    }}
                  />
                );
              })}
            </PlanRowList>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted">
              Aucun plan public n&apos;est actuellement disponible. Contactez le support ClubX.
            </div>
          )}

          {manualPlan && !upgradesDisabled && (
            <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-lg font-bold text-primary">Paiement sans carte</h2>
              <ManualPaymentForm
                endpoint="/api/billing/reactivate"
                extraBody={{ countryCode: country || "TN" }}
                planId={manualPlan.id}
                billingPeriod={period}
                planLabel={`${manualPlan.name} — ${planPrice(manualPlan, period)} ${manualPlan.currency} ${BILLING_PERIOD_SUFFIX[period]}`}
              />
              <button type="button" onClick={() => setManualPlan(null)} className="text-xs text-muted underline">
                Annuler
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
