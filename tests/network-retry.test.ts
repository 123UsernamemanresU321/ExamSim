import { afterEach, describe, expect, it, vi } from "vitest";
import { retryingFetch, withTransientNetworkRetry } from "../scripts/lib/network-retry.mjs";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("synthetic QA network retry", () => {
  it("retries transient connection failures and returns the successful result", async () => {
    let attempts = 0;
    const value = await withTransientNetworkRetry(async () => {
      attempts += 1;
      if (attempts < 3) throw new TypeError("fetch failed");
      return "ready";
    }, { attempts: 3, delayMs: 1 });

    expect(value).toBe("ready");
    expect(attempts).toBe(3);
  });

  it("does not retry non-network validation errors", async () => {
    let attempts = 0;
    await expect(withTransientNetworkRetry(async () => {
      attempts += 1;
      throw new Error("invalid account definition");
    }, { attempts: 4, delayMs: 1 })).rejects.toThrow("invalid account definition");
    expect(attempts).toBe(1);
  });

  it("retries timed-out provider transport", async () => {
    let attempts = 0;
    await expect(withTransientNetworkRetry(async () => {
      attempts += 1;
      throw new DOMException("Signal timed out", "TimeoutError");
    }, { attempts: 2, delayMs: 1 })).rejects.toThrow("Signal timed out");
    expect(attempts).toBe(2);
  });

  it("does not retry POST requests after an ambiguous transport failure", async () => {
    let attempts = 0;
    globalThis.fetch = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("fetch failed");
      return new Response("ok");
    });

    await expect(retryingFetch("https://example.test/provider", { method: "POST" })).rejects.toThrow("fetch failed");
    expect(attempts).toBe(1);
  });

  it("retries idempotent GET requests after a transient transport failure", async () => {
    let attempts = 0;
    globalThis.fetch = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("fetch failed");
      return new Response("ok");
    });

    const response = await retryingFetch("https://example.test/status", { method: "GET" });
    expect(await response.text()).toBe("ok");
    expect(attempts).toBe(2);
  });
});
