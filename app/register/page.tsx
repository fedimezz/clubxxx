import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isTenantHost } from "@/lib/host";

export default async function RegisterPage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost";
  // x-club-slug is set by proxy.ts (subdomain, or /c/<slug> + cookie in single-address mode).
  const inClub = isTenantHost(host) || !!requestHeaders.get("x-club-slug");
  redirect(inClub ? "/user/register" : "/onboarding");
}