import type { FetchImplementation } from "@/lib/api/client";
import {
  API_CACHE_TTL_MS,
  HKO_RAINFALL_NOWCAST_ENDPOINT,
} from "@/lib/api/endpoints";
import {
  buildRainfallNowcastSnapshot,
  type ParsedRainfallNowcastSnapshot,
} from "@/lib/normalization/rainfall-nowcast";
import { RainfallNowcastCsvParser } from "@/lib/validation/rainfall-nowcast";

export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
export const MAX_DATA_ROWS = 100_000;
export const RAINFALL_NOWCAST_REQUEST_TIMEOUT_MS = 8_000;

const ALLOWED_CONTENT_TYPES = new Set([
  "text/csv",
  "text/plain",
  "application/octet-stream",
]);

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
      contentLength > MAX_RESPONSE_BYTES
    ) {
      const cancelPromise = response.body?.cancel();
      controller.abort();
      await cancelPromise?.catch(() => undefined);
      return failure("too-large");
    }

    if (!response.body) return failure("body");
    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const parser = new RainfallNowcastCsvParser();
    let bytesRead = 0;
    let pending = "";

    const pushText = (text: string): boolean => {
      pending += text;
      let newlineIndex = pending.indexOf("\n");

      while (newlineIndex !== -1) {
        parser.pushLine(pending.slice(0, newlineIndex));
        pending = pending.slice(newlineIndex + 1);
        if (
          parser.hasFatalError ||
          parser.dataRowCount > MAX_DATA_ROWS
        ) {
          return false;
        }
        newlineIndex = pending.indexOf("\n");
      }

      return true;
    };

    while (true) {
      const chunk = await Promise.race([reader.read(), timeoutPromise]);
      if (timedOut) return failure("timeout");
      if (chunk.done) break;

      bytesRead += chunk.value.byteLength;
      if (bytesRead > MAX_RESPONSE_BYTES) {
        const cancelPromise = reader.cancel();
        controller.abort();
        await cancelPromise.catch(() => undefined);
        return failure("too-large");
      }

      let decoded = "";
      try {
        decoded = decoder.decode(chunk.value, { stream: true });
      } catch {
        throw new InvalidRainfallNowcastDataError();
      }
      if (!pushText(decoded)) {
        const cancelPromise = reader.cancel();
        controller.abort();
        await cancelPromise.catch(() => undefined);
        return failure(
          parser.dataRowCount > MAX_DATA_ROWS
            ? "too-large"
            : "invalid-data",
        );
      }
    }

    let trailingText = "";
    try {
      trailingText = decoder.decode();
    } catch {
      throw new InvalidRainfallNowcastDataError();
    }
    if (!pushText(trailingText)) {
      return failure(
        parser.dataRowCount > MAX_DATA_ROWS
          ? "too-large"
          : "invalid-data",
      );
    }
    if (pending !== "") parser.pushLine(pending);
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
      responseCache.set(cacheKey, {
        data: snapshot.value,
        retrievedAt,
        expiresAt: retrievedAtMs + ttlMs,
      });
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

  if (ttlMs > 0) {
    const currentTime = getTime(now);
    const cached = responseCache.get(cacheKey);
    if (cached && currentTime < cached.expiresAt) {
      return {
        ok: true,
        data: cached.data,
        retrievedAt: cached.retrievedAt,
        fromCache: true,
      };
    }
    if (cached) responseCache.delete(cacheKey);
  }

  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const request = requestRainfallNowcast(
    fetchImpl,
    now,
    timeoutMs,
    ttlMs,
    cacheKey,
  );
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
