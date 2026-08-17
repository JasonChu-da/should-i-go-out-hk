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
} from "@/lib/validation/rainfall-nowcast";

const FIXTURE = readFileSync(
  new URL(
    "./fixtures/gridded-rainfall-nowcast-live-sanitized.csv",
    import.meta.url,
  ),
  "utf8",
);
const HEADER = CSDI_RAINFALL_NOWCAST_HEADER.join(",");
const LEGACY_HEADER = [
  "Updated Date and Time (in Hong Kong Time)",
  "Ending Date and Time (in Hong Kong Time)",
  "Latitude (degree)",
  "Longitude (degree)",
  "Half-hourly Nowcast Accumulated Rainfall (mm)",
].join(",");
const UPDATE = "202607301712";
const ENDINGS = [
  "202607301742",
  "202607301812",
  "202607301842",
  "202607301912",
] as const;

function timestampFields(timestamp: string): (number | string)[] {
  return [
    timestamp.slice(0, 4),
    Number(timestamp.slice(4, 6)),
    Number(timestamp.slice(6, 8)),
    Number(timestamp.slice(8, 10)),
    Number(timestamp.slice(10, 12)),
    "",
    "UTC+8",
  ];
}

function csdiRow(
  endingAt: string,
  rainfall: number | string,
  latitude: number | string = 22.2764,
  longitude: number | string = 114.1758,
  updatedAt = UPDATE,
): string {
  return [
    ...timestampFields(updatedAt),
    ...timestampFields(endingAt),
    latitude,
    longitude,
    rainfall,
  ].join(",");
}

