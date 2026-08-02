import { inflateRawSync } from "node:zlib";

import type { FetchImplementation } from "@/lib/api/client";
import {
  API_CACHE_TTL_MS,
  HKO_RAINFALL_NOWCAST_ENDPOINT,
} from "@/lib/api/endpoints";
import {
  buildRainfallNowcastSnapshot,
  type ParsedRainfallNowcastSnapshot,
} from "@/lib/normalization/rainfall-nowcast";
import {
  assessFreshness,
  FRESHNESS_THRESHOLDS_MS,
} from "@/lib/freshness";
import { RainfallNowcastCsvParser } from "@/lib/validation/rainfall-nowcast";

export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
export const MAX_COMPRESSED_RESPONSE_BYTES = 512 * 1024;
export const MAX_DATA_ROWS = 100_000;
export const RAINFALL_NOWCAST_REQUEST_TIMEOUT_MS = 8_000;

const ALLOWED_CONTENT_TYPES = new Set([
  "application/zip",
  "application/octet-stream",
]);
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_DEFLATE_METHOD = 8;
const ZIP_ENTRY_NAME = "gridded_rainfall_nowcast.csv";

export type RainfallNowcastErrorType =
  | "timeout"
  | "network"
  | "http"
  | "content-type"
  | "body"
  | "too-large"
  | "invalid-data";

export const RAINFALL_NOWCAST_ERROR_MESSAGES = {
  timeout: "未來降雨預報服務回應逾時。",
  network: "暫時未能連線至未來降雨預報服務。",
  http: "未來降雨預報服務暫時未能提供資料。",
  "content-type": "未來降雨預報服務回傳了無法識別的格式。",
  body: "未來降雨預報服務沒有可讀取的資料內容。",
  "too-large": "未來降雨預報資料超出安全大小限制。",
  "invalid-data": "未來降雨預報資料格式異常。",
} as const satisfies Record<RainfallNowcastErrorType, string>;

export interface RainfallNowcastFetchSuccess {
  ok: true;
  data: ParsedRainfallNowcastSnapshot;
  retrievedAt: string;
  fromCache: boolean;
}

export interface RainfallNowcastFetchFailure {
  ok: false;
  error: {
    type: RainfallNowcastErrorType;
    message: (typeof RAINFALL_NOWCAST_ERROR_MESSAGES)[RainfallNowcastErrorType];
  };
}

export type RainfallNowcastFetchResult =
  | RainfallNowcastFetchSuccess
  | RainfallNowcastFetchFailure;

export interface FetchRainfallNowcastOptions {
  fetchImpl?: FetchImplementation;
  now?: () => number | Date;
  timeoutMs?: number;
  ttlMs?: number;
  cacheKey?: string;
}

interface CacheEntry {
  data: ParsedRainfallNowcastSnapshot;
  retrievedAt: string;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<
  string,
  Promise<RainfallNowcastFetchResult>
>();

function failure(
  type: RainfallNowcastErrorType,
): RainfallNowcastFetchFailure {
  return {
    ok: false,
    error: { type, message: RAINFALL_NOWCAST_ERROR_MESSAGES[type] },
  };
}

function getTime(now: () => number | Date): number {
  const value = now();
  return value instanceof Date ? value.getTime() : value;
}

function isCacheSourceFresh(entry: CacheEntry, now: number): boolean {
  return (
    assessFreshness(
      entry.data.updatedAt,
      now,
      FRESHNESS_THRESHOLDS_MS.rainfallNowcast,
    ) === "fresh"
  );
}

function cachedSuccess(entry: CacheEntry): RainfallNowcastFetchSuccess {
  return {
    ok: true,
    data: entry.data,
    retrievedAt: entry.retrievedAt,
    fromCache: true,
  };
}

function isAllowedContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.split(",").some((part) => {
    const mediaType = part.split(";", 1)[0]?.trim().toLowerCase();
    return mediaType ? ALLOWED_CONTENT_TYPES.has(mediaType) : false;
  });
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

class InvalidRainfallNowcastDataError extends Error {}
class RainfallNowcastTooLargeError extends Error {}

function extractCsvFromZip(zipBytes: Uint8Array): Uint8Array {
  if (zipBytes.byteLength < 30) {
    throw new InvalidRainfallNowcastDataError();
  }

  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength,
  );
  if (view.getUint32(0, true) !== ZIP_LOCAL_FILE_SIGNATURE) {
    throw new InvalidRainfallNowcastDataError();
  }

