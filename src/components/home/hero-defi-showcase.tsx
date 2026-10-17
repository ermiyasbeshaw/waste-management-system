"use client";

import React from "react";
import { motion } from "motion/react";
import { ArrowUpRight, ChevronRight, Sparkles } from "lucide-react";

/**
 * -----------------------------------------------------------------------------------
 * 1. RIVR HERO SECTION: Sleek Glassmorphism DeFi Showcase
 * Specifications:
 * - lucide-react icons, motion/react animations
 * - Background video: https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260428_193507_4286c423-2fd9-4efd-92bd-91a939453fc1.mp4
 * - Reused button/icon colorings from SafeWaste landing page (#0a3822, emerald-600)
 * -----------------------------------------------------------------------------------
 */

export function HeroBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/70 backdrop-blur-md border border-white/30 mx-auto mb-3 w-fit shadow-sm"
    >
      <Sparkles className="w-4 h-4 text-emerald-700" />
      <span className="text-[14px] font-normal text-[rgba(30,50,90,0.9)]">
        Fluid Staking
      </span>
    </motion.div>
  );
}

export function Navbar() {
  const menuItems = [
    { label: "Ecosystem", hasDropdown: false },
    { label: "Economics", hasDropdown: true },
    { label: "Developers", hasDropdown: false },
    { label: "Governance", hasDropdown: true },
  ];

  return (
    <nav className="flex items-center justify-between py-6 px-6 md:px-10 w-full relative z-10">
      {/* Left Side (hidden spacer for centering) */}
      <div className="flex-1 hidden md:block" />

      {/* Center Menu */}
      <ul className="hidden md:flex items-center gap-8 text-[rgb(45,45,45)] font-normal text-sm">
        {menuItems.map((item) => (
          <li
            key={item.label}
            className="cursor-pointer hover:opacity-70 transition-opacity flex items-center gap-1 group"
          >
            <span>{item.label}</span>
            {item.hasDropdown && (
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 text-zinc-500" />
            )}
          </li>
        ))}
      </ul>

      {/* Mobile Logo */}
      <div className="md:hidden">
        <span className="font-regular tracking-tighter text-xl text-[rgba(30,50,90,0.9)] font-semibold">
          RIVR
        </span>
      </div>

      {/* Right Button (Landing page styling: #0a3822 emerald theme) */}
      <div className="flex-1 flex justify-end">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center bg-[#0a3822] text-white rounded-full pl-2 pr-4 md:pr-6 py-1.5 md:py-2 gap-2 md:gap-3 hover:bg-[#072818] transition-colors group shadow-md"
        >
          <div className="bg-white/20 p-1 md:p-1.5 rounded-full flex items-center justify-center">
            <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
          <span className="text-xs md:text-sm font-normal">Book Demo</span>
        </motion.button>
      </div>
    </nav>
  );
}

export function BottomLeftCard() {
  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      whileInView={{ x: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay: 0.2 }}
      className="absolute bottom-28 right-4 left-auto md:left-6 md:right-auto md:bottom-6 lg:bottom-10 lg:left-10 p-3 md:p-4 lg:p-5 rounded-[1.2rem] md:rounded-[1.5rem] lg:rounded-[2.2rem] bg-white/40 backdrop-blur-xl flex flex-col gap-2 lg:gap-3 min-w-[140px] md:min-w-[150px] lg:min-w-[180px] w-fit border border-white/30 shadow-lg z-20"
    >
      <div className="flex flex-col">
        <span className="text-2xl md:text-3xl font-normal text-[rgba(30,50,90,0.9)] tracking-tight">
          5.2K
        </span>
        <span className="text-[10px] md:text-[12px] font-normal text-[rgba(30,50,90,0.6)] uppercase tracking-wider">
          Active Yielders
        </span>
      </div>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center bg-white rounded-full pl-1.5 pr-5 py-1.5 gap-2 hover:bg-emerald-50/90 transition-colors self-start group shadow-sm border border-[#0a3822]/10"
      >
        <div className="bg-[#0a3822]/10 p-1 rounded-full flex items-center justify-center text-[#0a3822]">
          <ArrowUpRight className="w-3.5 h-3.5" />
        </div>
        <span className="text-[14px] font-normal text-[rgba(30,50,90,0.9)]">
          Join Discord
        </span>
      </motion.button>
    </motion.div>
  );
}

export function BottomRightCorner() {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="absolute bottom-0 right-0 p-3 pt-5 pl-8 sm:p-4 sm:pt-6 sm:pl-10 md:p-6 md:pt-8 md:pl-14 bg-[#f0f0f0] rounded-tl-[1.5rem] sm:rounded-tl-[2rem] md:rounded-tl-[3.5rem] flex items-center gap-3 sm:gap-4 md:gap-6 z-20"
    >
      {/* Top intersection mask */}
      <div className="absolute -top-[1.5rem] sm:-top-[2rem] md:-top-[3.5rem] right-0 w-[1.5rem] sm:w-[2rem] md:w-[3.5rem] h-[1.5rem] sm:h-[2rem] md:h-[3.5rem] pointer-events-none">
        <svg width="100%" height="100%" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M56 56V0C56 30.9279 30.9279 56 0 56H56Z" fill="#f0f0f0" />
        </svg>
      </div>

      {/* Left intersection mask */}
      <div className="absolute bottom-0 -left-[1.5rem] sm:-left-[2rem] md:-left-[3.5rem] w-[1.5rem] sm:w-[2rem] md:w-[3.5rem] h-[1.5rem] sm:h-[2rem] md:h-[3.5rem] pointer-events-none">
        <svg width="100%" height="100%" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M56 56H0C30.9279 56 56 30.9279 56 0V56Z" fill="#f0f0f0" />
        </svg>
      </div>

      {/* Circle Icon */}
      <div className="bg-[rgba(30,50,90,0.05)] w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center border border-[rgba(30,50,90,0.1)] text-[#0a3822]">
        <ArrowUpRight className="w-5 h-5 md:w-6 md:h-6" />
      </div>

      {/* Info column */}
      <div className="flex flex-col">
        <span className="text-[16px] md:text-[20px] font-normal text-[rgba(30,50,90,0.95)]">
          Documentation
        </span>
        <div className="flex items-center gap-1 text-[rgba(30,50,90,0.6)] cursor-pointer hover:text-[rgba(30,50,90,0.8)] transition-colors">
          <span className="text-[12px] md:text-[15px] font-normal">Library</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </motion.div>
  );
}

