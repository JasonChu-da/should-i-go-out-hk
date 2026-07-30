import { readFileSync } from "node:fs";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  clearRainfallNowcastCache,
  fetchRainfallNowcast,
  MAX_DATA_ROWS,
  MAX_RESPONSE_BYTES,
  RAINFALL_NOWCAST_ERROR_MESSAGES,
} from "@/lib/api/rainfall-nowcast";
import type { FetchImplementation } from "@/lib/api/client";

const FIXTURE = readFileSync(
  new URL(
    "./fixtures/gridded-rainfall-nowcast-live-sanitized.csv",
    import.meta.url,
  ),
  "utf8",
);
const TEST_NOW = Date.parse("2026-07-30T09:20:00.000Z");

function csvResponse(
  body: BodyInit | null,
  contentType = "text/csv; charset=utf-8",
): Response {
  return new Response(body, {
    headers: { "Content-Type": contentType },
  });
}

describe("fetchRainfallNowcast", () => {
  beforeEach(() => {
    clearRainfallNowcastCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(["text/csv", "text/plain", "application/octet-stream"])(
    "接受 %s，cache 只保存十八區的精簡 snapshot",
    async (contentType) => {
      const fetchImpl = vi.fn(async () =>
        csvResponse(FIXTURE, contentType),
      );
      const options = {
        fetchImpl,
        now: () => TEST_NOW,
        cacheKey: `content-type-${contentType}`,
      };

      const first = await fetchRainfallNowcast(options);
      const second = await fetchRainfallNowcast(options);

      expect(first.ok).toBe(true);
      expect(second).toEqual(
        first.ok ? { ...first, fromCache: true } : first,
      );
      if (first.ok) {
        expect(Object.keys(first.data.byDistrict)).toHaveLength(18);
        expect(first.data.hongKongWide.periods).toHaveLength(4);
        expect(JSON.stringify(first.data)).not.toContain(
          "Updated Date and Time (in Hong Kong Time)",
        );
      }
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledWith(
        expect.stringContaining("Gridded_rainfall_nowcast.csv"),
        expect.objectContaining({
          cache: "no-store",
          signal: expect.any(AbortSignal),
        }),
      );
    },
  );

  it("合併同一 cache key 的並行下載", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetchImpl: FetchImplementation = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const options = {
      fetchImpl,
      now: () => TEST_NOW,
      cacheKey: "concurrent",
    };

    const firstPromise = fetchRainfallNowcast(options);
    const secondPromise = fetchRainfallNowcast(options);
    resolveResponse?.(csvResponse(FIXTURE));

    const [first, second] = await Promise.all([
      firstPromise,
      secondPromise,
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });

  it("拒絕缺失或未知 Content-Type 及 null body", async () => {
    const missingType = await fetchRainfallNowcast({
      fetchImpl: async () =>
        new Response(new TextEncoder().encode(FIXTURE)),
      ttlMs: 0,
    });
    const unknownType = await fetchRainfallNowcast({
      fetchImpl: async () => csvResponse(FIXTURE, "text/html"),
      ttlMs: 0,
    });
    const nullBody = await fetchRainfallNowcast({
      fetchImpl: async () => csvResponse(null),
      ttlMs: 0,
    });

    expect(missingType).toEqual({
      ok: false,
      error: {
        type: "content-type",
        message: RAINFALL_NOWCAST_ERROR_MESSAGES["content-type"],
      },
    });
    expect(unknownType).toEqual(missingType);
    expect(nullBody).toEqual({
      ok: false,
      error: {
        type: "body",
        message: RAINFALL_NOWCAST_ERROR_MESSAGES.body,
      },
    });
  });

  it("以解壓後串流 bytes 執行 5 MiB 上限，超限即 cancel 及 abort", async () => {
    const cancel = vi.fn();
    let signal: AbortSignal | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1));
      },
      cancel,
    });
    const fetchImpl: FetchImplementation = vi.fn((_input, init) => {
      signal = init?.signal ?? undefined;
      return Promise.resolve(csvResponse(stream));
    });

    const result = await fetchRainfallNowcast({
      fetchImpl,
      ttlMs: 0,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        type: "too-large",
        message: RAINFALL_NOWCAST_ERROR_MESSAGES["too-large"],
      },
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(true);
  });

  it("在下載完成前維持 8 秒 timeout，並取消 reader", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    let signal: AbortSignal | undefined;
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const fetchImpl: FetchImplementation = vi.fn((_input, init) => {
      signal = init?.signal ?? undefined;
      return Promise.resolve(csvResponse(stream));
    });

    const resultPromise = fetchRainfallNowcast({
      fetchImpl,
      timeoutMs: 100,
      ttlMs: 0,
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      error: {
        type: "timeout",
        message: RAINFALL_NOWCAST_ERROR_MESSAGES.timeout,
      },
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(true);
  });

  it("即使 fetch double 忽略 AbortSignal，headers timeout 仍會收斂", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchImpl: FetchImplementation = vi.fn((_input, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });

    const resultPromise = fetchRainfallNowcast({
      fetchImpl,
      timeoutMs: 100,
      ttlMs: 0,
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      error: {
        type: "timeout",
        message: RAINFALL_NOWCAST_ERROR_MESSAGES.timeout,
      },
    });
    expect(signal?.aborted).toBe(true);
  });

  it("拒絕超過 100,000 筆資料列", async () => {
    const header = FIXTURE.slice(0, FIXTURE.indexOf("\n"));
    const row =
      "202607301712,202607301742,0,0,0";
    const oversizedRows = `${header}\n${Array.from(
      { length: MAX_DATA_ROWS + 1 },
      () => row,
    ).join("\n")}`;

    const result = await fetchRainfallNowcast({
      fetchImpl: async () => csvResponse(oversizedRows),
      ttlMs: 0,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        type: "too-large",
        message: RAINFALL_NOWCAST_ERROR_MESSAGES["too-large"],
      },
    });
  });

  it("把非法 UTF-8 或格式錯誤列為 invalid-data，且不 cache 失敗", async () => {
    const header = new TextEncoder().encode(
      FIXTURE.slice(0, FIXTURE.indexOf("\n") + 1),
    );
    const invalidUtf8 = new Uint8Array(header.length + 1);
    invalidUtf8.set(header);
    invalidUtf8[header.length] = 0xff;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(csvResponse(invalidUtf8))
      .mockResolvedValueOnce(csvResponse(FIXTURE));
    const options = {
      fetchImpl,
      now: () => TEST_NOW,
      cacheKey: "invalid-then-valid",
    };

    const first = await fetchRainfallNowcast(options);
    const second = await fetchRainfallNowcast(options);

    expect(first).toEqual({
      ok: false,
      error: {
        type: "invalid-data",
        message: RAINFALL_NOWCAST_ERROR_MESSAGES["invalid-data"],
      },
    });
    expect(second.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
