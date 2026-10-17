"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  FileCheck2,
  Flame,
  KeyRound,
  MapPin,
  Phone,
  Mail,
  QrCode,
  ScanLine,
  ShieldCheck,
  Truck,
  Sparkles,
  Bot,
  Menu,
  X,
  Pill,
  Activity,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { VerifyBox } from "./verify-box";
import { CustomerSupportAi } from "./customer-support-ai";

interface HomePageProps {
  signInHref: string;
  signUpHref?: string;
}

export function HomePage({ signInHref, signUpHref = "/sign-up" }: HomePageProps) {
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#edf4ef] text-zinc-900 font-sans selection:bg-emerald-200 selection:text-emerald-950 relative overflow-x-hidden">
      {/* Interactive Customer Support AI Drawer/Modal */}
      <CustomerSupportAi isOpen={isAiOpen} onClose={() => setIsAiOpen(false)} />

      {/* Floating AI Assistant Trigger Button (Bottom Right) */}
      <aside aria-label="Support Assistant" className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40">
        <button
          type="button"
          onClick={() => setIsAiOpen(true)}
          className="flex items-center gap-2 sm:gap-2.5 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-full bg-[#0a3822] hover:bg-[#072818] active:scale-95 text-white shadow-2xl hover:shadow-emerald-900/30 transition-all hover:scale-105 border border-emerald-400/30 group"
          aria-label="Open SafeWaste Customer Support AI"
        >
          <div className="relative">
            <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 group-hover:rotate-12 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
          </div>
          <span className="text-[11px] sm:text-xs font-bold tracking-tight">Ask SafeWaste AI</span>
          <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
        </button>
      </aside>

      {/* ------------------------------------------------------------- */}
      {/* 1. TOP UTILITY BAR                                            */}
      {/* ------------------------------------------------------------- */}
      <div className="border-b border-[#d8e6db] bg-[#e4efe7] text-[11px] text-[#2c533e]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-8 sm:h-9 flex items-center justify-center sm:justify-start">
          <div className="flex items-center gap-2 font-medium truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse shrink-0" />
            <span className="truncate">Dire Dawa Regional Health Pilot Hub • 120+ Healthcare Facilities</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. MAIN HEADER / NAVIGATION                                   */}
      {/* ------------------------------------------------------------- */}
      <header className="sticky top-0 z-30 bg-[#edf4ef]/90 backdrop-blur-md border-b border-[#d8e6db]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-20 flex items-center justify-between">
          {/* Brand Logo (Medico style with capsule icon) */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-10 h-10 rounded-2xl bg-[#0a3822] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
              {/* Modern capsule glyph */}
              <div className="w-5 h-5 rounded-full border-2 border-emerald-400 border-t-white flex items-center justify-center -rotate-45">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>
            </div>
            <div className="flex items-baseline">
              <span className="font-extrabold text-2xl tracking-tight text-[#0a3822]">
                SafeWaste
              </span>
              <span className="text-xs font-bold text-emerald-700 ml-0.5">®</span>
            </div>
          </Link>

          {/* Center Navigation Links */}
          <nav
            aria-label="Main"
            className="hidden lg:flex items-center gap-8 text-xs font-bold uppercase tracking-wider text-[#1e4431]"
          >
            <a href="#hero" className="hover:text-[#0a3822] transition-colors">
              Home
            </a>
            <a href="#about" className="hover:text-[#0a3822] transition-colors">
              About
            </a>
            <a href="#categories" className="hover:text-[#0a3822] transition-colors">
              Waste Categories
            </a>
            <a href="#how" className="hover:text-[#0a3822] transition-colors">
              How It Works
            </a>
            <a href="#verify" className="hover:text-[#0a3822] transition-colors">
              Verify Certificate
            </a>
            <button
              type="button"
              onClick={() => setIsAiOpen(true)}
              className="text-emerald-700 hover:text-emerald-800 flex items-center gap-1 font-bold"
            >
              <span>AI Support</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            </button>
          </nav>

          {/* Right Action Buttons (Desktop): Register and Sign In (Replacing schedule option) */}
          <div className="hidden sm:flex items-center gap-2.5 shrink-0">
            <Link
              href={signInHref}
              className="px-4 py-2 rounded-full text-xs font-bold text-[#0a3822] hover:bg-[#0a3822]/10 transition-colors"
            >
              Sign In
            </Link>
            {signUpHref && (
              <Link
                href={signUpHref}
                className="px-5 py-2.5 rounded-full bg-[#0a3822] hover:bg-[#072818] text-white text-xs font-bold tracking-tight inline-flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all hover:gap-2.5"
              >
                <span>Register</span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
              </Link>
            )}
          </div>

          {/* Mobile Right Controls: Sign In + Register + Menu Toggle */}
          <div className="sm:hidden flex items-center gap-1.5">
            <Link
              href={signInHref}
              className="px-2.5 py-1.5 rounded-full text-[11px] font-bold text-[#0a3822] bg-[#0a3822]/10 hover:bg-[#0a3822]/20 transition-colors"
            >
              Sign In
            </Link>
            {signUpHref && (
              <Link
                href={signUpHref}
                className="px-3 py-1.5 rounded-full bg-[#0a3822] text-white text-[11px] font-bold tracking-tight inline-flex items-center gap-1 shadow-sm"
              >
                <span>Register</span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-[#0a3822]/10 text-[#0a3822] hover:bg-[#0a3822]/20 active:scale-95 transition-all"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[#edf4ef] border-b border-[#d8e6db] px-4 py-5 space-y-3 animate-in slide-in-from-top-4">
            <a
              href="#hero"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-bold text-[#0a3822]"
            >
              Home
            </a>
            <a
              href="#about"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-bold text-[#0a3822]"
            >
              About SafeWaste
            </a>
            <a
              href="#categories"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-bold text-[#0a3822]"
            >
              Medical Waste Categories
            </a>
            <a
              href="#how"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-bold text-[#0a3822]"
            >
              How It Works
            </a>
            <a
              href="#verify"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-bold text-[#0a3822]"
            >
              Verify Certificate
            </a>
            <div className="pt-3 border-t border-[#d8e6db] flex flex-col gap-2.5">
              {signUpHref && (
                <Link
                  href={signUpHref}
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-3 rounded-full bg-[#0a3822] text-white font-bold text-xs inline-flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
                >
                  <span>Register Facility</span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                </Link>
              )}
              <Link
                href={signInHref}
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-3 rounded-full bg-white border border-[#0a3822]/20 text-[#0a3822] font-bold text-xs text-center shadow-sm hover:bg-[#f0f6f2] active:scale-95 transition-all"
              >
                Sign In to Portal
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setIsAiOpen(true);
                }}
                className="w-full py-2.5 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
              >
                <Bot className="w-4 h-4" />
                <span>Ask Clinical Support AI</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ------------------------------------------------------------- */}
      {/* 3. HERO SECTION (MEDICO PHARMACEUTICAL STYLE)                 */}
      {/* ------------------------------------------------------------- */}
      <section id="hero" className="pt-8 sm:pt-14 pb-16 px-4 sm:px-6 relative">
        <div className="mx-auto max-w-7xl">
          {/* Top Pill Card (Screenshot 1 top-right feature) */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
            {/* Left Tag */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#e0eee3] border border-[#c6dfcb] text-[#0a3822] text-xs font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span>Certified Healthcare Waste Management System</span>
            </div>

            {/* Dark green pill banner matching Screenshot 1 */}
            <div className="bg-[#0a3822] text-white rounded-full p-2 pr-6 flex items-center gap-4 shadow-xl border border-emerald-500/20 max-w-md">
              <div className="w-12 h-12 rounded-full bg-emerald-800/60 flex items-center justify-center shrink-0 border border-emerald-400/30">
                {/* 3D Capsule Pill Graphic */}
                <div className="w-7 h-3.5 rounded-full bg-gradient-to-r from-emerald-400 to-white shadow -rotate-12 flex">
                  <div className="w-1/2 h-full rounded-l-full bg-emerald-400" />
                  <div className="w-1/2 h-full rounded-r-full bg-white" />
                </div>
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-xs font-serif italic text-emerald-200">
                  Innovating Care, <span className="font-sans not-italic font-bold text-white">One Container</span> at a Time.
                </p>
              </div>
              <a
                href="#how"
                className="w-8 h-8 rounded-full bg-white text-[#0a3822] hover:bg-emerald-300 flex items-center justify-center shrink-0 transition-transform hover:scale-105"
                aria-label="Discover More"
              >
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Large Centerpiece: "SafeWaste®" with 3D Open Capsule Artwork */}
          <div className="relative text-center py-6 sm:py-12">
            {/* Giant Title Backdrop */}
            <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black text-[#0a3822] tracking-tighter select-none relative z-10 leading-none">
              SafeWaste<span className="text-3xl sm:text-5xl md:text-6xl text-emerald-600 font-bold ml-1">®</span>
            </h1>

            {/* 3D Realistic Open Capsule Illustration in Center (Medico signature art) */}
            <div className="relative -mt-6 sm:-mt-12 md:-mt-16 mx-auto w-full max-w-2xl h-64 sm:h-80 flex items-center justify-center pointer-events-none z-20">
              {/* Left Half: Green Capsule Shell */}
              <div className="relative -rotate-[32deg] translate-x-4 sm:translate-x-8 -translate-y-4">
                <div className="w-32 sm:w-44 h-16 sm:h-22 rounded-l-full bg-gradient-to-b from-emerald-400 via-[#10b981] to-[#047857] shadow-2xl border-t-2 border-emerald-200 relative overflow-hidden flex items-center">
                  <div className="absolute top-1.5 left-4 right-2 h-2.5 bg-white/40 rounded-full blur-[1px]" />
                  <div className="absolute bottom-2 left-6 right-6 h-2 bg-emerald-950/40 rounded-full blur-sm" />
                </div>
              </div>

              {/* Scattering Beads / Molecular Spheres (Dispersing from capsule) */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-md animate-ping [animation-duration:3s]" />
                <div className="absolute w-4 h-4 rounded-full bg-emerald-400 shadow-lg -translate-x-12 -translate-y-8 animate-pulse" />
                <div className="absolute w-3.5 h-3.5 rounded-full bg-emerald-300 shadow -translate-x-6 translate-y-6" />
                <div className="absolute w-5 h-5 rounded-full bg-emerald-400 shadow-xl translate-x-4 -translate-y-10" />
                <div className="absolute w-3 h-3 rounded-full bg-emerald-200 shadow translate-x-8 translate-y-4" />
                <div className="absolute w-4 h-4 rounded-full bg-zinc-300 shadow-md translate-x-12 -translate-y-2" />
                <div className="absolute w-3 h-3 rounded-full bg-emerald-500 shadow-md -translate-x-16 translate-y-2" />
              </div>

              {/* Right Half: Silver Translucent Capsule Shell */}
              <div className="relative -rotate-[32deg] -translate-x-4 sm:-translate-x-8 translate-y-4">
                <div className="w-32 sm:w-44 h-16 sm:h-22 rounded-r-full bg-gradient-to-b from-white/90 via-zinc-200/80 to-zinc-400/90 backdrop-blur shadow-2xl border-t-2 border-white relative overflow-hidden">
                  <div className="absolute top-1.5 left-2 right-4 h-2.5 bg-white rounded-full blur-[1px]" />
                  <div className="absolute bottom-2 left-6 right-6 h-2 bg-zinc-600/30 rounded-full blur-sm" />
                </div>
              </div>
            </div>

            {/* Left and Right Floating Cards (Flanking the hero, matching Screenshot 1) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 sm:mt-12 text-left">
              {/* Left Card: "Connect. Communicate. Protect. 20k+" */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-md border border-[#cbe0d0] hover:shadow-xl transition-shadow flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#edf4ef] flex items-center justify-center text-[#0a3822]">
                    <ShieldCheck className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-[#0a3822] tracking-tight">
                    Connect. Communicate. Protect.
                  </h3>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Connecting hospital wards, GPS fleet vehicles, central incinerator queues, and regulatory inspectors into one seamless digital chain of custody.
                  </p>
                </div>
                <div className="pt-6 mt-6 border-t border-[#edf4ef] flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-extrabold text-[#0a3822] font-mono">
                    20,000+
                  </span>
                  <span className="text-xs font-medium text-emerald-800">
                    Hazardous containers securely tracked & neutralized
                  </span>
                </div>
              </div>

              {/* Right Card: "Your Health Begins with understanding" */}
              <div className="bg-[#0a3822] text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-emerald-500/20 hover:shadow-2xl transition-shadow flex flex-col justify-between relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-emerald-800/30 blur-2xl pointer-events-none" />
                <div className="space-y-3 relative z-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-900/60 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold">
                    <Activity className="w-3.5 h-3.5" />
                    <span>Real-Time Fleet Radar</span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-serif text-white tracking-tight">
                    Your Safety <span className="italic font-normal text-emerald-300">Begins with</span> understanding
                  </h3>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Listen to your facility&apos;s compliance pulse. IoT hardware trackers and single-use QR barcodes eliminate dumping and protect groundwater.
                  </p>
                </div>
                <div className="pt-6 mt-6 border-t border-emerald-800/40 flex items-center justify-between relative z-10">
                  <span className="text-xs font-semibold text-emerald-200">
                    EFDA & Ministry of Health Compliant
                  </span>
                  <a
                    href="#how"
                    className="w-10 h-10 rounded-full bg-white text-[#0a3822] hover:bg-emerald-300 flex items-center justify-center transition-transform hover:scale-110"
                    aria-label="Learn more about safety"
                  >
                    <ArrowUpRight className="w-5 h-5" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 4. STATEMENT / VALUE SECTION (MEDICO STYLE BOTTOM-CENTER)     */}
      {/* ------------------------------------------------------------- */}
      <section id="about" className="py-16 sm:py-24 px-4 sm:px-6 bg-[#e4efe7] border-y border-[#d8e6db]">
        <div className="mx-auto max-w-5xl text-center space-y-6">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-emerald-800 bg-[#d5e7d9] px-4 py-1.5 rounded-full">
            The SafeWaste Mission
          </span>
          <h2 className="text-3xl sm:text-5xl md:text-6xl font-bold text-[#0a3822] tracking-tight leading-tight">
            We are SafeWaste, a <span className="font-serif italic font-normal text-emerald-800">Modern Healthcare</span> Platform focused on <span className="font-serif italic font-normal text-emerald-800">Innovation</span> and environmental safety.
          </h2>
          <p className="text-sm sm:text-base text-zinc-700 max-w-3xl mx-auto leading-relaxed">
            We bring together cutting-edge IoT tracking, cryptographic OTP handovers, and certified high-temperature disposal to provide trusted, verifiable waste management for every healthcare facility. Transparent, immutable, and truly reliable.
          </p>
          <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
            <a
              href="#categories"
              className="px-8 py-3.5 rounded-full bg-[#0a3822] hover:bg-[#072818] text-white text-xs font-bold tracking-tight inline-flex items-center gap-2 shadow-lg transition-transform hover:scale-105"
            >
              <span>Explore Waste Categories</span>
              <ArrowRight className="w-4 h-4 text-emerald-400" />
            </a>
            <button
              type="button"
              onClick={() => setIsAiOpen(true)}
              className="px-8 py-3.5 rounded-full bg-white hover:bg-zinc-100 text-[#0a3822] text-xs font-bold tracking-tight inline-flex items-center gap-2 border border-[#cbe0d0] shadow-sm transition-transform hover:scale-105"
            >
              <Bot className="w-4 h-4 text-emerald-600" />
              <span>Ask AI Pharmacist & EHO</span>
            </button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 5. WASTE CATEGORIES SHOWCASE (MEDICO LOWER-RIGHT GRID)        */}
      {/* ------------------------------------------------------------- */}
      <section id="categories" className="py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-7xl space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                MoH Classification Standards
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0a3822] tracking-tight mt-1">
                Clinical Waste Streams We Manage
              </h2>
            </div>
            <p className="text-xs text-zinc-600 max-w-md">
              Every container receives a dedicated non-reusable barcode at registration. Weight is recorded, GPS-tracked, and incinerated under calibrated thermal treatment.
            </p>
          </div>

          {/* 4 Cards Grid with Pill Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1: Infectious */}
            <div className="bg-white rounded-3xl p-5 border border-[#cbe0d0] shadow-sm hover:shadow-xl transition-all flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="h-44 rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-500/30 p-4 flex flex-col justify-between relative overflow-hidden border border-amber-500/20">
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500 text-black w-fit font-mono">
                    Yellow Code
                  </span>
                  <div className="text-center py-4">
                    <Flame className="w-12 h-12 text-amber-700 mx-auto group-hover:scale-110 transition-transform" />
                  </div>
                  <span className="text-[11px] font-semibold text-amber-900">Autoclave & Incineration</span>
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#0a3822]">Infectious Waste</h3>
                  <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                    Dressings, cultures, infectious bodily fluid PPE, and swabs from clinical wards.
                  </p>
                </div>
              </div>
              <div className="pt-4 mt-4 border-t border-zinc-100 flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-emerald-700">1200°C Neutralization</span>
                <span className="w-8 h-8 rounded-full bg-[#0a3822] text-white flex items-center justify-center group-hover:bg-emerald-600 transition-colors">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>
            </div>

            {/* Card 2: Pharmaceuticals */}
            <div className="bg-white rounded-3xl p-5 border border-[#cbe0d0] shadow-sm hover:shadow-xl transition-all flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="h-44 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-600/30 p-4 flex flex-col justify-between relative overflow-hidden border border-emerald-500/20">
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-600 text-white w-fit font-mono">
                    Brown Code
                  </span>
                  <div className="text-center py-4">
                    <Pill className="w-12 h-12 text-emerald-800 mx-auto group-hover:scale-110 transition-transform" />
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-950">EFDA Permit Required</span>
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#0a3822]">Pharmaceutical & Expired Drugs</h3>
                  <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                    Outdated tablets, IV ampoules, expired chemotherapeutic batches, and damaged pharmaceuticals.
                  </p>
                </div>
              </div>
              <div className="pt-4 mt-4 border-t border-zinc-100 flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-emerald-700">EFDA Regulatory Seal</span>
                <span className="w-8 h-8 rounded-full bg-[#0a3822] text-white flex items-center justify-center group-hover:bg-emerald-600 transition-colors">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>
            </div>

            {/* Card 3: Sharps */}
            <div className="bg-white rounded-3xl p-5 border border-[#cbe0d0] shadow-sm hover:shadow-xl transition-all flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="h-44 rounded-2xl bg-gradient-to-br from-yellow-400/20 to-amber-600/30 p-4 flex flex-col justify-between relative overflow-hidden border border-yellow-500/20">
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-yellow-500 text-black w-fit font-mono">
                    Yellow Safety Box
                  </span>
                  <div className="text-center py-4">
                    <ShieldCheck className="w-12 h-12 text-yellow-800 mx-auto group-hover:scale-110 transition-transform" />
                  </div>
                  <span className="text-[11px] font-semibold text-yellow-950">Puncture-Proof Standard</span>
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#0a3822]">Sharps & Needles</h3>
                  <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                    Hypodermic needles, scalpel blades, suture lancets, and contaminated glass capillary tubes.
                  </p>
                </div>
              </div>
              <div className="pt-4 mt-4 border-t border-zinc-100 flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-emerald-700">Encapsulation / Shredding</span>
                <span className="w-8 h-8 rounded-full bg-[#0a3822] text-white flex items-center justify-center group-hover:bg-emerald-600 transition-colors">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>
            </div>

            {/* Card 4: Pathological */}
            <div className="bg-white rounded-3xl p-5 border border-[#cbe0d0] shadow-sm hover:shadow-xl transition-all flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="h-44 rounded-2xl bg-gradient-to-br from-rose-500/20 to-red-600/30 p-4 flex flex-col justify-between relative overflow-hidden border border-rose-500/20">
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-600 text-white w-fit font-mono">
                    Red Code
                  </span>
                  <div className="text-center py-4">
                    <Activity className="w-12 h-12 text-rose-700 mx-auto group-hover:scale-110 transition-transform" />
                  </div>
                  <span className="text-[11px] font-semibold text-rose-950">Cold Chain Handover</span>
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#0a3822]">Pathological & Anatomical</h3>
                  <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                    Human tissues, organs, body parts, placentas, biopsy samples, and surgical specimens.
                  </p>
                </div>
              </div>
              <div className="pt-4 mt-4 border-t border-zinc-100 flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-emerald-700">Thermal Cremation</span>
                <span className="w-8 h-8 rounded-full bg-[#0a3822] text-white flex items-center justify-center group-hover:bg-emerald-600 transition-colors">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 6. HOW IT WORKS: 5-STAGE CHAIN OF CUSTODY                     */}
      {/* ------------------------------------------------------------- */}
      <section id="how" className="py-20 px-4 sm:px-6 bg-[#e4efe7] border-t border-[#d8e6db]">
        <div className="mx-auto max-w-7xl space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Zero-Trust Architecture
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0a3822] tracking-tight">
              5 Steps from Hospital Bin to Public Certificate
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              {
                step: "01",
                icon: Building2,
                title: "Register & Label",
                text: "Hospital EHO logs weight and container count. System generates unique non-reusable QR barcode stickers.",
              },
              {
                step: "02",
                icon: ScanLine,
                title: "Scan & Arrive",
                text: "Fleet driver arrives at hospital loading dock. System verifies GPS geofence and sends 6-digit SMS OTP.",
              },
              {
                step: "03",
                icon: KeyRound,
                title: "Verified Handover",
                text: "Driver scans all containers. Hospital enters OTP. Zero partial pickup rule prevents left-behind waste.",
              },
              {
                step: "04",
                icon: Truck,
                title: "GPS Transit",
                text: "Hardware trackers stream route to central radar. Missing or deviated paths trigger automatic compliance alerts.",
              },
              {
                step: "05",
                icon: FileCheck2,
                title: "Incinerate & Certify",
                text: "Central plant logs destruction and issues a cryptographically hashed PDF Certificate of Disposal.",
              },
            ].map((s) => (
              <div
                key={s.step}
                className="bg-white rounded-3xl p-5 border border-[#cbe0d0] shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                    <span className="font-mono text-sm font-extrabold text-emerald-700">{s.step}</span>
                    <s.icon className="w-5 h-5 text-[#0a3822]" />
                  </div>
                  <h3 className="font-bold text-sm text-[#0a3822] mt-3">{s.title}</h3>
                  <p className="text-xs text-zinc-600 mt-1.5 leading-relaxed">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 7. CERTIFICATE VERIFICATION DESK                              */}
      {/* ------------------------------------------------------------- */}
      <section id="verify" className="py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl bg-white rounded-3xl p-8 sm:p-12 border border-[#cbe0d0] shadow-xl text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-[#edf4ef] flex items-center justify-center text-[#0a3822] mx-auto">
            <FileCheck2 className="w-7 h-7 text-emerald-700" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0a3822] tracking-tight">
              Verify an Official Certificate of Disposal
            </h2>
            <p className="text-xs sm:text-sm text-zinc-600 max-w-lg mx-auto mt-2">
              Every hazardous waste destruction certificate issued by SafeWaste is publicly verifiable and protected by cryptographic SHA-256 fingerprinting.
            </p>
          </div>

          <div className="flex justify-center">
            <VerifyBox />
          </div>

          <p className="text-[11px] text-zinc-500">
            Paste the verification link from your paper certificate QR code or enter the token (e.g. CERT-2026-0001).
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 8. SCREENSHOT 2: SLEEK AI PHARMACIST BANNER (ABOVE FOOTER)    */}
      {/* ------------------------------------------------------------- */}
      <section className="bg-[#0b0c10] border-t border-white/[0.08] text-white py-12 px-4 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="bg-gradient-to-r from-[#12141c] via-[#161a26] to-[#11131a] border border-white/[0.1] rounded-3xl p-6 sm:p-10 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            <div className="space-y-4 max-w-3xl">
              {/* Badges matching Screenshot 2 */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.08] border border-white/[0.15] text-xs font-semibold text-zinc-200">
                  <span className="text-emerald-400 font-mono">🔗</span>
                  <span>SAFEWASTE AI ASSISTANT</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-xs font-semibold text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Clinical AI Active 24/7</span>
                </span>
              </div>

              {/* Main Headline */}
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Instant Clinical Waste Consultation &amp; SafeWaste Assistant
              </h3>

              {/* Subtitle matching Screenshot 2 */}
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Ask our AI about hazardous waste compliance, MoH color coding, EFDA approval workflows, Dire Dawa collection routes, direct telephone hotlines (+251 988 969696 / +251 911 234567), or prescription / certificate verification.
              </p>
            </div>

            {/* Right Side Pill Button: [✨ Ask AI Assistant ↗] */}
            <button
              type="button"
              onClick={() => setIsAiOpen(true)}
              className="w-full sm:w-auto justify-center px-6 py-3.5 rounded-2xl bg-white hover:bg-zinc-100 text-black font-extrabold text-xs inline-flex items-center gap-2.5 shadow-xl hover:scale-105 active:scale-95 transition-all shrink-0"
            >
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Ask AI Assistant</span>
              <ArrowUpRight className="w-4 h-4 text-zinc-500" />
            </button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 9. SCREENSHOT 2: SLEEK DARK FOOTER                             */}
      {/* ------------------------------------------------------------- */}
      <footer className="bg-[#070709] border-t border-white/[0.06] text-zinc-400 pt-16 pb-12 px-4 sm:px-6">
        <div className="mx-auto max-w-7xl space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
            {/* Column 1 & 2: Brand Information */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-black font-extrabold text-sm shadow">
                  SW
                </div>
                <h4 className="text-xl font-extrabold text-white tracking-tight">
                  SafeWaste Platform
                </h4>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
                Pioneering pharmaceutical precision, environmental safety, and certified cGMP waste neutralization care. Serving hospitals, clinics, and pharmacies.
              </p>
              <div className="flex items-start gap-2 pt-2 text-xs text-zinc-300">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Sabian &amp; Dil Chora Health Corridor</span>
                  <div className="text-[11px] text-zinc-500 font-mono">Dire Dawa / Addis Ababa, Ethiopia</div>
                </div>
              </div>
            </div>

            {/* Column 3: Quick Links */}
            <div className="space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-white">
                Quick Links
              </h5>
              <ul className="space-y-2 text-xs">
                <li>
                  <a href="#hero" className="hover:text-white transition-colors">
                    About Us
                  </a>
                </li>
                <li>
                  <a href="#how" className="hover:text-white transition-colors">
                    Services
                  </a>
                </li>
                <li>
                  <a href="#categories" className="hover:text-white transition-colors">
                    Formulations Catalog
                  </a>
                </li>
                <li>
                  <a href="#about" className="hover:text-white transition-colors">
                    Our Team
                  </a>
                </li>
                <li>
                  <a href="#how" className="hover:text-white transition-colors">
                    Clinical Journal
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setIsAiOpen(true)}
                    className="hover:text-white transition-colors text-left"
                  >
                    Contact Us
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 4: Pharmacy Care / Waste Management */}
            <div className="space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-white">
                Compliance Care
              </h5>
              <ul className="space-y-2 text-xs">
                <li>
                  <span className="text-zinc-400">Sterile Compounding</span>
                </li>
                <li>
                  <span className="text-zinc-400">Clinical Compounding</span>
                </li>
                <li>
                  <span className="text-zinc-400">Personal Assessment</span>
                </li>
                <li>
                  <span className="text-zinc-400">VIP Express Courier</span>
                </li>
                <li>
                  <a href="#verify" className="hover:text-white transition-colors">
                    Terms &amp; Conditions
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setIsAiOpen(true)}
                    className="hover:text-white transition-colors text-left"
                  >
                    Support Center
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 5: Direct Contact */}
            <div className="space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-white">
                Direct Contact
              </h5>
              <div className="space-y-2 text-xs">
                <a
                  href="tel:+251988969696"
                  className="flex items-center gap-2 text-white hover:text-emerald-300 font-bold font-mono transition-colors"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>+251 988969696</span>
                </a>
                <a
                  href="tel:+251911234567"
                  className="flex items-center gap-2 text-white hover:text-emerald-300 font-bold font-mono transition-colors"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>+251 911234567</span>
                </a>
                <a
                  href="mailto:concierge@safewaste.gov.et"
                  className="flex items-center gap-2 text-zinc-300 hover:text-white truncate transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 text-emerald-400" />
                  <span>concierge@safewaste.gov.et</span>
                </a>
              </div>

              <div className="pt-3 space-y-1">
                <h6 className="text-[10px] font-bold uppercase tracking-wider text-white">
                  Follow Us
                </h6>
                <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
                  <span className="hover:text-white cursor-pointer">Facebook</span>
                  <span className="hover:text-white cursor-pointer">Instagram</span>
                  <span className="hover:text-white cursor-pointer">LinkedIn</span>
                  <span className="hover:text-white cursor-pointer">Twitter</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Copyright Bar */}
          <div className="pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-500">
            <p>© {new Date().getFullYear()} SafeWaste Healthcare Management Platform. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="#verify" className="hover:text-zinc-300">Public Certificate Registry</a>
              <span>•</span>
              <button type="button" onClick={() => setIsAiOpen(true)} className="hover:text-zinc-300">
                Clinical AI Bot
              </button>
              <span>•</span>
              <Link href={signInHref} className="hover:text-zinc-300">
                Staff Sign In
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
