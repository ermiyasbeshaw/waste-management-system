import Link from "next/link";
import {
  ArrowRight,
  Building2,
  FileCheck2,
  Flame,
  KeyRound,
  Landmark,
  MapPinned,
  QrCode,
  ScanLine,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Photo } from "./photo";
import { VerifyBox } from "./verify-box";

/**
 * Public home page (`/` for visitors who are not signed in). Structure inspired by a waste-services site
 * (owner's reference): utility bar and navigation, hero, value statement with three pillars, how it works,
 * who we serve, oversight band, certificate check, closing call to action, footer. Own content and the
 * SafeWaste look (dark zinc, emerald); photos only, no video. No invented figures, contacts or social links.
 */

const PILLARS = [
  {
    icon: QrCode,
    title: "One chain of custody",
    text: "Every container gets its own code and QR label at registration. It is scanned at pickup, checked in at the disposal site and listed on the certificate — never reused.",
  },
  {
    icon: KeyRound,
    title: "One verified handover",
    text: "The hospital confirms each pickup with a one-time code sent to its verified phones. No partial pickups: every expected container must be scanned first.",
  },
  {
    icon: FileCheck2,
    title: "One verifiable certificate",
    text: "After destruction, a Certificate of Disposal is issued with a QR code. Anyone can check that it is valid — and that a PDF is the original.",
  },
];

const STEPS = [
  {
    icon: Building2,
    title: "Register",
    text: "Hospital staff record the waste and print container labels.",
  },
  {
    icon: ScanLine,
    title: "Pick up",
    text: "The driver scans every container; the hospital confirms the handover.",
  },
  {
    icon: MapPinned,
    title: "Transport",
    text: "Vehicle trackers record the route to the disposal site.",
  },
  {
    icon: Flame,
    title: "Destroy",
    text: "The site checks each container in and records the destruction.",
  },
  {
    icon: ShieldCheck,
    title: "Certify",
    text: "A Certificate of Disposal is issued and can be verified by anyone.",
  },
];

const AUDIENCES = [
  {
    icon: Building2,
    title: "Hospitals, clinics and pharmacies",
    text: "Register waste in minutes, see the truck at the door, download certificates and monthly invoices.",
  },
  {
    icon: Truck,
    title: "Transport and disposal teams",
    text: "Trips in stop order on the phone, QR scanning, and a clear queue for check-in and destruction.",
  },
  {
    icon: Landmark,
    title: "Regulators (EFDA)",
    text: "Read-only oversight: volumes, route replay, certificates and a tamper-evident audit log.",
  },
];

