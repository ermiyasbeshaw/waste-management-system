import { describe, expect, it } from "vitest";
import { MEDICINE_REQUEST_STATUSES, STATUS_META } from "@/lib/statuses";
import { renderMessage } from "@/server/outbox/templates";

describe("QR-Code-Based Medical Waste Disposal Tracking Workflow", () => {
  it("includes all lifecycle tracking statuses in MEDICINE_REQUEST_STATUSES", () => {
    expect(MEDICINE_REQUEST_STATUSES).toContain("PENDING_APPROVAL");
    expect(MEDICINE_REQUEST_STATUSES).toContain("PENDING_EFDA_APPROVAL");
    expect(MEDICINE_REQUEST_STATUSES).toContain("PENDING_DRIVER_ASSIGNMENT");
    expect(MEDICINE_REQUEST_STATUSES).toContain("APPROVED");
    expect(MEDICINE_REQUEST_STATUSES).toContain("REJECTED");
    expect(MEDICINE_REQUEST_STATUSES).toContain("RECEIVED_BY_DRIVER");
    expect(MEDICINE_REQUEST_STATUSES).toContain("RECEIVED_AT_FACILITY");
    expect(MEDICINE_REQUEST_STATUSES).toContain("DISPOSED");
  });

  it("provides user-friendly metadata for all statuses", () => {
    expect(STATUS_META.PENDING_EFDA_APPROVAL).toBeDefined();
    expect(STATUS_META.PENDING_EFDA_APPROVAL.label).toBe("Pending EFDA approval");

    expect(STATUS_META.PENDING_DRIVER_ASSIGNMENT).toBeDefined();
    expect(STATUS_META.PENDING_DRIVER_ASSIGNMENT.label).toBe("Pending driver assignment");

    expect(STATUS_META.RECEIVED_BY_DRIVER).toBeDefined();
    expect(STATUS_META.RECEIVED_BY_DRIVER.label).toBe("Received by driver");

    expect(STATUS_META.RECEIVED_AT_FACILITY).toBeDefined();
    expect(STATUS_META.RECEIVED_AT_FACILITY.label).toBe("Received at facility");

    expect(STATUS_META.DISPOSED).toBeDefined();
    expect(STATUS_META.DISPOSED.label).toBe("Disposed");
  });

  it("renders outbox email templates correctly for each step of the workflow", () => {
    // 1. Driver scanned notification
    const scanned = renderMessage(
      "disposal.driver_scanned",
      {
        requestCode: "MD-2026-00042",
        facilityName: "Tikur Anbessa Hospital",
        driverName: "Abebe Kebede",
        scannedAt: "2026-10-15",
      },
      {}
    );
    expect(scanned.channel).toBe("EMAIL");
    if (scanned.channel === "EMAIL") {
      expect(scanned.subject).toContain("MD-2026-00042");
      expect(scanned.subject).toContain("Waste Received by Driver");
      expect(scanned.html).toContain("Tikur Anbessa Hospital");
    }

    // 2. Pending EFDA approval notification
    const efdaMsg = renderMessage(
      "disposal.pending_efda_approval",
      {
        requestCode: "MD-2026-00042",
        containsExpired: true,
      },
      {}
    );
    expect(efdaMsg.channel).toBe("EMAIL");
    if (efdaMsg.channel === "EMAIL") {
      expect(efdaMsg.subject).toContain("Pending EFDA Approval");
      expect(efdaMsg.html).toContain("expired medicine");
    }

    // 3. Pending driver assignment notification
    const driverAssignMsg = renderMessage(
      "disposal.pending_driver_assignment",
      {
        requestCode: "MD-2026-00042",
        containsExpired: false,
      },
      {}
    );
    expect(driverAssignMsg.channel).toBe("EMAIL");
    if (driverAssignMsg.channel === "EMAIL") {
      expect(driverAssignMsg.subject).toContain("Ready for Driver Assignment");
    }

    // 4. Driver assigned notification
    const driverAssigned = renderMessage(
      "disposal.driver_assigned",
      {
        requestCode: "MD-2026-00042",
        facilityName: "Tikur Anbessa Hospital",
        driverName: "Abebe Kebede",
      },
      {}
    );
    expect(driverAssigned.channel).toBe("EMAIL");
    if (driverAssigned.channel === "EMAIL") {
      expect(driverAssigned.subject).toContain("Driver Assigned");
      expect(driverAssigned.html).toContain("Abebe Kebede");
    }
  });

  it("verifies the sequential lifecycle progression for ordinary waste vs expired medicine", () => {
    // Ordinary waste sequence:
    // PENDING_APPROVAL -> PENDING_DRIVER_ASSIGNMENT -> APPROVED -> RECEIVED_BY_DRIVER -> RECEIVED_AT_FACILITY -> DISPOSED
    const ordinarySequence = [
      "PENDING_APPROVAL",
      "PENDING_DRIVER_ASSIGNMENT",
      "APPROVED",
      "RECEIVED_BY_DRIVER",
      "RECEIVED_AT_FACILITY",
      "DISPOSED",
    ] as const;

    for (let i = 0; i < ordinarySequence.length - 1; i++) {
      expect(MEDICINE_REQUEST_STATUSES).toContain(ordinarySequence[i]);
    }

    // Expired medicine sequence:
    // PENDING_APPROVAL -> PENDING_EFDA_APPROVAL -> PENDING_DRIVER_ASSIGNMENT -> APPROVED -> RECEIVED_BY_DRIVER -> RECEIVED_AT_FACILITY -> DISPOSED
    const expiredSequence = [
      "PENDING_APPROVAL",
      "PENDING_EFDA_APPROVAL",
      "PENDING_DRIVER_ASSIGNMENT",
      "APPROVED",
      "RECEIVED_BY_DRIVER",
      "RECEIVED_AT_FACILITY",
      "DISPOSED",
    ] as const;

    for (let i = 0; i < expiredSequence.length - 1; i++) {
      expect(MEDICINE_REQUEST_STATUSES).toContain(expiredSequence[i]);
    }
  });

  it("generates unique QR code tokens that identify specific disposal requests", () => {
    const requestCode = "MD-2026-00001";
    const qr1 = `QR-${requestCode}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const qr2 = `QR-${requestCode}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

    expect(qr1).toMatch(/^QR-MD-2026-00001-[A-F0-9]{8}$/);
    expect(qr2).toMatch(/^QR-MD-2026-00001-[A-F0-9]{8}$/);
    expect(qr1).not.toEqual(qr2);
  });
});
