import { HKO_CURRENT_WEATHER_ENDPOINT } from "@/lib/api/endpoints";
import type {
  NormalizedMetric,
  NormalizedWeather,
} from "@/lib/domain/outlook";
import { OUTLOOK_NUMERIC_RANGES } from "@/lib/domain/outlook";
import { FRESHNESS_THRESHOLDS_MS } from "@/lib/freshness";
import {
  getDistrictById,
  type LocationId,
} from "@/lib/location/districts";
import {
  createSourceMeta,
  createTimedMetric,
  createUnavailableMetric,
  deriveSourceStatus,
  normalizeHkoTimestamp,
} from "@/lib/normalization/shared";
import type {
  HkoMeasurementItem,
  HkoRainfallItem,
  HkoRhrread,
} from "@/lib/validation/hko";

const HONG_KONG_OBSERVATORY = "香港天文台";
const HONG_KONG_HIGHEST_RAINFALL = "十八區最高";
interface ValueRange {
  min?: number;
  max?: number;
}

function createWeatherMetric({
  value,
  label,
  place,
  rawPublishedAt,
  now,
  range,
}: {
  value: number | null;
  label: string;
  place: string | null;
  rawPublishedAt: string | undefined;
  now: Date;
  range?: ValueRange;
}): NormalizedMetric<number> {
  const rawTimestamp = rawPublishedAt ?? null;
  const normalizedPublishedAt = normalizeHkoTimestamp(rawPublishedAt);
  const outsideRange =
    value !== null &&
    ((range?.min !== undefined && value < range.min) ||
      (range?.max !== undefined && value > range.max));

  if (outsideRange) {
    return {
      status: "malformed",
      value: null,
      label,
      place,
      publishedAt: normalizedPublishedAt,
      rawPublishedAt: rawTimestamp,
      message: "觀測數值超出合理範圍，不會用於計分。",
    };
  }

  return createTimedMetric({
    value,
    label,
    place,
    rawPublishedAt: rawTimestamp,
    normalizedPublishedAt,
    now,
    maxAge: FRESHNESS_THRESHOLDS_MS.weather,
  });
}

function normalizeRainfallPlace(place: string): string {
  return place.trim().replace(/區$/u, "");
}

function isSameRainfallPlace(left: string, right: string): boolean {
  return normalizeRainfallPlace(left) === normalizeRainfallPlace(right);
}

function isValidRainfallMaximum(
  item: HkoRainfallItem,
): item is HkoRainfallItem & { max: number } {
  return item.max !== undefined && Number.isFinite(item.max) && item.max >= 0;
}

function findHighestRainfall(
  items: readonly HkoRainfallItem[],
): HkoRainfallItem | undefined {
  let highest: (HkoRainfallItem & { max: number }) | undefined;

  for (const item of items) {
    if (
      isValidRainfallMaximum(item) &&
      (highest === undefined || item.max > highest.max)
    ) {
      highest = item;
    }
  }

  return highest;
}

function findFirstAvailableStation(
  items: readonly HkoMeasurementItem[],
  stationNames: readonly string[],
): HkoMeasurementItem | undefined {
  for (const stationName of stationNames) {
    const observation = items.find(
      (item) => item.place === stationName && Number.isFinite(item.value),
    );
    if (observation) return observation;
  }

  return undefined;
}

function isUvNightTime(now: Date): boolean {
  if (!Number.isFinite(now.getTime())) return false;

  const hongKongHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Hong_Kong",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );

  return hongKongHour >= 18 || hongKongHour < 7;
}

