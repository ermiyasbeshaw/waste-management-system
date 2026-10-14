import type { ReactNode } from "react";
import {
  AlertTriangle,
  BadgeAlert,
  Clock,
  FileWarning,
  MailWarning,
  PhoneOff,
  Radio,
  RadioTower,
  Receipt,
} from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatEtb } from "@/lib/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { getAdminAlerts } from "@/server/queries/admin";

const DISPOSAL_KIND = {
  MISSING: "container missing",
  REFUSED: "container refused",
  CLOSED_NO_DESTRUCTION: "closed without destruction",
  CERTIFICATE_FAILED: "certificate generation failed",
} as const;

/**
 * Admin alerts (CLAUDE.md §6): overdue pickups, silent trackers during a trip, FAILED outbox messages, overrides,
 * issued invoices past due, plus facilities not ready / without contract, vehicles without tracker and licences
 * about to expire. Every section is always shown, with "None" when empty, so an empty list is visible as good news.
 */

function Section({
  title,
  icon: Icon,
  tone,
  count,
  empty,
  children,
}: {
  title: string;
  icon: typeof AlertTriangle;
  tone: "rose" | "amber" | "blue";
  count: number;
  empty: string;
  children: ReactNode;
}) {
  const colours = {
    rose: "border-rose-500/20 text-rose-400",
    amber: "border-amber-500/20 text-amber-400",
    blue: "border-blue-500/20 text-blue-400",
  }[tone];
  return (
    <section
      className={`bg-[#111116] border rounded-2xl p-5 space-y-3 ${count > 0 ? colours.split(" ")[0] : "border-white/[0.07]"}`}
    >
      <h3
        className={`flex items-center gap-2.5 font-semibold text-xs uppercase tracking-wider ${count > 0 ? colours.split(" ")[1] : "text-zinc-400"}`}
      >
        <Icon className="w-4 h-4" aria-hidden="true" />
        <span>{title}</span>
        <span className="ml-auto font-mono">{count}</span>
      </h3>
      {count === 0 ? <p className="text-xs text-zinc-500">{empty}</p> : children}
    </section>
  );
}

const Row = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 text-xs p-3 bg-[#121218] rounded-xl border border-white/[0.05]">
    {children}
  </div>
);

