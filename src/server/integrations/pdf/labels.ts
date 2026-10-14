import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";

/**
 * Container label sheets (CLAUDE.md §6, architecture module 9): one label per container with the facility name,
 * category (colour AND text), "container x of n", the Waste ID and a QR code holding ONLY the container code.
 * A4, 2 × 4 labels per page. Behind the `PdfRenderer` interface so the PDF library can be replaced.
 */

export interface LabelSheetInput {
  systemName: string;
  facilityName: string;
  categoryName: string;
  /** MoH colour code (YELLOW, RED, …) — printed as a colour bar and as text. */
  colourCode: string;
  wasteCode: string;
  /** Registration date as shown to people, e.g. "9 Oct 2026". */
  registeredOn: string;
  labels: { containerCode: string; seq: number; total: number }[];
}

export interface PdfRenderer {
  renderLabels(input: LabelSheetInput): Promise<Uint8Array>;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 28;
const GAP = 12;
const COLS = 2;
const ROWS = 4;
export const LABELS_PER_PAGE = COLS * ROWS;

const MOH_RGB: Record<string, [number, number, number]> = {
  YELLOW: [0.92, 0.7, 0.03],
  RED: [0.86, 0.15, 0.15],
  BLUE: [0.15, 0.39, 0.92],
  BROWN: [0.55, 0.3, 0.1],
  BLACK: [0.1, 0.1, 0.1],
  WHITE: [0.97, 0.97, 0.97],
};

/** The QR payload: the container code and nothing else (no names, phones or patient data — CLAUDE.md §6). */
export function qrPayload(containerCode: string): string {
  return containerCode;
}

/** Standard PDF fonts only cover Latin-1: anything else becomes "?" instead of failing the whole sheet. */
function safe(text: string): string {
  return text.replace(/[^ -~ -ÿ]/g, "?");
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

export const pdfLibRenderer: PdfRenderer = {
  async renderLabels(input) {
    const doc = await PDFDocument.create();
    doc.setTitle(`Container labels ${input.wasteCode}`);
    doc.setCreator(input.systemName);
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const w = (A4.width - 2 * MARGIN - (COLS - 1) * GAP) / COLS;
    const h = (A4.height - 2 * MARGIN - (ROWS - 1) * GAP) / ROWS;
    const [cr, cg, cb] = MOH_RGB[input.colourCode] ?? [0.6, 0.6, 0.6];
    const darkBar = ["RED", "BLUE", "BROWN", "BLACK"].includes(input.colourCode);

    let page = doc.addPage([A4.width, A4.height]);
    for (let i = 0; i < input.labels.length; i++) {
      if (i > 0 && i % LABELS_PER_PAGE === 0) page = doc.addPage([A4.width, A4.height]);
      const label = input.labels[i];
      const slot = i % LABELS_PER_PAGE;
      const x = MARGIN + (slot % COLS) * (w + GAP);
      const top = A4.height - MARGIN - Math.floor(slot / COLS) * (h + GAP);
      const y = top - h;

      // Frame + category colour bar with the category name in text (never colour alone).
      page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0, 0, 0), borderWidth: 1 });
      const barH = 26;
      page.drawRectangle({ x, y: top - barH, width: w, height: barH, color: rgb(cr, cg, cb) });
      page.drawText(fit(`${input.categoryName} (${input.colourCode})`, bold, 10, w - 16), {
        x: x + 8,
        y: top - 17,
        size: 10,
        font: bold,
        color: darkBar ? rgb(1, 1, 1) : rgb(0, 0, 0),
      });

      // QR (right) — container code only.
      const qrSize = 104;
      const png = await QRCode.toBuffer(qrPayload(label.containerCode), {
        type: "png",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 320,
      });
      const qr = await doc.embedPng(png);
      page.drawImage(qr, { x: x + w - qrSize - 8, y: y + 26, width: qrSize, height: qrSize });

      // Text (left).
      const textW = w - qrSize - 28;
      const lines: [string, PDFFont, number][] = [
        [fit(input.facilityName, bold, 10, textW), bold, 10],
        [`Container ${label.seq} of ${label.total}`, bold, 15],
        [`Waste ID: ${input.wasteCode}`, regular, 9],
        [`Registered: ${safe(input.registeredOn)}`, regular, 9],
      ];
      let ty = top - barH - 20;
      for (const [text, font, size] of lines) {
        page.drawText(text, { x: x + 8, y: ty, size, font, color: rgb(0, 0, 0) });
        ty -= size + 9;
      }

      // Container code in full under the QR, readable if the QR is damaged.
      page.drawText(fit(label.containerCode, bold, 10, w - 16), {
        x: x + 8,
        y: y + 10,
        size: 10,
        font: bold,
        color: rgb(0, 0, 0),
      });
      page.drawText(fit(input.systemName, regular, 6, qrSize), {
        x: x + w - qrSize - 8,
        y: y + 12,
        size: 6,
        font: regular,
        color: rgb(0.35, 0.35, 0.35),
      });
    }
    return doc.save();
  },
};
