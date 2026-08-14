import { getDefaultApiCacheTtlMs } from "./endpoints";

export const DEFAULT_API_TIMEOUT_MS = 8_000;
export const MAX_JSON_RESPONSE_BYTES = 1024 * 1024;

export type ApiErrorType =
  | "timeout"
  | "network"
  | "http"
  | "content-type"
  | "too-large"
  | "invalid-json";

export const API_ERROR_MESSAGES = {
  timeout: "政府資料服務回應逾時，請稍後再試。",
  network: "暫時未能連線至政府資料服務，請稍後再試。",
  http: "政府資料服務暫時未能提供資料，請稍後再試。",
  "content-type": "政府資料服務回傳了無法識別的資料格式。",
  "too-large": "政府資料服務回傳的資料超出安全大小限制。",
  "invalid-json": "政府資料服務回傳的資料無法讀取。",
} as const satisfies Record<ApiErrorType, string>;

export interface ApiFetchSuccess {
  ok: true;
  data: unknown;
  retrievedAt: string;
  fromCache: boolean;
}

export interface ApiFetchFailure {
  ok: false;
  error: {
    type: ApiErrorType;
    message: (typeof API_ERROR_MESSAGES)[ApiErrorType];
  };
}

export type ApiFetchResult = ApiFetchSuccess | ApiFetchFailure;

export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface FetchJsonOptions {
  fetchImpl?: FetchImplementation;
  now?: () => number | Date;
  timeoutMs?: number;
  ttlMs?: number;
  cacheKey?: string;
}

interface CacheEntry {
  data: unknown;
  retrievedAt: string;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<ApiFetchResult>>();

function failure(type: ApiErrorType): ApiFetchFailure {
  return {
    ok: false,
    error: {
      type,
      message: API_ERROR_MESSAGES[type],
    },
  };
}

function getTime(now: () => number | Date): number {
  const value = now();
  return value instanceof Date ? value.getTime() : value;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function isJsonContentType(contentType: string | null): boolean {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

function releaseReader(
  reader: ReadableStreamDefaultReader<Uint8Array> | null,
): void {
  try {
    reader?.releaseLock();
  } catch {
    // A cancelled reader may already have released its lock.
  }
}

async function requestJson(
  url: string,
  fetchImpl: FetchImplementation,
  now: () => number | Date,
  timeoutMs: number,
  ttlMs: number,
  cacheKey: string,
): Promise<ApiFetchResult> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let timedOut = false;
  const timeoutError = new Error("Internal API request timeout");
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

  const fetchPromise = (async (): Promise<ApiFetchResult> => {
    const response = await fetchImpl(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      controller.abort();
      return failure("http");
    }

    if (!isJsonContentType(response.headers.get("content-type"))) {
      void response.body?.cancel().catch(() => undefined);
      controller.abort();
      return failure("content-type");
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_JSON_RESPONSE_BYTES
    ) {
      void response.body?.cancel().catch(() => undefined);
      controller.abort();
      return failure("too-large");
    }

    if (!response.body) return failure("invalid-json");
    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytesRead = 0;
    let json = "";

    let data: unknown;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytesRead += chunk.value.byteLength;
        if (bytesRead > MAX_JSON_RESPONSE_BYTES) {
          void reader.cancel().catch(() => undefined);
          controller.abort();
          return failure("too-large");
        }
        json += decoder.decode(chunk.value, { stream: true });
      }
      json += decoder.decode();
      data = JSON.parse(json) as unknown;
    } catch (error) {
      if (timedOut || isAbortError(error)) {
        throw error;
      }

      void reader.cancel().catch(() => undefined);
      controller.abort();
      return failure("invalid-json");
    }

    // A test double may ignore AbortSignal. Never cache a response that
    // completed after this request's deadline.
    if (timedOut) {
      return failure("timeout");
    }

    const retrievedAtMs = getTime(now);
    const retrievedAt = new Date(retrievedAtMs).toISOString();
    const result: ApiFetchSuccess = {
      ok: true,
      data,
      retrievedAt,
      fromCache: false,
    };

    if (ttlMs > 0) {
      responseCache.set(cacheKey, {
        data,
        retrievedAt,
        expiresAt: retrievedAtMs + ttlMs,
      });
    }

    return result;
  })();

  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (error) {
    if (timedOut || error === timeoutError || isAbortError(error)) {
      return failure("timeout");
    }

    return failure("network");
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
    releaseReader(reader);
  }
}

/**
 * Fetch and decode JSON from a government endpoint.
 *
 * Transport errors are intentionally converted to a small, safe error model;
 * callers never receive raw upstream response bodies or exception messages.
 */
export async function fetchJson(
  url: string,
  options: FetchJsonOptions = {},
): Promise<ApiFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS);
  const ttlMs = Math.max(
    0,
    options.ttlMs ?? getDefaultApiCacheTtlMs(url),
  );
  const cacheKey = options.cacheKey ?? url;

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

    if (cached) {
      responseCache.delete(cacheKey);
    }
  }

  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = requestJson(
    url,
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

/** Clear module memory between isolated tests or after an explicit refresh. */
export function clearApiCache(): void {
  responseCache.clear();
  inFlightRequests.clear();
}
