/**
 * Development seed (CLAUDE.md §9: fictional data that satisfies every rule). Run: `npm run db:seed`.
 *
 * R0 (8 Oct 2026): 3 facilities + one dev user per role.
 * Gate 2.1 (9 Oct 2026): reference data - waste categories, destruction methods, settings (CLAUDE.md section 7),
 * 2 vehicles and the driver profile of the dev driver.
 * Gate 2.9 (9 Oct 2026): all 18 prototype facilities, fictional facility users, a second driver, and (once, on a
 * database without waste) the operational demo data from `seed-operations.ts`.
 * - Idempotent: rows are upserted by their unique code / clerk_user_id, so running it twice changes nothing.
 * - Dev users have clerk_user_id `dev_<role>`; the dev role switcher picks them while Clerk users are postponed.
 * - Refuses to run when NODE_ENV=production. Uses the direct (unpooled) URL from .env.local.
 */
import { config } from "dotenv";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, sql } from "drizzle-orm";
import {
  destructionMethods,
  drivers,
  facilities,
  settings,
  users,
  vehicles,
  wasteCategories,
} from "../src/server/db/schema";
import { DEFAULT_SETTINGS } from "../src/lib/validation/settings";
import { seedOperations } from "./seed-operations";

config({ path: ".env.local", quiet: true });

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed: NODE_ENV is production.");
}
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set (.env.local)");

/**
 * The 18 facilities of the prototype (names, codes and places as in the mock data; contact fields dropped —
 * v1.2 DECISION). 17 health facilities + the one DISPOSAL_SITE.
 */
const FACILITY_ROWS = [
  [
    "DD-REF-001",
    "Dil Chora Referral Hospital",
    "REFERRAL_HOSPITAL",
    "Dire Dawa",
    "Kebele 02",
    "Hospital Road, Near Ras Hotel, Dire Dawa",
    9.5931,
    41.8662,
  ],
  [
    "DD-GEN-002",
    "Sabian General Hospital",
    "GENERAL_HOSPITAL",
    "Dire Dawa",
    "Sabian Kebele 06",
    "Sabian Highway, Dire Dawa",
    9.6085,
    41.8512,
  ],
  [
    "DD-GEN-003",
    "Bilal General Hospital",
    "GENERAL_HOSPITAL",
    "Dire Dawa",
    "Kebele 04",
    "Genda Kore Street, Dire Dawa",
    9.5882,
    41.8745,
  ],
  [
    "DD-GEN-004",
    "Yebego General Hospital",
    "GENERAL_HOSPITAL",
    "Dire Dawa",
    "Kebele 07",
    "Melka Jebdu Road, Dire Dawa",
    9.5742,
    41.8421,
  ],
  [
    "DD-PRI-005",
    "Kezira Primary Hospital & Clinic",
    "PRIMARY_HOSPITAL",
    "Dire Dawa",
    "Kezira Kebele 01",
    "Chemin de Fer Ave, Kezira, Dire Dawa",
    9.6015,
    41.8605,
  ],
  [
    "DD-PRI-006",
    "Genda Kore Health Center",
    "PRIMARY_HOSPITAL",
    "Dire Dawa",
    "Kebele 04",
    "Genda Kore Central Square, Dire Dawa",
    9.5841,
    41.8799,
  ],
  [
    "DD-PRI-007",
    "Shinile Maternal & Child Health Center",
    "CLINIC",
    "Dire Dawa Peripheral",
    "Shinile Gate",
    "Shinile Road, North Gate",
    9.6224,
    41.8385,
  ],
  [
    "DD-CLI-008",
    "Melka Jebdu Poly Clinic",
    "CLINIC",
    "Dire Dawa",
    "Melka Jebdu Kebele 09",
    "Main Market St, Melka Jebdu",
    9.5512,
    41.821,
  ],
  [
    "DD-CLI-009",
    "Dechatu Specialty Surgery Clinic",
    "CLINIC",
    "Dire Dawa",
    "Dechatu Kebele 03",
    "Dechatu River Walk, Dire Dawa",
    9.5978,
    41.8688,
  ],
  [
    "DD-PHA-010",
    "Red Cross Regional Pharmacy & Depot",
    "PHARMACY",
    "Dire Dawa",
    "Kebele 02",
    "Red Cross Compound, Kezira",
    9.6034,
    41.8631,
  ],
  [
    "DD-PHA-011",
    "Selam Medico Pharma Wholesaler",
    "PHARMACY",
    "Dire Dawa",
    "Kebele 05",
    "Taiwan Market Area, Dire Dawa",
    9.591,
    41.871,
  ],
  [
    "DD-PHA-012",
    "Dire Dawa University Medical Campus Clinic",
    "CLINIC",
    "Dire Dawa",
    "DDU Main Campus",
    "DDU Ring Road, Dire Dawa",
    9.619,
    41.829,
  ],
  [
    "DD-CLI-013",
    "Legehare Community Health Post",
    "CLINIC",
    "Dire Dawa",
    "Legehare Kebele 01",
    "Railway Station Plaza, Legehare",
    9.6001,
    41.859,
  ],
  [
    "DD-CLI-014",
    "B-Megala Dental & Maxillofacial Center",
    "CLINIC",
    "Dire Dawa",
    "Megala Kebele 03",
    "Megala Commercial Zone",
    9.5895,
    41.864,
  ],
  [
    "DD-PHA-015",
    "LifeCare Diagnostic Lab & Biohazard Unit",
    "CLINIC",
    "Dire Dawa",
    "Kebele 06",
    "Airport Road, Dire Dawa",
    9.612,
    41.856,
  ],
  [
    "DD-CLI-016",
    "St. Michael Orthopedic Hospital",
    "GENERAL_HOSPITAL",
    "Dire Dawa",
    "Kebele 08",
    "Addis Ketema Road, Dire Dawa",
    9.5815,
    41.849,
  ],
  [
    "DD-CLI-017",
    "Kora Family Health Clinic",
    "CLINIC",
    "Dire Dawa",
    "Kebele 05",
    "Kora Market Corner",
    9.586,
    41.869,
  ],
  [
    "DD-DIS-018",
    "Dire Dawa Central Hazardous Incineration & Disposal Site",
    "DISPOSAL_SITE",
    "Dire Dawa Industrial Zone",
    "Melka Industrial Park Buffer Zone",
    "Industrial Park Southern Gate, HW Treatment Plant #1",
    9.542,
    41.808,
  ],
] as const;

