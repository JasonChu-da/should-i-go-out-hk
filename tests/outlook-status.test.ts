import { describe, expect, it } from "vitest";
import { classifyOverallStatus } from "@/lib/outlook/status";
import type { SourceMeta } from "@/lib/domain/outlook";

function source(
  status: SourceMeta["status"],
  issues: string[] = [],
  id: SourceMeta["id"] = "weather",
): SourceMeta {
  return {
    id,
    label: "測試來源",
    url: "https://example.test",
    status,
    retrievedAt: "2026-07-14T12:00:00.000Z",
    publishedAt: null,
    rawPublishedAt: null,
    issues,
  };
}

describe("classifyOverallStatus", () => {
  it("returns ok only when every source is usable without validation issues", () => {
    expect(classifyOverallStatus([source("ok"), source("ok")])).toBe("ok");
  });

  it("returns partial when one API is unavailable or partially malformed", () => {
    expect(classifyOverallStatus([source("ok"), source("unavailable")])).toBe("partial");
    expect(classifyOverallStatus([source("ok", ["一個可選欄位格式異常"])])).toBe("partial");
  });

  it("returns error when every API is unavailable or stale", () => {
    expect(classifyOverallStatus([source("unavailable"), source("stale")])).toBe("error");
    expect(classifyOverallStatus([])).toBe("error");
  });

  it("does not let an additive nowcast source hide failure of all core sources", () => {
    expect(
      classifyOverallStatus([
        source("unavailable"),
        source("ok", [], "rainfallNowcast"),
      ]),
    ).toBe("error");
  });
});
