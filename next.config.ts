import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't advertise "X-Powered-By: Next.js" — no functional benefit, minor
  // recon information for an attacker.
  poweredByHeader: false,
  // gzip/brotli for HTML/JSON/JS when not behind a compressing proxy.
  compress: true,
  // Pull only the icons / motion helpers actually used into each page bundle instead of the whole package.
  experimental: {
    agentUpgrade: "security",
    optimizePackageImports: ["lucide-react", "react-icons/fa6", "framer-motion"],
  },
  images: {
    // Resize/convert on the CDN (Cloudinary / Unsplash), not on this server: see lib/cloudinary-loader.ts.
    // Fixes "upstream image response timed out" and takes image work off the Node process.
    loader: "custom",
    loaderFile: "./lib/cloudinary-loader.ts",
    remotePatterns: [
      // Owner-uploaded photos (page content editor, gallery, avatars, etc.)
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Placeholder/stock photos used as defaults in the content schema
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // Baseline security headers. The app already sets its own auth cookie
  // flags (httpOnly/secure/sameSite) in lib/auth.ts — these cover the
  // browser-level protections that aren't per-route.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Clickjacking protection is provided by the nonce-based CSP in proxy.ts.
          // Stop browsers from MIME-sniffing responses away from their
          // declared Content-Type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't leak the full referrer URL to third-party origins.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Force HTTPS for a year once a browser has seen it once.
          // Harmless in local dev (only enforced by browsers over https).
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Disable powerful browser features this app doesn't use.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          // A page that opens a window (OAuth popup) keeps working, but other origins' windows can no
          // longer script this one (tab-nabbing / XS-Leaks).
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          // Legacy Flash/PDF cross-domain policy files: none.
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        ],
      },
    ];
  },
};

export default nextConfig;