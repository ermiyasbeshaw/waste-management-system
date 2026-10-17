import { Sidebar } from "@/components/shared/sidebar";
import { Header } from "@/components/shared/header";
import { DashboardBottomBar } from "@/components/mobile/dashboard-bottom-bar";

/** App shell (sidebar for desktop, bottom navigation bar for mobile app feel) for /admin, /hospital and /regulator. */
export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <Header />
        <main className="flex-1 p-3.5 sm:p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6 pb-24 md:pb-8">
          {children}
        </main>
        <DashboardBottomBar />
      </div>
    </div>
  );
}
