"use client";

import Link from "next/link";
import { ArrowRight, Crown } from "lucide-react";

/** Sidebar teaser → the membership page (real plans live there; nothing is promised here). */
export default function MemberVipCard() {
  return (
    <div className="mx-vip p-4 text-center">
      <Crown size={22} className="mx-auto text-amber-400" aria-hidden />
      <p className="mt-1 text-sm font-extrabold text-amber-400">Pass Membre</p>
      <p className="mt-1 text-xs text-muted">Consultez les formules de votre club et gérez votre adhésion.</p>
      <Link href="/dashboard/membership" className="mx-cta mt-3 w-full px-3 py-2 text-xs">
        Découvrir <ArrowRight size={14} aria-hidden />
      </Link>
    </div>
  );
}
