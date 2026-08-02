import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DISTRICTS } from "@/lib/location/districts";
import {
  buildRainfallNowcastSnapshot,
  normalizeRainfallNowcast,
} from "@/lib/normalization/rainfall-nowcast";
import {
  CSDI_RAINFALL_NOWCAST_HEADER,
  parseRainfallNowcastCsv,
  RAINFALL_NOWCAST_HEADER,
} from "@/lib/validation/rainfall-nowcast";

const FIXTURE = readFileSync(
  new URL(
    "./fixtures/gridded-rainfall-nowcast-live-sanitized.csv",
    import.meta.url,
  ),
  "utf8",
);
const HEADER = RAINFALL_NOWCAST_HEADER.join(",");
const UPDATE = "202607301712";
const ENDINGS = [
  "202607301742",
  "202607301812",
  "202607301842",
  "202607301912",
] as const;

function csvForPoint(
  rainfall: readonly (number | string)[],
  latitude = 22.2764,
  longitude = 114.1758,
): string {
  return [
    HEADER,
    ...ENDINGS.map(
      (endingAt, index) =>
        `${UPDATE},${endingAt},${latitude},${longitude},${rainfall[index]}`,
    ),
  ].join("\n");
}

function expectParsed(csv: string) {
  const parsed = parseRainfallNowcastCsv(csv);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    throw new Error(JSON.stringify(parsed.issues));
  }
  return parsed;
}

function expectSnapshot(csv: string) {
  const parsed = expectParsed(csv);
  const snapshot = buildRainfallNowcastSnapshot(
    parsed.value,
    parsed.issues,
  );
  expect(snapshot.ok).toBe(true);
  if (!snapshot.ok) {
    throw new Error(JSON.stringify(snapshot.issues));
  }
  return snapshot.value;
}

