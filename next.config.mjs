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
  // Medicine stock files (CLAUDE.md §12) are uploaded through a Server Action: up to 5 MB plus form overhead.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
