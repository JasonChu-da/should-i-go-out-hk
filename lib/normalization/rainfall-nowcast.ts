import { HKO_RAINFALL_NOWCAST_SOURCE_PAGE } from "@/lib/api/endpoints";
import type {
  NormalizedRainfallNowcast,
  RainfallNowcastPeriod,
  RainfallNowcastValue,
  SourceMeta,
} from "@/lib/domain/outlook";
import {
  OUTLOOK_NUMERIC_RANGES,
  RAINFALL_NOWCAST_SIGNAL_MM,
} from "@/lib/domain/outlook";
import { FRESHNESS_THRESHOLDS_MS } from "@/lib/freshness";
import {
  DISTRICTS,
  getDistrictById,
  haversineDistanceKm,
  type DistrictId,
  type LocationId,
} from "@/lib/location/districts";
import {
  createSourceMeta,
  createTimedMetric,
  createUnavailableMetric,
  deriveSourceStatus,
} from "@/lib/normalization/shared";
import {
  failure,
  success,
  type ParseResult,
  type ValidationIssue,
} from "@/lib/validation/common";
import type {
  ParsedRainfallGridCell,
  ParsedRainfallNowcastGrid,
  ParsedRainfallValue,
} from "@/lib/validation/rainfall-nowcast";

export interface RainfallSnapshotPeriod {
  periodStartAt: string;
  periodEndAt: string;
  rainfallMm: number;
}

export interface DistrictRainfallNowcastSnapshot {
  gridLatitude: number;
  gridLongitude: number;
  gridDistanceKm: number;
  periods: readonly [
    RainfallSnapshotPeriod,
    RainfallSnapshotPeriod,
    RainfallSnapshotPeriod,
    RainfallSnapshotPeriod,
  ];
}

export interface HongKongRainfallNowcastSnapshot {
  periods: readonly [
    RainfallSnapshotPeriod & { districtId: DistrictId },
    RainfallSnapshotPeriod & { districtId: DistrictId },
    RainfallSnapshotPeriod & { districtId: DistrictId },
    RainfallSnapshotPeriod & { districtId: DistrictId },
  ];
}

export interface ParsedRainfallNowcastSnapshot {
  rawUpdatedAt: string;
  updatedAt: string;
  byDistrict: Record<DistrictId, DistrictRainfallNowcastSnapshot>;
  hongKongWide: HongKongRainfallNowcastSnapshot;
  issues: string[];
  issueCount: number;
}

function issueText(issue: ValidationIssue): string {
  return `${issue.path}: ${issue.message}`;
}

function coordinateComesFirst(
  candidate: ParsedRainfallGridCell,
  current: ParsedRainfallGridCell,
): boolean {
  return (
    candidate.latitude < current.latitude ||
    (candidate.latitude === current.latitude &&
      candidate.longitude < current.longitude)
  );
}

