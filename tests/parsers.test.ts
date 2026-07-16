import { describe, expect, it } from "vitest";

import { parseAqhi } from "@/lib/validation/aqhi";
import type {
  ParseResult,
  ParseSuccess,
} from "@/lib/validation/common";
import { parseFlw, parseRhrread, parseWarnsum } from "@/lib/validation/hko";

import aqhiLive from "./fixtures/aqhi-live-sanitized.json";
import aqhiMalformedItems from "./fixtures/aqhi-malformed-items.json";
import aqhiMalformedRoot from "./fixtures/aqhi-malformed-root.json";
import flwLive from "./fixtures/flw-live-sanitized.json";
import rhrreadDaytimeUv from "./fixtures/rhrread-daytime-uv.json";
import rhrreadMalformedItems from "./fixtures/rhrread-malformed-items.json";
import rhrreadMalformedRoot from "./fixtures/rhrread-malformed-root.json";
import rhrreadMissingFields from "./fixtures/rhrread-missing-fields.json";
import rhrreadNight from "./fixtures/rhrread-night-live-sanitized.json";
import warnsumEmpty from "./fixtures/warnsum-empty.json";
import warnsumMonsoon from "./fixtures/warnsum-monsoon-live-sanitized.json";
import warnsumSevere from "./fixtures/warnsum-severe.json";

function expectSuccess<T>(result: ParseResult<T>): ParseSuccess<T> {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`預期 parser 成功：${JSON.stringify(result.issues)}`);
  }
  return result;
}

describe("parseRhrread", () => {
  it("接受實測夜間結構，保留空 uvindex、main 及 raw timestamps", () => {
    const result = expectSuccess(parseRhrread(rhrreadNight));

    expect(result.issues).toEqual([]);
    expect(result.value.uvindex).toBe("");
    expect(result.value.rainfall?.data).toHaveLength(3);
    expect(result.value.rainfall?.data[1]).toMatchObject({
      place: "深水埗區",
      max: 0,
      main: "",
    });
    expect(result.value.rainfall?.data[0]).not.toHaveProperty("min");
    expect(result.value.rainfall?.startTime).toBe(
      "2026-07-14T18:45:00+08:00",
    );
    expect(result.value.temperature?.recordTime).toBe(
      "2026-07-14T20:00:00+08:00",
    );
    expect(result.value.updateTime).toBe("2026-07-14T20:02:00+08:00");
    expect(result.value.warningMessage).toEqual([
      "強烈季候風信號現正生效。",
    ]);
    expect(result.value).not.toHaveProperty("$metadata");
  });

  it("接受日間 uvindex object 及 warningMessage 空字串", () => {
    const result = expectSuccess(parseRhrread(rhrreadDaytimeUv));

    expect(result.issues).toEqual([]);
    expect(result.value.warningMessage).toBe("");
    expect(result.value.uvindex).not.toBe("");
    expect(result.value.uvindex).toBeDefined();
    if (typeof result.value.uvindex === "object") {
      expect(result.value.uvindex.data).toEqual([
        {
          place: "京士柏",
          value: 8,
          desc: "甚高",
          message: "避免長時間在戶外曝曬。",
        },
      ]);
      expect(result.value.uvindex.recordTime).toBe(
        "2026-07-14T12:00:00+08:00",
      );
    }
  });

  it("容許 optional fields 缺失", () => {
    const result = expectSuccess(parseRhrread(rhrreadMissingFields));

    expect(result.issues).toEqual([]);
    expect(result.value.rainfall?.data).toEqual([]);
    expect(result.value.warningMessage).toBe("");
    expect(result.value.temperature).toBeUndefined();
    expect(result.value.updateTime).toBeUndefined();
  });

  it("逐項排除 malformed 雨量、氣溫、濕度、UV 及訊息，不拖垮來源", () => {
    const result = expectSuccess(parseRhrread(rhrreadMalformedItems));

    expect(result.value.rainfall?.data).toEqual([
      { place: "中西區", max: 3, unit: "mm" },
    ]);
    expect(result.value.temperature?.data).toEqual([
      { place: "香港天文台", value: 31, unit: "C" },
    ]);
    expect(result.value.humidity?.data).toEqual([
      { place: "香港天文台", value: 82, unit: "percent" },
    ]);
    expect(result.value.warningMessage).toEqual(["一項可用訊息"]);
    expect(result.value.icon).toEqual([62]);
    expect(result.value.updateTime).toBeUndefined();
    expect(result.issues.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "$.rainfall.data[1]",
        "$.rainfall.data[2].place",
        "$.rainfall.data[3].max",
        "$.temperature.data[1].value",
        "$.temperature.data[2]",
        "$.humidity.data[1].place",
        "$.uvindex.data[1].value",
        "$.uvindex.recordTime",
        "$.warningMessage[1]",
        "$.icon[1]",
        "$.updateTime",
      ]),
    );

    const uvindex = result.value.uvindex;
    expect(uvindex).not.toBe("");
    expect(uvindex).toBeDefined();
    if (typeof uvindex === "object") {
      expect(uvindex.data).toEqual([{ place: "京士柏", value: 7 }]);
      expect(uvindex.recordTime).toBeUndefined();
    }
  });

  it("根節點不是 object 時回傳不可恢復的失敗", () => {
    const result = parseRhrread(rhrreadMalformedRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { path: "$", message: "rhrread 根節點必須是物件" },
    ]);
  });

  it("容許未知欄位但不讓它污染 validated value", () => {
    const result = expectSuccess(
      parseRhrread({
        updateTime: "2026-07-14T20:02:00+08:00",
        aFutureHkoField: { anything: true },
      }),
    );

    expect(result.issues).toEqual([]);
    expect(result.value).toEqual({
      updateTime: "2026-07-14T20:02:00+08:00",
    });
  });
});

