"use client";

import React from "react";
import { motion } from "motion/react";
import { ArrowUpRight, ChevronRight, Sparkles } from "lucide-react";

/**
 * -----------------------------------------------------------------------------------
 * 1. RIVR HERO SECTION: Sleek Glassmorphism DeFi Showcase
 * -----------------------------------------------------------------------------------
 */
export function RivrHeroSection() {
  const menuItems = [
    { label: "Ecosystem", hasDropdown: false },
    { label: "Economics", hasDropdown: true },
    { label: "Developers", hasDropdown: false },
    { label: "Governance", hasDropdown: true },
  ];

  return (
    <div className="w-full flex items-center justify-center p-3 md:p-5 bg-[#f0f0f0]">
      <section className="relative w-full max-w-[1536px] min-h-[620px] md:min-h-[720px] h-[85vh] max-h-[860px] rounded-[1.5rem] md:rounded-[3rem] overflow-hidden shadow-none flex flex-col items-center bg-white/10 group">
        {/* Background Video */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover object-[65%] lg:object-center z-0"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260428_193507_4286c423-2fd9-4efd-92bd-91a939453fc1.mp4"
        />

        {/* The Content Layer */}
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-between pb-6">
          {/* Top Navbar */}
          <nav className="flex items-center justify-between py-6 px-6 md:px-10 w-full relative z-10">
            {/* Left side spacer */}
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
                    <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  )}
                </li>
              ))}
            </ul>

            {/* Mobile Logo */}
            <div className="md:hidden">
              <span className="font-regular tracking-tighter text-xl text-[rgba(30,50,90,0.9)]">
                RIVR
              </span>
            </div>

            {/* Right Button (using landing page palette styling) */}
            <div className="flex-1 flex justify-end">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center bg-[#0a3822] hover:bg-[#072818] text-white rounded-full pl-2 pr-4 md:pr-6 py-1.5 md:py-2 gap-2 md:gap-3 transition-colors group shadow-md"
              >
                <div className="bg-white/20 p-1 md:p-1.5 rounded-full flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </div>
                <span className="text-xs md:text-sm font-normal">Book Demo</span>
              </motion.button>
            </div>
          </nav>

          {/* Text Container */}
          <div className="w-full flex flex-col items-center pt-2 sm:pt-6 md:pt-8 px-6 text-center max-w-4xl my-auto">
            {/* HeroBadge Component */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-md border border-white/20 mx-auto mb-3 w-fit shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-[#0a3822]" />
              <span className="text-[14px] font-normal text-[rgba(30,50,90,0.9)]">
                Fluid Staking
              </span>
            </motion.div>

            {/* motion.h1 */}
            <motion.h1
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-[80px] font-normal text-[#5E6470] mb-2 tracking-tight leading-[1.05]"
            >
              Fluid Asset Streams
            </motion.h1>

            {/* motion.p */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-sm sm:text-base md:text-lg text-[#5E6470] opacity-80 leading-relaxed max-w-xl font-normal mt-2"
            >
              Access Smart Vaults, stake RIVR, NFTs, transform rigid holdings into liquid cash instantly.
            </motion.p>
          </div>

          {/* Bottom Left Card */}
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
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
              className="flex items-center bg-white rounded-full pl-1.5 pr-4 sm:pr-5 py-1.5 gap-2 hover:bg-white/90 transition-colors self-start group shadow-sm"
            >
              <div className="bg-[rgba(30,50,90,0.1)] p-1 rounded-full flex items-center justify-center text-[rgba(30,50,90,0.9)]">
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <span className="text-[13px] md:text-[14px] font-normal text-[rgba(30,50,90,0.9)]">
                Join Discord
              </span>
            </motion.button>
          </motion.div>

          {/* Bottom Right Corner (Faux-Cutout Layout) */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
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
        </div>
      </section>
    </div>
  );
}

/**
 * -----------------------------------------------------------------------------------
 * 2. DIGITAL EPOCH HERO CONTAINER & SEAMLESS MARQUEE LOGO SCROLLER
 * -----------------------------------------------------------------------------------
 */

interface BrandLogo {
  name: string;
  gradientClass: string;
  svgPath: React.ReactNode;
}

const BRAND_LOGOS: BrandLogo[] = [
  {
    name: "Procure",
    gradientClass: "from-blue-500 to-indigo-600",
    svgPath: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    name: "Shopify",
    gradientClass: "from-amber-400 to-yellow-500",
    svgPath: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M15.337 2.45c-.035 0-.07.005-.102.016l-2.095.698a.336.336 0 0 0-.214.225l-2.583 8.356c-.03.097.026.198.123.228.097.03.199-.026.229-.123l2.583-8.356a.335.335 0 0 1 .214-.225l1.97-.656L13.88 7.37a.337.337 0 0 0 .198.423.336.336 0 0 0 .423-.198l1.79-5.11a.335.335 0 0 0-.175-.42l-.78-.315zm3.83 2.14l-2.074.692 2.052 14.152 2.66-1.57a.78.78 0 0 0 .385-.67l.45-10.74a.78.78 0 0 0-.585-.794l-2.888-1.07zm-7.904 2.636L9.67 9.497c-.035-.02-.075-.029-.115-.029l-3.35.03c-.22 0-.422.1-.552.274l-2.84 3.785a.78.78 0 0 0-.158.468v4.992c0 .43.35.78.78.78h4.63l3.198-12.57zm.955-3.08l-.208.674 3.125 12.28 2.015-13.896-4.932.942z" />
      </svg>
    ),
  },
  {
    name: "Blender",
    gradientClass: "from-orange-500 to-blue-600",
    svgPath: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M12.54 2.01a1.2 1.2 0 0 0-.77.34l-5.3 4.96a1.2 1.2 0 0 0 .37 1.98l.84.34-3.5 3.3a1.2 1.2 0 0 0 .04 1.7l1.45 1.45a1.2 1.2 0 0 0 1.7.04l3.3-3.5.34.84a1.2 1.2 0 0 0 1.98.37l4.96-5.3a1.2 1.2 0 0 0-.34-1.92l-4.22-1.74a1.2 1.2 0 0 0-.85-.1zM12 9a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      </svg>
    ),
  },
  {
    name: "Figma",
    gradientClass: "from-purple-500 to-pink-500",
    svgPath: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M8 2h4a4 4 0 0 1 4 4 4 4 0 0 1-4 4H8V2zm0 8h4a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4v-4zm0 8a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4zm-4-8a4 4 0 0 1 4-4v8a4 4 0 0 1-4-4zm0-8a4 4 0 0 1 4-4v8a4 4 0 0 1-4-4z" />
      </svg>
    ),
  },
  {
    name: "Spotify",
    gradientClass: "from-pink-500 to-rose-600",
    svgPath: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.435-5.308-1.76-8.792-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.746 3.808-.87 7.076-.5 9.72 1.113.295.18.388.563.208.857zm1.225-2.723c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.127-.85-.106-.976-.518-.126-.413.107-.849.519-.976 3.632-1.102 8.147-.568 11.236 1.332.367.225.483.705.258 1.071zm.105-2.835C14.692 8.95 8.085 8.73 4.244 9.897c-.494.15-1.018-.129-1.168-.623-.15-.494.13-1.018.624-1.168 4.412-1.339 11.688-1.085 15.568 1.218.445.264.59.838.327 1.282-.264.444-.838.59-1.282.326z" />
      </svg>
    ),
  },
  {
    name: "Lottielab",
    gradientClass: "from-lime-400 to-emerald-500",
    svgPath: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M12 3L4 9v6l8 6 8-6V9l-8-6zm0 2.5L18 10l-6 4.5L6 10l6-4.5zM6 11.5l5 3.75v5.2L6 16.7v-5.2zm12 0v5.2l-5 3.75v-5.2l5-3.75z" />
      </svg>
    ),
  },
  {
    name: "Google Cloud",
    gradientClass: "from-sky-400 to-blue-500",
    svgPath: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3z" />
      </svg>
    ),
  },
  {
    name: "Bing",
    gradientClass: "from-cyan-400 to-teal-500",
    svgPath: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M5 3v18l5-3 5 3V3L10 6 5 3zm2 3.2l3 1.8 3-1.8v10.6l-3-1.8-3 1.8V6.2z" />
      </svg>
    ),
  },
];

