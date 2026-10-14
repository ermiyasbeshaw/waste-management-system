import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

/** Tabular report PDF (exports, Gate 6.4): landscape A4, repeated header row, page numbers. */

export interface TableReport {
  systemName: string;
  title: string;
  /** e.g. "Generated 10 Oct 2026, 14:05 EAT · 120 rows" */
  subtitle: string;
  headers: string[];
  rows: string[][];
}

const PAGE = { width: 841.89, height: 595.28 };
const M = 32;
const ROW_H = 15;
const SIZE = 8;
const safe = (t: string) => t.replace(/[^ -~ -ÿ]/g, "?");

function fit(text: string, font: PDFFont, width: number): string {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, SIZE) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, SIZE) > width) t = t.slice(0, -1);
  return `${t}...`;
}

export async function renderTablePdf(report: TableReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(report.title);
  doc.setCreator(report.systemName);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Column widths in proportion to the longest text (capped), filling the page width.
  const sample = [report.headers, ...report.rows.slice(0, 200)];
  const weights = report.headers.map((_, i) =>
    Math.min(40, Math.max(6, ...sample.map((r) => (r[i] ?? "").length)))
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => ((PAGE.width - 2 * M) * w) / total);

  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - M;
  const header = () => {
    page.drawText(safe(report.systemName.toUpperCase()), {
      x: M,
      y,
      size: 8,
      font: bold,
      color: rgb(0.02, 0.47, 0.34),
    });
    y -= 16;
    page.drawText(safe(report.title), { x: M, y, size: 14, font: bold });
    y -= 14;
    page.drawText(safe(report.subtitle), {
      x: M,
      y,
      size: 8,
      font: regular,
      color: rgb(0.4, 0.4, 0.45),
    });
    y -= 18;
    let x = M;
    page.drawRectangle({
      x: M,
      y: y - 4,
      width: PAGE.width - 2 * M,
      height: ROW_H,
      color: rgb(0.9, 0.93, 0.92),
    });
    report.headers.forEach((h, i) => {
      page.drawText(fit(h, bold, widths[i] - 4), { x: x + 2, y, size: SIZE, font: bold });
      x += widths[i];
    });
    y -= ROW_H;
  };
  header();
  for (const row of report.rows) {
    if (y < M + ROW_H) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - M;
      header();
    }
    let x = M;
    row.forEach((cell, i) => {
      page.drawText(fit(cell ?? "", regular, widths[i] - 4), {
        x: x + 2,
        y,
        size: SIZE,
        font: regular,
      });
      x += widths[i];
    });
    y -= ROW_H;
  }
  if (report.rows.length === 0) page.drawText("No rows.", { x: M, y, size: SIZE, font: regular });

  const pages = doc.getPages();
  pages.forEach((p, i) =>
    p.drawText(`page ${i + 1} of ${pages.length}`, {
      x: PAGE.width - M - 60,
      y: 16,
      size: 7,
      font: regular,
      color: rgb(0.4, 0.4, 0.45),
    })
  );
  return doc.save();
}
