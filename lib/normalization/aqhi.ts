import { AQHI_CURRENT_ENDPOINT } from "@/lib/api/endpoints";
import type {
  NormalizedAqhi,
  NormalizedAqhiValue,
  NormalizedMetric,
  SourceMeta,
} from "@/lib/domain/outlook";
import {
  FRESHNESS_THRESHOLDS_MS,
  assessFreshness,
  parseHktTimestamp,
  type FreshnessStatus,
} from "@/lib/freshness";
import {
  HONG_KONG_WIDE,
  getDistrictById,
  type LocationId,
} from "@/lib/location/districts";
import {
  createTimedMetric,
  createUnavailableMetric,
  deriveSourceStatus,
} from "@/lib/normalization/shared";
import type {
  AqhiResponse,
  AqhiStationReading,
  AqhiValue,
} from "@/lib/validation/aqhi";

const AQHI_LABEL = "空氣質素健康指數（AQHI）";
const AQHI_SOURCE_LABEL = "環境保護署空氣質素健康指數";

export const AQHI_STATION_LABELS_TC: Readonly<Record<string, string>> = {
  "Central/Western": "中西區",
  Eastern: "東區",
  "Kwai Chung": "葵涌",
  "Kwun Tong": "觀塘",
  North: "北區",
  "Sham Shui Po": "深水埗",
  "Sha Tin": "沙田",
  Southern: "南區",
  "Tai Po": "大埔",
  "Tap Mun": "塔門",
  "Tseung Kwan O": "將軍澳",
  "Tsuen Wan": "荃灣",
  "Tuen Mun": "屯門",
  "Tung Chung": "東涌",
  "Yuen Long": "元朗",
  "Causeway Bay": "銅鑼灣路邊",
  Central: "中環路邊",
  "Mong Kok": "旺角路邊",
};

/** Official general monitoring stations; roadside stations are separate. */
export const GENERAL_AQHI_STATIONS = [
  "Central/Western",
  "Eastern",
  "Kwai Chung",
  "Kwun Tong",
  "North",
  "Sham Shui Po",
  "Sha Tin",
  "Southern",
  "Tai Po",
  "Tap Mun",
  "Tseung Kwan O",
  "Tsuen Wan",
  "Tuen Mun",
  "Tung Chung",
  "Yuen Long",
] as const;

export const ROADSIDE_AQHI_STATIONS = [
  "Causeway Bay",
  "Central",
  "Mong Kok",
] as const;

const GENERAL_STATION_SET = new Set<string>(GENERAL_AQHI_STATIONS);
const ROADSIDE_STATION_SET = new Set<string>(ROADSIDE_AQHI_STATIONS);

interface Candidate {
  reading: AqhiStationReading;
  normalizedValue: NormalizedAqhiValue;
  normalizedPublishedAt: string | null;
  publishedAtMs: number | null;
  freshness: FreshnessStatus;
}

function normalizeAqhiValue(value: AqhiValue): NormalizedAqhiValue {
  if (value === "10+") {
    return { value: 11, display: "10+" };
  }

  return {
    value: typeof value === "number" ? value : Number(value),
    display: String(value),
  };
}

function toCandidate(reading: AqhiStationReading, now: Date): Candidate {
  const publishedAt = parseHktTimestamp(reading.publish_date);
  const publishedAtMs = publishedAt?.getTime() ?? null;

  return {
    reading,
    normalizedValue: normalizeAqhiValue(reading.aqhi),
    normalizedPublishedAt: publishedAt?.toISOString() ?? null,
    publishedAtMs,
    freshness: assessFreshness(
      publishedAt,
      now,
      FRESHNESS_THRESHOLDS_MS.aqhi,
    ),
  };
}

function compareCandidates(left: Candidate, right: Candidate): number {
  const valueDifference =
    right.normalizedValue.value - left.normalizedValue.value;
  if (valueDifference !== 0) return valueDifference;

  const timeDifference =
    (right.publishedAtMs ?? Number.NEGATIVE_INFINITY) -
    (left.publishedAtMs ?? Number.NEGATIVE_INFINITY);
  if (timeDifference !== 0) return timeDifference;

  if (left.reading.station < right.reading.station) return -1;
  if (left.reading.station > right.reading.station) return 1;
  return 0;
}

