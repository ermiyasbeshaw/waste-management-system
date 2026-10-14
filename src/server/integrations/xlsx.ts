import "server-only";
import ExcelJS from "exceljs";

/** XLSX writer for exports (Gate 6.4): one sheet, bold header, filters, frozen header row, sensible widths. */
export async function renderXlsx(input: {
  sheetName: string;
  headers: string[];
  rows: (string | number)[][];
  creator: string;
}): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = input.creator;
  wb.created = new Date();
  const ws = wb.addWorksheet(input.sheetName.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.addRow(input.headers).font = { bold: true };
  for (const r of input.rows) ws.addRow(r);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: input.headers.length } };
  ws.columns.forEach((col, i) => {
    const longest = Math.max(
      input.headers[i].length,
      ...input.rows.slice(0, 500).map((r) => String(r[i] ?? "").length)
    );
    col.width = Math.min(60, Math.max(10, longest + 2));
  });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Reads the first sheet of an .xlsx file as a table of plain values (dates stay Date, formulas give their result). */
export async function readXlsxTable(bytes: Uint8Array): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const table: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values: unknown[] = [];
    for (let c = 1; c <= row.cellCount; c++) values.push(plain(row.getCell(c).value));
    table.push(values);
  });
  return table.filter((r) => r.some((v) => String(v ?? "").trim() !== ""));
}

function plain(v: unknown): unknown {
  if (v === null || v === undefined) return "";
  if (v instanceof Date || typeof v !== "object") return v;
  const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
  if (o.result !== undefined) return plain(o.result);
  if (o.richText) return o.richText.map((t) => t.text).join("");
  if (o.text !== undefined) return o.text;
  return String(v);
}
