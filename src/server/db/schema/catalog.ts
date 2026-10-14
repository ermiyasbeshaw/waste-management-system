import { sql } from "drizzle-orm";
import { boolean, check, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common";
import { users } from "./users";

/** Waste categories (architecture §6.2): code, name, MoH colour code, active. DECISION: no other fields. */
export const wasteCategories = pgTable(
  "waste_categories",
  {
    id: id(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    colourCode: text("colour_code").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("waste_categories_code_unique").on(t.code),
    check("waste_categories_code_format", sql`${t.code} ~ '^[A-Z][A-Z_]{1,31}$'`),
    check(
      "waste_categories_colour_code",
      sql`${t.colourCode} IN ('YELLOW', 'RED', 'BLUE', 'BROWN', 'BLACK', 'WHITE')`
    ),
  ]
);

/** Destruction methods chosen by the disposal operator (architecture §6.2). */
export const destructionMethods = pgTable(
  "destruction_methods",
  {
    id: id(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("destruction_methods_code_unique").on(t.code),
    check("destruction_methods_code_format", sql`${t.code} ~ '^[A-Z][A-Z_]{1,47}$'`),
  ]
);

/**
 * Business settings (CLAUDE.md §7): one row per key, value as JSON, read with getSetting(key) (Gate 2.4).
 * Editable by super_admin only, audited.
 */
export const settings = pgTable(
  "settings",
  {
    id: id(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("settings_key_unique").on(t.key),
    check("settings_key_format", sql`${t.key} ~ '^[a-z][a-z0-9_]{1,63}$'`),
  ]
);
