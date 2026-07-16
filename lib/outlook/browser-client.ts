import type { OutlookPayload } from "@/lib/domain/outlook";
import type { LocationId } from "@/lib/location/districts";
import { isOutlookPayload } from "@/lib/validation/outlook";

export const DEFAULT_OUTLOOK_ROUTE_TIMEOUT_MS = 12_000;

export type OutlookRouteErrorType =
  | "aborted"
  | "timeout"
  | "http"
  | "invalid"
  | "network";

export interface OutlookRouteSuccess {
  ok: true;
  payload: OutlookPayload;
}

export interface OutlookRouteFailure {
  ok: false;
  error: {
    type: OutlookRouteErrorType;
    status?: number;
  };
}

export type OutlookRouteResult = OutlookRouteSuccess | OutlookRouteFailure;

export type BrowserFetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface FetchOutlookRouteOptions {
  /** React effect cleanup (or another caller) can cancel the in-flight request. */
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: BrowserFetchImplementation;
}

function failure(
  type: OutlookRouteErrorType,
  status?: number,
): OutlookRouteFailure {
  return status === undefined
    ? { ok: false, error: { type } }
    : { ok: false, error: { type, status } };
}

function normalizedTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs)) {
    return DEFAULT_OUTLOOK_ROUTE_TIMEOUT_MS;
  }

  return Math.max(0, timeoutMs);
}

/**
 * Fetch the browser-facing internal outlook route within one end-to-end
 * deadline. The deadline covers both the HTTP request and response.json(), so
 * a stalled body cannot leave the React loading state pending indefinitely.
 *
 * This boundary never throws. Only cancellation of the caller-provided signal
 * is reported as `aborted`; an unrelated AbortError is a network failure.
 */
export async function fetchOutlookRoute(
  locationId: LocationId,
  options: FetchOutlookRouteOptions = {},
): Promise<OutlookRouteResult> {
  const callerSignal = options.signal;

  if (callerSignal?.aborted) {
    return failure("aborted");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = normalizedTimeout(options.timeoutMs);
  let timedOut = false;
  let resolveStop: (result: OutlookRouteFailure) => void = () => undefined;
  const stopPromise = new Promise<OutlookRouteFailure>((resolve) => {
    resolveStop = resolve;
  });

  const stop = (type: "aborted" | "timeout") => {
    if (controller.signal.aborted) return;

    if (type === "timeout") timedOut = true;
    // Resolve the explicit stop result before aborting. Fetch implementations
    // may synchronously reject from their abort listener.
    resolveStop(failure(type));
    controller.abort();
  };

  const handleCallerAbort = () => stop("aborted");
  callerSignal?.addEventListener("abort", handleCallerAbort, { once: true });
  const timeoutHandle = setTimeout(() => stop("timeout"), timeoutMs);

  const interruptedFailure = (): OutlookRouteFailure => {
    if (callerSignal?.aborted) return failure("aborted");
    if (timedOut) return failure("timeout");
    return failure("network");
  };

  const requestPromise = (async (): Promise<OutlookRouteResult> => {
    let response: Response;

    try {
      response = await fetchImpl(
        `/api/outlook?location=${encodeURIComponent(locationId)}`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        },
      );
    } catch {
      return interruptedFailure();
    }

    if (!response.ok) {
      return failure("http", response.status);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      if (callerSignal?.aborted || timedOut) return interruptedFailure();
      return failure("invalid");
    }

    // A fetch/Response test double may ignore AbortSignal and settle after the
    // caller has cancelled or the deadline has elapsed.
    if (callerSignal?.aborted || timedOut) return interruptedFailure();

    if (!isOutlookPayload(data)) {
      return failure("invalid");
    }

    return { ok: true, payload: data };
  })();

  try {
    return await Promise.race([requestPromise, stopPromise]);
  } catch {
    // Defensive boundary for unusual Response implementations (for example a
    // throwing `ok` getter). No internal route error should escape to React.
    return interruptedFailure();
  } finally {
    clearTimeout(timeoutHandle);
    callerSignal?.removeEventListener("abort", handleCallerAbort);
  }
}
