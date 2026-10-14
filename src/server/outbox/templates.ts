import { z } from "zod";

/**
 * Message templates (architecture module 10). Each template fixes its channel, validates its data and renders
 * the text. Secret values (the OTP) arrive separately, encrypted, and are only seen by `render`.
 * Further templates (trip assigned, certificate issued, invoice issued, alerts) are added with their gates.
 * ASSUMPTION: English text until the client provides wording (and Amharic, if wanted).
 */

export type Channel = "SMS" | "EMAIL";

export type Rendered =
  { channel: "SMS"; text: string } | { channel: "EMAIL"; subject: string; html: string };

interface Template<D extends z.ZodTypeAny> {
  channel: Channel;
  data: D;
  /** Names of the secret values the template needs (encrypted in the outbox). */
  secrets: readonly string[];
  render: (data: z.infer<D>, secrets: Record<string, string>) => Rendered;
}

function template<D extends z.ZodTypeAny>(t: Template<D>): Template<D> {
  return t;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );

export const TEMPLATES = {
  /** Pickup OTP to each verified hospital recipient (CLAUDE.md §6). */
  "otp.pickup": template({
    channel: "SMS",
    data: z.object({
      facilityName: z.string().min(1),
      expiresInMinutes: z.number().int().positive(),
    }),
    secrets: ["code"],
    render: (d, s) => ({
      channel: "SMS",
      text: `SafeWaste pickup code for ${d.facilityName}: ${s.code}. Valid ${d.expiresInMinutes} min. Give it to the driver only after every container is scanned.`,
    }),
  }),
  /** New or changed trip for a driver (CLAUDE.md §6: driver email via the outbox). */
  "trip.assigned": template({
    channel: "EMAIL",
    data: z.object({
      tripCode: z.string(),
      plannedDate: z.string(),
      vehiclePlate: z.string(),
      stops: z.array(z.string()).min(1),
      change: z.enum(["NEW", "REASSIGNED", "CANCELLED"]),
    }),
    secrets: [],
    render: (d) => ({
      channel: "EMAIL",
      subject:
        d.change === "CANCELLED"
          ? `Trip ${d.tripCode} cancelled`
          : `Trip ${d.tripCode} on ${d.plannedDate} — ${d.vehiclePlate}`,
      html:
        d.change === "CANCELLED"
          ? `<p>Trip <b>${escapeHtml(d.tripCode)}</b> (${escapeHtml(d.plannedDate)}) is no longer assigned to you.</p>`
          : `<p>${d.change === "REASSIGNED" ? "You have been assigned" : "New trip"}: <b>${escapeHtml(d.tripCode)}</b> on ${escapeHtml(d.plannedDate)}, vehicle ${escapeHtml(d.vehiclePlate)}.</p><ol>${d.stops.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol><p>Open the SafeWaste driver console for details.</p>`,
    }),
  }),
  /** Certificate of Disposal issued — to the facility's hospital administrators (CLAUDE.md §2: email). */
  "certificate.issued": template({
    channel: "EMAIL",
    data: z.object({
      certificateNo: z.string(),
      wasteCode: z.string(),
      facilityName: z.string(),
      verifyUrl: z.string().url(),
    }),
    secrets: [],
    render: (d) => ({
      channel: "EMAIL",
      subject: `Certificate of Disposal ${d.certificateNo} — ${d.wasteCode}`,
      html: `<p>The waste <b>${escapeHtml(d.wasteCode)}</b> of ${escapeHtml(d.facilityName)} has been destroyed. Certificate <b>${escapeHtml(d.certificateNo)}</b> is issued.</p><p>Download it in SafeWaste (Hospital → Certificates). Anyone can check it at <a href="${escapeHtml(d.verifyUrl)}">${escapeHtml(d.verifyUrl)}</a>.</p>`,
    }),
  }),
  /** Monthly invoice issued — to the facility's hospital administrators (CLAUDE.md §2: email). */
  "invoice.issued": template({
    channel: "EMAIL",
    data: z.object({
      invoiceNo: z.string(),
      facilityName: z.string(),
      periodLabel: z.string(),
      total: z.string(),
      dueDate: z.string(),
    }),
    secrets: [],
    render: (d) => ({
      channel: "EMAIL",
      subject: `Invoice ${d.invoiceNo} — ${d.periodLabel}`,
      html: `<p>Invoice <b>${escapeHtml(d.invoiceNo)}</b> for ${escapeHtml(d.facilityName)} (${escapeHtml(d.periodLabel)}): <b>${escapeHtml(d.total)}</b>, due ${escapeHtml(d.dueDate)}.</p><p>Open SafeWaste (Hospital → Invoices) to download it. Payment is made outside SafeWaste; quote the invoice number.</p>`,
    }),
  }),
  /**
   * Medicine expiry alert (CLAUDE.md §12) — to the facility's hospital administrators and to EFDA officers.
   * ASSUMPTION: English wording until the owner provides the text.
   */
  "stock.expiry_alert": template({
    channel: "EMAIL",
    data: z.object({
      facilityName: z.string(),
      lines: z
        .array(
          z.object({
            item: z.string(),
            strength: z.string(),
            batch: z.string(),
            quantity: z.number(),
            unit: z.string(),
            expiryDate: z.string(),
            daysLeft: z.number(),
          })
        )
        .min(1)
        .max(50),
      more: z.number().int().min(0),
    }),
    secrets: [],
    render: (d) => ({
      channel: "EMAIL",
      subject: `Medicine expiry alert — ${d.facilityName} (${d.lines.length + d.more} line${d.lines.length + d.more === 1 ? "" : "s"})`,
      html: `<p>Stock of <b>${escapeHtml(d.facilityName)}</b> that is expiring or has expired:</p><ul>${d.lines
        .map(
          (l) =>
            `<li>${escapeHtml(l.item)}${l.strength ? ` ${escapeHtml(l.strength)}` : ""}, batch ${escapeHtml(l.batch)}: ${l.quantity} ${escapeHtml(l.unit)} — ${
              l.daysLeft < 0
                ? `expired on ${escapeHtml(l.expiryDate)}`
                : l.daysLeft === 0
                  ? "expires today"
                  : `expires in ${l.daysLeft} day(s) (${escapeHtml(l.expiryDate)})`
            }</li>`
        )
        .join(
          ""
        )}</ul>${d.more ? `<p>… and ${d.more} more line(s).</p>` : ""}<p>Open SafeWaste (Medicine stock) to review it or to request disposal.</p>`,
    }),
  }),
  /** Delivery check for administrators (no business data). */
  "system.test_sms": template({
    channel: "SMS",
    data: z.object({ note: z.string().max(100) }),
    secrets: [],
    render: (d) => ({ channel: "SMS", text: `SafeWaste test message: ${d.note}` }),
  }),
  "system.test_email": template({
    channel: "EMAIL",
    data: z.object({ note: z.string().max(100) }),
    secrets: [],
    render: (d) => ({
      channel: "EMAIL",
      subject: "SafeWaste test message",
      html: `<p>SafeWaste test message: ${escapeHtml(d.note)}</p>`,
    }),
  }),
} as const;

export type TemplateName = keyof typeof TEMPLATES;
export type TemplateData<T extends TemplateName> = z.infer<(typeof TEMPLATES)[T]["data"]>;

export function isTemplateName(name: string): name is TemplateName {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, name);
}

/** Renders a stored message; throws when the template is unknown or the data / secrets do not fit. */
export function renderMessage(
  name: string,
  data: unknown,
  secrets: Record<string, string>
): Rendered {
  if (!isTemplateName(name)) throw new Error(`Unknown template ${name}`);
  const t = TEMPLATES[name] as unknown as Template<z.ZodTypeAny>;
  const parsed = t.data.parse(data);
  for (const s of t.secrets) {
    if (!secrets[s]) throw new Error(`Template ${name} is missing secret "${s}"`);
  }
  return t.render(parsed, secrets);
}