export function RivrHeroSection() {
  return (
    <div className="w-full min-h-[640px] md:min-h-[740px] h-screen max-h-[880px] flex items-center justify-center p-3 md:p-5 bg-[#f0f0f0]">
      <section className="relative w-full max-w-[1536px] h-full rounded-[1.5rem] md:rounded-[3rem] overflow-hidden shadow-none flex flex-col items-center bg-white/10 group">
        {/* The Video Background */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover object-[65%] lg:object-center z-0"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260428_193507_4286c423-2fd9-4efd-92bd-91a939453fc1.mp4"
        />

        {/* The Content Layer */}
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-between pb-4">
          {/* Navbar Component */}
          <Navbar />

          {/* Text Container */}
          <div className="w-full flex flex-col items-center pt-4 sm:pt-6 md:pt-8 px-6 text-center max-w-4xl">
            <HeroBadge />

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-[80px] font-normal text-[#5E6470] mb-2 tracking-tight leading-[1.05]"
            >
              Fluid Asset Streams
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-sm sm:text-base md:text-lg text-[#5E6470] opacity-80 leading-relaxed max-w-xl font-normal"
            >
              Access Smart Vaults, stake RIVR, NFTs, transform rigid holdings into liquid cash instantly.
            </motion.p>
          </div>

          {/* Bottom Left Card Component */}
          <BottomLeftCard />

          {/* Bottom Right Corner Component */}
          <BottomRightCorner />
        </div>
      </section>
    </div>
  );
}

/**
 * -----------------------------------------------------------------------------------
 * 2. DIGITAL EPOCH HERO CONTAINER & SEAMLESS MARQUEE LOGO SCROLLER
 * Specifications:
 * - Inter as --font-sans, Outfit as --font-display
 * - Video URL: https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260505_101331_74f9b798-3f00-4e86-8a01-377aa16ffeaa.mp4
 * - Headline: "Foundation of the<br />new digital epoch"
 * - Marquee scroller with 8 svgl.app logos: Procure, Shopify, Blender, Figma, Spotify, Lottielab, Google Cloud, Bing
 * - Pure CSS marquee with left/right linear gradient mask
 * -----------------------------------------------------------------------------------
 */

interface BrandLogoItem {
  name: string;
  src: string;
  gradient: string;
}

const BRAND_LOGOS: BrandLogoItem[] = [
  {
    name: "Procure",
    src: "https://svgl.app/library/procure.svg",
    gradient: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
  },
  {
    name: "Shopify",
    src: "https://svgl.app/library/shopify.svg",
    gradient: "linear-gradient(135deg, #eab308, #facc15)",
  },
  {
    name: "Blender",
    src: "https://svgl.app/library/blender.svg",
    gradient: "linear-gradient(135deg, #2563eb, #60a5fa)",
  },
  {
    name: "Figma",
    src: "https://svgl.app/library/figma.svg",
    gradient: "linear-gradient(135deg, #9333ea, #c084fc)",
  },
  {
    name: "Spotify",
    src: "https://svgl.app/library/spotify.svg",
    gradient: "linear-gradient(135deg, #e11d48, #fb7185)",
  },
  {
    name: "Lottielab",
    src: "https://svgl.app/library/lottielab.svg",
    gradient: "linear-gradient(135deg, #65a30d, #a3e635)",
  },
  {
    name: "Google Cloud",
    src: "https://svgl.app/library/google-cloud.svg",
    gradient: "linear-gradient(135deg, #0284c7, #38bdf8)",
  },
  {
    name: "Bing",
    src: "https://svgl.app/library/bing.svg",
    gradient: "linear-gradient(135deg, #0d9488, #2dd4bf)",
  },
];

export function DigitalEpochHeroSection() {
  return (
    <div className="w-full bg-[#f9fafb] py-12 md:py-16 px-3 sm:px-6">
      {/* 2. Main Hero Container & Video Background */}
      <div className="relative w-full max-w-[1400px] mx-auto rounded-[32px] sm:rounded-[48px] bg-white border border-slate-200/50 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.03)] overflow-hidden h-[540px] md:h-[600px] flex flex-col">
        {/* Underlying video layer without overlays */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover scale-105 transition-transform duration-1000"
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260505_101331_74f9b798-3f00-4e86-8a01-377aa16ffeaa.mp4"
          />
        </div>

        {/* 3. Hero Text Content */}
        <div className="relative z-20 flex-1 px-6 sm:px-8 md:px-16 pt-10 sm:pt-12 md:pt-16 flex flex-col items-start">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="max-w-2xl space-y-4"
          >
            <h2 className="font-display text-[34px] sm:text-[42px] md:text-[56px] font-medium tracking-tight text-[#0a1b33] leading-[1.1]">
              Foundation of the
              <br />
              new digital epoch
            </h2>
            <p className="font-sans text-[14px] md:text-[15px] text-[#64748b] leading-relaxed max-w-lg font-normal">
              Designing products, powering ecosystems and laying the foundation of a decentralized web
              for enterprises, builders and communities alike.
            </p>
            <div className="pt-2">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 bg-[#0a3822] hover:bg-[#072818] text-white px-7 py-3 rounded-full text-sm font-medium shadow-md transition-all"
              >
                Contact Us
              </motion.button>
            </div>
          </motion.div>
        </div>

        {/* 4. Floating Bottom Navbar */}
        <div className="absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 z-30 w-auto max-w-[95%]">
          <motion.nav
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex items-center gap-1.5 sm:gap-2.5 bg-white/90 backdrop-blur-2xl px-2 sm:px-3 py-1.5 rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.08)] border border-slate-200/40"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-white border border-slate-100 shadow-sm rounded-full flex items-center justify-center text-sm font-bold text-[#0a3822]">
              ✦
            </div>
            <button className="text-[12px] font-semibold text-slate-500 hover:text-[#0a1b33] px-2.5 py-1 transition-colors">
              Products
            </button>
            <button className="text-[12px] font-semibold text-slate-500 hover:text-[#0a1b33] px-2.5 py-1 transition-colors">
              Docs
            </button>
            <button className="inline-flex items-center gap-1.5 bg-white px-4 sm:px-5 py-2 rounded-full text-[12px] font-semibold text-[#0a3822] border border-slate-200/60 shadow-sm hover:border-emerald-600 transition-all">
              <span>Get in touch</span>
              <ChevronRight className="w-3.5 h-3.5 text-emerald-600" />
            </button>
          </motion.nav>
        </div>
      </div>

      {/* 5. Seamless Marquee Logo Scroller Component */}
      <div
        className="mt-10 overflow-hidden relative w-full max-w-[1400px] mx-auto"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
        }}
      >
        <div className="animate-marquee gap-5 py-4">
          {/* Render list twice to ensure seamless infinite loop */}
          {[...BRAND_LOGOS, ...BRAND_LOGOS].map((brand, idx) => (
            <div
              key={`${brand.name}-${idx}`}
              className="group relative h-24 w-40 shrink-0 flex items-center justify-center rounded-full bg-white border border-slate-200/60 shadow-sm hover:border-slate-300 transition-all overflow-hidden cursor-pointer"
            >
              {/* Gradient hover overlay: scaled 1.5 and 0 opacity, drops to scale 1 and opacity 100 on group-hover */}
              <div
                className="absolute inset-0 scale-150 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-500 rounded-full"
                style={{ background: brand.gradient }}
              />

              {/* Logo icon with inversion on hover */}
              <img
                src={brand.src}
                alt={brand.name}
                className="relative z-10 h-8 w-auto max-w-[80px] object-contain transition-all duration-300 group-hover:brightness-0 group-hover:invert"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Combined Showcase Section to be rendered directly after the 5-step Chain of Custody section
 */
export function LandingShowcaseSections() {
  return (
    <section id="ecosystem" className="w-full space-y-6">
      <RivrHeroSection />
      <DigitalEpochHeroSection />
    </section>
  );
}
