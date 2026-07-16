import { describe, expect, it } from "vitest";

import { HKO_CURRENT_WEATHER_ENDPOINT } from "@/lib/api/endpoints";
import { normalizeWeather } from "@/lib/normalization/weather";
import type { HkoRhrread } from "@/lib/validation/hko";
import { parseRhrread } from "@/lib/validation/hko";

import rhrreadDaytimeUv from "./fixtures/rhrread-daytime-uv.json";
import rhrreadMissingFields from "./fixtures/rhrread-missing-fields.json";
import rhrreadNight from "./fixtures/rhrread-night-live-sanitized.json";

const RETRIEVED_AT = "2026-07-14T20:08:00+08:00";

function parsedRhrread(input: unknown): HkoRhrread {
  const result = parseRhrread(input);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`預期 fixture 可通過 parser：${JSON.stringify(result.issues)}`);
  }
  return result.value;
}

describe("normalizeWeather", () => {
  it("正規化實測 fixture，按地區選雨量及優先氣溫站並保留訊息", () => {
    const result = normalizeWeather(
      parsedRhrread(rhrreadNight),
      "sha-tin",
      RETRIEVED_AT,
      new Date(RETRIEVED_AT),
    );

    expect(result.rainfallMm).toMatchObject({
      status: "fresh",
      value: 0,
      label: "雨量",
      place: "沙田",
      rawPublishedAt: "2026-07-14T19:45:00+08:00",
      publishedAt: "2026-07-14T11:45:00.000Z",
    });
    expect(result.temperatureC).toMatchObject({
      status: "fresh",
      value: 27.6,
      label: "氣溫",
      place: "沙田",
      rawPublishedAt: "2026-07-14T20:00:00+08:00",
    });
    expect(result.humidityPercent).toMatchObject({
      status: "fresh",
      value: 84,
      label: "相對濕度",
      place: "香港天文台",
    });
    expect(result.uvIndex.status).toBe("notApplicable");
    expect(result.icons).toEqual([62]);
    expect(result.warningMessages).toEqual(["強烈季候風信號現正生效。"]);
    expect(result.specialWeatherTips).toEqual([]);
    expect(result.source).toEqual({
      id: "weather",
      label: "香港天文台即時天氣",
      url: HKO_CURRENT_WEATHER_ENDPOINT,
      status: "ok",
      retrievedAt: RETRIEVED_AT,
      publishedAt: "2026-07-14T12:00:00.000Z",
      rawPublishedAt: "2026-07-14T20:00:00+08:00",
      issues: [],
    });
  });

  it("按 temperatureStations 次序選首個實際存在的地區站", () => {
    const value: HkoRhrread = {
      rainfall: {
        data: [
          { place: "中西區", max: 1 },
          { place: "沙田", max: 4 },
        ],
        endTime: "2026-07-14T19:45:00+08:00",
      },
      temperature: {
        data: [
          { place: "大埔", value: 31 },
          { place: "香港天文台", value: 28 },
        ],
        recordTime: "2026-07-14T20:00:00+08:00",
      },
    };

    const result = normalizeWeather(
      value,
      "sha-tin",
      RETRIEVED_AT,
      new Date(RETRIEVED_AT),
    );

    expect(result.rainfallMm).toMatchObject({ value: 4, place: "沙田" });
    expect(result.temperatureC).toMatchObject({ value: 31, place: "大埔" });
  });

  it("兼容深水埗雨量地名有或沒有「區」字尾", () => {
    const result = normalizeWeather(
      parsedRhrread(rhrreadNight),
      "sham-shui-po",
      RETRIEVED_AT,
      new Date(RETRIEVED_AT),
    );

    expect(result.rainfallMm).toMatchObject({
      status: "fresh",
      value: 0,
      place: "深水埗區",
    });
  });

  it("香港整體模式取十八區有效 max 的最高值，氣溫只取香港天文台", () => {
    const value: HkoRhrread = {
      rainfall: {
        data: [
          { place: "中西區", max: 2 },
          { place: "東區", min: 9 },
          { place: "沙田", max: 7 },
        ],
        endTime: "2026-07-14T19:45:00+08:00",
      },
      temperature: {
        data: [
          { place: "沙田", value: 35 },
          { place: "香港天文台", value: 29 },
        ],
        recordTime: "2026-07-14T20:00:00+08:00",
      },
      humidity: {
        data: [
          { place: "沙田", value: 99 },
          { place: "香港天文台", value: 80 },
        ],
        recordTime: "2026-07-14T20:00:00+08:00",
      },
    };

    const result = normalizeWeather(
      value,
      "hong-kong",
      RETRIEVED_AT,
      new Date(RETRIEVED_AT),
    );

    expect(result.rainfallMm).toMatchObject({
      value: 7,
      place: "十八區最高",
    });
    expect(result.temperatureC).toMatchObject({
      value: 29,
      place: "香港天文台",
    });
    expect(result.humidityPercent).toMatchObject({
      value: 80,
      place: "香港天文台",
    });
  });

  it("日間 UV object 使用首項及 recordTime", () => {
    const result = normalizeWeather(
      parsedRhrread(rhrreadDaytimeUv),
      "hong-kong",
      "2026-07-14T12:10:00+08:00",
      new Date("2026-07-14T12:10:00+08:00"),
    );

    expect(result.uvIndex).toMatchObject({
      status: "fresh",
      value: 8,
      place: "京士柏",
      rawPublishedAt: "2026-07-14T12:00:00+08:00",
      publishedAt: "2026-07-14T04:00:00.000Z",
    });
  });

  it("UV object 沒有 recordTime 時才回退至 rhrread updateTime", () => {
    const result = normalizeWeather(
      {
        uvindex: { data: [{ place: "京士柏", value: 5 }] },
        updateTime: "2026-07-14T12:02:00+08:00",
      },
      "hong-kong",
      "2026-07-14T12:10:00+08:00",
      new Date("2026-07-14T12:10:00+08:00"),
    );

    expect(result.uvIndex).toMatchObject({
      status: "fresh",
      value: 5,
      rawPublishedAt: "2026-07-14T12:02:00+08:00",
    });
  });

  it.each([
    "2026-07-14T18:00:00+08:00",
    "2026-07-15T06:59:59+08:00",
  ])("夜間空字串 UV 標示為不適用：%s", (now) => {
    const result = normalizeWeather(
      { uvindex: "", updateTime: now },
      "hong-kong",
      now,
      new Date(now),
    );

    expect(result.uvIndex).toMatchObject({
      status: "notApplicable",
      value: null,
    });
  });

  it.each([
    "2026-07-14T07:00:00+08:00",
    "2026-07-14T17:59:59+08:00",
  ])("日間空字串 UV 標示為缺失：%s", (now) => {
    const result = normalizeWeather(
      { uvindex: "", updateTime: now },
      "hong-kong",
      now,
      new Date(now),
    );

    expect(result.uvIndex).toMatchObject({ status: "missing", value: null });
  });

  it("容許量度缺失而不崩潰，來源標示 unavailable", () => {
    const result = normalizeWeather(
      parsedRhrread(rhrreadMissingFields),
      "central-and-western",
      RETRIEVED_AT,
      new Date(RETRIEVED_AT),
    );

    expect([
      result.rainfallMm.status,
      result.temperatureC.status,
      result.humidityPercent.status,
      result.uvIndex.status,
    ]).toEqual(["missing", "missing", "missing", "missing"]);
    expect(result.source.status).toBe("unavailable");
    expect(result.warningMessages).toEqual([]);
  });

  it("每個量度獨立判斷 freshness，stale 保留觀測值", () => {
    const result = normalizeWeather(
      {
        rainfall: {
          data: [{ place: "沙田", max: 6 }],
          endTime: "2026-07-14T09:00:00+08:00",
        },
        temperature: {
          data: [{ place: "沙田", value: 33 }],
          recordTime: "2026-07-14T09:10:00+08:00",
        },
        humidity: {
          data: [{ place: "香港天文台", value: 91 }],
          recordTime: "2026-07-14T09:20:00+08:00",
        },
        uvindex: {
          data: [{ place: "京士柏", value: 9 }],
          recordTime: "2026-07-14T09:30:00+08:00",
        },
      },
      "sha-tin",
      "2026-07-14T12:00:00+08:00",
      new Date("2026-07-14T12:00:00+08:00"),
    );

    expect(result.rainfallMm).toMatchObject({ status: "stale", value: 6 });
    expect(result.temperatureC).toMatchObject({ status: "stale", value: 33 });
    expect(result.humidityPercent).toMatchObject({ status: "stale", value: 91 });
    expect(result.uvIndex).toMatchObject({ status: "stale", value: 9 });
    expect(result.source.status).toBe("stale");
  });

  it("有值但量度時間無效時標示 malformed 並保留 raw timestamp", () => {
    const result = normalizeWeather(
      {
        temperature: {
          data: [{ place: "香港天文台", value: 30 }],
          recordTime: "不是時間",
        },
      },
      "hong-kong",
      RETRIEVED_AT,
      new Date(RETRIEVED_AT),
    );

    expect(result.temperatureC).toMatchObject({
      status: "malformed",
      value: null,
      publishedAt: null,
      rawPublishedAt: "不是時間",
    });
    expect(result.source.status).toBe("unavailable");
  });

  it("拒絕 Date.parse 會自動捲動的非法 HKO 日曆日期", () => {
    const result = normalizeWeather(
      {
        temperature: {
          data: [{ place: "香港天文台", value: 30 }],
          recordTime: "2026-02-30T12:00:00+08:00",
        },
      },
      "hong-kong",
      "2026-03-02T12:10:00+08:00",
      new Date("2026-03-02T12:10:00+08:00"),
    );

    expect(result.temperatureC).toMatchObject({
      status: "malformed",
      value: null,
      rawPublishedAt: "2026-02-30T12:00:00+08:00",
    });
  });

  it("排除超出語義範圍的觀測數值而不讓它們計分", () => {
    const time = "2026-07-14T20:00:00+08:00";
    const result = normalizeWeather(
      {
        rainfall: {
          data: [{ place: "中西區", max: -1 }],
          endTime: time,
        },
        temperature: {
          data: [{ place: "香港天文台", value: 80 }],
          recordTime: time,
        },
        humidity: {
          data: [{ place: "香港天文台", value: 101 }],
          recordTime: time,
        },
        uvindex: {
          data: [{ place: "京士柏", value: -1 }],
          recordTime: time,
        },
      },
      "central-and-western",
      RETRIEVED_AT,
      new Date(RETRIEVED_AT),
    );

    expect([
      result.rainfallMm.status,
      result.temperatureC.status,
      result.humidityPercent.status,
      result.uvIndex.status,
    ]).toEqual(["malformed", "malformed", "malformed", "malformed"]);
    expect(result.source.status).toBe("unavailable");
    expect(result.source.issues).toHaveLength(4);
  });
});