function csvForPoint(
  rainfall: readonly (number | string)[],
  latitude = 22.2764,
  longitude = 114.1758,
): string {
  return [
    HEADER,
    ...ENDINGS.map((endingAt, index) =>
      csdiRow(
        endingAt,
        rainfall[index],
        latitude,
        longitude,
      ),
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
  it("解析從官方 CSDI ZIP 實際回應抽取的十七欄資料", () => {
    const parsed = expectParsed(FIXTURE);

    expect(parsed.value.updatedAt).toBe("2026-08-11T01:36:00.000Z");
    expect(parsed.value.periodEndAts).toEqual([
      "2026-08-11T02:06:00.000Z",
      "2026-08-11T02:36:00.000Z",
      "2026-08-11T03:06:00.000Z",
      "2026-08-11T03:36:00.000Z",
    ]);
    expect(parsed.value.cells).toHaveLength(2);
    expect(parsed.value.cells[0].periodValues).toEqual([
      { status: "valid", value: 0.02 },
      { status: "valid", value: 0.01 },
      { status: "valid", value: 0 },
      { status: "valid", value: 0 },
    ]);
  });

  it("接受十七個官方欄位的任意順序", () => {
    const canonical = csvForPoint([0.21, 0.23, 0.25, 0.28]);
    const latestObservedOrder = [
      9, 8, 7, 10, 11, 12, 13, 16, 14, 15, 2, 1, 0, 3, 4, 5, 6,
    ];
    const reorder = (line: string) => {
      const fields = line.split(",");
      return latestObservedOrder.map((index) => fields[index]).join(",");
    };
    const reordered = expectParsed(
      canonical.split("\n").map(reorder).join("\n"),
    );

    expect(reordered.value).toEqual(expectParsed(canonical).value);
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
    ).toEqual([0.02, 0.02, 0, 0]);
  });

  it("同距格點依緯度、經度升序作決定性選擇", () => {
    const latitude = 22.2764;
    const lowerLongitude = 114.1679875;
    const higherLongitude = 114.1836125;
    const rows = ENDINGS.flatMap((endingAt) => [
      csdiRow(endingAt, 2, latitude, higherLongitude),
      csdiRow(endingAt, 1, latitude, lowerLongitude),
    ]);
    const snapshot = expectSnapshot([HEADER, ...rows].join("\n"));

    expect(snapshot.byDistrict["wan-chai"]).toMatchObject({
      gridLatitude: latitude,
      gridLongitude: lowerLongitude,
    });
  });

  it("接受 BOM 及欄位首尾空白", () => {
    const spacedHeader = `\uFEFF${CSDI_RAINFALL_NOWCAST_HEADER.map(
      (field) => ` ${field} `,
    ).join(",")}`;
    const spacedRows = csvForPoint([0, 0, 0, 0])
      .split("\n")
      .slice(1)
      .map((line) =>
        line
          .split(",")
          .map((field) => ` ${field} `)
          .join(","),
      );

    expectParsed([spacedHeader, ...spacedRows].join("\n"));
  });

  it("拒絕舊五欄、缺欄、額外欄、重複欄及非十七欄資料列", () => {
    const valid = csvForPoint([0, 0, 0, 0]);
    const firstRow = valid.split("\n")[1].split(",");

    const legacy = parseRainfallNowcastCsv(
      `${LEGACY_HEADER}\n${UPDATE},${ENDINGS[0]},22.2764,114.1758,0`,
    );
    expect(legacy).toMatchObject({
      ok: false,
      issues: [{ path: "$.header" }],
    });

    expect(
      parseRainfallNowcastCsv(
        valid.replace(HEADER, `${HEADER},Extra`),
      ).ok,
    ).toBe(false);
    expect(
      parseRainfallNowcastCsv(
        valid.replace(
          HEADER,
          CSDI_RAINFALL_NOWCAST_HEADER.slice(0, -1).join(","),
        ),
      ).ok,
    ).toBe(false);
    expect(
      parseRainfallNowcastCsv(
        valid.replace(
          HEADER,
          [
            ...CSDI_RAINFALL_NOWCAST_HEADER.slice(0, -1),
            CSDI_RAINFALL_NOWCAST_HEADER[0],
          ].join(","),
        ),
      ).ok,
    ).toBe(false);
    expect(
      parseRainfallNowcastCsv(
        [HEADER, firstRow.slice(0, -1).join(",")].join("\n"),
      ).ok,
    ).toBe(false);
    expect(
      parseRainfallNowcastCsv(
        [HEADER, [...firstRow, "Extra"].join(",")].join("\n"),
      ).ok,
    ).toBe(false);
  });

  it("把混合更新時間、非法時間或座標及缺少必要時段視為致命", () => {
    const valid = csvForPoint([0, 0, 0, 0]);

    const mixedUpdate = valid.split("\n");
    mixedUpdate[4] = csdiRow(
      "202607301924",
      0,
      22.2764,
      114.1758,
      "202607301724",
    );
    expect(parseRainfallNowcastCsv(mixedUpdate.join("\n")).ok).toBe(
      false,
    );
    expect(
      parseRainfallNowcastCsv(
        valid.replace("2026,7,30,17,12", "2026,2,30,17,12"),
      ).ok,
    ).toBe(false);
    expect(parseRainfallNowcastCsv(valid.replace("UTC+8", "UTC+9")).ok).toBe(
      false,
    );
    expect(
      parseRainfallNowcastCsv(valid.replace("22.2764", "north")).ok,
    ).toBe(false);
    expect(
      parseRainfallNowcastCsv(valid.replace("22.2764", "")).ok,
    ).toBe(false);
    expect(
      parseRainfallNowcastCsv(
        `${valid}\n${csdiRow("202607301942", 0, "north")}`,
      ).ok,
    ).toBe(false);
    expect(
      parseRainfallNowcastCsv(
        valid
          .split("\n")
          .filter((_line, index) => index !== 3)
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

    const nonDecimalSelected = expectParsed(
      csvForPoint(["0x10", 0, 0, 0]),
    );
    expect(
      buildRainfallNowcastSnapshot(
        nonDecimalSelected.value,
        nonDecimalSelected.issues,
      ).ok,
    ).toBe(false);

    const rows = DISTRICTS.flatMap((district) =>
      ENDINGS.map((endingAt) =>
        csdiRow(
          endingAt,
          0,
          district.center.latitude,
          district.center.longitude,
        ),
      ),
    );
    rows.push(
      csdiRow(ENDINGS[0], "not-a-number", 22.35, 114.01),
      ...ENDINGS.slice(1).map(
        (endingAt) => csdiRow(endingAt, 0, 22.35, 114.01),
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

  it("超界半小時雨量只令 nowcast 來源降級", () => {
    const snapshot = expectSnapshot(csvForPoint([250.01, 0, 0, 0]));
    const normalized = normalizeRainfallNowcast(
      snapshot,
      "wan-chai",
      "2026-07-30T09:20:00.000Z",
      new Date("2026-07-30T09:20:00.000Z"),
    );

    expect(normalized.forecast).toMatchObject({
      status: "malformed",
      value: null,
    });
    expect(normalized.source.status).toBe("unavailable");
  });
});
