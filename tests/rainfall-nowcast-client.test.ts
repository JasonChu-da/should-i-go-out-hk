import { crc32, deflateRawSync } from "node:zlib";

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
  MAX_DATA_ROWS,
  MAX_RESPONSE_BYTES,
  RAINFALL_NOWCAST_ERROR_MESSAGES,
} from "@/lib/api/rainfall-nowcast";
import type { FetchImplementation } from "@/lib/api/client";
import { CSDI_RAINFALL_NOWCAST_HEADER } from "@/lib/validation/rainfall-nowcast";

const TEST_NOW = Date.parse("2026-07-30T09:20:00.000Z");
const ZIP_FIXTURE = Uint8Array.from(
  Buffer.from(
    [
      "UEsDBBQAAAAIAJdsAl1iy7MH+QEAAEIGAAAcAAAAZ3JpZGRlZF9yYWluZmFsbF9ub3djYXN0LmNzdp2SXWvaUBjH7/spcqnsVJNoW70cc9CL2outXnR3wUQNxGS4hNG7IaN1fUE3oVJa2Au4CRN1LDpnB/syS2Ku9hV2zsGXPCdSOm9OyJ/n95wnzy+557JkKjKXwScXOVSkSjTuXtvu5cBttd2b91zE+WmvilAOkFlDN0tsnXtTWxUxaEY6ClW12quiBXigljG4a1jLaa+q/mUTl11Vl+TIb9mEHLFkVtUtU2FZp3bMsiRi2KdK3tBllvW+vGNZEjEsPZ8Zeuhq/HQuXq2Y3DmfRNFjXVb1InDk9M69YQM4ItFtEzgC4EwRJKkiSFJFgKSGGI4YYjhiaMYFBc3AoKA5GBAEwLkfiFI/EKV+ADrXA1GqB6JUD0ADdkIzUzuhsamdPclUTUvGDWSlWFEw7f3oO5PPf3/V6Pkm7k26wXe0Z+hFFhk1IXJbB8iupBU2S3if2hG3b7zMSy9M7mE+b5Utjf5fTyRVL0iaxkXK5Wh8etKZ/n7rf2i4465zceoM6vgTPLs/7dT8645/UseN3f5X79t3ctefsU2qP712h2ez6taIVPc+hqs3RF7cRjsowSNhBwkiQrmDRw9SCMTJZSzGxNQ2EoRELJ1MIz4mCut2SMZEUcAdeP4eHVLBODRDYt0O/znDXXvYWrfDYob7bDJ95x5S63ZYzJDc+AdQSwECFAAUAAAACACXbAJdYsuzB/kBAABCBgAAHAAAAAAAAAAAAAAAAAAAAAAAZ3JpZGRlZF9yYWluZmFsbF9ub3djYXN0LmNzdlBLBQYAAAAAAQABAEoAAAAzAgAAAAA=",
    ].join(""),
    "base64",
  ),
);
const ZIP_ENTRY_NAME = "gridded_rainfall_nowcast.csv";
const ZIP_CENTRAL_FILE_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

function zipCsv(csv: string): Uint8Array<ArrayBuffer> {
  const name = Buffer.from(ZIP_ENTRY_NAME, "utf8");
  const data = Buffer.from(csv, "utf8");
  const compressed = deflateRawSync(data);
  const checksum = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressed.byteLength, 18);
  local.writeUInt32LE(data.byteLength, 22);
  local.writeUInt16LE(name.byteLength, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(ZIP_CENTRAL_FILE_SIGNATURE, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.byteLength, 20);
  central.writeUInt32LE(data.byteLength, 24);
  central.writeUInt16LE(name.byteLength, 28);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.byteLength + name.byteLength, 12);
  eocd.writeUInt32LE(
    local.byteLength + name.byteLength + compressed.byteLength,
    16,
  );

  const bytes = Buffer.concat([
    local,
    name,
    compressed,
    central,
    name,
    eocd,
  ]);
  const zip = new Uint8Array(bytes.byteLength);
  zip.set(bytes);
  return zip;
}

function zipOffsets(zip: Uint8Array) {
  const view = new DataView(
    zip.buffer,
    zip.byteOffset,
    zip.byteLength,
  );
  let eocdOffset = zip.byteLength - 22;
  while (
    eocdOffset >= 0 &&
    view.getUint32(eocdOffset, true) !==
      ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE
  ) {
    eocdOffset -= 1;
  }
  if (eocdOffset < 0) throw new Error("測試 ZIP 缺少 EOCD");

  const centralOffset = view.getUint32(eocdOffset + 16, true);
  if (
    view.getUint32(centralOffset, true) !== ZIP_CENTRAL_FILE_SIGNATURE
  ) {
    throw new Error("測試 ZIP 缺少 central file header");
  }
  return { centralOffset, eocdOffset };
}

