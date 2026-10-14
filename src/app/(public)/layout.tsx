/** Public pages (sign-in, certificate verification): no sidebar, no role switcher. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen w-full max-w-3xl mx-auto px-4 py-6">{children}</main>;
}
