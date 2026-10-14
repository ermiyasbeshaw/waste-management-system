"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import { AppError } from "@/server/errors";
import {
  addStockLine,
  archiveStockLine,
  createDisposalRequest,
  previewStockFile,
  saveStockImport,
  updateStockLine,
} from "@/server/services/medicine";

/** Medicine stock actions (CLAUDE.md §12): hospital roles, own facility; the services check role and scope. */

function done<T extends { ok: boolean }>(r: T): T {
  if (r.ok) revalidatePath("/hospital", "layout");
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