function rewriteEntryName(name: string): Uint8Array {
  const { centralOffset, eocdOffset } = zipOffsets(ZIP_FIXTURE);
  const source = Buffer.from(ZIP_FIXTURE);
  const view = new DataView(
    ZIP_FIXTURE.buffer,
    ZIP_FIXTURE.byteOffset,
    ZIP_FIXTURE.byteLength,
  );
  const localNameLength = view.getUint16(26, true);
  const localExtraLength = view.getUint16(28, true);
  const centralNameLength = view.getUint16(centralOffset + 28, true);
  const centralExtraLength = view.getUint16(centralOffset + 30, true);
  const centralCommentLength = view.getUint16(centralOffset + 32, true);
  const nameBytes = Buffer.from(name, "utf8");

  const localHeader = Buffer.from(source.subarray(0, 30));
  localHeader.writeUInt16LE(nameBytes.byteLength, 26);
  const localExtra = source.subarray(
    30 + localNameLength,
    30 + localNameLength + localExtraLength,
  );
  const compressedData = source.subarray(
    30 + localNameLength + localExtraLength,
    centralOffset,
  );

  const centralHeader = Buffer.from(
    source.subarray(centralOffset, centralOffset + 46),
  );
  centralHeader.writeUInt16LE(nameBytes.byteLength, 28);
  const centralTail = source.subarray(
    centralOffset + 46 + centralNameLength,
    centralOffset +
      46 +
      centralNameLength +
      centralExtraLength +
      centralCommentLength,
  );
  const newCentralOffset =
    localHeader.byteLength +
    nameBytes.byteLength +
    localExtra.byteLength +
    compressedData.byteLength;
  const newCentralSize =
    centralHeader.byteLength + nameBytes.byteLength + centralTail.byteLength;
  const eocd = Buffer.from(source.subarray(eocdOffset));
  eocd.writeUInt32LE(newCentralSize, 12);
  eocd.writeUInt32LE(newCentralOffset, 16);

  return Uint8Array.from(
    Buffer.concat([
      localHeader,
      nameBytes,
      localExtra,
      compressedData,
      centralHeader,
      nameBytes,
      centralTail,
      eocd,
    ]),
  );
}

function duplicateCentralEntry(): Uint8Array {
  const { centralOffset, eocdOffset } = zipOffsets(ZIP_FIXTURE);
  const source = Buffer.from(ZIP_FIXTURE);
  const centralEntry = source.subarray(centralOffset, eocdOffset);
  const eocd = Buffer.from(source.subarray(eocdOffset));
  eocd.writeUInt16LE(2, 8);
  eocd.writeUInt16LE(2, 10);
  eocd.writeUInt32LE(centralEntry.byteLength * 2, 12);
  return Uint8Array.from(
    Buffer.concat([
      source.subarray(0, centralOffset),
      centralEntry,
      centralEntry,
      eocd,
    ]),
  );
}

