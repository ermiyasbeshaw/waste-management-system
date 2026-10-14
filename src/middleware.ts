import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isDevAuthBypass } from "@/server/auth/dev-bypass";

const publishableKey =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  "pk_test_YWNlLW1hbGFtdXRlLTgyMDIuY2xlcmsuYWNjb3VudHMuZGV2JA";

const secretKey =
  process.env.CLERK_SECRET_KEY || "sk_test_Ax1w1p6FCqT45QhwPxJA6X1eh4hsHpZac8rSLR6aRp";

try {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = publishableKey;
  }
  if (!process.env.CLERK_SECRET_KEY) {
    process.env.CLERK_SECRET_KEY = secretKey;
  }
} catch {
  // Edge runtime environment objects can be immutable
}

/**
 * Signed-in check (CLAUDE.md §3). Public routes are listed here; every other route requires a Clerk session.
 * Role and facility checks happen later on the server (area layouts and services), never here.
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/verify(.*)",
  "/api/health",
  "/api/verify(.*)",
  "/api/webhooks/clerk",
  "/api/tracking/v1/ingest",
  "/api/jobs(.*)",
]);

const withClerk = clerkMiddleware(
  async (auth, req) => {
    if (isPublicRoute(req)) return;
    await auth.protect(); // signed-out page requests are redirected to NEXT_PUBLIC_CLERK_SIGN_IN_URL
  },
  {
    publishableKey,
    secretKey,
  }
);

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  // Development-only bypass for automated tests (see src/server/auth/dev-bypass.ts). Never active in production.
  if (isDevAuthBypass(req)) return NextResponse.next();
  try {
    return (await withClerk(req, event)) ?? NextResponse.next();
  } catch (error) {
    console.error("Clerk middleware invocation failed gracefully:", error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
