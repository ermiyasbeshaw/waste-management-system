import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

/**
 * Certificate of Disposal PDF (CLAUDE.md §6, Gate 5.3): lists the destroyed containers and the exceptions
 * (MISSING / REFUSED with reason). Shows only the public DECISION fields plus the container lists — never person
 * names, phone numbers or emails. The QR code holds only the public verify URL.
 */

export interface CertificatePdfInput {
  systemName: string;
  certificateNo: string;
  issuedOn: string;
  facilityName: string;
  facilityCode: string;
  wasteCode: string;
  categoryName: string;
  weightKg: number;
  destroyedOn: string;
  methodName: string;
  verifyUrl: string;
  destroyed: string[];
  exceptions: { containerCode: string; status: "MISSING" | "REFUSED"; reason: string }[];
}

const A4 = { width: 595.28, height: 841.89 };
const M = 48;

/** Standard PDF fonts only cover Latin-1. */
function safe(text: string): string {
  return text.replace(/[^ -~ -ÿ]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safe(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Certificate of Disposal ${input.certificateNo}`);
  doc.setCreator(input.systemName);
  doc.setProducer(input.systemName);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.08, 0.1);
  const grey = rgb(0.4, 0.4, 0.45);
  const accent = rgb(0.02, 0.47, 0.34);

  let page: PDFPage = doc.addPage([A4.width, A4.height]);
  let y = A4.height - M;
  const newPage = () => {
    page = doc.addPage([A4.width, A4.height]);
    y = A4.height - M;
    page.drawText(safe(`${input.certificateNo} (continued)`), {
      x: M,
      y,
      size: 10,
      font: bold,
      color: grey,
    });
    y -= 24;
  };
  const ensure = (h: number) => {
    if (y - h < M + 20) newPage();
  };
  const text = (t: string, size = 10, font = regular, color = ink, x = M) => {
    ensure(size + 6);
    page.drawText(safe(t), { x, y, size, font, color });
    y -= size + 6;
  };

  // Header
  page.drawRectangle({ x: 0, y: A4.height - 6, width: A4.width, height: 6, color: accent });
  text(input.systemName.toUpperCase(), 9, bold, accent);
  y -= 4;
  text("Certificate of Disposal", 22, bold);
  text(`Certificate No. ${input.certificateNo}    Issued ${input.issuedOn}`, 11, bold, grey);
  y -= 8;

  // QR (top right): the public verification URL only.
  const png = await QRCode.toBuffer(input.verifyUrl, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 300,
  });
  const qr = await doc.embedPng(png);
  page.drawImage(qr, { x: A4.width - M - 96, y: A4.height - M - 104, width: 96, height: 96 });

  // Facts
  const facts: [string, string][] = [
    ["Facility", `${input.facilityName} (${input.facilityCode})`],
    ["Waste ID", input.wasteCode],
    ["Category", input.categoryName],
    ["Registered weight", `${input.weightKg} kg`],
    ["Destruction date", input.destroyedOn],
    ["Destruction method", input.methodName],
    [
      "Containers",
      `${input.destroyed.length} destroyed` +
        (input.exceptions.length ? `, ${input.exceptions.length} not destroyed (see below)` : ""),
    ],
  ];
  for (const [label, value] of facts) {
    ensure(18);
    page.drawText(safe(label), { x: M, y, size: 10, font: regular, color: grey });
    page.drawText(safe(value), { x: M + 130, y, size: 10, font: bold, color: ink });
    y -= 18;
  }
  y -= 10;

  text("Destroyed containers", 12, bold);
  const colW = (A4.width - 2 * M) / 3;
  for (let i = 0; i < input.destroyed.length; i += 3) {
    ensure(16);
    input.destroyed.slice(i, i + 3).forEach((code, j) => {
      page.drawText(safe(code), { x: M + j * colW, y, size: 9, font: regular, color: ink });
    });
    y -= 15;
  }
  if (input.destroyed.length === 0) text("None", 9, regular, grey);
  y -= 8;

  if (input.exceptions.length) {
    text("Containers not destroyed", 12, bold);
    for (const e of input.exceptions) {
      const lines = wrap(
        `${e.containerCode} - ${e.status}: ${e.reason}`,
        regular,
        9,
        A4.width - 2 * M
      );
      for (const l of lines) text(l, 9);
    }
    y -= 8;
  }

  ensure(60);
  text("Verification", 12, bold);
  for (const l of wrap(
    `Scan the QR code or open ${input.verifyUrl} to check that this certificate is valid. Only certificates shown as ISSUED there are valid. The file can be compared with the original on that page.`,
    regular,
    9,
    A4.width - 2 * M
  ))
    text(l, 9, regular, grey);

  // Footer on every page
  const pages = doc.getPages();
  pages.forEach((p, i) =>
    p.drawText(safe(`${input.certificateNo}  ·  page ${i + 1} of ${pages.length}`), {
      x: M,
      y: 24,
      size: 8,
      font: regular,
      color: grey,
    })
  );
  return doc.save();
}
