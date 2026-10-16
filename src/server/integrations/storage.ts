import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import os from "node:os";
import { env } from "@/env";
import { AppError } from "@/server/errors";
import { log } from "@/server/log";

/**
 * File storage adapter (architecture module 13). Certificate PDFs are written once and read back for download
 * and hash checks. Development uses the local folder `STORAGE_DIR`; in serverless (e.g. Vercel) it uses os.tmpdir()
 * with an in-memory cache fallback so file writes never fail on read-only environments.
 */
export interface StorageProvider {
  readonly name: string;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** null when no file is stored under the key. */
  get(key: string): Promise<Uint8Array | null>;
}

const KEY = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,200}$/;

// Global memory cache so files are always available across requests
const memoryCache = new Map<string, Uint8Array>();

export function localStorageProvider(root: string): StorageProvider {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const base = isServerless ? resolve(os.tmpdir(), "safewaste-storage") : resolve(root);

  const pathOf = (key: string) => {
    if (!KEY.test(key) || key.includes(".."))
      throw new AppError("BAD_REQUEST", 400, "Invalid file key.");
    const full = resolve(base, key);
    if (!full.startsWith(base + sep)) throw new AppError("BAD_REQUEST", 400, "Invalid file key.");
    return full;
  };

  return {
    name: "local",
    async put(key, bytes) {
      memoryCache.set(key, bytes);
      try {
        const full = pathOf(key);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, bytes);
      } catch (err) {
        log.warn("Storage put filesystem fallback (in-memory cached)", { key, err: String(err) });
      }
    },
    async get(key) {
      if (memoryCache.has(key)) {
        return memoryCache.get(key)!;
      }
      try {
        const full = pathOf(key);
        const bytes = new Uint8Array(await readFile(full));
        memoryCache.set(key, bytes);
        return bytes;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        log.warn("Storage get fallback", { key, err: String(err) });
        return null;
      }
    },
  };
}

let provider: StorageProvider | null = null;
export function getStorage(): StorageProvider {
  provider ??= localStorageProvider(env.STORAGE_DIR);
  return provider;
}