export const SEED_FACILITIES = FACILITY_ROWS.map(
  ([code, name, type, region, kebele, address, lat, lng]) => ({
    code,
    name,
    type,
    region,
    city: "Dire Dawa",
    kebele,
    address,
    lat,
    lng,
  })
);

/**
 * One dev user per role. Phones are fictional (+251 900 000 1xx). Hospital users have a "verified" phone and
 * receive pickup OTPs so their facilities count as ready (CLAUDE.md §6) — dev data only.
 */
export const SEED_USERS = [
  {
    role: "super_admin",
    fullName: "Nebiyu Platform Admin",
    email: "admin+clerk_test@example.com",
    facility: null,
    phone: null,
  },
  {
    role: "hospital_admin",
    fullName: "Dr. Aster Tadesse",
    email: "hospital.admin+clerk_test@example.com",
    facility: "DD-REF-001",
    phone: "+251900000102",
  },
  {
    role: "hospital_staff",
    fullName: "Sr. Genet Alemu",
    email: "hospital.staff+clerk_test@example.com",
    facility: "DD-GEN-002",
    phone: "+251900000103",
  },
  {
    role: "driver",
    fullName: "Abebe Kebede",
    email: "driver+clerk_test@example.com",
    facility: null,
    phone: null,
  },
  {
    role: "disposal_operator",
    fullName: "Eng. Kassahun Worku",
    email: "disposal+clerk_test@example.com",
    facility: "DD-DIS-018",
    phone: null,
  },
  {
    role: "efda_officer",
    fullName: "Tariku Haile",
    email: "efda+clerk_test@example.com",
    facility: null,
    phone: null,
  },
] as const;

/**
 * Fictional facility users (cannot sign in until Clerk is set up). Every health facility gets one OTP recipient
 * (verified phone, +251 900 000 2xx), EXCEPT DD-CLI-009 (no users) and DD-CLI-017 (a user without a verified
 * phone) — those two show as "not ready" on the admin dashboard (CLAUDE.md §6).
 */
const RECIPIENT_FACILITIES = [
  ["DD-GEN-003", "Ahmed Yusuf"],
  ["DD-GEN-004", "Dawit Mengistu"],
  ["DD-PRI-005", "Hirut Bekele"],
  ["DD-PRI-006", "Samuel Girma"],
  ["DD-PRI-007", "Mulu Assefa"],
  ["DD-CLI-008", "Yonas Tesfaye"],
  ["DD-PHA-010", "Selamawit Desta"],
  ["DD-PHA-011", "Bereket Haile"],
  ["DD-PHA-012", "Meron Abebe"],
  ["DD-CLI-013", "Fikru Alemayehu"],
  ["DD-CLI-014", "Tsion Getachew"],
  ["DD-PHA-015", "Kalkidan Mekonnen"],
  ["DD-CLI-016", "Elias Worku"],
] as const;