  const flags = view.getUint16(6, true);
  const method = view.getUint16(8, true);
  const compressedSize = view.getUint32(18, true);
  const uncompressedSize = view.getUint32(22, true);
  const fileNameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const dataStart = 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + compressedSize;

  if (compressedSize > MAX_COMPRESSED_RESPONSE_BYTES) {
    throw new RainfallNowcastTooLargeError();
  }
  if (
    flags !== 0 ||
    method !== ZIP_DEFLATE_METHOD ||
    dataStart > zipBytes.byteLength ||
    dataEnd > zipBytes.byteLength
  ) {
    throw new InvalidRainfallNowcastDataError();
  }
  if (uncompressedSize > MAX_RESPONSE_BYTES) {
    throw new RainfallNowcastTooLargeError();
  }

  let fileName: string;
  try {
    fileName = new TextDecoder("utf-8", { fatal: true }).decode(
      zipBytes.subarray(30, 30 + fileNameLength),
    );
  } catch {
    throw new InvalidRainfallNowcastDataError();
  }
  if (fileName !== ZIP_ENTRY_NAME) {
    throw new InvalidRainfallNowcastDataError();
  }

  let csvBytes: Uint8Array;
  try {
    csvBytes = inflateRawSync(zipBytes.subarray(dataStart, dataEnd), {
      maxOutputLength: MAX_RESPONSE_BYTES,
    });
  } catch {
    throw new InvalidRainfallNowcastDataError();
  }
  if (csvBytes.byteLength !== uncompressedSize) {
    throw new InvalidRainfallNowcastDataError();
  }
  return csvBytes;
}

