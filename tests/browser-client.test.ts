import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApiFetchResult } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type { OutlookPayload } from "@/lib/domain/outlook";
import {
  DEFAULT_OUTLOOK_ROUTE_TIMEOUT_MS,
  fetchOutlookRoute,
  type BrowserFetchImplementation,
} from "@/lib/outlook/browser-client";
import { buildOutlookPayload } from "@/lib/outlook/aggregate";
import aqhi from "@/tests/fixtures/aqhi-live-sanitized.json";
import forecast from "@/tests/fixtures/flw-live-sanitized.json";
import weather from "@/tests/fixtures/rhrread-night-live-sanitized.json";
import warnings from "@/tests/fixtures/warnsum-monsoon-live-sanitized.json";

const NOW = new Date("2026-07-14T12:20:00.000Z");

const success = (data: unknown): ApiFetchResult => ({
  ok: true,
  data,
  retrievedAt: NOW.toISOString(),
  fromCache: false,
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

describe("fetchOutlookRoute", () => {
  let payload: OutlookPayload;

  beforeAll(async () => {
    const responses: Record<string, ApiFetchResult> = {
      [API_ENDPOINTS.weather]: success(weather),
      [API_ENDPOINTS.warnings]: success(warnings),
      [API_ENDPOINTS.forecast]: success(forecast),
      [API_ENDPOINTS.aqhi]: success(aqhi),
    };
    payload = await buildOutlookPayload("hong-kong", {
      fetcher: async (url) => responses[url] as ApiFetchResult,
      now: () => NOW,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns a runtime-validated payload from the internal route", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(payload));

    const result = await fetchOutlookRoute("hong-kong", { fetchImpl });

    expect(result).toEqual({ ok: true, payload });
    expect(DEFAULT_OUTLOOK_ROUTE_TIMEOUT_MS).toBe(12_000);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/outlook?location=hong-kong",
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("reports a non-successful HTTP status without decoding its body", async () => {
    const json = vi.fn(async () => ({ privateDetail: "do not expose" }));
    const response = { ok: false, status: 503, json } as unknown as Response;

    await expect(
      fetchOutlookRoute("hong-kong", { fetchImpl: async () => response }),
    ).resolves.toEqual({
      ok: false,
      error: { type: "http", status: 503 },
    });
    expect(json).not.toHaveBeenCalled();
  });

  it("reports payload contract drift and JSON decoding errors as invalid", async () => {
    await expect(
      fetchOutlookRoute("hong-kong", {
        fetchImpl: async () => jsonResponse({ status: "ok" }),
      }),
    ).resolves.toEqual({ ok: false, error: { type: "invalid" } });

    await expect(
      fetchOutlookRoute("hong-kong", {
        fetchImpl: async () =>
          new Response("{not-json", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      }),
    ).resolves.toEqual({ ok: false, error: { type: "invalid" } });
  });

  it("converts a network rejection into a result instead of throwing", async () => {
    await expect(
      fetchOutlookRoute("hong-kong", {
        fetchImpl: async () => {
          throw new TypeError("offline");
        },
      }),
    ).resolves.toEqual({ ok: false, error: { type: "network" } });
  });

  it("does not mistake an AbortError for React cleanup while still mounted", async () => {
    await expect(
      fetchOutlookRoute("hong-kong", {
        fetchImpl: async () => {
          throw new DOMException("upstream aborted", "AbortError");
        },
      }),
    ).resolves.toEqual({ ok: false, error: { type: "network" } });
  });

  it("reports aborted only when the caller cleanup signal is aborted", async () => {
    const callerController = new AbortController();
    let internalSignal: AbortSignal | undefined;
    const fetchImpl: BrowserFetchImplementation = vi.fn((_input, init) => {
      internalSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        internalSignal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });

    const resultPromise = fetchOutlookRoute("hong-kong", {
      fetchImpl,
      signal: callerController.signal,
    });
    callerController.abort();

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      error: { type: "aborted" },
    });
    expect(internalSignal?.aborted).toBe(true);
  });

  it("times out when fetch never settles, even if it ignores AbortSignal", async () => {
    vi.useFakeTimers();
    let internalSignal: AbortSignal | undefined;
    const fetchImpl: BrowserFetchImplementation = vi.fn((_input, init) => {
      internalSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });

    const resultPromise = fetchOutlookRoute("hong-kong", {
      fetchImpl,
      timeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      error: { type: "timeout" },
    });
    expect(internalSignal?.aborted).toBe(true);
  });

  it("applies the same deadline when response.json never settles", async () => {
    vi.useFakeTimers();
    const response = {
      ok: true,
      status: 200,
      json: () => new Promise<never>(() => undefined),
    } as unknown as Response;

    const resultPromise = fetchOutlookRoute("hong-kong", {
      fetchImpl: async () => response,
      timeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      error: { type: "timeout" },
    });
  });
});
