"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  X,
  Sparkles,
  ShieldCheck,
  Phone,
  Mail,
  ChevronRight,
  RefreshCw,
  FileCheck2,
  Truck,
  AlertTriangle,
  HelpCircle,
  Building2,
  KeyRound,
  Pill,
} from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  quickReplies?: string[];
  links?: { label: string; href: string }[];
}

const KNOWLEDGE_BASE: { keywords: string[]; answer: string; links?: { label: string; href: string }[] }[] = [
  {
    keywords: ["color", "category", "categories", "moh", "yellow", "red", "brown", "black", "waste type"],
    answer:
      "According to Ethiopian Ministry of Health (MoH) regulations, medical waste is classified into 5 standardized color-coded categories:\n\n" +
      "• 🟡 Yellow (Infectious Waste): Bandages, swabs, blood-soaked dressings, IV lines, PPE. Neutralized via high-temperature autoclave/incinerator.\n" +
      "• 🔴 Red (Pathological & Anatomical): Tissues, anatomical waste, placenta, fluids. Strict cold chain + thermal destruction.\n" +
      "• 🟤 Brown (Pharmaceutical & Expired Drugs): Expired pills, syrups, vials. Requires formal EFDA regulatory approval before destruction.\n" +
      "• 📦 Yellow Safety Box (Sharps): Needles, scalpel blades, glass ampoules in puncture-proof boxes.\n" +
      "• ⚫ Black (General Waste): Non-hazardous office, food, and packaging waste.",
    links: [
      { label: "View Categories", href: "#categories" },
      { label: "How It Works", href: "#how-it-works" },
    ],
  },
  {
    keywords: ["otp", "pickup", "handover", "driver", "code", "sms", "collection"],
    answer:
      "SafeWaste uses a strict cryptographic OTP handover to guarantee Chain of Custody:\n\n" +
      "1. Driver Arrival: When the truck enters the facility's 100m geofence, the driver clicks 'I have arrived'.\n" +
      "2. SMS Dispatch: The system automatically sends a secure 6-digit OTP code to the facility's verified hospital staff.\n" +
      "3. Container Scan: The driver scans every container QR barcode with their mobile camera.\n" +
      "4. Zero Partial Pickup Rule: The OTP verification is unlocked ONLY after all expected containers are scanned.\n" +
      "5. Instant Confirmation: The driver enters the 6-digit code. Status changes atomically to IN_TRANSIT.\n" +
      "• Fallback: If SMS is delayed, Hospital Admins can confirm the handover directly in-app under 'Truck at the door'.",
  },
  {
    keywords: ["certificate", "verify", "destruction", "token", "hash", "sha256", "tamper"],
    answer:
      "Destruction Certificates in SafeWaste are tamper-proof and publicly verifiable:\n\n" +
      "• Every certificate receives a unique verification token (e.g. CERT-2026-...) and a cryptographic SHA-256 hash stored in the immutable audit ledger.\n" +
      "• Anyone can verify a certificate at `/verify/[token]` without signing in.\n" +
      "• The verification portal shows: Waste ID, destroyed weight (kg), destruction method, date, and facility.\n" +
      "• Users can also upload the PDF certificate using the 'Compare File' engine to mathematically confirm the file hasn't been altered.",
    links: [
      { label: "Verify a Certificate", href: "#verify" },
    ],
  },
  {
    keywords: ["efda", "expired", "approval", "medicine", "drug", "regulator"],
    answer:
      "The Ethiopian Food and Drug Authority (EFDA) has formal statutory oversight over expired medicine:\n\n" +
      "1. Hospital pharmacy creates a disposal request by selecting batch numbers and quantities from active stock.\n" +
      "2. Hospital Administrator approves the request.\n" +
      "3. Because it contains pharmaceuticals, the system automatically routes the batch to the EFDA Regulatory Officer.\n" +
      "4. EFDA Officer reviews the batch manifest and either approves it (generating an official EFDA disposal authorization) or rejects with written rationale.\n" +
      "5. Once approved, Super Admin assigns an authorized driver and fleet truck for collection.",
  },
  {
    keywords: ["role", "roles", "user", "who", "access", "persona", "permission"],
    answer:
      "SafeWaste features 6 dedicated user roles with strict separation of concerns:\n\n" +
      "1. 👑 Super Administrator: Global fleet radar, facility onboarding, trip dispatch, ETB billing, settings, and pickup overrides.\n" +
      "2. 🏥 Hospital Administrator: Facility waste management, user access, OTP delegation, and monthly invoice review.\n" +
      "3. 🩺 Hospital Staff / EHO: Daily waste registration, barcode label printing, stock upload, and pickup handovers.\n" +
      "4. 🚚 Fleet Driver: Mobile console, GPS navigation, QR scanning, SMS OTP confirmation, and arrival logging.\n" +
      "5. 🔥 Disposal Operator: Inbound truck check-in, container discrepancy logging, and incinerator/autoclave record locking.\n" +
      "6. ⚖️ EFDA Regulatory Officer: National compliance oversight, route replay, hash-chain audit ledger verification, and medicine approvals.",
  },
  {
    keywords: ["pilot", "dire dawa", "scale", "where", "facilities", "location", "truck"],
    answer:
      "The SafeWaste pilot is actively deployed in the Dire Dawa Regional Health Administration hub:\n\n" +
      "• Scale: 120+ registered healthcare facilities (referral hospitals like Dil Chora, general hospitals like Sabian, primary clinics, and pharmacies).\n" +
      "• Fleet: 2 dedicated hazardous waste transport vehicles equipped with GPS hardware trackers.\n" +
      "• Treatment: 1 central high-temperature disposal and treatment facility in Dire Dawa.\n" +
      "• Liaison: Regional Health Bureau & EFDA federal oversight liaison in Addis Ababa.",
  },
  {
    keywords: ["contact", "phone", "email", "support", "hotline", "help", "address"],
    answer:
      "You can reach the SafeWaste Regional Support Desk 24/7:\n\n" +
      "• Hotline: +251 988 969696 / +251 911 234567\n" +
      "• Email: concierge@safewaste.gov.et / support@safewaste.et\n" +
      "• Physical Hub: Sabian & Dil Chora Health Corridor, Dire Dawa, Ethiopia\n" +
      "• Federal Liaison: Bole Sub-City, Addis Ababa, Ethiopia",
  },
  {
    keywords: ["invoice", "billing", "etb", "birr", "vat", "payment", "contract"],
    answer:
      "Financial operations in SafeWaste comply with Ethiopian billing standards:\n\n" +
      "• All contract rates and invoices are strictly denominated in Ethiopian Birr (ETB).\n" +
      "• Monthly invoices are generated from active facility service contracts.\n" +
      "• Applicable VAT (15%) is itemized on official tax invoices.\n" +
      "• Payment is settled offline via Commercial Bank of Ethiopia (CBE) or Telebirr slip reference, recorded by Super Admin.",
  },
];