export const SEED_FACILITY_USERS = [
  ...RECIPIENT_FACILITIES.map(([facility, fullName], i) => ({
    clerkUserId: `seed_${facility.toLowerCase().replace(/-/g, "_")}_admin`,
    role: "hospital_admin" as const,
    fullName,
    email: `${facility.toLowerCase()}.admin+clerk_test@example.com`,
    facility,
    phone: `+2519000002${String(i + 1).padStart(2, "0")}`,
    phoneVerified: true,
    receivesPickupOtp: true,
  })),
  {
    clerkUserId: "seed_dd_ref_001_staff",
    role: "hospital_staff" as const,
    fullName: "Lidya Tadesse",
    email: "dd-ref-001.staff+clerk_test@example.com",
    facility: "DD-REF-001",
    phone: "+251900000290",
    phoneVerified: true,
    receivesPickupOtp: false,
  },
  {
    clerkUserId: "seed_dd_cli_017_staff",
    role: "hospital_staff" as const,
    fullName: "Natnael Kebede",
    email: "dd-cli-017.staff+clerk_test@example.com",
    facility: "DD-CLI-017",
    phone: "+251900000291",
    phoneVerified: false,
    receivesPickupOtp: false,
  },
  {
    clerkUserId: "seed_driver_2",
    role: "driver" as const,
    fullName: "Tesfaye Gebre",
    email: "driver2+clerk_test@example.com",
    facility: null,
    phone: null,
    phoneVerified: false,
    receivesPickupOtp: false,
  },
];

/** MoH waste categories (codes and colours as in the prototype). */
export const SEED_CATEGORIES = [
  { code: "INFECTIOUS", name: "Infectious & Highly Hazardous Waste", colourCode: "YELLOW" },
  { code: "SHARPS", name: "Sharps & Cutting Materials", colourCode: "RED" },
  { code: "PATHOLOGICAL", name: "Anatomical & Pathological Organs", colourCode: "RED" },
  { code: "PHARMACEUTICAL", name: "Expired & Cytotoxic Pharmaceuticals", colourCode: "BLUE" },
  { code: "CHEMICAL", name: "Chemical & Heavy Metal Waste", colourCode: "BROWN" },
  { code: "GENERAL", name: "Non-hazardous Medical Facility General Waste", colourCode: "BLACK" },
];

export const SEED_DESTRUCTION_METHODS = [
  { code: "HIGH_TEMP_INCINERATION", name: "High-temperature incineration" },
  { code: "AUTOCLAVING", name: "Autoclaving" },
  { code: "CHEMICAL_DISINFECTION", name: "Chemical disinfection" },
  { code: "MICROWAVE_SHREDDING", name: "Microwave treatment and shredding" },
  { code: "SECURE_LANDFILL_ENCAPSULATION", name: "Encapsulation and secure landfill" },
];

/** Default business settings (CLAUDE.md §7). Existing values are never overwritten by the seed. */
/** Defaults from CLAUDE.md section 7 (single source: src/lib/validation/settings.ts). */
export { DEFAULT_SETTINGS };

/** The 2 vehicles of the pilot (fictional plates, as in the prototype). */
export const SEED_VEHICLES = [
  { plateNo: "ET-3-A48291", model: "Isuzu NPR 400 Biohazard Spec", capacityKg: "3500" },
  { plateNo: "ET-3-B91024", model: "Iveco Daily Hazmat Carrier", capacityKg: "2800" },
];

/** Thrown to roll back the operational seed with `--dry-run`. */
class DryRun extends Error {}

