import { afterEach, describe, expect, it, vi } from "vitest";
import { devBypassApplies, hostnameOf, isDevAuthBypass } from "@/server/auth/dev-bypass";

function req(hostname: string, header?: string) {
  const headers = new Headers();
  if (header !== undefined) headers.set("x-dev-auth-bypass", header);
  return { headers, nextUrl: { hostname } };
}

describe("dev sign-in bypass", () => {
  afterEach(() => vi.unstubAllEnvs());

  it('mode "1": only with the header, on localhost, in development', () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_AUTH_BYPASS", "1");
    expect(isDevAuthBypass(req("localhost", "1"))).toBe(true);
    expect(isDevAuthBypass(req("127.0.0.1", "1"))).toBe(true);
    expect(isDevAuthBypass(req("localhost"))).toBe(false); // no header
    expect(isDevAuthBypass(req("safewaste.example", "1"))).toBe(false); // not local
  });

  it('mode "always": every localhost request in development, never other hosts', () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_AUTH_BYPASS", "always");
    expect(isDevAuthBypass(req("localhost"))).toBe(true);
    expect(devBypassApplies("safewaste.example", null)).toBe(false);
  });

  it("is off without the server flag", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_AUTH_BYPASS", "0");
    expect(isDevAuthBypass(req("localhost", "1"))).toBe(false);
  });

  it("can never apply in production, in any mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const mode of ["1", "always"]) {
      vi.stubEnv("DEV_AUTH_BYPASS", mode);
      expect(isDevAuthBypass(req("localhost", "1"))).toBe(false);
    }
  });

  it("reads the hostname from a Host header", () => {
    expect(hostnameOf("localhost:3000")).toBe("localhost");
    expect(hostnameOf("[::1]:3000")).toBe("[::1]");
    expect(hostnameOf(null)).toBe("");
  });
});
