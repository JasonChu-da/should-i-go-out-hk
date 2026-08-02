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
  MAX_COMPRESSED_RESPONSE_BYTES,
  MAX_RESPONSE_BYTES,
  RAINFALL_NOWCAST_ERROR_MESSAGES,
} from "@/lib/api/rainfall-nowcast";
import type { FetchImplementation } from "@/lib/api/client";

const TEST_NOW = Date.parse("2026-07-30T09:20:00.000Z");
const ZIP_FIXTURE = Uint8Array.from(
  Buffer.from(
    [
      "UEsDBBQAAAAIAJdsAl1iy7MH+QEAAEIGAAAcAAAAZ3JpZGRlZF9yYWluZmFsbF9ub3djYXN0LmNzdp2SXWvaUBjH7/spcqnsVJNoW70cc9CL2outXnR3wUQNxGS4hNG7IaN1fUE3oVJa2Au4CRN1LDpnB/syS2Ku9hV2zsGXPCdSOm9OyJ/n95wnzy+557JkKjKXwScXOVSkSjTuXtvu5cBttd2b91zE+WmvilAOkFlDN0tsnXtTWxUxaEY6ClW12quiBXigljG4a1jLaa+q/mUTl11Vl+TIb9mEHLFkVtUtU2FZp3bMsiRi2KdK3tBllvW+vGNZEjEsPZ8Zeuhq/HQuXq2Y3DmfRNFjXVb1InDk9M69YQM4ItFtEzgC4EwRJKkiSFJFgKSGGI4YYjhiaMYFBc3AoKA5GBAEwLkfiFI/EKV+ADrXA1GqB6JUD0ADdkIzUzuhsamdPclUTUvGDWSlWFEw7f3oO5PPf3/V6Pkm7k26wXe0Z+hFFhk1IXJbB8iupBU2S3if2hG3b7zMSy9M7mE+b5Utjf5fTyRVL0iaxkXK5Wh8etKZ/n7rf2i4465zceoM6vgTPLs/7dT8645/UseN3f5X79t3ctefsU2qP712h2ez6taIVPc+hqs3RF7cRjsowSNhBwkiQrmDRw9SCMTJZSzGxNQ2EoRELJ1MIz4mCut2SMZEUcAdeP4eHVLBODRDYt0O/znDXXvYWrfDYob7bDJ95x5S63ZYzJDc+AdQSwECFAAUAAAACACXbAJdYsuzB/kBAABCBgAAHAAAAAAAAAAAAAAAAAAAAAAAZ3JpZGRlZF9yYWluZmFsbF9ub3djYXN0LmNzdlBLBQYAAAAAAQABAEoAAAAzAgAAAAA=",
    ].join(""),
    "base64",
  ),
);

function zipResponse(
  body: BodyInit | null = ZIP_FIXTURE,
  contentType = "application/zip",
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

  it.each(["application/zip", "application/octet-stream"])(
    "接受 %s，cache 只保存十八區的精簡 snapshot",
    async (contentType) => {
      const fetchImpl = vi.fn(async () =>
        zipResponse(ZIP_FIXTURE, contentType),
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
        expect.stringContaining("gridded_rainfall_nowcast.zip"),
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
    resolveResponse?.(zipResponse());

    const [first, second] = await Promise.all([
      firstPromise,
      secondPromise,
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });

  it("cache 不會越過來源更新後 24 分鐘的 hard expiry", async () => {
    let currentTime = TEST_NOW;
    const fetchImpl = vi.fn(async () => zipResponse());
    const options = {
      fetchImpl,
      now: () => currentTime,
      cacheKey: "source-aware-expiry",
    };

    const first = await fetchRainfallNowcast(options);
    currentTime = Date.parse("2026-07-30T09:36:00.001Z");
    const second = await fetchRainfallNowcast(options);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.fromCache).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refresh 逾時時只沿用仍未過 24 分鐘的 cache", async () => {
    vi.useFakeTimers();
    let currentTime = TEST_NOW;
    const fetchImpl: FetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(zipResponse())
      .mockImplementationOnce(() => new Promise<Response>(() => undefined));
    const options = {
      fetchImpl,
      now: () => currentTime,
      timeoutMs: 100,
      ttlMs: 100,
      cacheKey: "fresh-cache-fallback",
    };

    const first = await fetchRainfallNowcast(options);
    currentTime += 101;
    const refresh = fetchRainfallNowcast(options);
    await vi.advanceTimersByTimeAsync(100);
    const second = await refresh;

    expect(first.ok).toBe(true);
    expect(second).toEqual(
      first.ok ? { ...first, fromCache: true } : first,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("來源超過 24 分鐘後 refresh 失敗時不沿用 cache", async () => {
    let currentTime = TEST_NOW;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(zipResponse())
      .mockRejectedValueOnce(new Error("network unavailable"));
    const options = {
      fetchImpl,
      now: () => currentTime,
      cacheKey: "expired-cache-no-fallback",
    };

    const first = await fetchRainfallNowcast(options);
    currentTime = Date.parse("2026-07-30T09:36:00.001Z");
    const second = await fetchRainfallNowcast(options);

    expect(first.ok).toBe(true);
    expect(second).toEqual({
      ok: false,
      error: {
        type: "network",
        message: RAINFALL_NOWCAST_ERROR_MESSAGES.network,
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("拒絕缺失或未知 Content-Type 及 null body", async () => {
    const missingType = await fetchRainfallNowcast({
      fetchImpl: async () =>
        new Response(ZIP_FIXTURE),
      ttlMs: 0,
    });
    const unknownType = await fetchRainfallNowcast({
      fetchImpl: async () => zipResponse(ZIP_FIXTURE, "text/html"),
      ttlMs: 0,
    });
    const nullBody = await fetchRainfallNowcast({
      fetchImpl: async () => zipResponse(null),
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

  it("壓縮內容超過 512 KiB 時立即 cancel 及 abort", async () => {
    const cancel = vi.fn();
    let signal: AbortSignal | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new Uint8Array(MAX_COMPRESSED_RESPONSE_BYTES + 1),
        );
      },
      cancel,
    });
    const fetchImpl: FetchImplementation = vi.fn((_input, init) => {
      signal = init?.signal ?? undefined;
      return Promise.resolve(zipResponse(stream));
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

  it("在下載完成前維持完整 deadline，並取消 reader", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    let signal: AbortSignal | undefined;
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const fetchImpl: FetchImplementation = vi.fn((_input, init) => {
      signal = init?.signal ?? undefined;
      return Promise.resolve(zipResponse(stream));
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

  it("拒絕宣告解壓後超過 5 MiB 的 ZIP", async () => {
    const oversizedZip = ZIP_FIXTURE.slice();
    new DataView(oversizedZip.buffer).setUint32(
      22,
      MAX_RESPONSE_BYTES + 1,
      true,
    );

    const result = await fetchRainfallNowcast({
      fetchImpl: async () => zipResponse(oversizedZip),
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

  it("把損壞 ZIP 列為 invalid-data，且不 cache 失敗", async () => {
    const invalidZip = ZIP_FIXTURE.slice();
    invalidZip[100] ^= 0xff;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(zipResponse(invalidZip))
      .mockResolvedValueOnce(zipResponse());
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
