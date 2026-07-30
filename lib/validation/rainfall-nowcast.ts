import { normalizeHktTimestamp } from "@/lib/freshness";
import { HONG_KONG_SERVICE_BOUNDS } from "@/lib/location/districts";
import {
  failure,
  success,
  type ParseResult,
  type ValidationIssue,
} from "@/lib/validation/common";

export const RAINFALL_NOWCAST_HEADER = [
  "Updated Date and Time (in Hong Kong Time)",
  "Ending Date and Time (in Hong Kong Time)",
  "Latitude (degree)",
  "Longitude (degree)",
  "Half-hourly Nowcast Accumulated Rainfall (mm)",
] as const;

const REQUIRED_OFFSETS_MINUTES = [30, 60, 90, 120] as const;
const MAX_REPORTED_ISSUES = 10;

export type ParsedRainfallValue =
  | { status: "valid"; value: number }
  | { status: "invalid" }
  | { status: "duplicate" };

export interface ParsedRainfallGridCell {
  latitude: number;
  longitude: number;
  periodValues: [
    ParsedRainfallValue | undefined,
    ParsedRainfallValue | undefined,
    ParsedRainfallValue | undefined,
    ParsedRainfallValue | undefined,
  ];
}

export interface ParsedRainfallNowcastGrid {
  rawUpdatedAt: string;
  updatedAt: string;
  periodEndAts: readonly [string, string, string, string];
  cells: ParsedRainfallGridCell[];
  recoverableIssueCount: number;
}