describe("香港天文台格點降雨 CSV", () => {
  it("解析經實際回應抽取的五欄、香港時間及四段半小時資料", () => {
    const parsed = expectParsed(FIXTURE);

    expect(parsed.value.updatedAt).toBe("2026-07-30T09:12:00.000Z");
    expect(parsed.value.periodEndAts).toEqual([
      "2026-07-30T09:42:00.000Z",
      "2026-07-30T10:12:00.000Z",
      "2026-07-30T10:42:00.000Z",
      "2026-07-30T11:12:00.000Z",
    ]);
    expect(parsed.value.cells).toHaveLength(2);
    expect(parsed.value.cells[0].periodValues).toEqual([
      { status: "valid", value: 0.21 },
      { status: "valid", value: 0.23 },
      { status: "valid", value: 0.25 },
      { status: "valid", value: 0.28 },
    ]);
  });

  it("解析 CSDI 壓縮檔內的十七欄官方格式", () => {
    const rows = FIXTURE.trim()
      .split("\n")
      .slice(1)
      .map((line) => {
        const [updated, ending, latitude, longitude, rainfall] =
          line.split(",");
        return [
          updated.slice(0, 4),
          Number(updated.slice(4, 6)),
          Number(updated.slice(6, 8)),
          Number(updated.slice(8, 10)),
          Number(updated.slice(10, 12)),
          "",
          "UTC+8",
          ending.slice(0, 4),
          Number(ending.slice(4, 6)),
          Number(ending.slice(6, 8)),
          Number(ending.slice(8, 10)),
          Number(ending.slice(10, 12)),
          "",
          "UTC+8",
          latitude,
          longitude,
          rainfall,
        ].join(",");
      });
    const parsed = expectParsed(
      [CSDI_RAINFALL_NOWCAST_HEADER.join(","), ...rows].join("\n"),
    );

    expect(parsed.value.updatedAt).toBe("2026-07-30T09:12:00.000Z");
    expect(parsed.value.cells).toHaveLength(2);
    expect(parsed.value.cells[0].periodValues[0]).toEqual({
      status: "valid",
      value: 0.21,
    });

    const latestObservedOrder = [
      9, 8, 7, 10, 11, 12, 13, 16, 14, 15, 2, 1, 0, 3, 4, 5, 6,
    ];
    const reorder = (line: string) => {
      const fields = line.split(",");
      return latestObservedOrder.map((index) => fields[index]).join(",");
    };
    const reordered = expectParsed(
      [
        reorder(CSDI_RAINFALL_NOWCAST_HEADER.join(",")),
        ...rows.map(reorder),
      ].join("\n"),
    );
    expect(reordered.value).toEqual(parsed.value);
  });

  it("只保留十八區各一個代表格點及全港四段衍生值", () => {
    const snapshot = expectSnapshot(FIXTURE);

    expect(Object.keys(snapshot.byDistrict)).toHaveLength(18);
    for (const district of DISTRICTS) {
      const selected = snapshot.byDistrict[district.id];
      expect(selected.periods).toHaveLength(4);
      expect(
        new Set(
          selected.periods.map(
            () => `${selected.gridLatitude},${selected.gridLongitude}`,
          ),
        ).size,
      ).toBe(1);
    }
    expect(
      snapshot.hongKongWide.periods.map((period) => period.rainfallMm),
    ).toEqual([0.21, 0.23, 0.25, 0.28]);
  });

  it("同距格點依緯度、經度升序作決定性選擇", () => {
    const latitude = 22.2764;
    const lowerLongitude = 114.1679875;
    const higherLongitude = 114.1836125;
    const rows = ENDINGS.flatMap((endingAt) => [
      `${UPDATE},${endingAt},${latitude},${higherLongitude},2`,
      `${UPDATE},${endingAt},${latitude},${lowerLongitude},1`,
    ]);
    const snapshot = expectSnapshot([HEADER, ...rows].join("\n"));

    expect(snapshot.byDistrict["wan-chai"]).toMatchObject({
      gridLatitude: latitude,
      gridLongitude: lowerLongitude,
    });
  });

  it("接受 BOM 和欄位首尾空白，但拒絕額外、缺少或重排欄位", () => {
    const spacedHeader = `\uFEFF${RAINFALL_NOWCAST_HEADER.map(
      (field) => ` ${field} `,
    ).join(",")}`;
    expectParsed(
      csvForPoint([0, 0, 0, 0]).replace(HEADER, spacedHeader),
    );

    expect(
      parseRainfallNowcastCsv(
        csvForPoint([0, 0, 0, 0]).replace(HEADER, `${HEADER},Extra`),
      ).ok,
    ).toBe(false);
    expect(
      parseRainfallNowcastCsv(
        csvForPoint([0, 0, 0, 0]).replace(
          HEADER,
          RAINFALL_NOWCAST_HEADER.slice(0, 4).join(","),
        ),
      ).ok,
    ).toBe(false);
    expect(
      parseRainfallNowcastCsv(
        csvForPoint([0, 0, 0, 0]).replace(
          HEADER,
          [
            RAINFALL_NOWCAST_HEADER[1],
            RAINFALL_NOWCAST_HEADER[0],
            ...RAINFALL_NOWCAST_HEADER.slice(2),
          ].join(","),
        ),
      ).ok,
    ).toBe(false);
  });

  it("把混合更新時間、非法時間或座標及缺少必要時段視為致命", () => {
    const valid = csvForPoint([0, 0, 0, 0]);

    expect(
      parseRainfallNowcastCsv(
        valid.replace(
          `${UPDATE},${ENDINGS[3]}`,
          `202607301724,202607301924`,
        ),
      ).ok,
    ).toBe(false);
    expect(
      parseRainfallNowcastCsv(
        valid.replace(UPDATE, "202602301712"),
      ).ok,
    ).toBe(false);
    expect(
      parseRainfallNowcastCsv(valid.replace("22.2764", "north")).ok,
    ).toBe(false);
    expect(
      parseRainfallNowcastCsv(
        `${valid}\n${UPDATE},202607301942,north,114.1758,0`,
      ).ok,
    ).toBe(false);
    expect(
      parseRainfallNowcastCsv(
        valid
          .split("\n")
          .filter((line) => !line.includes(ENDINGS[2]))
          .join("\n"),
      ).ok,
    ).toBe(false);
  });

  it("只讓所選代表格點的非法、缺少或重複雨量拖垮來源", () => {
    const invalidSelected = expectParsed(
      csvForPoint([0, "not-a-number", 0, 0]),
    );
    expect(
      buildRainfallNowcastSnapshot(
        invalidSelected.value,
        invalidSelected.issues,
      ).ok,
    ).toBe(false);

    const rows = DISTRICTS.flatMap((district) =>
      ENDINGS.map(
        (endingAt) =>
          `${UPDATE},${endingAt},${district.center.latitude},${district.center.longitude},0`,
      ),
    );
    rows.push(
      `${UPDATE},${ENDINGS[0]},22.35,114.01,not-a-number`,
      ...ENDINGS.slice(1).map(
        (endingAt) => `${UPDATE},${endingAt},22.35,114.01,0`,
      ),
    );
    const recoverable = expectParsed([HEADER, ...rows].join("\n"));
    const snapshot = buildRainfallNowcastSnapshot(
      recoverable.value,
      recoverable.issues,
    );

    expect(snapshot.ok).toBe(true);
    if (snapshot.ok) {
      expect(snapshot.value.issueCount).toBe(1);
      expect(snapshot.value.issues[0]).toContain("非代表格點雨量無效");
    }
  });
});

