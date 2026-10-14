"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import {
  cancelInvoice,
  issueInvoice,
  runMonthlyInvoicesNow,
  settleInvoice,
} from "@/server/services/billing";

/** Invoice actions (super_admin only; every service re-checks the role and the transition). */

function done<T extends { ok: boolean }>(r: T): T {
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}

export async function issueInvoiceAction(id: string) {
  return done(await asAction("issueInvoice", (rid) => issueInvoice(id, rid)));
}

export async function settleInvoiceAction(id: string, input: unknown) {
  return done(await asAction("settleInvoice", (rid) => settleInvoice(id, input, rid)));
}

export async function cancelInvoiceAction(id: string, input: unknown) {
  return done(await asAction("cancelInvoice", (rid) => cancelInvoice(id, input, rid)));
}

export async function runMonthlyInvoicesAction(input: unknown) {
  return done(await asAction("runMonthlyInvoices", (rid) => runMonthlyInvoicesNow(input, rid)));
}
