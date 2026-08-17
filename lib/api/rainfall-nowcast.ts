import * as zlib from "node:zlib";

import { fromBufferPromise, type Entry } from "yauzl";

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
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const ZIP_MAX_COMMENT_SIZE = 0xffff;
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
  if (!contentType || contentType.includes(",")) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType ? ALLOWED_CONTENT_TYPES.has(mediaType) : false;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

class InvalidRainfallNowcastDataError extends Error {}
class RainfallNowcastTooLargeError extends Error {}

function readCentralDirectoryBounds(zipBytes: Uint8Array): {
  offset: number;
  size: number;
} {
  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength,
  );
  const firstPossibleOffset = Math.max(
    0,
    zipBytes.byteLength -
      ZIP_END_OF_CENTRAL_DIRECTORY_SIZE -
      ZIP_MAX_COMMENT_SIZE,
  );

  for (
    let offset =
      zipBytes.byteLength - ZIP_END_OF_CENTRAL_DIRECTORY_SIZE;
    offset >= firstPossibleOffset;
    offset -= 1
  ) {
    if (
      view.getUint32(offset, true) !==
      ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      continue;
    }
    const commentLength = view.getUint16(offset + 20, true);
    if (
      offset + ZIP_END_OF_CENTRAL_DIRECTORY_SIZE + commentLength !==
      zipBytes.byteLength
    ) {
      continue;
    }

    const entryCount = view.getUint16(offset + 10, true);
    const centralDirectorySize = view.getUint32(offset + 12, true);
    const centralDirectoryOffset = view.getUint32(offset + 16, true);
    if (
      view.getUint16(offset + 4, true) !== 0 ||
      view.getUint16(offset + 6, true) !== 0 ||
      view.getUint16(offset + 8, true) !== entryCount ||
      entryCount !== 1 ||
      centralDirectoryOffset + centralDirectorySize !== offset
    ) {
      throw new InvalidRainfallNowcastDataError();
    }
    return { offset: centralDirectoryOffset, size: centralDirectorySize };
  }

  throw new InvalidRainfallNowcastDataError();
}

function crc32(bytes: Uint8Array): number {
  const nativeCrc32 = (
    zlib as typeof zlib & {
      crc32?: (data: Uint8Array) => number;
    }
  ).crc32;
  if (nativeCrc32) return nativeCrc32(bytes);

  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isExpectedEntry(entry: Entry): boolean {
  return (
    entry.fileName === ZIP_ENTRY_NAME &&
    entry.fileName.length > 0 &&
    !entry.fileName.endsWith("/") &&
    !entry.isEncrypted() &&
    entry.generalPurposeBitFlag === 0 &&
    entry.compressionMethod === ZIP_DEFLATE_METHOD
  );
}

async function extractCsvFromZip(
  zipBytes: Uint8Array,
): Promise<Uint8Array> {
  const centralDirectory = readCentralDirectoryBounds(zipBytes);
  let zipFile: Awaited<ReturnType<typeof fromBufferPromise>> | undefined;

  try {
    zipFile = await fromBufferPromise(Buffer.from(zipBytes), {
      strictFileNames: true,
      validateEntrySizes: true,
    });
    const entries = zipFile.eachEntry();
    const firstEntry = await entries.next();
    await entries.return?.();
    const entry = firstEntry.value;
    if (
      !entry ||
      !isExpectedEntry(entry) ||
      46 +
        entry.fileNameLength +
        entry.extraFieldLength +
        entry.fileCommentLength !==
        centralDirectory.size
    ) {
      throw new InvalidRainfallNowcastDataError();
    }
    if (entry.compressedSize > MAX_COMPRESSED_RESPONSE_BYTES) {
      throw new RainfallNowcastTooLargeError();
    }
    if (entry.uncompressedSize > MAX_RESPONSE_BYTES) {
      throw new RainfallNowcastTooLargeError();
    }

    const local = await zipFile.readLocalFileHeaderPromise(entry);
    if (
      local.versionNeededToExtract !== entry.versionNeededToExtract ||
      local.generalPurposeBitFlag !== entry.generalPurposeBitFlag ||
      local.compressionMethod !== entry.compressionMethod ||
      local.lastModFileTime !== entry.lastModFileTime ||
      local.lastModFileDate !== entry.lastModFileDate ||
      local.crc32 !== entry.crc32 ||
      local.compressedSize !== entry.compressedSize ||
      local.uncompressedSize !== entry.uncompressedSize ||
      !local.fileName.equals(entry.fileNameRaw) ||
      local.fileDataStart + entry.compressedSize !==
        centralDirectory.offset
    ) {
      throw new InvalidRainfallNowcastDataError();
    }

    const chunks: Buffer[] = [];
    let bytesRead = 0;
    const stream = await zipFile.openReadStreamPromise(entry);
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesRead += bytes.byteLength;
      if (bytesRead > MAX_RESPONSE_BYTES) {
        stream.destroy();
        throw new RainfallNowcastTooLargeError();
      }
      chunks.push(bytes);
    }
    const csvBytes = Buffer.concat(chunks, bytesRead);
    if (
      csvBytes.byteLength !== entry.uncompressedSize ||
      crc32(csvBytes) !== entry.crc32
    ) {
      throw new InvalidRainfallNowcastDataError();
    }
    return csvBytes;
  } catch (error) {
    if (error instanceof RainfallNowcastTooLargeError) throw error;
    throw new InvalidRainfallNowcastDataError();
  } finally {
    zipFile?.close();
  }
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
          Accept: "application/zip, application/octet-stream;q=0.9",
        },
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);

    if (timedOut) return failure("timeout");
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      controller.abort();
      return failure("http");
    }
    if (!isAllowedContentType(response.headers.get("content-type"))) {
      void response.body?.cancel().catch(() => undefined);
      controller.abort();
      return failure("content-type");
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_COMPRESSED_RESPONSE_BYTES
    ) {
      void response.body?.cancel().catch(() => undefined);
      controller.abort();
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
        void reader.cancel().catch(() => undefined);
        controller.abort();
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
      csvBytes = await Promise.race([
        extractCsvFromZip(zipBytes),
        timeoutPromise,
      ]);
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