export async function AlertsWidget() {
  const a = await getAdminAlerts();

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Section
        title="Overdue Pickups"
        icon={Clock}
        tone="rose"
        count={a.overduePickups.length}
        empty="None — every registered waste record is within the pickup window."
      >
        {a.overduePickups.map((w) => (
          <Row key={w.id}>
            <div>
              <p className="font-mono font-bold text-white">{w.wasteCode}</p>
              <p className="text-zinc-400">{w.facilityName}</p>
            </div>
            <span className="font-mono text-rose-400">{w.daysWaiting} days waiting</span>
          </Row>
        ))}
      </Section>

      <Section
        title="Handover OTP Overrides (Last 30 Days)"
        icon={AlertTriangle}
        tone="rose"
        count={a.overrides.length}
        empty="None — every recent pickup was confirmed by OTP or in-app."
      >
        {a.overrides.map((o) => (
          <Row key={o.id}>
            <div>
              <p className="text-zinc-200 font-medium">{o.facilityName}</p>
              <p className="text-[11px] text-zinc-400">{o.details}</p>
            </div>
            <span className="font-mono text-[10px] text-zinc-500">{formatDateTime(o.at)}</span>
          </Row>
        ))}
      </Section>

      <Section
        title="Facilities Not Ready for Pickup"
        icon={PhoneOff}
        tone="amber"
        count={a.facilitiesNotReady.length}
        empty="None — every facility has a user who receives pickup codes."
      >
        <p className="text-[11px] text-zinc-400">
          No hospital user with a verified phone receives pickup codes, so these facilities cannot
          be scheduled.
        </p>
        {a.facilitiesNotReady.map((f) => (
          <Row key={f.id}>
            <div>
              <p className="font-semibold text-white">{f.name}</p>
              <p className="font-mono text-[10px] text-zinc-500">{f.code}</p>
            </div>
            <StatusBadge status="NOT_READY" size="sm" />
          </Row>
        ))}
      </Section>

      <Section
        title="Issued Invoices Past Due"
        icon={Receipt}
        tone="amber"
        count={a.overdueInvoices.length}
        empty="None — no issued invoice is past its due date."
      >
        {a.overdueInvoices.map((i) => (
          <Row key={i.id}>
            <div>
              <p className="font-mono font-bold text-white">{i.invoiceNo}</p>
              <p className="text-zinc-400">{i.facilityName}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-white">{formatEtb(i.totalSantim)}</p>
              <p className="text-[10px] text-rose-400">Due {formatDate(i.dueDate)}</p>
            </div>
          </Row>
        ))}
      </Section>

      <Section
        title="Silent Trackers During a Trip"
        icon={RadioTower}
        tone="rose"
        count={a.silentTrackers.length}
        empty="None — every vehicle on a trip has reported GPS recently."
      >
        {a.silentTrackers.map((s) => (
          <Row key={s.id}>
            <div>
              <p className="font-mono font-bold text-white">{s.plateNumber}</p>
              <p className="text-zinc-400">Trip {s.tripCode}</p>
            </div>
            <span className="text-[11px] text-rose-400">
              {s.lastSeenAt ? `Last GPS ${formatDateTime(s.lastSeenAt)}` : "No GPS point yet"}
            </span>
          </Row>
        ))}
      </Section>

      <Section
        title="Disposal Exceptions (Last 30 Days)"
        icon={AlertTriangle}
        tone="rose"
        count={a.disposalExceptions.length}
        empty="None — every container was received and destroyed, every certificate issued."
      >
        {a.disposalExceptions.map((d) => (
          <Row key={`${d.kind}-${d.id}`}>
            <div>
              <p className="font-mono text-white">
                {d.code} · {DISPOSAL_KIND[d.kind]}
              </p>
              <p className="text-[11px] text-zinc-400">
                {d.facilityName}
                {d.details ? ` — ${d.details}` : ""}
              </p>
            </div>
            <span className="font-mono text-[10px] text-zinc-500">{formatDateTime(d.at)}</span>
          </Row>
        ))}
      </Section>

      <Section
        title="Failed Messages (SMS / Email)"
        icon={MailWarning}
        tone="rose"
        count={a.failedMessages.length}
        empty="None — no message has failed for good."
      >
        {a.failedMessages.map((m) => (
          <Row key={m.id}>
            <div>
              <p className="font-mono text-white">
                {m.channel} · {m.template}
              </p>
              <p className="text-[11px] text-zinc-400 break-all">{m.lastError ?? "—"}</p>
            </div>
            <span className="font-mono text-[10px] text-zinc-500">{formatDateTime(m.at)}</span>
          </Row>
        ))}
      </Section>

      <Section
        title="Licences Expiring or Expired"
        icon={BadgeAlert}
        tone="amber"
        count={a.expiringLicences.length}
        empty="None — no licence expires within the warning window."
      >
        {a.expiringLicences.map((l) => (
          <Row key={l.id}>
            <div>
              <p className="text-white font-medium">{l.subject}</p>
              <p className="text-[11px] text-zinc-400">
                {l.kind} · <span className="font-mono">{l.number}</span>
              </p>
            </div>
            <span
              className={`font-mono text-[11px] ${l.expired ? "text-rose-400" : "text-amber-400"}`}
            >
              {l.expired ? "Expired" : "Expires"} {formatDate(l.expiresOn)}
            </span>
          </Row>
        ))}
      </Section>

      <Section
        title="Facilities Without an Active Contract"
        icon={FileWarning}
        tone="amber"
        count={a.uncontractedFacilities.length}
        empty="None — every active facility has a contract."
      >
        {a.uncontractedFacilities.map((f) => (
          <Row key={f.id}>
            <p className="text-white">{f.name}</p>
            <StatusBadge status="NO_CONTRACT" size="sm" />
          </Row>
        ))}
      </Section>

      <Section
        title="Fleet Units Lacking Active GPS Telemetry Device"
        icon={Radio}
        tone="blue"
        count={a.vehiclesWithoutTracker.length}
        empty="None — every active vehicle has a tracker."
      >
        {a.vehiclesWithoutTracker.map((v) => (
          <Row key={v.id}>
            <div>
              <span className="font-mono font-bold text-white">{v.plateNumber}</span>
              {v.model && <span className="text-zinc-400 ml-2">({v.model})</span>}
            </div>
          </Row>
        ))}
      </Section>
    </div>
  );
}
