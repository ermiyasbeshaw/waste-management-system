"use client";

import { Layers, Truck, AlertOctagon } from "lucide-react";
import { BottomNav } from "@/components/mobile/bottom-nav";

export function DisposalNav({
  counts,
}: {
  counts: { queue: number; inbound: number; exceptions: number };
}) {
  return (
    <BottomNav
      label="Disposal navigation"
      accent="rose"
      items={[
        { href: "/disposal", label: "Queue", icon: Layers, count: counts.queue },
        { href: "/disposal/inbound", label: "Inbound", icon: Truck, count: counts.inbound },
        {
          href: "/disposal/exceptions",
          label: "Exceptions",
          icon: AlertOctagon,
          count: counts.exceptions,
        },
      ]}
    />
  );
}