describe("降雨臨近預報時間語義", () => {
  it("保留進行中半小時的原始區間和雨量，並計算剩餘 96 分鐘覆蓋", () => {
    const snapshot = expectSnapshot(csvForPoint([0.7, 0, 8, 0]));
    const normalized = normalizeRainfallNowcast(
      snapshot,
      "wan-chai",
      "2026-07-30T09:20:00.000Z",
      new Date("2026-07-30T09:36:00.000Z"),
    );

    expect(normalized.forecast.status).toBe("fresh");
    expect(normalized.forecast.value).toMatchObject({
      remainingCoverageMinutes: 96,
      firstRainWindow: { firstPeriodIndex: 0, lastPeriodIndex: 0 },
      peakRainPeriodIndex: 2,
    });
    expect(normalized.forecast.value?.periods[0]).toEqual({
      periodStartAt: "2026-07-30T09:12:00.000Z",
      periodEndAt: "2026-07-30T09:42:00.000Z",
      rainfallMm: 0.7,
      isPartiallyElapsed: true,
    });
  });

  it("firstRainWindow 只合併第一組連續有雨時段", () => {
    const snapshot = expectSnapshot(csvForPoint([0, 0.7, 0, 1.2]));
    const normalized = normalizeRainfallNowcast(
      snapshot,
      "wan-chai",
      "2026-07-30T09:20:00.000Z",
      new Date("2026-07-30T09:20:00.000Z"),
    );

    expect(normalized.forecast.value?.firstRainWindow).toEqual({
      firstPeriodIndex: 1,
      lastPeriodIndex: 1,
    });
    expect(normalized.forecast.value?.peakRainPeriodIndex).toBe(3);
  });

  it("超過 24 分鐘即標為過期，不把舊資料當作最新", () => {
    const snapshot = expectSnapshot(csvForPoint([1, 1, 1, 1]));
    const boundary = normalizeRainfallNowcast(
      snapshot,
      "wan-chai",
      "2026-07-30T09:36:00.000Z",
      new Date("2026-07-30T09:36:00.000Z"),
    );
    const expired = normalizeRainfallNowcast(
      snapshot,
      "wan-chai",
      "2026-07-30T09:36:01.000Z",
      new Date("2026-07-30T09:36:01.000Z"),
    );

    expect(boundary.forecast.status).toBe("fresh");
    expect(expired.forecast.status).toBe("stale");
    expect(expired.source.status).toBe("stale");
  });
});