async function main() {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { casing: "snake_case" });
  try {
    const facilityIds = new Map<string, string>();
    for (const f of SEED_FACILITIES) {
      const [row] = await db
        .insert(facilities)
        .values(f)
        .onConflictDoUpdate({
          target: facilities.code,
          set: {
            name: f.name,
            region: f.region,
            city: f.city,
            kebele: f.kebele,
            address: f.address,
            lat: f.lat,
            lng: f.lng,
          },
        })
        .returning({ id: facilities.id, code: facilities.code });
      facilityIds.set(row.code, row.id);
    }

    for (const u of SEED_USERS) {
      const isHospital = u.role === "hospital_admin" || u.role === "hospital_staff";
      const values = {
        clerkUserId: `dev_${u.role}`,
        role: u.role,
        facilityId: u.facility ? facilityIds.get(u.facility)! : null,
        fullName: u.fullName,
        email: u.email,
        phoneE164: u.phone,
        phoneVerified: u.phone !== null,
        receivesPickupOtp: isHospital && u.phone !== null,
        active: true,
      };
      await db
        .insert(users)
        .values(values)
        .onConflictDoUpdate({ target: users.clerkUserId, set: values });
    }

    for (const u of SEED_FACILITY_USERS) {
      const values = {
        clerkUserId: u.clerkUserId,
        role: u.role,
        facilityId: u.facility ? facilityIds.get(u.facility)! : null,
        fullName: u.fullName,
        email: u.email,
        phoneE164: u.phone,
        phoneVerified: u.phoneVerified,
        receivesPickupOtp: u.receivesPickupOtp,
        active: true,
      };
      await db
        .insert(users)
        .values(values)
        .onConflictDoUpdate({ target: users.clerkUserId, set: values });
    }

    for (const c of SEED_CATEGORIES) {
      await db
        .insert(wasteCategories)
        .values(c)
        .onConflictDoUpdate({
          target: wasteCategories.code,
          set: { name: c.name, colourCode: c.colourCode },
        });
    }
    for (const m of SEED_DESTRUCTION_METHODS) {
      await db
        .insert(destructionMethods)
        .values(m)
        .onConflictDoUpdate({ target: destructionMethods.code, set: { name: m.name } });
    }
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await db
        .insert(settings)
        .values({ key, value })
        .onConflictDoNothing({ target: settings.key });
    }
    const vehicleIds = new Map<string, string>();
    for (const v of SEED_VEHICLES) {
      const [row] = await db
        .insert(vehicles)
        .values(v)
        .onConflictDoUpdate({
          target: vehicles.plateNo,
          set: { model: v.model, capacityKg: v.capacityKg },
        })
        .returning({ id: vehicles.id, plateNo: vehicles.plateNo });
      vehicleIds.set(row.plateNo, row.id);
    }
    const [driverUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkUserId, "dev_driver"));
    const defaultVehicleId = vehicleIds.get("ET-3-A48291")!;
    await db
      .insert(drivers)
      .values({
        userId: driverUser.id,
        licenseNo: "ETH-DD-DRV-9018",
        defaultVehicleId,
        status: "ON_DUTY",
      })
      .onConflictDoUpdate({
        target: drivers.userId,
        set: { licenseNo: "ETH-DD-DRV-9018", defaultVehicleId },
      });

    const [driver2] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkUserId, "seed_driver_2"));
    const driver2Vehicle = vehicleIds.get("ET-3-B91024")!;
    await db
      .insert(drivers)
      .values({
        userId: driver2.id,
        licenseNo: "ETH-DD-DRV-9022",
        defaultVehicleId: driver2Vehicle,
      })
      .onConflictDoUpdate({
        target: drivers.userId,
        set: { licenseNo: "ETH-DD-DRV-9022", defaultVehicleId: driver2Vehicle },
      });

    // Operational demo data: only on a database without any waste yet (no hard deletes, so it runs once).
    const [{ n: existingWaste }] = (
      await db.execute(sql`select count(*)::int as n from waste_records`)
    ).rows as { n: number }[];
    if (existingWaste === 0) {
      const dryRun = process.argv.includes("--dry-run");
      let ops: Awaited<ReturnType<typeof seedOperations>> | undefined;
      await db
        .transaction(async (tx) => {
          ops = await seedOperations(tx);
          if (dryRun) throw new DryRun();
        })
        .catch((e: unknown) => {
          if (!(e instanceof DryRun)) throw e;
          console.log("Dry run: operational data checked and rolled back.");
        });
      if (!ops) throw new Error("Operational seed did not run");
      console.log(
        `Operational demo data: ${ops.waste} waste records, ${ops.trips} trips, ${ops.certificates} certificates, ` +
          `${ops.contracts} contracts, ${ops.invoices} invoices, ${ops.audit} audit entries.`
      );
    } else {
      console.log(`Operational demo data skipped: ${existingWaste} waste records already exist.`);
    }

    const count = async (table: string) =>
      Number(
        (
          (await db.execute(sql.raw(`select count(*)::int as n from ${table}`))).rows[0] as {
            n: number;
          }
        ).n
      );
    const summary = await Promise.all(
      [
        "facilities",
        "users",
        "waste_categories",
        "destruction_methods",
        "settings",
        "vehicles",
        "drivers",
        "waste_records",
        "containers",
        "trips",
        "trip_stops",
        "certificates",
        "contracts",
        "invoices",
      ].map(async (t) => `${await count(t)} ${t}`)
    );
    console.log(`Seed done: ${summary.join(", ")}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(
    `Seed failed: ${String(err.message).replace(/postgres(ql)?:\/\/\S+/g, "<db-url>")}`
  );
  process.exitCode = 1;
});
