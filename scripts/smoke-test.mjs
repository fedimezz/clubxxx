import process from "node:process";

const baseUrl = (process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const checks = [];

function label(name) {
  return `CHECK ${name}`;
}

function record(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${label(name)}${detail ? ` - ${detail}` : ""}`);
}

async function fetchJson(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...options,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, headers: res.headers, body: text, json };
}

async function run() {
  const root = await fetchJson("/");
  record("root-200", root.status === 200, `status=${root.status}`);

  const manifest = await fetchJson("/manifest.webmanifest");
  record("manifest-200", manifest.status === 200, `status=${manifest.status}`);

  const headers = root.headers;
  const csp = headers.get("content-security-policy") || "";
  const hsts = headers.get("strict-transport-security") || "";
  const xcto = headers.get("x-content-type-options") || "";
  const frameAncestors = csp.toLowerCase().includes("frame-ancestors") || csp.toLowerCase().includes("frame-ancestors 'none'");
  const coop = headers.get("cross-origin-opener-policy") || "";
  record("security-headers", !!csp && !!hsts && xcto.toLowerCase() === "nosniff" && frameAncestors && coop.toLowerCase().includes("same-origin"), `CSP=${!!csp} HSTS=${!!hsts} X-Content-Type-Options=${xcto} COOP=${coop}`);

  const plans = await fetchJson("/api/saas-plans");
  const planList = Array.isArray(plans.json?.plans) ? plans.json.plans : Array.isArray(plans.json) ? plans.json : [];
  const paidPlans = planList.filter((p) => p && p.priceMonthly !== null && Number(p.priceMonthly) > 0 || p && p.priceYearly !== null && Number(p.priceYearly) > 0);
  record("paid-plans-present", plans.status === 200 && paidPlans.length >= 1, `status=${plans.status} paid=${paidPlans.length}`);
  record("no-trial-public-plan", plans.status === 200 && !planList.some((p) => p && p.tier === "TRIAL"), `hasTrial=${planList.some((p) => p && p.tier === "TRIAL")}`);

  const trialPlan = await fetchJson("/api/saas-plans/trial");
  const trialData = trialPlan.json && typeof trialPlan.json === "object" && "plan" in trialPlan.json ? trialPlan.json.plan : trialPlan.json || {};
  record("trial-plan-api", trialPlan.status === 200 && !!trialData?.id && trialData.tier === "TRIAL" && !!trialData.limits, `status=${trialPlan.status} tier=${trialData?.tier || "n/a"}`);

  const sessionNoCookie = await fetchJson("/api/auth/session");
  record("session-without-cookie", sessionNoCookie.status === 401, `status=${sessionNoCookie.status}`);

  const sessionBadCookie = await fetchJson("/api/auth/session", {
    headers: { Cookie: "token=%E0%A4%A" },
  });
  record("malformed-cookie-401", sessionBadCookie.status === 401, `status=${sessionBadCookie.status}`);

  const csrfLogout = await fetchJson("/api/auth/logout", {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  record("csrf-protection", csrfLogout.status === 403, `status=${csrfLogout.status}`);

  const protectedPages = ["/dashboard", "/admin", "/platform"];
  for (const path of protectedPages) {
    const res = await fetchJson(path, { headers: { Cookie: "" } });
    const isRedirectOr401 = [301, 302, 303, 307, 308, 401].includes(res.status);
    record(`protected-${path.replace("/", "")}`, isRedirectOr401, `status=${res.status}`);
  }

  const cronCheck = await fetchJson("/api/cron/trial-check");
  record("cron-auth-required", [401, 403].includes(cronCheck.status), `status=${cronCheck.status}`);

  if (process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD) {
    const loginRes = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD }),
    });
    record("login-with-smoke-creds", loginRes.status === 200 || loginRes.status === 302 || loginRes.status === 307 || loginRes.status === 308, `status=${loginRes.status}`);
    const sessionWithCookie = await fetchJson("/api/auth/session", {
      headers: {
        Cookie: loginRes.headers.get("set-cookie")?.split(";")[0] ?? "",
      },
    });
    record("smoke-session-authenticated", sessionWithCookie.status === 200, `status=${sessionWithCookie.status}`);

    const logoutRes = await fetchJson("/api/auth/logout", {
      method: "POST",
      headers: {
        Cookie: loginRes.headers.get("set-cookie")?.split(";")[0] ?? "",
      },
    });
    record("logout-smoke-user", logoutRes.status === 200 || logoutRes.status === 302 || logoutRes.status === 307 || logoutRes.status === 308, `status=${logoutRes.status}`);
  }

  const failing = checks.filter((check) => !check.ok);
  if (failing.length) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("SMOKE TEST ERROR", error);
  process.exitCode = 1;
});
