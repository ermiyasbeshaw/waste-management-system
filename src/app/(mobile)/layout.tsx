import { MobileTopBar } from "@/components/mobile/mobile-top-bar";

/** Mobile-first shell (no sidebar) for /driver and /disposal. Each area adds a fixed bottom navigation, so the page keeps 6 rem free at the bottom. */
export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <MobileTopBar />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-4 pb-24 space-y-4">{children}</main>
    </div>
  );
}