export function HomePage({
  signInHref,
  signUpHref = "/sign-up",
}: {
  signInHref: string;
  signUpHref?: string;
}) {
  return (
    <div className="bg-[#08080a] text-zinc-100">
      {/* Utility bar */}
      <div className="border-b border-white/[0.06] bg-[#0b0b0f] text-xs text-zinc-400">
        <div className="mx-auto max-w-6xl px-4 h-9 flex items-center justify-end gap-5">
          <a href="#verify" className="hover:text-zinc-200">
            Verify a certificate
          </a>
          {signUpHref && (
            <Link href={signUpHref} className="hover:text-zinc-200">
              Register
            </Link>
          )}
          <Link href={signInHref} className="hover:text-zinc-200">
            Sign in
          </Link>
        </div>
      </div>

      {/* Navigation */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#08080a]/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-white">
            <span className="w-8 h-8 rounded-lg bg-emerald-500 text-black flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            </span>
            SafeWaste
          </Link>
          <nav
            aria-label="Main"
            className="hidden md:flex items-center gap-7 text-sm text-zinc-300"
          >
            <a href="#how" className="hover:text-white">
              How it works
            </a>
            <a href="#who" className="hover:text-white">
              Who we serve
            </a>
            <a href="#oversight" className="hover:text-white">
              Oversight
            </a>
            <a href="#verify" className="hover:text-white">
              Verify
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {signUpHref && (
              <Link
                href={signUpHref}
                className="hidden sm:inline-flex min-h-[40px] px-3.5 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/[0.04] text-zinc-300 hover:text-white text-sm font-medium items-center transition-colors"
              >
                Register
              </Link>
            )}
            <Link
              href={signInHref}
              className="min-h-[40px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              Sign in <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <Photo
          src="/home/hero.jpg"
          label="Healthcare workers handling sealed medical waste containers"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#08080a] via-[#08080a]/85 to-[#08080a]/30" />
          <div className="relative mx-auto max-w-6xl px-4 py-24 md:py-36">
            <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
              Medical waste · Dire Dawa
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl md:text-6xl font-bold tracking-tight text-white leading-[1.05]">
              Medical waste, tracked from the ward to the certificate.
            </h1>
            <p className="mt-6 max-w-2xl text-base md:text-lg text-zinc-300">
              SafeWaste follows every container of hospital, clinic and pharmacy waste: a verified
              pickup, GPS-tracked transport, recorded destruction and a Certificate of Disposal
              anyone can check.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={signInHref}
                className="min-h-[48px] px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold inline-flex items-center gap-2 transition-colors"
              >
                Sign in <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              {signUpHref && (
                <Link
                  href={signUpHref}
                  className="min-h-[48px] px-6 rounded-xl border border-emerald-500/30 hover:border-emerald-500/60 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  Register with Clerk
                </Link>
              )}
              <a
                href="#verify"
                className="min-h-[48px] px-6 rounded-xl border border-white/[0.2] hover:bg-white/[0.06] text-white font-semibold inline-flex items-center gap-2 transition-colors"
              >
                Verify a certificate
              </a>
            </div>
          </div>
        </Photo>

        {/* Value statement + three pillars */}
        <section className="mx-auto max-w-6xl px-4 py-20" aria-labelledby="value-title">
          <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
            Safe disposal you can prove
          </p>
          <h2 id="value-title" className="mt-3 max-w-3xl text-3xl md:text-4xl font-bold text-white">
            One record for every container, from registration to destruction.
          </h2>
          <p className="mt-4 max-w-3xl text-zinc-400">
            Hazardous waste must not get lost between the hospital and the incinerator. SafeWaste
            keeps each step on record, with evidence at every handover, so facilities, transporters
            and regulators see the same truth.
          </p>
          <h3 className="mt-12 text-sm font-semibold text-zinc-300">How we do it</h3>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {PILLARS.map((p) => (
              <div
                key={p.title}
                className="rounded-2xl border border-white/[0.07] bg-[#111116] p-6"
              >
                <p.icon className="w-6 h-6 text-emerald-400" aria-hidden="true" />
                <h4 className="mt-4 text-lg font-semibold text-white">{p.title}</h4>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{p.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section
          id="how"
          className="border-y border-white/[0.06] bg-[#0b0b0f]"
          aria-labelledby="how-title"
        >
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 id="how-title" className="text-3xl md:text-4xl font-bold text-white">
              How it works
            </h2>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className="rounded-2xl border border-white/[0.07] bg-[#111116] p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-300 text-sm font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <s.icon className="w-5 h-5 text-zinc-300" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-semibold text-white">{s.title}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Who we serve */}
        <section id="who" className="mx-auto max-w-6xl px-4 py-20" aria-labelledby="who-title">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 id="who-title" className="text-3xl md:text-4xl font-bold text-white">
                Who we serve
              </h2>
              <div className="mt-8 space-y-4">
                {AUDIENCES.map((a) => (
                  <div
                    key={a.title}
                    className="rounded-2xl border border-white/[0.07] bg-[#111116] p-5 flex gap-4"
                  >
                    <a.icon className="w-6 h-6 shrink-0 text-emerald-400" aria-hidden="true" />
                    <div>
                      <h3 className="font-semibold text-white">{a.title}</h3>
                      <p className="mt-1 text-sm text-zinc-400">{a.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Photo
              src="/home/facilities.jpg"
              label="A hospital ward with medical staff"
              className="min-h-[320px] lg:min-h-[460px] rounded-3xl border border-white/[0.07]"
            />
          </div>
        </section>

        {/* Oversight band (image / text) */}
        <section
          id="oversight"
          className="bg-[#0b0b0f] border-y border-white/[0.06]"
          aria-labelledby="oversight-title"
        >
          <div className="mx-auto max-w-6xl px-4 py-20 grid gap-10 lg:grid-cols-2 lg:items-center">
            <Photo
              src="/home/transport.jpg"
              label="A waste collection truck on the road"
              className="order-last lg:order-first min-h-[300px] lg:min-h-[420px] rounded-3xl border border-white/[0.07]"
            />
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
                Built for compliance
              </p>
              <h2 id="oversight-title" className="mt-3 text-3xl md:text-4xl font-bold text-white">
                Oversight is part of the system, not an afterthought.
              </h2>
              <ul className="mt-6 space-y-3 text-zinc-300">
                {[
                  "Every change is written to an audit log that cannot be edited; a hash chain shows any tampering.",
                  "Each pickup records where the vehicle was when it arrived; routes can be replayed later.",
                  "Regulators get read-only access to every facility, without changing anything.",
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <ShieldCheck
                      className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5"
                      aria-hidden="true"
                    />
                    <span className="text-sm leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Certificate check */}
        <section
          id="verify"
          className="mx-auto max-w-6xl px-4 py-20"
          aria-labelledby="verify-title"
        >
          <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent p-8 md:p-12">
            <h2 id="verify-title" className="text-2xl md:text-3xl font-bold text-white">
              Check a Certificate of Disposal
            </h2>
            <p className="mt-3 max-w-2xl text-zinc-300">
              Scan the QR code on the certificate, or paste its link or code here. You will see
              whether it is valid — no sign-in needed.
            </p>
            <div className="mt-6">
              <VerifyBox />
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="border-t border-white/[0.06]" aria-labelledby="cta-title">
          <div className="mx-auto max-w-3xl px-4 py-20 text-center">
            <ShieldCheck className="mx-auto w-10 h-10 text-emerald-400" aria-hidden="true" />
            <h2 id="cta-title" className="mt-4 text-3xl font-bold text-white">
              Already part of the network?
            </h2>
            <p className="mt-3 text-zinc-400">
              Sign in to register waste, run trips, record destruction or review compliance.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={signInHref}
                className="min-h-[48px] px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold inline-flex items-center gap-2 transition-colors"
              >
                Sign in <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              {signUpHref && (
                <Link
                  href={signUpHref}
                  className="min-h-[48px] px-6 rounded-xl border border-white/20 hover:border-white/40 hover:bg-white/[0.06] text-white font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  Register with Clerk
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-[#0b0b0f]">
        <div className="mx-auto max-w-6xl px-4 py-12 grid gap-8 sm:grid-cols-3 text-sm">
          <div>
            <p className="flex items-center gap-2 font-semibold text-white">
              <ShieldCheck className="w-5 h-5 text-emerald-400" aria-hidden="true" /> SafeWaste
            </p>
            <p className="mt-3 text-zinc-400">
              Medical waste tracking for Dire Dawa Administration.
            </p>
          </div>
          <div>
            <p className="font-semibold text-zinc-200">Platform</p>
            <ul className="mt-3 space-y-2 text-zinc-400">
              <li>
                <a href="#how" className="hover:text-zinc-200">
                  How it works
                </a>
              </li>
              <li>
                <a href="#who" className="hover:text-zinc-200">
                  Who we serve
                </a>
              </li>
              <li>
                <a href="#oversight" className="hover:text-zinc-200">
                  Oversight
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-zinc-200">Access</p>
            <ul className="mt-3 space-y-2 text-zinc-400">
              <li>
                <Link href={signInHref} className="hover:text-zinc-200">
                  Sign in
                </Link>
              </li>
              {signUpHref && (
                <li>
                  <Link href={signUpHref} className="hover:text-zinc-200">
                    Register
                  </Link>
                </li>
              )}
              <li>
                <a href="#verify" className="hover:text-zinc-200">
                  Verify a certificate
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/[0.06]">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-zinc-500">
            © {new Date().getFullYear()} Neba CS · SafeWaste
          </p>
        </div>
      </footer>
    </div>
  );
}