export function DigitalEpochHeroSection() {
  return (
    <div className="w-full bg-[#f9fafb] py-12 md:py-16 px-3 sm:px-6">
      {/* 2. Main Hero Container & Video Background */}
      <div className="relative w-full max-w-[1400px] mx-auto rounded-[32px] sm:rounded-[48px] bg-white border border-slate-200/50 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.03)] overflow-hidden h-[540px] md:h-[600px] flex flex-col">
        {/* Underlying video layer */}
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
            transition={{ duration: 0.8 }}
            className="max-w-2xl space-y-4"
          >
            <h2 className="text-[34px] sm:text-[42px] md:text-[56px] font-medium tracking-tight text-[#0a1b33] leading-[1.1]">
              Foundation of the
              <br />
              new digital epoch
            </h2>
            <p className="text-[14px] md:text-[15px] text-[#64748b] leading-relaxed max-w-lg font-normal">
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
            <button className="inline-flex items-center gap-1.5 bg-white px-4 sm:px-5 py-2 rounded-full text-[12px] font-semibold text-[#0a1b33] border border-slate-200/60 shadow-sm hover:border-slate-300 transition-all">
              <span>Get in touch</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
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
              {/* Gradient hover overlay */}
              <div
                className={`absolute inset-0 bg-gradient-to-r ${brand.gradientClass} opacity-0 scale-150 group-hover:scale-100 group-hover:opacity-100 transition-all duration-500`}
              />

              {/* Logo icon */}
              <div className="relative z-10 text-slate-700 group-hover:text-white transition-all duration-300 flex flex-col items-center justify-center gap-1">
                {brand.svgPath}
                <span className="text-[11px] font-semibold tracking-tight">{brand.name}</span>
              </div>
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
    <div className="w-full space-y-6">
      <RivrHeroSection />
      <DigitalEpochHeroSection />
    </div>
  );
}
