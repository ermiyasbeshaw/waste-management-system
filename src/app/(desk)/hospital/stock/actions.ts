"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import { AppError } from "@/server/errors";
import {
  addStockLine,
  archiveStockLine,
  assignDriverToRequest,
  createDisposalRequest,
  getDriverAssignedRequests,
  getQrCodeDataUrl,
  getRequestVerificationDetails,
  markDisposalComplete,
  previewStockFile,
  saveStockImport,
  scanRequestByDriver,
  scanRequestByOperator,
  updateStockLine,
} from "@/server/services/medicine";

/** Medicine stock actions (CLAUDE.md §12): hospital roles, own facility; the services check role and scope. */

function done<T extends { ok: boolean }>(r: T): T {
  if (r.ok) {
    revalidatePath("/hospital", "layout");
    revalidatePath("/admin", "layout");
    revalidatePath("/regulator", "layout");
    revalidatePath("/driver", "layout");
    revalidatePath("/disposal", "layout");
  }
  return r;
}

export async function previewStockAction(form: FormData) {
  return asAction("previewStock", async () => {
    const file = form.get("file");
    if (!(file instanceof File))
      throw new AppError("VALIDATION_ERROR", 422, "Choose an Excel or CSV file.");
    return previewStockFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  });
}

export async function saveStockAction(input: unknown) {
  return done(await asAction("saveStock", (rid) => saveStockImport(input, rid)));
}

export async function addStockLineAction(input: unknown) {
  return done(await asAction("addStockLine", (rid) => addStockLine(input, rid)));
}

export async function updateStockLineAction(id: string, input: unknown) {
  return done(await asAction("updateStockLine", (rid) => updateStockLine(id, input, rid)));
}

export async function archiveStockLineAction(id: string) {
  return done(await asAction("archiveStockLine", (rid) => archiveStockLine(id, rid)));
}

export async function createDisposalRequestAction(input: unknown, idempotencyKey: string) {
  return done(
    await asAction("createDisposalRequest", (rid) =>
      createDisposalRequest(input, { idempotencyKey, requestId: rid })
    )
  );
}

export async function scanRequestByDriverAction(qrCode: string) {
  return done(await asAction("scanRequestByDriver", (rid) => scanRequestByDriver(qrCode, rid)));
}

export async function scanRequestByOperatorAction(qrCode: string) {
  return done(await asAction("scanRequestByOperator", (rid) => scanRequestByOperator(qrCode, rid)));
}

export async function markDisposalCompleteAction(idOrCode: string) {
  return done(await asAction("markDisposalComplete", (rid) => markDisposalComplete(idOrCode, rid)));
}

export async function getRequestVerificationAction(qrCodeOrId: string) {
  return asAction("getRequestVerification", () => getRequestVerificationDetails(qrCodeOrId));
}

export async function getQrCodeDataUrlAction(text: string) {
  return asAction("getQrCodeDataUrl", () => getQrCodeDataUrl(text));
}

export async function assignDriverToRequestAction(
  id: string,
  driverUserId: string,
  vehicleId?: string | null
) {
  return done(
    await asAction("assignDriverToRequest", (rid) =>
      assignDriverToRequest(id, driverUserId, vehicleId, rid)
    )
  );
}

export async function getDriverAssignedRequestsAction() {
  return asAction("getDriverAssignedRequests", () => getDriverAssignedRequests());
}
