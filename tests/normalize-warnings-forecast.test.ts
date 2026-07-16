import { describe, expect, it } from "vitest";

import { normalizeForecast } from "@/lib/normalization/forecast";
import { normalizeWarnings } from "@/lib/normalization/warnings";
import type { ParseResult, ParseSuccess } from "@/lib/validation/common";
import {
  parseFlw,
  parseWarnsum,
  type HkoLocalForecast,
  type HkoWarningSummary,
} from "@/lib/validation/hko";

import flwLive from "./fixtures/flw-live-sanitized.json";
import warnsumEmpty from "./fixtures/warnsum-empty.json";
import warnsumMonsoon from "./fixtures/warnsum-monsoon-live-sanitized.json";
import warnsumSevere from "./fixtures/warnsum-severe.json";

function expectSuccess<T>(result: ParseResult<T>): ParseSuccess<T> {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("預期 fixture 通過 parser");
  return result;
}

function parsedWarnings(input: unknown): HkoWarningSummary {
  return expectSuccess(parseWarnsum(input)).value;
}

function parsedForecast(input: unknown): HkoLocalForecast {
  return expectSuccess(parseFlw(input)).value;
}

describe("normalizeWarnings", () => {
  const now = new Date("2026-07-14T20:08:00+08:00");
  const retrievedAt = "2026-07-14T20:08:00+08:00";

  it("treats a successful empty snapshot as fresh and confirmed", () => {
    const result = normalizeWarnings(
      parsedWarnings(warnsumEmpty),
      retrievedAt,
      now,
    );

    expect(result.items).toEqual([]);
    expect(result.source.status).toBe("ok");
    expect(result.source.publishedAt).toBe("2026-07-14T12:08:00.000Z");
  });

  it("normalizes a live monsoon signal using its dynamic family key", () => {
    const result = normalizeWarnings(
      parsedWarnings(warnsumMonsoon),
      retrievedAt,
      now,
    );

    expect(result.source.status).toBe("ok");
    expect(result.items).toEqual([
      {
        family: "WMSGNL",
        code: "WMSGNL",
        name: "強烈季候風信號",
        actionCode: "ISSUE",
        type: null,
        issueTime: "2026-07-14T10:20:00.000Z",
        updateTime: "2026-07-14T10:20:00.000Z",
        expireTime: null,
      },
    ]);
  });

  it("retains severe warnings while their expiry is not past", () => {
    const severeNow = new Date("2026-07-14T10:30:00+08:00");
    const result = normalizeWarnings(
      parsedWarnings(warnsumSevere),
      "2026-07-14T10:30:00+08:00",
      severeNow,
    );

    expect(result.items.map(({ family, code }) => ({ family, code }))).toEqual([
      { family: "WRAIN", code: "WRAINB" },
      { family: "WTCSGNL", code: "TC8NE" },
    ]);
    expect(result.source.status).toBe("ok");
  });

  it("retains an unknown warning code and the original dynamic family", () => {
    const result = normalizeWarnings(
      parsedWarnings({
        FUTURE_FAMILY: {
          name: "新增警告",
          code: "WNEW",
          actionCode: "ISSUE",
          updateTime: "2026-07-14T20:00:00+08:00",
        },
      }),
      retrievedAt,
      now,
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        family: "FUTURE_FAMILY",
        code: "WNEW",
        name: "新增警告",
      }),
    ]);
  });

  it("excludes cancelled and already expired warnings", () => {
    const result = normalizeWarnings(
      parsedWarnings({
        CANCELLED: {
          name: "已取消警告",
          code: "WTS",
          actionCode: "CANCEL",
        },
        EXPIRED: {
          name: "已過期警告",
          code: "WRAINA",
          actionCode: "ISSUE",
          expireTime: "2026-07-14T20:07:59+08:00",
        },
      }),
      retrievedAt,
      now,
    );

    expect(result.items).toEqual([]);
    expect(result.source.issues).toContain(
      "警告 EXPIRED 已超過有效時間，已排除此項。",
    );
  });

  it("uses snapshot retrieval time instead of an old warning update time", () => {
    const result = normalizeWarnings(
      parsedWarnings({
        WMSGNL: {
          name: "仍然生效的舊警告",
          code: "WMSGNL",
          actionCode: "ISSUE",
          issueTime: "2026-07-10T08:00:00+08:00",
          updateTime: "2026-07-10T08:00:00+08:00",
        },
      }),
      retrievedAt,
      now,
    );

    expect(result.source.status).toBe("ok");
    expect(result.items).toHaveLength(1);
  });

  it("keeps items for display but marks an old snapshot stale", () => {
    const result = normalizeWarnings(
      parsedWarnings(warnsumMonsoon),
      "2026-07-14T19:37:59+08:00",
      now,
    );

    expect(result.source.status).toBe("stale");
    expect(result.items).toHaveLength(1);
  });
});

describe("normalizeForecast", () => {
  const now = new Date("2026-07-14T20:08:00+08:00");

  it("normalizes the live forecast and preserves supporting text", () => {
    const result = normalizeForecast(
      parsedForecast(flwLive),
      "2026-07-14T20:08:00+08:00",
      now,
    );

    expect(result.description).toMatchObject({
      status: "fresh",
      value: "大致多雲，有幾陣驟雨。",
      publishedAt: "2026-07-14T11:45:00.000Z",
      rawPublishedAt: "2026-07-14T19:45:00+08:00",
    });
    expect(result.forecastPeriod).toBe("本港地區今晚及明日天氣預測");
    expect(result.generalSituation).toContain("廣闊低壓槽");
    expect(result.outlook).toBe("隨後一兩日間中有驟雨。");
    expect(result.source.status).toBe("ok");
  });

  it.each([
    [{ updateTime: "2026-07-14T19:45:00+08:00" }, "missing"],
    [
      {
        forecastDesc: "   ",
        updateTime: "2026-07-14T19:45:00+08:00",
      },
      "missing",
    ],
  ] as const)("marks an absent or blank description %s", (input, status) => {
    const result = normalizeForecast(
      parsedForecast(input),
      "2026-07-14T20:08:00+08:00",
      now,
    );

    expect(result.description.status).toBe(status);
    expect(result.description.value).toBeNull();
    expect(result.source.status).toBe("unavailable");
  });

  it("retains a stale description for display and marks its source stale", () => {
    const result = normalizeForecast(
      parsedForecast({
        forecastDesc: "大致多雲，有幾陣驟雨。",
        updateTime: "2026-07-14T08:07:59+08:00",
      }),
      "2026-07-14T20:08:00+08:00",
      now,
    );

    expect(result.description.status).toBe("stale");
    expect(result.description.value).toBe("大致多雲，有幾陣驟雨。");
    expect(result.source.status).toBe("stale");
  });
});