function chooseCandidate(candidates: Candidate[]): Candidate | undefined {
  const statusPriority: readonly (readonly FreshnessStatus[])[] = [
    ["fresh"],
    ["stale"],
    ["invalid", "future"],
  ];

  for (const acceptedStatuses of statusPriority) {
    const matching = candidates
      .filter((candidate) => acceptedStatuses.includes(candidate.freshness))
      .sort(compareCandidates);

    if (matching[0]) return matching[0];
  }

  return undefined;
}

function sourceMeta(
  metric: NormalizedMetric<NormalizedAqhiValue>,
  retrievedAt: string,
  issues: string[],
): SourceMeta {
  return {
    id: "aqhi",
    label: AQHI_SOURCE_LABEL,
    url: AQHI_CURRENT_ENDPOINT,
    status: deriveSourceStatus([metric]),
    retrievedAt,
    publishedAt: metric.publishedAt,
    rawPublishedAt: metric.rawPublishedAt,
    issues,
  };
}

function missingResult(
  retrievedAt: string,
  place: string | null,
  message: string,
): NormalizedAqhi {
  const aqhi = createUnavailableMetric<NormalizedAqhiValue>(
    AQHI_LABEL,
    "missing",
    message,
    place,
  );

  return {
    aqhi,
    healthRisk: null,
    source: sourceMeta(aqhi, retrievedAt, [message]),
  };
}

export function normalizeAqhi(
  value: AqhiResponse,
  locationId: LocationId,
  retrievedAt: string,
  now: Date,
): NormalizedAqhi {
  const nonRoadsideReadings = value.filter(
    (reading) => !ROADSIDE_STATION_SET.has(reading.station),
  );

  let readings: AqhiResponse;
  let expectedStation: string | null;
  let unavailablePlace: string;

  if (locationId === HONG_KONG_WIDE.id) {
    readings = nonRoadsideReadings.filter((reading) =>
      GENERAL_STATION_SET.has(reading.station),
    );
    expectedStation = null;
    unavailablePlace = "全港一般監測站最高";
  } else {
    const district = getDistrictById(locationId);
    if (!district) {
      return missingResult(
        retrievedAt,
        null,
        "找不到所選地區的官方 AQHI 監測站設定。",
      );
    }

    expectedStation = district.aqhiStation;
    unavailablePlace = `${AQHI_STATION_LABELS_TC[district.aqhiStation] ?? "地區"}監測站`;
    readings = nonRoadsideReadings.filter(
      (reading) => reading.station === district.aqhiStation,
    );
  }

  if (readings.length === 0) {
    return missingResult(
      retrievedAt,
      unavailablePlace,
      "所選地區的 AQHI 監測站暫時沒有提供資料。",
    );
  }

  const selected = chooseCandidate(
    readings.map((reading) => toCandidate(reading, now)),
  );

  if (!selected) {
    return missingResult(
      retrievedAt,
      unavailablePlace,
      "AQHI 資料暫時無法使用。",
    );
  }

  const aqhi = createTimedMetric({
    value: selected.normalizedValue,
    label: AQHI_LABEL,
    place:
      expectedStation === null
        ? `全港一般監測站最高（${AQHI_STATION_LABELS_TC[selected.reading.station] ?? "官方監測站"}）`
        : `${AQHI_STATION_LABELS_TC[selected.reading.station] ?? "地區"}監測站`,
    rawPublishedAt: selected.reading.publish_date,
    normalizedPublishedAt: selected.normalizedPublishedAt,
    now,
    maxAge: FRESHNESS_THRESHOLDS_MS.aqhi,
  });
  const issues =
    aqhi.status === "malformed"
      ? ["AQHI 發布時間無法用於判斷資料新鮮度。"]
      : [];

  return {
    aqhi,
    healthRisk:
      aqhi.status === "fresh" || aqhi.status === "stale"
        ? selected.reading.health_risk
        : null,
    source: sourceMeta(aqhi, retrievedAt, issues),
  };
}
