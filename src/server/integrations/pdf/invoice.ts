import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Monthly invoice PDF (Gate 6.3). Amounts arrive already formatted as ETB (src/lib/money.ts); no person names.
 * DRAFT and CANCELLED invoices carry a large marker so they cannot be mistaken for a bill.
 * ASSUMPTION: no TIN / legal invoice fields until the client gives them (CLAUDE.md §13: no invented legal rules).
 */

export interface InvoicePdfInput {
  systemName: string;
  invoiceNo: string;
  status: "DRAFT" | "ISSUED" | "SETTLED_OFFLINE" | "CANCELLED";
  facilityName: string;
  facilityCode: string;
  contractCode: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  issuedOn: string | null;
  dueDate: string | null;
  subtotal: string;
  vatRatePercent: string;
  vat: string;
  total: string;
  settlement: string | null;
}

const A4 = { width: 595.28, height: 841.89 };
const M = 48;
const safe = (t: string) => t.replace(/[^ -~ -ÿ]/g, "?");

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${input.invoiceNo}`);
  doc.setCreator(input.systemName);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.08, 0.1);
  const grey = rgb(0.4, 0.4, 0.45);
  const accent = rgb(0.02, 0.47, 0.34);
  const page = doc.addPage([A4.width, A4.height]);
  let y = A4.height - M;
  const line = (t: string, size = 10, font = regular, color = ink, x = M) => {
    page.drawText(safe(t), { x, y, size, font, color });
    y -= size + 7;
  };
  const right = (t: string, size: number, font = regular, at = y) => {
    const w = font.widthOfTextAtSize(safe(t), size);
    page.drawText(safe(t), { x: A4.width - M - w, y: at, size, font, color: ink });
  };

  page.drawRectangle({ x: 0, y: A4.height - 6, width: A4.width, height: 6, color: accent });
  line(input.systemName.toUpperCase(), 9, bold, accent);
  y -= 4;
  line("Invoice", 24, bold);
  line(`Invoice No. ${input.invoiceNo}`, 11, bold, grey);
  y -= 10;

  const facts: [string, string][] = [
    ["Billed to", `${input.facilityName} (${input.facilityCode})`],
    ["Contract", input.contractCode],
    ["Period", `${input.periodLabel} (${input.periodStart} to ${input.periodEnd})`],
    ["Issue date", input.issuedOn ?? "not issued"],
    ["Due date", input.dueDate ?? "-"],
    ["Status", input.status.replace("_", " ")],
  ];
  for (const [k, v] of facts) {
    page.drawText(safe(k), { x: M, y, size: 10, font: regular, color: grey });
    page.drawText(safe(v), { x: M + 110, y, size: 10, font: bold, color: ink });
    y -= 18;
  }
  y -= 16;

  // Amounts
  page.drawLine({ start: { x: M, y: y + 12 }, end: { x: A4.width - M, y: y + 12 }, color: grey });
  line(`Medical waste collection and disposal service - ${input.periodLabel}`, 10);
  right(input.subtotal, 10, regular, y + 17);
  y -= 8;
  page.drawLine({ start: { x: M, y: y + 12 }, end: { x: A4.width - M, y: y + 12 }, color: grey });
  line("Subtotal", 10, regular, grey, A4.width - M - 260);
  right(input.subtotal, 10, regular, y + 17);
  line(`VAT ${input.vatRatePercent} %`, 10, regular, grey, A4.width - M - 260);
  right(input.vat, 10, regular, y + 17);
  line("Total", 12, bold, ink, A4.width - M - 260);
  right(input.total, 12, bold, y + 19);
  y -= 20;

  line(
    "Payment is made outside SafeWaste (bank transfer or cash). Quote the invoice number.",
    9,
    regular,
    grey
  );
  if (input.settlement) line(`Settled: ${input.settlement}`, 9, bold, accent);

  if (input.status === "DRAFT" || input.status === "CANCELLED") {
    const word = input.status;
    const size = 72;
    const w = bold.widthOfTextAtSize(word, size);
    page.drawText(word, {
      x: (A4.width - w) / 2,
      y: A4.height / 2 - 120,
      size,
      font: bold,
      color: rgb(0.85, 0.2, 0.2),
      opacity: 0.25,
    });
  }
  page.drawText(safe(`${input.invoiceNo}  ·  ${input.systemName}`), {
    x: M,
    y: 24,
    size: 8,
    font: regular,
    color: grey,
  });
  return doc.save();
}