function normalizeUv(value: HkoRhrread, now: Date): NormalizedMetric<number> {
  if (value.uvindex === "") {
    return isUvNightTime(now)
      ? createUnavailableMetric(
          "紫外線指數",
          "notApplicable",
          "夜間沒有適用的紫外線指數觀測。",
        )
      : createUnavailableMetric(
          "紫外線指數",
          "missing",
          "日間紫外線指數資料暫時未有提供。",
        );
  }

  if (value.uvindex === undefined) {
    return createUnavailableMetric(
      "紫外線指數",
      "missing",
      "紫外線指數資料暫時未有提供。",
    );
  }

  const observation = value.uvindex.data[0];
  return createWeatherMetric({
    value: observation?.value ?? null,
    label: "紫外線指數",
    place: observation?.place ?? null,
    rawPublishedAt: value.uvindex.recordTime ?? value.updateTime,
    now,
    range: OUTLOOK_NUMERIC_RANGES.uvIndex,
  });
}

export function normalizeWeather(
  value: HkoRhrread,
  locationId: LocationId,
  retrievedAt: string,
  now: Date,
): NormalizedWeather {
  const icons = [...(value.icon ?? [])];
  const rawIconPublishedAt = value.iconUpdateTime ?? null;
  const conditionIcons = createTimedMetric({
    value: icons.length > 0 ? icons : null,
    label: "天氣狀況",
    rawPublishedAt: rawIconPublishedAt,
    normalizedPublishedAt: normalizeHkoTimestamp(value.iconUpdateTime),
    now,
    maxAge: FRESHNESS_THRESHOLDS_MS.weather,
  });
  const district =
    locationId === "hong-kong" ? undefined : getDistrictById(locationId);
  const rainfallItems = value.rainfall?.data ?? [];

  const rainfallObservation =
    locationId === "hong-kong"
      ? findHighestRainfall(rainfallItems)
      : rainfallItems.find(
          (item) =>
            district !== undefined &&
            isSameRainfallPlace(item.place, district.rainfallPlace),
        );
  const rainfallMm = createWeatherMetric({
    value: rainfallObservation?.max ?? null,
    label: "雨量",
    place:
      locationId === "hong-kong"
        ? HONG_KONG_HIGHEST_RAINFALL
        : rainfallObservation?.place ?? null,
    rawPublishedAt: value.rainfall?.endTime,
    now,
    range: OUTLOOK_NUMERIC_RANGES.rainfallMm,
  });

  const temperatureStations =
    locationId === "hong-kong"
      ? [HONG_KONG_OBSERVATORY]
      : (district?.temperatureStations ?? []);
  const temperatureObservation = findFirstAvailableStation(
    value.temperature?.data ?? [],
    temperatureStations,
  );
  const temperatureC = createWeatherMetric({
    value: temperatureObservation?.value ?? null,
    label: "氣溫",
    place: temperatureObservation?.place ?? null,
    rawPublishedAt: value.temperature?.recordTime,
    now,
    range: OUTLOOK_NUMERIC_RANGES.temperatureC,
  });

  const humidityObservation = findFirstAvailableStation(
    value.humidity?.data ?? [],
    [HONG_KONG_OBSERVATORY],
  );
  const humidityPercent = createWeatherMetric({
    value: humidityObservation?.value ?? null,
    label: "相對濕度",
    place: humidityObservation?.place ?? null,
    rawPublishedAt: value.humidity?.recordTime,
    now,
    range: OUTLOOK_NUMERIC_RANGES.humidityPercent,
  });

  const uvIndex = normalizeUv(value, now);
  const metrics: NormalizedMetric<unknown>[] = [
    conditionIcons,
    rainfallMm,
    temperatureC,
    humidityPercent,
    uvIndex,
  ];
  const source = createSourceMeta(
    {
      id: "weather",
      label: "香港天文台即時天氣",
      url: HKO_CURRENT_WEATHER_ENDPOINT,
      retrievedAt,
    },
    deriveSourceStatus(metrics),
    metrics,
    metrics
      .filter((metric) => metric.status === "malformed")
      .map((metric) => `${metric.label}：${metric.message}`),
  );

  return {
    conditionIcons,
    rainfallMm,
    temperatureC,
    humidityPercent,
    uvIndex,
    icons,
    warningMessages:
      value.warningMessage === "" || value.warningMessage === undefined
        ? []
        : [...value.warningMessage],
    specialWeatherTips: [...(value.specialWxTips ?? [])],
    source,
  };
}
