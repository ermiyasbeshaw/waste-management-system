/**
 * Bidirectional Ethiopian <-> Gregorian calendar conversion using astronomical Julian Day Numbers.
 * Supports all standard Ethiopian calendar months (12 x 30 days + Pagumē 5 or 6 days).
 */

export const ETHIOPIAN_MONTHS = [
  { id: 1, name: "Meskerem", amharic: "መስከረም" },
  { id: 2, name: "Tikimt", amharic: "ጥቅምት" },
  { id: 3, name: "Hidar", amharic: "ኅዳር" },
  { id: 4, name: "Tahsas", amharic: "ታኅሣሥ" },
  { id: 5, name: "Tir", amharic: "ጥር" },
  { id: 6, name: "Yakatit", amharic: "የካቲት" },
  { id: 7, name: "Megabit", amharic: "መጋቢት" },
  { id: 8, name: "Miazia", amharic: "ሚያዝያ" },
  { id: 9, name: "Ginbot", amharic: "ግንቦት" },
  { id: 10, name: "Sene", amharic: "ሰኔ" },
  { id: 11, name: "Hamle", amharic: "ሐምሌ" },
  { id: 12, name: "Nehase", amharic: "ነሐሴ" },
  { id: 13, name: "Pagume", amharic: "ጳጉሜን" },
] as const;

export interface EthiopianDate {
  year: number;
  month: number;
  day: number;
  monthName: string;
  monthNameAmharic: string;
  formatted: string;
  formattedAmharic: string;
}

/** Converts Gregorian (Y, M, D) to Julian Day Number (JDN). */
function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/** Converts JDN to Gregorian (Y, M, D). */
function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

/** Converts JDN to Ethiopian date. */
function jdnToEthiopian(jdn: number): { year: number; month: number; day: number } {
  const r = (jdn - 1723856) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year =
    4 * Math.floor((jdn - 1723856) / 1461) +
    Math.floor(r / 365) -
    Math.floor(r / 1460);
  const month = Math.floor(n / 30) + 1;
  const day = (n % 30) + 1;
  return { year, month, day };
}

/** Converts Ethiopian date to JDN. */
function ethiopianToJdn(year: number, month: number, day: number): number {
  return (
    1723856 +
    365 * (year - 1) +
    Math.floor(year / 4) +
    30 * (month - 1) +
    day -
    1
  );
}

/**
 * Converts a Gregorian Date or ISO string "YYYY-MM-DD" into Ethiopian Date.
 */
export function toEthiopianDate(input: Date | string): EthiopianDate {
  let y: number;
  let m: number;
  let d: number;

  if (typeof input === "string") {
    const parts = input.split("T")[0].split("-");
    y = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    d = parseInt(parts[2], 10);
  } else {
    y = input.getFullYear();
    m = input.getMonth() + 1;
    d = input.getDate();
  }

  const jdn = gregorianToJdn(y, m, d);
  const eth = jdnToEthiopian(jdn);
  const monthMeta = ETHIOPIAN_MONTHS[eth.month - 1] ?? ETHIOPIAN_MONTHS[0];

  return {
    year: eth.year,
    month: eth.month,
    day: eth.day,
    monthName: monthMeta.name,
    monthNameAmharic: monthMeta.amharic,
    formatted: `${monthMeta.name} ${eth.day}, ${eth.year} E.C.`,
    formattedAmharic: `${monthMeta.amharic} ${eth.day} ቀን ${eth.year} ዓ.ም`,
  };
}

/**
 * Converts Ethiopian date to Gregorian ISO date string "YYYY-MM-DD".
 */
export function toGregorianIso(year: number, month: number, day: number): string {
  const jdn = ethiopianToJdn(year, month, day);
  const greg = jdnToGregorian(jdn);
  const mm = String(greg.month).padStart(2, "0");
  const dd = String(greg.day).padStart(2, "0");
  return `${greg.year}-${mm}-${dd}`;
}
