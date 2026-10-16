"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { env } from "@/env";
import { log } from "@/server/log";
import { HOME_BY_ROLE } from "./access-rules";
import { DEV_ACCOUNTS } from "./dev-accounts.generated";
import {
  DEV_SESSION_COOKIE,
  DEV_SESSION_TTL_SECONDS,
  checkDevPassword,
  createDevSessionToken,
} from "./dev-session";
import { isDevBypassRequest } from "./current-user";

/** Server actions for the development test login (/dev-login). Requires Clerk authentication first. */

export interface DevLoginState {
  error: string | null;
}

const loginInput = z.object({
  username: z.string().trim().min(1, "Enter your username").max(64),
  password: z.string().min(1, "Enter your password").max(200),
});

/** Simple in-memory brake against password guessing on the dev server (per username). */
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 60_000;

export async function devLogin(_prev: DevLoginState, formData: FormData): Promise<DevLoginState> {
  const { userId } = await auth();
  const bypass = await isDevBypassRequest();

  if ((!bypass && !userId) || !env.DEV_LOGIN_SECRET) {
    return { error: "Please sign in with Clerk first." };
  }
  const parsed = loginInput.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const key = parsed.data.username.toLowerCase();
  const lock = failures.get(key);
  if (lock && lock.until > Date.now()) {
    return { error: "Too many wrong attempts. Wait a minute and try again." };
  }

  const account = checkDevPassword(DEV_ACCOUNTS, parsed.data.username, parsed.data.password);
  if (!account) {
    const count = (lock?.count ?? 0) + 1;
    failures.set(key, { count, until: count >= MAX_FAILURES ? Date.now() + LOCK_MS : 0 });
    log.warn("Development test login failed", { username: key });
    return { error: "Wrong username or password." };
  }

  failures.delete(key);
  (await cookies()).set(DEV_SESSION_COOKIE, createDevSessionToken(account, env.DEV_LOGIN_SECRET), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: DEV_SESSION_TTL_SECONDS,
  });
  log.info("Development test login", { username: account.username, role: account.role });
  redirect(HOME_BY_ROLE[account.role]);
}

export async function devLogout(): Promise<void> {
  (await cookies()).delete(DEV_SESSION_COOKIE);
  redirect("/dev-login");
}