function nearestCell(
  cells: readonly ParsedRainfallGridCell[],
  latitude: number,
  longitude: number,
): ParsedRainfallGridCell | null {
  let nearest: ParsedRainfallGridCell | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const cell of cells) {
    const distance = haversineDistanceKm(
      { latitude, longitude },
      { latitude: cell.latitude, longitude: cell.longitude },
    );
    if (
      distance < nearestDistance ||
      (distance === nearestDistance &&
        nearest !== null &&
        coordinateComesFirst(cell, nearest))
    ) {
      nearest = cell;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function validRainfall(
  value: ParsedRainfallValue | undefined,
): number | null {
  return value?.status === "valid" ? value.value : null;
}

function cellKey(cell: ParsedRainfallGridCell): string {
  return `${cell.latitude},${cell.longitude}`;
}

function periodStatusMessage(
  value: ParsedRainfallValue | undefined,
): string {
  if (value === undefined) return "缺少";
  if (value.status === "duplicate") return "重複";
  return "雨量無效";
}

export function buildRainfallNowcastSnapshot(
  grid: ParsedRainfallNowcastGrid,
  parserIssues: readonly ValidationIssue[] = [],
): ParseResult<ParsedRainfallNowcastSnapshot> {
  const byDistrict = {} as Record<
    DistrictId,
    DistrictRainfallNowcastSnapshot
  >;
  const selectedCells = new Set<string>();

  for (const district of DISTRICTS) {
    const cell = nearestCell(
      grid.cells,
      district.center.latitude,
      district.center.longitude,
    );
    if (!cell) {
      return failure(
        `$.districts.${district.id}`,
        "找不到地區代表預報格點",
        [...parserIssues],
      );
    }

    const values = cell.periodValues.map(validRainfall);
    const invalidIndex = values.findIndex((value) => value === null);
    if (invalidIndex !== -1) {
      return failure(
        `$.districts.${district.id}.periods[${invalidIndex}]`,
        `代表格點必要時段${periodStatusMessage(cell.periodValues[invalidIndex])}`,
        [...parserIssues],
      );
    }

    const periodStarts = [
      grid.updatedAt,
      grid.periodEndAts[0],
      grid.periodEndAts[1],
      grid.periodEndAts[2],
    ] as const;
    const periods = values.map((rainfallMm, index) => ({
      periodStartAt: periodStarts[index],
      periodEndAt: grid.periodEndAts[index],
      rainfallMm: rainfallMm as number,
    })) as [
      RainfallSnapshotPeriod,
      RainfallSnapshotPeriod,
      RainfallSnapshotPeriod,
      RainfallSnapshotPeriod,
    ];
    const distance = haversineDistanceKm(district.center, {
      latitude: cell.latitude,
      longitude: cell.longitude,
    });

    byDistrict[district.id] = {
      gridLatitude: cell.latitude,
      gridLongitude: cell.longitude,
      gridDistanceKm: distance,
      periods,
    };
    selectedCells.add(cellKey(cell));
  }

  const recoverableIssues = parserIssues.map(issueText);
  let issueCount = grid.recoverableIssueCount;
  for (const cell of grid.cells) {
    if (selectedCells.has(cellKey(cell))) continue;

    for (const [index, value] of cell.periodValues.entries()) {
      if (value?.status === "valid") continue;
      issueCount += 1;
      if (recoverableIssues.length < 10) {
        recoverableIssues.push(
          `$.grid.${cellKey(cell)}.periods[${index}]: 非代表格點${periodStatusMessage(value)}`,
        );
      }
    }
  }

  const hongKongPeriods = [0, 1, 2, 3].map((periodIndex) => {
    let highestDistrict: (typeof DISTRICTS)[number] = DISTRICTS[0];
    let highestPeriod = byDistrict[highestDistrict.id].periods[periodIndex];

    for (const district of DISTRICTS.slice(1)) {
      const candidate = byDistrict[district.id].periods[periodIndex];
      if (candidate.rainfallMm > highestPeriod.rainfallMm) {
        highestDistrict = district;
        highestPeriod = candidate;
      }
    }

    return { ...highestPeriod, districtId: highestDistrict.id };
  }) as [
    RainfallSnapshotPeriod & { districtId: DistrictId },
    RainfallSnapshotPeriod & { districtId: DistrictId },
    RainfallSnapshotPeriod & { districtId: DistrictId },
    RainfallSnapshotPeriod & { districtId: DistrictId },
  ];

  return success({
    rawUpdatedAt: grid.rawUpdatedAt,
    updatedAt: grid.updatedAt,
    byDistrict,
    hongKongWide: { periods: hongKongPeriods },
    issues: recoverableIssues.slice(0, 10),
    issueCount,
  });
}

function analyzePeriods(
  snapshotPeriods: readonly [
    RainfallSnapshotPeriod,
    RainfallSnapshotPeriod,
    RainfallSnapshotPeriod,
    RainfallSnapshotPeriod,
  ],
  now: Date,
): RainfallNowcastValue {
  const nowMs = now.getTime();
  const periods = snapshotPeriods.map((period) => {
    const startMs = Date.parse(period.periodStartAt);
    const endMs = Date.parse(period.periodEndAt);
    return {
      periodStartAt: period.periodStartAt,
      periodEndAt: period.periodEndAt,
      rainfallMm: period.rainfallMm,
      isPartiallyElapsed: startMs < nowMs && nowMs < endMs,
    };
  }) as [
    RainfallNowcastPeriod,
    RainfallNowcastPeriod,
    RainfallNowcastPeriod,
    RainfallNowcastPeriod,
  ];
  const coverageEndAt = periods[3].periodEndAt;
  const remainingCoverageMinutes = Math.max(
    0,
    Math.min(120, Math.ceil((Date.parse(coverageEndAt) - nowMs) / 60_000)),
  );

  let firstPeriodIndex = -1;
  let lastPeriodIndex = -1;
  for (let index = 0; index < periods.length; index += 1) {
    const period = periods[index];
    const isRemaining = Date.parse(period.periodEndAt) > nowMs;
    const hasRainSignal =
      isRemaining &&
      period.rainfallMm >= RAINFALL_NOWCAST_SIGNAL_MM;

    if (firstPeriodIndex === -1) {
      if (hasRainSignal) {
        firstPeriodIndex = index;
        lastPeriodIndex = index;
      }
      continue;
    }

    if (hasRainSignal) {
      lastPeriodIndex = index;
    } else {
      break;
    }
  }

  let peakRainPeriodIndex: number | null = null;
  for (let index = 0; index < periods.length; index += 1) {
    if (Date.parse(periods[index].periodEndAt) <= nowMs) continue;
    if (
      peakRainPeriodIndex === null ||
      periods[index].rainfallMm >
        periods[peakRainPeriodIndex].rainfallMm
    ) {
      peakRainPeriodIndex = index;
    }
  }

  return {
    periods,
    coverageEndAt,
    remainingCoverageMinutes,
    firstRainWindow:
      firstPeriodIndex === -1
        ? null
        : { firstPeriodIndex, lastPeriodIndex },
    peakRainPeriodIndex,
  };
}

function sourceIssues(snapshot: ParsedRainfallNowcastSnapshot): string[] {
  if (snapshot.issueCount <= snapshot.issues.length) return snapshot.issues;
  return [
    ...snapshot.issues,
    `另有 ${snapshot.issueCount - snapshot.issues.length} 項非關鍵資料問題。`,
  ];
}

export function normalizeRainfallNowcast(
  snapshot: ParsedRainfallNowcastSnapshot,
  locationId: LocationId,
  retrievedAt: string,
  now: Date,
): NormalizedRainfallNowcast {
  const district =
    locationId === "hong-kong" ? undefined : getDistrictById(locationId);
  const selected =
    locationId === "hong-kong"
      ? snapshot.hongKongWide
      : snapshot.byDistrict[locationId];
  const place =
    locationId === "hong-kong"
      ? "十八區代表格點最高"
      : (district?.nameTc ?? null);

  if (!selected) {
    return unavailableRainfallNowcast(
      retrievedAt,
      "找不到所選地區的降雨預報。",
      "malformed",
    );
  }

  if (
    selected.periods.some(
      ({ rainfallMm }) =>
        rainfallMm < OUTLOOK_NUMERIC_RANGES.rainfallNowcastMm.min ||
        rainfallMm > OUTLOOK_NUMERIC_RANGES.rainfallNowcastMm.max,
    )
  ) {
    return unavailableRainfallNowcast(
      retrievedAt,
      "預測雨量數值超出合理範圍，不會用於計分。",
      "malformed",
    );
  }

  const forecast = createTimedMetric({
    value: analyzePeriods(selected.periods, now),
    label: "未來降雨預報",
    place,
    rawPublishedAt: snapshot.rawUpdatedAt,
    normalizedPublishedAt: snapshot.updatedAt,
    now,
    maxAge: FRESHNESS_THRESHOLDS_MS.rainfallNowcast,
  });
  const source = createSourceMeta(
    {
      id: "rainfallNowcast",
      label: "香港天文台兩小時降雨臨近預報",
      url: HKO_RAINFALL_NOWCAST_SOURCE_PAGE,
      retrievedAt,
    },
    deriveSourceStatus([forecast]),
    [forecast],
    sourceIssues(snapshot),
  );

  return { forecast, source };
}

export function unavailableRainfallNowcast(
  retrievedAt: string,
  message: string,
  status: "failed" | "malformed" = "failed",
): NormalizedRainfallNowcast {
  const forecast = createUnavailableMetric<RainfallNowcastValue>(
    "未來降雨預報",
    status,
    message,
  );
  const source: SourceMeta = {
    id: "rainfallNowcast",
    label: "香港天文台兩小時降雨臨近預報",
    url: HKO_RAINFALL_NOWCAST_SOURCE_PAGE,
    status: "unavailable",
    retrievedAt,
    publishedAt: null,
    rawPublishedAt: null,
    issues: [message],
  };

  return { forecast, source };
}