describe("parseWarnsum", () => {
  it("接受動態 warning key 及缺少 optional type/expireTime 的實測資料", () => {
    const result = expectSuccess(parseWarnsum(warnsumMonsoon));

    expect(result.issues).toEqual([]);
    expect(Object.keys(result.value)).toEqual(["WMSGNL"]);
    expect(result.value.WMSGNL).toEqual({
      name: "強烈季候風信號",
      code: "WMSGNL",
      actionCode: "ISSUE",
      issueTime: "2026-07-14T18:20:00+08:00",
      updateTime: "2026-07-14T18:20:00+08:00",
    });
    expect(result.value).not.toHaveProperty("$metadata");
  });

  it("把成功空 object 保留為沒有警告，而非來源失敗", () => {
    const result = expectSuccess(parseWarnsum(warnsumEmpty));

    expect(result.value).toEqual({});
    expect(result.issues).toEqual([]);
  });

  it("保留 severe warning code 及所有 raw timestamps", () => {
    const result = expectSuccess(parseWarnsum(warnsumSevere));

    expect(result.issues).toEqual([]);
    expect(result.value.WRAIN?.code).toBe("WRAINB");
    expect(result.value.WTCSGNL?.code).toBe("TC8NE");
    expect(result.value.WTCSGNL?.expireTime).toBe(
      "2026-07-14T18:00:00+08:00",
    );
  });

  it("排除缺少 required strings 的 warning，optional 欄位錯誤只排除該欄", () => {
    const result = expectSuccess(
      parseWarnsum({
        GOOD: {
          name: "可用警告",
          code: "GOOD",
          actionCode: "ISSUE",
          updateTime: 123,
        },
        MISSING_CODE: {
          name: "不完整警告",
          actionCode: "ISSUE",
        },
        NOT_AN_OBJECT: "bad",
      }),
    );

    expect(result.value).toEqual({
      GOOD: { name: "可用警告", code: "GOOD", actionCode: "ISSUE" },
    });
    expect(result.issues.map(({ path }) => path)).toEqual([
      "$.GOOD.updateTime",
      "$.MISSING_CODE.code",
      "$.NOT_AN_OBJECT",
    ]);
    expect(result.issues.map(({ impact }) => impact)).toEqual([
      undefined,
      "item",
      "item",
    ]);
  });

  it("根節點不是 object 時失敗", () => {
    const result = parseWarnsum([]);

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.path).toBe("$");
  });
});

