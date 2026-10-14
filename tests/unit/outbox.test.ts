import { describe, expect, it, vi } from "vitest";
import { noteEnqueued, runThenKick } from "@/server/outbox/after-commit";
import { retryDelayMinutes } from "@/server/outbox/retry";
import { seal, unseal } from "@/server/outbox/seal";
import { renderMessage } from "@/server/outbox/templates";

const KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const OTHER_KEY = "ff112233445566778899aabbccddeeff00112233445566778899aabbccddee00";

describe("outbox secret sealing", () => {
  it("round-trips and never contains the plain value", () => {
    const sealed = seal({ code: "482913" }, KEY);
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain("482913");
    expect(unseal(sealed, KEY)).toEqual({ code: "482913" });
    expect(seal({ code: "482913" }, KEY)).not.toBe(sealed); // random IV
  });

  it("refuses a wrong key or a changed ciphertext", () => {
    const sealed = seal({ code: "482913" }, KEY);
    expect(() => unseal(sealed, OTHER_KEY)).toThrow();
    const parts = sealed.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    expect(() => unseal(parts.join("."), KEY)).toThrow();
    expect(() => seal({ code: "1" }, "abcd")).toThrow(/32 bytes/);
  });
});

describe("templates", () => {
  it("renders the pickup OTP SMS", () => {
    const r = renderMessage(
      "otp.pickup",
      { facilityName: "Dil Chora Referral Hospital", expiresInMinutes: 10 },
      { code: "482913" }
    );
    expect(r.channel).toBe("SMS");
    expect(r).toMatchObject({ text: expect.stringContaining("482913") });
    expect(r).toMatchObject({ text: expect.stringContaining("Valid 10 min") });
  });

  it("refuses unknown templates, bad data and missing secrets", () => {
    expect(() => renderMessage("nope", {}, {})).toThrow(/Unknown template/);
    expect(() => renderMessage("otp.pickup", { facilityName: "" }, { code: "1" })).toThrow();
    expect(() =>
      renderMessage("otp.pickup", { facilityName: "X", expiresInMinutes: 10 }, {})
    ).toThrow(/missing secret/);
  });

  it("escapes HTML in emails", () => {
    const r = renderMessage("system.test_email", { note: "<b>hi</b>" }, {});
    expect(r).toMatchObject({ html: "<p>SafeWaste test message: &lt;b&gt;hi&lt;/b&gt;</p>" });
  });
});

describe("retry schedule (1 / 5 / 15 / 60 min)", () => {
  it("follows CLAUDE.md §6", () => {
    expect([1, 2, 3, 4, 5, 6].map(retryDelayMinutes)).toEqual([1, 5, 15, 60, 60, 60]);
  });
});

describe("dispatch after commit", () => {
  it("kicks the dispatcher only when the workflow enqueued something", async () => {
    const kick = vi.fn(async () => undefined);
    await runThenKick(
      async () => "no messages",
      kick,
      () => undefined
    );
    expect(kick).not.toHaveBeenCalled();
    expect(
      await runThenKick(
        async () => {
          noteEnqueued();
          return "ok";
        },
        kick,
        () => undefined
      )
    ).toBe("ok");
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it("never kicks when the workflow failed (rolled back), and a failing kick does not fail the request", async () => {
    const kick = vi.fn(async () => {
      throw new Error("gateway down");
    });
    const onError = vi.fn();
    await expect(
      runThenKick(
        async () => {
          noteEnqueued();
          throw new Error("rolled back");
        },
        kick,
        onError
      )
    ).rejects.toThrow("rolled back");
    expect(kick).not.toHaveBeenCalled();

    await runThenKick(async () => noteEnqueued(), kick, onError);
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("noteEnqueued outside a workflow is harmless", () => {
    expect(() => noteEnqueued()).not.toThrow();
  });
});
