import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  API_ERROR_MESSAGES,
  clearApiCache,
  fetchJson,
  MAX_JSON_RESPONSE_BYTES,
  type FetchImplementation,
} from "@/lib/api/client";
import {
  API_CACHE_TTL_MS,
  API_ENDPOINTS,
  AQHI_CURRENT_ENDPOINT,
  HKO_CURRENT_WEATHER_ENDPOINT,
  HKO_LOCAL_FORECAST_ENDPOINT,
  HKO_RAINFALL_NOWCAST_ENDPOINT,
  HKO_WARNING_SUMMARY_ENDPOINT,
} from "@/lib/api/endpoints";

const TEST_NOW = Date.parse("2026-07-14T12:00:00.000Z");

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

describe("government API endpoints", () => {
  it("defines the five official endpoints and their cache TTLs", () => {
    expect(API_ENDPOINTS).toEqual({
      weather: HKO_CURRENT_WEATHER_ENDPOINT,
      warnings: HKO_WARNING_SUMMARY_ENDPOINT,
      forecast: HKO_LOCAL_FORECAST_ENDPOINT,
      aqhi: AQHI_CURRENT_ENDPOINT,
      rainfallNowcast: HKO_RAINFALL_NOWCAST_ENDPOINT,
    });
    expect(API_CACHE_TTL_MS).toEqual({
      warnings: 60_000,
      weather: 300_000,
      forecast: 600_000,
      aqhi: 900_000,
      rainfallNowcast: 600_000,
    });
  });
});

describe("fetchJson", () => {
  beforeEach(() => {
    clearApiCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns JSON, records retrieval time, and reuses a fresh cache entry", async () => {
    let now = TEST_NOW;
    const payload = { temperature: 31 };
    const fetchImpl = vi.fn(async () => jsonResponse(payload));

    const first = await fetchJson(API_ENDPOINTS.weather, {
      fetchImpl,
      now: () => now,
      ttlMs: 1_000,
    });
    now += 999;
    const second = await fetchJson(API_ENDPOINTS.weather, {
      fetchImpl,
      now: () => now,
      ttlMs: 1_000,
    });

    expect(first).toEqual({
      ok: true,
      data: payload,
      retrievedAt: "2026-07-14T12:00:00.000Z",
      fromCache: false,
    });
    expect(second).toEqual({ ...first, fromCache: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      API_ENDPOINTS.weather,
      expect.objectContaining({
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("deduplicates concurrent requests using the same cache key", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetchImpl: FetchImplementation = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );

    const firstPromise = fetchJson(API_ENDPOINTS.warnings, {
      fetchImpl,
      now: () => TEST_NOW,
    });
    const secondPromise = fetchJson(API_ENDPOINTS.warnings, {
      fetchImpl,
      now: () => TEST_NOW,
    });

    resolveResponse?.(jsonResponse({}));

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });

  it("returns a safe error for a non-2xx response", async () => {
    const result = await fetchJson("https://example.test/http-error", {
      fetchImpl: async () => jsonResponse({ privateDetail: "do not expose" }, 503),
      now: () => TEST_NOW,
      ttlMs: 0,
    });

    expect(result).toEqual({
      ok: false,
      error: { type: "http", message: API_ERROR_MESSAGES.http },
    });
    expect(JSON.stringify(result)).not.toContain("privateDetail");
  });

  it.each([
    ["HTTP 錯誤", 503, "application/json", "http"],
    ["錯誤 Content-Type", 200, "text/html", "content-type"],
  ] as const)("%s 時取消 response body 並中止 request", async (
    _case,
    status,
    contentType,
    errorType,
  ) => {
    const cancel = vi.fn();
    let signal: AbortSignal | undefined;
    const stream = new ReadableStream<Uint8Array>({ cancel });

    const result = await fetchJson(`https://example.test/${errorType}`, {
      fetchImpl: async (_input, init) => {
        signal = init?.signal ?? undefined;
        return new Response(stream, {
          status,
          headers: { "Content-Type": contentType },
        });
      },
      ttlMs: 0,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        type: errorType,
        message: API_ERROR_MESSAGES[errorType],
      },
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(true);
  });

  it("rejects a successful response without an application/json media type", async () => {
    const result = await fetchJson("https://example.test/html", {
      fetchImpl: async () =>
        new Response("<html>upstream error</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      now: () => TEST_NOW,
      ttlMs: 0,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        type: "content-type",
        message: API_ERROR_MESSAGES["content-type"],
      },
    });
  });

  it("returns an invalid-json error when JSON parsing fails", async () => {
    const result = await fetchJson("https://example.test/invalid-json", {
      fetchImpl: async () =>
        new Response("{not-json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      now: () => TEST_NOW,
      ttlMs: 0,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        type: "invalid-json",
        message: API_ERROR_MESSAGES["invalid-json"],
      },
    });
  });

  it("rejects declared and streamed JSON bodies above the byte limit", async () => {
    const declared = await fetchJson("https://example.test/declared-large", {
      fetchImpl: async () =>
        new Response("{}", {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(MAX_JSON_RESPONSE_BYTES + 1),
          },
        }),
      ttlMs: 0,
    });
    const streamed = await fetchJson("https://example.test/streamed-large", {
      fetchImpl: async () =>
        new Response(`"${"x".repeat(MAX_JSON_RESPONSE_BYTES)}"`, {
          headers: { "Content-Type": "application/json" },
        }),
      ttlMs: 0,
    });

    expect(declared).toEqual({
      ok: false,
      error: { type: "too-large", message: API_ERROR_MESSAGES["too-large"] },
    });
    expect(streamed).toEqual(declared);
  });

  it("rejects a declared oversized body without waiting for cleanup", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const stream = new ReadableStream<Uint8Array>({
      cancel: () => new Promise<void>(() => undefined),
    });

    const resultPromise = fetchJson("https://example.test/hanging-cleanup", {
      fetchImpl: async (_input, init) => {
        signal = init?.signal ?? undefined;
        return new Response(stream, {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(MAX_JSON_RESPONSE_BYTES + 1),
          },
        });
      },
      timeoutMs: 100,
      ttlMs: 0,
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      error: { type: "too-large", message: API_ERROR_MESSAGES["too-large"] },
    });
    expect(signal?.aborted).toBe(true);
  });

  it("aborts an upstream request at the timeout", async () => {
    vi.useFakeTimers();
    let receivedSignal: AbortSignal | undefined;
    const fetchImpl: FetchImplementation = vi.fn((_input, init) => {
      receivedSignal = init?.signal ?? undefined;

      return new Promise<Response>((_resolve, reject) => {
        receivedSignal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });

    const resultPromise = fetchJson("https://example.test/slow", {
      fetchImpl,
      now: () => TEST_NOW,
      timeoutMs: 100,
      ttlMs: 0,
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      error: { type: "timeout", message: API_ERROR_MESSAGES.timeout },
    });
    expect(receivedSignal?.aborted).toBe(true);
  });

  it("does not cache failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: true }, 500))
      .mockResolvedValueOnce(jsonResponse({ recovered: true }));

    const first = await fetchJson(API_ENDPOINTS.aqhi, {
      fetchImpl,
      now: () => TEST_NOW,
    });
    const second = await fetchJson(API_ENDPOINTS.aqhi, {
      fetchImpl,
      now: () => TEST_NOW,
    });

    expect(first.ok).toBe(false);
    expect(second).toEqual({
      ok: true,
      data: { recovered: true },
      retrievedAt: "2026-07-14T12:00:00.000Z",
      fromCache: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
