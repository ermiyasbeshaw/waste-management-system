import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import {
  LABELS_PER_PAGE,
  pdfLibRenderer,
  qrPayload,
  type LabelSheetInput,
} from "@/server/integrations/pdf/labels";

const sheet = (n: number, overrides: Partial<LabelSheetInput> = {}): LabelSheetInput => ({
  systemName: "SafeWaste Biohazard Tracking Network",
  facilityName: "Dil Chora Referral Hospital",
  categoryName: "Sharps & Cutting Materials",
  colourCode: "RED",
  wasteCode: "WR-2610-00042",
  registeredOn: "9 Oct 2026",
  labels: Array.from({ length: n }, (_, i) => ({
    containerCode: `WR-2610-00042-C${String(i + 1).padStart(2, "0")}`,
    seq: i + 1,
    total: n,
  })),
  ...overrides,
});

describe("container label PDF (CLAUDE.md §6)", () => {
  it("is a valid PDF with 8 labels per A4 page", async () => {
    for (const [n, pages] of [
      [1, 1],
      [8, 1],
      [9, 2],
      [17, 3],
    ] as const) {
      const bytes = await pdfLibRenderer.renderLabels(sheet(n));
      expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount(), `${n} labels`).toBe(pages);
      expect(Math.round(doc.getPage(0).getWidth())).toBe(595); // A4
    }
    expect(LABELS_PER_PAGE).toBe(8);
  });

  it("the QR holds the container code and nothing else", () => {
    expect(qrPayload("WR-2610-00042-C03")).toBe("WR-2610-00042-C03");
    const qr = QRCode.create(qrPayload("WR-2610-00042-C03"), { errorCorrectionLevel: "M" });
    const data = qr.segments.map((s) => String((s as unknown as { data: unknown }).data)).join("");
    expect(data).toBe("WR-2610-00042-C03");
  });

  it("never fails on names the standard fonts cannot draw (e.g. Ethiopic) or on very long names", async () => {
    const bytes = await pdfLibRenderer.renderLabels(
      sheet(2, {
        facilityName:
          "ድሬዳዋ ሆስፒታል — a very long facility name that does not fit on one label line at all",
        categoryName: "Expired & Cytotoxic Pharmaceuticals with an extra long description",
        colourCode: "UNKNOWN",
      })
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
