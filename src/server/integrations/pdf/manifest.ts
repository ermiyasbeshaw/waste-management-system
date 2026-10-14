import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Trip manifest (CLAUDE.md §6: `GET /api/trips/{id}/manifest`): what the vehicle carries — trip, vehicle, driver
 * and every stop in order with its waste records and container codes, plus signature lines for the paper copy.
 * A4 portrait; continues on new pages as needed.
 */

export interface ManifestInput {
  systemName: string;
  tripCode: string;
  plannedDate: string;
  vehiclePlate: string;
  driverName: string;
  driverLicenceNo: string;
  printedAt: string;
  stops: {
    order: number;
    facilityName: string;
    facilityCode: string;
    address: string;
    status: string;
    waste: {
      wasteCode: string;
      categoryName: string;
      containerCount: number;
      weightKg: number;
      containerCodes: string[];
    }[];
  }[];
}

const A4 = { width: 595.28, height: 841.89 };
const M = 40;

const safe = (t: string) => t.replace(/[^ -~ -ÿ]/g, "?");

export async function renderManifest(input: ManifestInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Trip manifest ${input.tripCode}`);
  doc.setCreator(input.systemName);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([A4.width, A4.height]);
  let y = A4.height - M;

  const newPageIfNeeded = (space: number) => {
    if (y - space < M + 20) {
      page = doc.addPage([A4.width, A4.height]);
      y = A4.height - M;
      line(`${input.tripCode} (continued)`, bold, 10);
      y -= 4;
    }
  };
  function line(text: string, font: PDFFont = regular, size = 10, x = M, color = rgb(0, 0, 0)) {
    page.drawText(safe(text), { x, y, size, font, color, maxWidth: A4.width - M - x });
    y -= size + 5;
  }

  line(input.systemName, regular, 9, M, rgb(0.35, 0.35, 0.35));
  line(`Trip manifest ${input.tripCode}`, bold, 18);
  line(
    `Date: ${input.plannedDate}    Vehicle: ${input.vehiclePlate}    Driver: ${input.driverName} (licence ${input.driverLicenceNo})`
  );
  line(`Printed: ${input.printedAt}`, regular, 8, M, rgb(0.35, 0.35, 0.35));
  y -= 6;

  const total = input.stops.reduce(
    (t, s) => ({
      containers: t.containers + s.waste.reduce((n, w) => n + w.containerCount, 0),
      kg: t.kg + s.waste.reduce((n, w) => n + w.weightKg, 0),
    }),
    { containers: 0, kg: 0 }
  );
  line(
    `${input.stops.length} stop(s) · ${total.containers} container(s) · ${total.kg.toFixed(2)} kg`,
    bold,
    11
  );
  y -= 6;

  for (const s of input.stops) {
    newPageIfNeeded(60);
    page.drawLine({
      start: { x: M, y: y + 8 },
      end: { x: A4.width - M, y: y + 8 },
      thickness: 0.6,
      color: rgb(0.6, 0.6, 0.6),
    });
    line(`Stop ${s.order}: ${s.facilityName} (${s.facilityCode})  [${s.status}]`, bold, 11);
    line(s.address, regular, 9, M + 10, rgb(0.25, 0.25, 0.25));
    for (const w of s.waste) {
      newPageIfNeeded(30);
      line(
        `${w.wasteCode} · ${w.categoryName} · ${w.containerCount} container(s) · ${w.weightKg.toFixed(2)} kg`,
        regular,
        9,
        M + 10
      );
      // Container codes, several per line.
      for (let i = 0; i < w.containerCodes.length; i += 4) {
        newPageIfNeeded(14);
        line(w.containerCodes.slice(i, i + 4).join("    "), regular, 8, M + 22, rgb(0.2, 0.2, 0.2));
      }
    }
    y -= 4;
  }

  newPageIfNeeded(90);
  y -= 20;
  line(
    "Driver signature: ______________________________        Disposal site received by: ______________________________",
    regular,
    9
  );
  y -= 10;
  line(
    "Date / time: ___________________                         Date / time: ___________________",
    regular,
    9
  );
  return doc.save();
}