function expectInvalidZip(zip: Uint8Array) {
  return expect(
    fetchRainfallNowcast({
      fetchImpl: async () => zipResponse(Uint8Array.from(zip)),
      ttlMs: 0,
    }),
  ).resolves.toEqual({
    ok: false,
    error: {
      type: "invalid-data",
      message: RAINFALL_NOWCAST_ERROR_MESSAGES["invalid-data"],
    },
  });
}

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
          headers: {
            Accept: "application/zip, application/octet-stream;q=0.9",
          },
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
    vi.useFakeTimers();
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
    const ambiguousType = await fetchRainfallNowcast({
      fetchImpl: async () =>
        zipResponse(ZIP_FIXTURE, "application/zip, text/html"),
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
    expect(ambiguousType).toEqual(missingType);
    expect(nullBody).toEqual({
      ok: false,
      error: {
        type: "body",
        message: RAINFALL_NOWCAST_ERROR_MESSAGES.body,
      },
    });
  });

  it.each([
    ["HTTP 錯誤", 503, "application/zip", "http"],
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
    const result = await fetchRainfallNowcast({
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
        message: RAINFALL_NOWCAST_ERROR_MESSAGES[errorType],
      },
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(true);
  });

  it("拒絕回應時不等待卡住的 body cleanup", async () => {
    let signal: AbortSignal | undefined;
    const stream = new ReadableStream<Uint8Array>({
      cancel: () => new Promise<void>(() => undefined),
    });

    await expect(
      fetchRainfallNowcast({
        fetchImpl: async (_input, init) => {
          signal = init?.signal ?? undefined;
          return zipResponse(stream, "text/html");
        },
        ttlMs: 0,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "content-type" },
    });
    expect(signal?.aborted).toBe(true);
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
    const { centralOffset } = zipOffsets(oversizedZip);
    const view = new DataView(oversizedZip.buffer);
    view.setUint32(22, MAX_RESPONSE_BYTES + 1, true);
    view.setUint32(
      centralOffset + 24,
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

  it("解壓後未超限時仍拒絕超過 100,000 筆資料列", async () => {
    const header = CSDI_RAINFALL_NOWCAST_HEADER.join(",");
    const row = "2026,1,1,0,0,,UTC+8,2026,1,1,0,30,,UTC+8,0,0,0";
    const csv = `${header}\n${Array(MAX_DATA_ROWS + 1).fill(row).join("\n")}`;
    const zip = zipCsv(csv);

    expect(Buffer.byteLength(csv)).toBeLessThan(MAX_RESPONSE_BYTES);
    expect(zip.byteLength).toBeLessThan(MAX_COMPRESSED_RESPONSE_BYTES);
    await expect(
      fetchRainfallNowcast({
        fetchImpl: async () => zipResponse(zip),
        ttlMs: 0,
      }),
    ).resolves.toEqual({
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

  it("解壓後驗證 central directory 的 CRC-32", async () => {
    const invalidZip = ZIP_FIXTURE.slice();
    const { centralOffset } = zipOffsets(invalidZip);
    const view = new DataView(invalidZip.buffer);
    const invalidCrc = (view.getUint32(14, true) + 1) >>> 0;
    view.setUint32(14, invalidCrc, true);
    view.setUint32(centralOffset + 16, invalidCrc, true);

    await expectInvalidZip(invalidZip);
  });

  it.each([
    ["central directory signature 損壞", () => {
      const zip = ZIP_FIXTURE.slice();
      const { centralOffset } = zipOffsets(zip);
      zip[centralOffset] ^= 0xff;
      return zip;
    }],
    ["central directory 越界", () => {
      const zip = ZIP_FIXTURE.slice();
      const { eocdOffset } = zipOffsets(zip);
      new DataView(zip.buffer).setUint32(eocdOffset + 16, 0xffffffff, true);
      return zip;
    }],
    ["包含多個 entry", duplicateCentralEntry],
    ["包含 directory entry", () =>
      rewriteEntryName(`${ZIP_ENTRY_NAME.slice(0, -1)}/`)],
    ["包含 path traversal 名稱", () =>
      rewriteEntryName(`../${"a".repeat(ZIP_ENTRY_NAME.length - 3)}`)],
    ["檔案名稱為空", () => rewriteEntryName("")],
    ["entry 已加密", () => {
      const zip = ZIP_FIXTURE.slice();
      const { centralOffset } = zipOffsets(zip);
      const view = new DataView(zip.buffer);
      view.setUint16(6, 1, true);
      view.setUint16(centralOffset + 8, 1, true);
      return zip;
    }],
    ["compression method 不支援", () => {
      const zip = ZIP_FIXTURE.slice();
      const { centralOffset } = zipOffsets(zip);
      const view = new DataView(zip.buffer);
      view.setUint16(8, 99, true);
      view.setUint16(centralOffset + 10, 99, true);
      return zip;
    }],
    ["local header 越界", () => {
      const zip = ZIP_FIXTURE.slice();
      const { centralOffset } = zipOffsets(zip);
      new DataView(zip.buffer).setUint32(
        centralOffset + 42,
        0xffffffff,
        true,
      );
      return zip;
    }],
    ["central/local 重要欄位不一致", () => {
      const zip = ZIP_FIXTURE.slice();
      new DataView(zip.buffer).setUint32(14, 0, true);
      return zip;
    }],
    ["compressed size 與實際內容不一致", () => {
      const zip = ZIP_FIXTURE.slice();
      const { centralOffset } = zipOffsets(zip);
      const view = new DataView(zip.buffer);
      const size = view.getUint32(18, true) + 1;
      view.setUint32(18, size, true);
      view.setUint32(centralOffset + 20, size, true);
      return zip;
    }],
    ["uncompressed size 與實際內容不一致", () => {
      const zip = ZIP_FIXTURE.slice();
      const { centralOffset } = zipOffsets(zip);
      const view = new DataView(zip.buffer);
      const size = view.getUint32(22, true) + 1;
      view.setUint32(22, size, true);
      view.setUint32(centralOffset + 24, size, true);
      return zip;
    }],
    ["ZIP 被截斷", () => ZIP_FIXTURE.slice(0, -1)],
  ])("拒絕 %s", async (_name, createZip) => {
    await expectInvalidZip(createZip());
  });
});
