import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isDevAuthBypass } from "@/server/auth/dev-bypass";

/**
 * Signed-in check (CLAUDE.md §3). Public routes are listed here; every other route requires a Clerk session.
 * Role and facility checks happen later on the server (area layouts and services), never here.
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/dev-login", // development test login; returns 404 unless the dev bypass is active
  "/verify(.*)",
  "/api/health",
  "/api/verify(.*)",
  "/api/webhooks/clerk",
  "/api/tracking/v1/ingest",
  "/api/jobs(.*)",
]);

const withClerk = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  await auth.protect(); // signed-out page requests are redirected to NEXT_PUBLIC_CLERK_SIGN_IN_URL
});

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  // Development-only bypass for automated tests (see src/server/auth/dev-bypass.ts). Never active in production.
  if (isDevAuthBypass(req)) return NextResponse.next();
  return withClerk(req, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
