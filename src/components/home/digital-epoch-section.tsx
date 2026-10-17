"use client";

import React from "react";
import { motion } from "motion/react";
import { ChevronRight, ArrowRight } from "lucide-react";

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

export function DigitalEpochSection() {
  return (
    <div className="w-full my-6 sm:my-8 px-2 sm:px-4">
      {/* 2. Main Hero Container & Video Background */}
      <div className="relative w-full max-w-7xl mx-auto rounded-[28px] sm:rounded-[40px] md:rounded-[48px] bg-white border border-[#cbe0d0] shadow-[0_30px_90px_-20px_rgba(10,56,34,0.08)] overflow-hidden h-[500px] sm:h-[540px] md:h-[580px] flex flex-col">
        {/* Underlying video layer */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover scale-105 transition-transform duration-1000 opacity-90"
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260505_101331_74f9b798-3f00-4e86-8a01-377aa16ffeaa.mp4"
          />
        </div>

        {/* 3. Hero Text Content (SafeWaste System Themed) */}
        <div className="relative z-20 flex-1 px-5 sm:px-8 md:px-14 pt-8 sm:pt-12 md:pt-14 flex flex-col items-start">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="max-w-2xl space-y-3 sm:space-y-4"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 backdrop-blur-md border border-emerald-500/20 text-[#0a3822] text-[11px] font-bold shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Biohazard Logistics & Compliance Network</span>
            </div>

            <h2 className="text-[28px] sm:text-[38px] md:text-[50px] font-black tracking-tight text-[#0a3822] leading-[1.1]">
              Foundation of the
              <br />
              Healthcare Safety Epoch
            </h2>

            <p className="text-[13px] sm:text-[14px] md:text-[15px] text-[#1e4431]/90 leading-relaxed max-w-lg font-medium">
              Designing zero-trust custody, powering real-time GPS fleet radar, and establishing
              cryptographic biohazard compliance for hospitals, clinical waste fleets, and communities alike.
            </p>

            <div className="pt-2 sm:pt-3">
              <a
                href="#how"
                className="inline-flex items-center gap-2 bg-[#0a3822] hover:bg-[#072818] text-white px-6 sm:px-7 py-3 rounded-full text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
              >
                <span>Explore 5-Step Custody</span>
                <ArrowRight className="w-4 h-4 text-emerald-400" />
              </a>
            </div>
          </motion.div>
        </div>

        {/* 4. Floating Bottom Navbar */}
        <div className="absolute bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 z-30 w-auto max-w-[95%]">
          <motion.nav
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex items-center gap-1 sm:gap-2.5 bg-white/95 backdrop-blur-2xl px-2 sm:px-3 py-1.5 rounded-full shadow-[0_12px_40px_rgba(10,56,34,0.12)] border border-[#cbe0d0]"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-[#edf4ef] border border-emerald-400/30 shadow-sm rounded-full flex items-center justify-center text-sm font-bold text-[#0a3822]">
              ✦
            </div>
            <a
              href="#categories"
              className="text-[11px] sm:text-[12px] font-bold text-[#1e4431] hover:text-[#0a3822] px-2 sm:px-2.5 py-1 transition-colors"
            >
              Categories
            </a>
            <a
              href="#how"
              className="text-[11px] sm:text-[12px] font-bold text-[#1e4431] hover:text-[#0a3822] px-2 sm:px-2.5 py-1 transition-colors"
            >
              5 Steps
            </a>
            <a
              href="#verify"
              className="inline-flex items-center gap-1.5 bg-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-[12px] font-bold text-[#0a3822] border border-[#cbe0d0] shadow-sm hover:border-emerald-600 transition-all"
            >
              <span>Verify Certificate</span>
              <ChevronRight className="w-3.5 h-3.5 text-emerald-600" />
            </a>
          </motion.nav>
        </div>
      </div>

      {/* 5. Seamless Marquee Logo Scroller Component */}
      <div
        className="mt-6 sm:mt-8 overflow-hidden relative w-full max-w-7xl mx-auto"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
        }}
      >
        <div className="animate-marquee gap-4 sm:gap-5 py-2 sm:py-3">
          {/* Render list twice to ensure seamless infinite loop */}
          {[...BRAND_LOGOS, ...BRAND_LOGOS].map((brand, idx) => (
            <div
              key={`${brand.name}-${idx}`}
              className="group relative h-20 sm:h-24 w-32 sm:w-40 shrink-0 flex items-center justify-center rounded-full bg-white border border-slate-200/60 shadow-sm hover:border-emerald-500 transition-all overflow-hidden cursor-pointer"
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
                className="relative z-10 h-7 sm:h-8 w-auto max-w-[70px] sm:max-w-[80px] object-contain transition-all duration-300 group-hover:brightness-0 group-hover:invert"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
