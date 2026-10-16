/**
 * Next.js configuration (Gate 7.2 security headers). Conservative set that cannot break the app:
 * - no framing (clickjacking), no MIME sniffing, a strict referrer policy;
 * - camera only for our own pages (container QR scanner); no microphone, no location (the driver app never sends
 *   location — GPS comes from the vehicle trackers, CLAUDE.md §2);
 * - a minimal Content-Security-Policy (base-uri, object-src, form-action, frame-ancestors). A full script/style
 *   CSP is added once Clerk is integrated (its domains are needed) — see docs/security-review.md;
 * - HSTS only in production (HTTPS).
 * @type {import('next').NextConfig}
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'",
  },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig = {
  poweredByHeader: false,
  env: {
    DATABASE_URL:
      "postgresql://neondb_owner:npg_w6aWpJ3YbmUA@ep-odd-fire-b1cuk7z5-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    DATABASE_URL_UNPOOLED:
      "postgresql://neondb_owner:npg_w6aWpJ3YbmUA@ep-odd-fire-b1cuk7z5.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    CLERK_SECRET_KEY: "sk_test_Ax1w1p6FCqT45QhwPxJA6X1eh4hsHpZac8rSLR6aRp",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      "pk_test_YWNlLW1hbGFtdXRlLTgyMDIuY2xlcmsuYWNjb3VudHMuZGV2JA",
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: "/",
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: "/",
    NEXT_PUBLIC_MAP_TILE_URL: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    NEXT_PUBLIC_MAP_ATTRIBUTION:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    CRON_SECRET: "dd763e4f30a948e350be06c9495386c158ac8b8caf831f8ba475caf95053e217",
    OUTBOX_ENCRYPTION_KEY:
      "82b597e7c1eac286c86d2553d42524c23ab546e1db7f11de60ce7699f10b10c7",
    DEV_LOGIN_SECRET: "b255f16918fcf271a1f21ae24ab4c7d9ddeb6b84439631efeb906c93d248f7fc",
    APP_BASE_URL: "https://waste-management-system-udm5.vercel.app",
  },
  // Medicine stock files (CLAUDE.md §12) are uploaded through a Server Action: up to 5 MB plus form overhead.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