describe("parseFlw", () => {
  it("接受 optional 空字串並原樣保留 updateTime", () => {
    const result = expectSuccess(parseFlw(flwLive));

    expect(result.issues).toEqual([]);
    expect(result.value.tcInfo).toBe("");
    expect(result.value.fireDangerWarning).toBe("");
    expect(result.value.updateTime).toBe("2026-07-14T19:45:00+08:00");
    expect(result.value).not.toHaveProperty("$metadata");
  });

  it("容許所有欄位缺失，並只略過類型錯誤的 optional field", () => {
    expect(expectSuccess(parseFlw({})).value).toEqual({});

    const result = expectSuccess(
      parseFlw({
        generalSituation: "仍可使用的內容",
        updateTime: 123,
        futureField: true,
      }),
    );
    expect(result.value).toEqual({ generalSituation: "仍可使用的內容" });
    expect(result.issues).toEqual([
      { path: "$.updateTime", message: "預期為字串" },
    ]);
  });

  it("根節點不是 object 時失敗", () => {
    expect(parseFlw("not-an-object").ok).toBe(false);
  });
});

describe("parseAqhi", () => {
  it("接受實測 number AQHI 並保留沒有 offset 的 publish_date", () => {
    const result = expectSuccess(parseAqhi(aqhiLive));

    expect(result.issues).toEqual([]);
    expect(result.value).toHaveLength(3);
    expect(result.value[0]).toEqual({
      station: "Central/Western",
      aqhi: 2,
      health_risk: "Low",
      publish_date: "2026-07-14T19:30:00",
    });
  });

  it("接受 1 至 10 的 numeric string 及 10+", () => {
    const result = expectSuccess(
      parseAqhi([
        {
          station: "Central/Western",
          aqhi: "1",
          health_risk: "Low",
          publish_date: "2026-07-14T19:30:00",
        },
        {
          station: "Causeway Bay",
          aqhi: "10+",
          health_risk: "Serious",
          publish_date: "2026-07-14T19:30:00",
        },
      ]),
    );

    expect(result.issues).toEqual([]);
    expect(result.value.map(({ aqhi }) => aqhi)).toEqual(["1", "10+"]);
  });

  it("單列錯誤只排除該列，未知欄位則容許", () => {
    const result = expectSuccess(parseAqhi(aqhiMalformedItems));

    expect(result.value).toEqual([
      {
        station: "Central/Western",
        aqhi: "5",
        health_risk: "Moderate",
        publish_date: "2026-07-14T19:30:00",
      },
      {
        station: "Causeway Bay",
        aqhi: "10+",
        health_risk: "Serious",
        publish_date: "2026-07-14T19:30:00",
      },
    ]);
    expect(result.issues.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "$[1].aqhi",
        "$[2].health_risk",
        "$[3].publish_date",
        "$[4]",
      ]),
    );
  });

  it("拒絕範圍外、非整數及帶空白的 AQHI 表示", () => {
    const rows = [0, 11, 2.5, "0", "11", " 5 "].map((aqhi, index) => ({
      station: `Station ${index}`,
      aqhi,
      health_risk: "Low",
      publish_date: "2026-07-14T19:30:00",
    }));
    const result = expectSuccess(parseAqhi(rows));

    expect(result.value).toEqual([]);
    expect(result.issues.filter(({ path }) => path.endsWith(".aqhi"))).toHaveLength(
      rows.length,
    );
  });

  it("health_risk 使用精確官方 enum", () => {
    const result = expectSuccess(
      parseAqhi([
        {
          station: "Sha Tin",
          aqhi: 5,
          health_risk: "Medium",
          publish_date: "2026-07-14T19:30:00",
        },
      ]),
    );

    expect(result.value).toEqual([]);
    expect(result.issues).toContainEqual({
      path: "$[0].health_risk",
      message: "不是官方 AQHI 健康風險級別",
    });
  });

  it("空 array 是有效的零站點回應", () => {
    const result = expectSuccess(parseAqhi([]));

    expect(result.value).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it("根節點不是 array 時回傳不可恢復的失敗", () => {
    const result = parseAqhi(aqhiMalformedRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { path: "$", message: "AQHI 根節點必須是陣列" },
    ]);
  });
});