async function requestRainfallNowcast(
  fetchImpl: FetchImplementation,
  now: () => number | Date,
  timeoutMs: number,
  ttlMs: number,
  cacheKey: string,
): Promise<RainfallNowcastFetchResult> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let timedOut = false;
  const timeoutError = new Error("Internal rainfall nowcast timeout");
  timeoutError.name = "TimeoutError";
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      void reader?.cancel().catch(() => undefined);
      controller.abort();
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetchImpl(HKO_RAINFALL_NOWCAST_ENDPOINT, {
        cache: "no-store",
        headers: {
          Accept:
            "text/csv, text/plain;q=0.9, application/octet-stream;q=0.8",
        },
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);

    if (timedOut) return failure("timeout");
    if (!response.ok) return failure("http");
    if (!isAllowedContentType(response.headers.get("content-type"))) {
      return failure("content-type");
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_COMPRESSED_RESPONSE_BYTES
    ) {
      const cancelPromise = response.body?.cancel();
      controller.abort();
      await cancelPromise?.catch(() => undefined);
      return failure("too-large");
    }

    if (!response.body) return failure("body");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;

    while (true) {
      const chunk = await Promise.race([reader.read(), timeoutPromise]);
      if (timedOut) return failure("timeout");
      if (chunk.done) break;

      bytesRead += chunk.value.byteLength;
      if (bytesRead > MAX_COMPRESSED_RESPONSE_BYTES) {
        const cancelPromise = reader.cancel();
        controller.abort();
        await cancelPromise.catch(() => undefined);
        return failure("too-large");
      }
      chunks.push(chunk.value);
    }

    const zipBytes = new Uint8Array(bytesRead);
    let offset = 0;
    for (const chunk of chunks) {
      zipBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    let csvBytes: Uint8Array;
    try {
      csvBytes = extractCsvFromZip(zipBytes);
    } catch (error) {
      if (error instanceof RainfallNowcastTooLargeError) {
        return failure("too-large");
      }
      throw error;
    }

    let csv: string;
    try {
      csv = new TextDecoder("utf-8", { fatal: true }).decode(csvBytes);
    } catch {
      throw new InvalidRainfallNowcastDataError();
    }
    const parser = new RainfallNowcastCsvParser();
    for (const line of csv.split("\n")) {
      parser.pushLine(line);
      if (parser.hasFatalError || parser.dataRowCount > MAX_DATA_ROWS) {
        break;
      }
    }
    if (parser.dataRowCount > MAX_DATA_ROWS) return failure("too-large");

    const parsed = parser.finish();
    if (!parsed.ok) return failure("invalid-data");
    const snapshot = buildRainfallNowcastSnapshot(
      parsed.value,
      parsed.issues,
    );
    if (!snapshot.ok) return failure("invalid-data");
    if (timedOut) return failure("timeout");

    const retrievedAtMs = getTime(now);
    const retrievedAt = new Date(retrievedAtMs).toISOString();
    const result: RainfallNowcastFetchSuccess = {
      ok: true,
      data: snapshot.value,
      retrievedAt,
      fromCache: false,
    };

    if (ttlMs > 0) {
      const sourceExpiresAt =
        Date.parse(snapshot.value.updatedAt) +
        FRESHNESS_THRESHOLDS_MS.rainfallNowcast;
      const expiresAt = Math.min(
        retrievedAtMs + ttlMs,
        sourceExpiresAt,
      );

      if (expiresAt > retrievedAtMs) {
        responseCache.set(cacheKey, {
          data: snapshot.value,
          retrievedAt,
          expiresAt,
        });
      }
    }
    return result;
  } catch (error) {
    if (timedOut || isAbortError(error)) return failure("timeout");
    if (error instanceof InvalidRainfallNowcastDataError) {
      return failure("invalid-data");
    }
    return failure("network");
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    try {
      reader?.releaseLock();
    } catch {
      // A cancelled reader may already have released its lock.
    }
  }
}

export async function fetchRainfallNowcast(
  options: FetchRainfallNowcastOptions = {},
): Promise<RainfallNowcastFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = Math.max(
    0,
    options.timeoutMs ?? RAINFALL_NOWCAST_REQUEST_TIMEOUT_MS,
  );
  const ttlMs = Math.max(
    0,
    options.ttlMs ?? API_CACHE_TTL_MS.rainfallNowcast,
  );
  const cacheKey = options.cacheKey ?? HKO_RAINFALL_NOWCAST_ENDPOINT;

  let cached: CacheEntry | undefined;
  if (ttlMs > 0) {
    const currentTime = getTime(now);
    cached = responseCache.get(cacheKey);
    if (cached && !isCacheSourceFresh(cached, currentTime)) {
      responseCache.delete(cacheKey);
      cached = undefined;
    }
    if (cached && currentTime < cached.expiresAt) {
      return cachedSuccess(cached);
    }
  }

  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const request = requestRainfallNowcast(
    fetchImpl,
    now,
    timeoutMs,
    ttlMs,
    cacheKey,
  ).then((result) => {
    if (result.ok || !cached) return result;
    if (isCacheSourceFresh(cached, getTime(now))) {
      return cachedSuccess(cached);
    }
    if (responseCache.get(cacheKey) === cached) {
      responseCache.delete(cacheKey);
    }
    return result;
  });
  inFlightRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (inFlightRequests.get(cacheKey) === request) {
      inFlightRequests.delete(cacheKey);
    }
  }
}

export function clearRainfallNowcastCache(): void {
  responseCache.clear();
  inFlightRequests.clear();
}
