import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/shared/status-badge";
import * as enums from "@/server/db/schema/enums";
import {
  CERTIFICATE_STATUSES,
  COLLECTION_METHODS,
  CONTAINER_STATUSES,
  CONTRACT_STATUSES,
  DERIVED_FLAGS,
  DRIVER_STATUSES,
  FACILITY_STATUSES,
  HANDOVER_STATUSES,
  INVOICE_STATUSES,
  OTP_STATUSES,
  OUTBOX_STATUSES,
  STATUS_META,
  STOP_STATUSES,
  TRIP_STATUSES,
  VEHICLE_STATUSES,
  WASTE_STATUSES,
} from "@/lib/statuses";

const ALL: Record<string, readonly string[]> = {
  waste: WASTE_STATUSES,
  container: CONTAINER_STATUSES,
  handover: HANDOVER_STATUSES,
  trip: TRIP_STATUSES,
  stop: STOP_STATUSES,
  collectionMethod: COLLECTION_METHODS,
  otp: OTP_STATUSES,
  certificate: CERTIFICATE_STATUSES,
  invoice: INVOICE_STATUSES,
  contract: CONTRACT_STATUSES,
  facility: FACILITY_STATUSES,
  vehicle: VEHICLE_STATUSES,
  driver: DRIVER_STATUSES,
  outbox: OUTBOX_STATUSES,
  derived: DERIVED_FLAGS,
};

describe("v1.2 statuses (CLAUDE.md §5)", () => {
  it("the Postgres enums use exactly the shared lists", () => {
    expect(enums.wasteStatus.enumValues).toEqual([...WASTE_STATUSES]);
    expect(enums.containerStatus.enumValues).toEqual([...CONTAINER_STATUSES]);
    expect(enums.stopStatus.enumValues).toEqual([...STOP_STATUSES]);
    expect(enums.invoiceStatus.enumValues).toEqual([...INVOICE_STATUSES]);
    expect(enums.certificateStatus.enumValues).toEqual([...CERTIFICATE_STATUSES]);
    expect(enums.outboxStatus.enumValues).toEqual([...OUTBOX_STATUSES]);
  });

  for (const [entity, values] of Object.entries(ALL)) {
    it(`StatusBadge shows readable text for every ${entity} value (colour is never alone)`, () => {
      for (const value of values) {
        const html = renderToStaticMarkup(
          createElement(StatusBadge, { status: value as never, size: "sm" })
        );
        const label = STATUS_META[value as keyof typeof STATUS_META]?.label;
        expect(label, value).toBeTruthy();
        expect(html, value).toContain(`>${label.replace(/&/g, "&amp;")}</span>`);
        expect(html).toContain(`data-status="${value}"`);
        expect(label).not.toMatch(/_/); // human text, not the enum code
      }
    });
  }

  it("the prototype statuses are gone from the app (SEALED, PAID, NO_CONTRACT as a status)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name)) {
          const text = readFileSync(path, "utf8");
          if (/["'](SEALED|PAID)["']|status: "NO_CONTRACT"|"COMPLETED"\s*:\s*"bg-/.test(text))
            offenders.push(path);
        }
      }
    };
    for (const dir of ["src/app", "src/components", "src/types", "src/lib", "src/server"])
      walk(dir);
    expect(offenders).toEqual([]);
  });
});