const INITIAL_SUGGESTIONS = [
  "What are the MoH waste color codes?",
  "How does OTP pickup verification work?",
  "How does EFDA approve expired medicine disposal?",
  "How do I verify a Certificate of Destruction?",
  "What are the 6 user roles in SafeWaste?",
  "What is the emergency hotline for collection support?",
];

export function CustomerSupportAi({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome-1",
      sender: "ai",
      text: "Hello! I am your SafeWaste Clinical AI Assistant. I have full knowledge of the Ethiopian Ministry of Health (MoH) hazardous waste guidelines, EFDA pharmaceutical disposal regulations, Dire Dawa fleet routes, and certificate verification. How can I assist you today?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      quickReplies: INITIAL_SUGGESTIONS,
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, messages, isTyping]);

  const handleSend = (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setIsTyping(true);

    // AI answer matching
    setTimeout(() => {
      const lower = query.toLowerCase();
      let bestMatch: { answer: string; links?: { label: string; href: string }[] } | null = null;
      let highestMatches = 0;

      for (const item of KNOWLEDGE_BASE) {
        let count = 0;
        for (const kw of item.keywords) {
          if (lower.includes(kw)) count++;
        }
        if (count > highestMatches) {
          highestMatches = count;
          bestMatch = item;
        }
      }

      let responseText = "";
      let links: { label: string; href: string }[] | undefined = undefined;

      if (bestMatch && highestMatches > 0) {
        responseText = bestMatch.answer;
        links = bestMatch.links;
      } else {
        responseText =
          "I understand your inquiry. SafeWaste is Ethiopia's certified medical waste chain-of-custody platform serving 120+ facilities across Dire Dawa.\n\n" +
          "Could you specify if you are asking about:\n" +
          "1. MoH waste classification & container packaging\n" +
          "2. Driver collection & SMS OTP handover verification\n" +
          "3. EFDA regulatory authorization for expired pharmaceuticals\n" +
          "4. Public certificate verification & cryptographic hash checking\n" +
          "5. Direct support hotline (+251 988 969696)";
      }

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        sender: "ai",
        text: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        links,
        quickReplies: [
          "What are the MoH waste color codes?",
          "How does OTP pickup verification work?",
          "How do I verify a Certificate of Destruction?",
        ],
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="SafeWaste Customer Support AI"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-0 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-[#0f1118] border border-white/[0.12] w-full sm:max-w-md h-[88vh] sm:h-[620px] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0d3b26] to-[#082015] p-4 text-white flex items-center justify-between border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shadow-glow">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm tracking-tight">SafeWaste Clinical AI</h3>
                <span className="flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-400/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active 24/7
                </span>
              </div>
              <p className="text-[11px] text-zinc-300">MoH & EFDA Regulatory Assistant</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Assistant"
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.1] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hotlines Banner */}
        <div className="bg-[#141824] px-4 py-2 border-b border-white/[0.06] text-[11px] text-zinc-300 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <Phone className="w-3.5 h-3.5" />
            Direct Support: +251 988 969696
          </span>
          <span className="text-zinc-500 text-[10px] font-mono">Dire Dawa Pilot Hub</span>
        </div>

        {/* Message Log */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                  m.sender === "user"
                    ? "bg-emerald-600 text-white rounded-br-sm shadow-md"
                    : "bg-[#181c2b] text-zinc-200 border border-white/[0.08] rounded-bl-sm shadow"
                }`}
              >
                <div className="whitespace-pre-line">{m.text}</div>
                {m.links && m.links.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-white/[0.08] flex flex-wrap gap-1.5">
                    {m.links.map((link) => (
                      <a
                        key={link.label}
                        href={link.href}
                        onClick={onClose}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30 transition-colors"
                      >
                        {link.label}
                        <ChevronRight className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-zinc-500 mt-1 px-1">{m.timestamp}</span>

              {/* Quick reply chips */}
              {m.quickReplies && m.quickReplies.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 max-w-full">
                  {m.quickReplies.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => handleSend(q)}
                      className="text-left text-[11px] font-medium bg-[#131722] hover:bg-emerald-500/15 text-zinc-300 hover:text-emerald-300 border border-white/[0.08] hover:border-emerald-500/30 rounded-xl px-2.5 py-1.5 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex items-center gap-2 text-zinc-400 text-xs bg-[#181c2b] p-3 rounded-2xl w-28 border border-white/[0.06]">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              <span className="text-[11px]">Typing...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input footer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3 bg-[#121520] border-t border-white/[0.08] flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about MoH categories, OTP, certificates..."
            className="flex-1 min-h-[42px] bg-[#1a1e2d] border border-white/[0.1] rounded-xl px-3.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send message"
            className="w-10 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black flex items-center justify-center transition-colors shadow"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
