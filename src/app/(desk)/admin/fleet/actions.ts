"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import {
  addLicence,
  createDriverProfile,
  createTracker,
  createVehicle,
  rotateTrackerToken,
  setTrackerActive,
  setVehicleStatus,
} from "@/server/services/fleet";

const done = <T>(r: T) => {
  revalidatePath("/admin", "layout");
  return r;
};

export async function createVehicleAction(input: unknown) {
  return done(await asAction("createVehicle", (id) => createVehicle(input, id)));
}
export async function setVehicleStatusAction(vehicleId: string, input: unknown) {
  return done(await asAction("setVehicleStatus", (id) => setVehicleStatus(vehicleId, input, id)));
}
export async function createDriverProfileAction(input: unknown) {
  return done(await asAction("createDriverProfile", (id) => createDriverProfile(input, id)));
}
export async function createTrackerAction(input: unknown) {
  return done(await asAction("createTracker", (id) => createTracker(input, id)));
}
export async function rotateTrackerTokenAction(trackerId: string) {
  return done(await asAction("rotateTrackerToken", (id) => rotateTrackerToken(trackerId, id)));
}
export async function setTrackerActiveAction(trackerId: string, active: boolean) {
  return done(await asAction("setTrackerActive", (id) => setTrackerActive(trackerId, active, id)));
}
export async function addLicenceAction(input: unknown) {
  return done(await asAction("addLicence", (id) => addLicence(input, id)));
}
