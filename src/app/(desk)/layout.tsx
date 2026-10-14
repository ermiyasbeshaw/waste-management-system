import { Sidebar } from "@/components/shared/sidebar";
import { Header } from "@/components/shared/header";

/** Desktop shell (sidebar + header) for /admin, /hospital and /regulator. */
export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <Header />
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">{children}</main>
      </div>
    </div>
  );
}