function parseCompactHktTimestamp(raw: string): string | null {
  const match =
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(raw.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const normalized = normalizeHktTimestamp(
    `${year}-${month}-${day}T${hour}:${minute}:00+08:00`,
  );
  if (!normalized) return null;

  const milliseconds = Date.parse(normalized);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
}

function isValidCoordinate(
  latitude: number,
  longitude: number,
): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function isInsideServiceBounds(
  latitude: number,
  longitude: number,
): boolean {
  return (
    latitude >= HONG_KONG_SERVICE_BOUNDS.minLatitude &&
    latitude <= HONG_KONG_SERVICE_BOUNDS.maxLatitude &&
    longitude >= HONG_KONG_SERVICE_BOUNDS.minLongitude &&
    longitude <= HONG_KONG_SERVICE_BOUNDS.maxLongitude
  );
}

function coordinateKey(latitude: number, longitude: number): string {
  return `${latitude},${longitude}`;
}

/**
 * Incremental parser for the fixed five-column HKO CSV contract.
 * It retains only grid identities inside the app's Hong Kong service bounds.
 */
export class RainfallNowcastCsvParser {
  dataRowCount = 0;

  private headerSeen = false;
  private rawUpdatedAt: string | null = null;
  private updatedAt: string | null = null;
  private readonly requiredPeriodsSeen = [false, false, false, false];
  private readonly cells = new Map<string, ParsedRainfallGridCell>();
  private readonly fatalIssues: ValidationIssue[] = [];
  private readonly recoverableIssues: ValidationIssue[] = [];
  private recoverableIssueCount = 0;

  get hasFatalError(): boolean {
    return this.fatalIssues.length > 0;
  }

  private fatal(path: string, message: string): void {
    if (this.fatalIssues.length < MAX_REPORTED_ISSUES) {
      this.fatalIssues.push({ path, message });
    }
  }

  private recoverable(path: string, message: string): void {
    this.recoverableIssueCount += 1;
    if (this.recoverableIssues.length < MAX_REPORTED_ISSUES) {
      this.recoverableIssues.push({ path, message });
    }
  }

  pushLine(rawLine: string): void {
    if (this.hasFatalError) return;

    const line = rawLine.endsWith("\r")
      ? rawLine.slice(0, -1)
      : rawLine;

    if (!this.headerSeen) {
      this.headerSeen = true;
      const fields = line
        .replace(/^\uFEFF/u, "")
        .split(",")
        .map((field) => field.trim());

      if (
        fields.length !== RAINFALL_NOWCAST_HEADER.length ||
        !RAINFALL_NOWCAST_HEADER.every(
          (expected, index) => fields[index] === expected,
        )
      ) {
        this.fatal(
          "$.header",
          "CSV 標題必須與官方五欄英文格式完全一致",
        );
      }
      return;
    }

    if (line.trim() === "") return;
    this.dataRowCount += 1;
    const path = `$.rows[${this.dataRowCount}]`;
    const fields = line.split(",").map((field) => field.trim());

    if (fields.length !== RAINFALL_NOWCAST_HEADER.length) {
      this.fatal(path, "CSV 資料列必須恰好有五欄");
      return;
    }

    const [
      rawUpdatedAt,
      rawEndingAt,
      rawLatitude,
      rawLongitude,
      rawRainfall,
    ] = fields;
    const updatedAt = parseCompactHktTimestamp(rawUpdatedAt);
    const endingAt = parseCompactHktTimestamp(rawEndingAt);

    if (!updatedAt || !endingAt) {
      this.fatal(path, "更新或結束時間不是合法香港時間");
      return;
    }

    if (this.rawUpdatedAt === null) {
      this.rawUpdatedAt = rawUpdatedAt;
      this.updatedAt = updatedAt;
    } else if (rawUpdatedAt !== this.rawUpdatedAt) {
      this.fatal(path, "同一 CSV 混合了多個更新時間");
      return;
    }

    const offsetMinutes =
      (Date.parse(endingAt) - Date.parse(updatedAt)) / 60_000;
    const latitude = Number(rawLatitude);
    const longitude = Number(rawLongitude);
    if (!isValidCoordinate(latitude, longitude)) {
      this.fatal(path, "經緯度無效，無法判斷格點身分");
      return;
    }

    const periodIndex = REQUIRED_OFFSETS_MINUTES.indexOf(
      offsetMinutes as (typeof REQUIRED_OFFSETS_MINUTES)[number],
    );

    if (periodIndex === -1) {
      this.recoverable(path, "已略過非必要的額外預報時段");
      return;
    }
    this.requiredPeriodsSeen[periodIndex] = true;

    const rainfallMm = Number(rawRainfall);
    const rainfallIsValid =
      rawRainfall !== "" &&
      Number.isFinite(rainfallMm) &&
      rainfallMm >= 0;

    if (!isInsideServiceBounds(latitude, longitude)) {
      if (!rainfallIsValid) {
        this.recoverable(path, "香港服務範圍外的雨量值無效");
      }
      return;
    }

    const key = coordinateKey(latitude, longitude);
    const cell =
      this.cells.get(key) ??
      ({
        latitude,
        longitude,
        periodValues: [undefined, undefined, undefined, undefined],
      } satisfies ParsedRainfallGridCell);
    const current = cell.periodValues[periodIndex];

    cell.periodValues[periodIndex] =
      current === undefined
        ? rainfallIsValid
          ? { status: "valid", value: rainfallMm }
          : { status: "invalid" }
        : { status: "duplicate" };
    this.cells.set(key, cell);
  }

  finish(): ParseResult<ParsedRainfallNowcastGrid> {
    if (!this.headerSeen) {
      return failure("$.header", "CSV 沒有標題列");
    }

    if (this.hasFatalError) {
      return {
        ok: false,
        issues: [...this.fatalIssues],
      };
    }

    if (!this.rawUpdatedAt || !this.updatedAt) {
      return failure("$.rows", "CSV 沒有資料列");
    }

    const missingPeriod = this.requiredPeriodsSeen.findIndex(
      (seen) => !seen,
    );
    if (missingPeriod !== -1) {
      return failure(
        "$.rows",
        `缺少更新後 ${REQUIRED_OFFSETS_MINUTES[missingPeriod]} 分鐘的必要時段`,
        this.recoverableIssues,
      );
    }

    if (this.cells.size === 0) {
      return failure(
        "$.rows",
        "香港服務範圍內沒有可識別格點",
        this.recoverableIssues,
      );
    }

    const updatedAtMs = Date.parse(this.updatedAt);
    const periodEndAts = REQUIRED_OFFSETS_MINUTES.map((minutes) =>
      new Date(updatedAtMs + minutes * 60_000).toISOString(),
    ) as [string, string, string, string];

    return success(
      {
        rawUpdatedAt: this.rawUpdatedAt,
        updatedAt: this.updatedAt,
        periodEndAts,
        cells: [...this.cells.values()],
        recoverableIssueCount: this.recoverableIssueCount,
      },
      this.recoverableIssues,
    );
  }
}

export function parseRainfallNowcastCsv(
  csv: string,
): ParseResult<ParsedRainfallNowcastGrid> {
  const parser = new RainfallNowcastCsvParser();
  for (const line of csv.split("\n")) {
    parser.pushLine(line);
    if (parser.hasFatalError) break;
  }
  return parser.finish();
}
