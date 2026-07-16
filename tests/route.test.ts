import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISTRICTS, HONG_KONG_WIDE } from "@/lib/location/districts";

const { buildOutlookPayload } = vi.hoisted(() => ({
  buildOutlookPayload: vi.fn(async (locationId: string) => ({
    status: "ok",
    generatedAt: "2026-07-14T12:00:00.000Z",
    location: { id: locationId },
  })),
}));

vi.mock("@/lib/outlook/aggregate", () => ({ buildOutlookPayload }));

import { GET } from "@/app/api/outlook/route";

describe("GET /api/outlook", () => {
  beforeEach(() => {
    buildOutlookPayload.mockClear();
  });

  it("defaults an omitted location to Hong Kong-wide mode", async () => {
    const response = await GET(new Request("http://localhost/api/outlook"));

    expect(response.status).toBe(200);
    expect(buildOutlookPayload).toHaveBeenCalledWith(HONG_KONG_WIDE.id);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it.each(DISTRICTS.map((district) => [district.id] as const))(
    "accepts canonical district %s",
    async (districtId) => {
      const response = await GET(
        new Request(`http://localhost/api/outlook?location=${districtId}`),
      );

      expect(response.status).toBe(200);
      expect(buildOutlookPayload).toHaveBeenLastCalledWith(districtId);
    },
  );

  it.each(["", "overall", "central", "../sha-tin"])(
    "rejects invalid location %j without calling upstream aggregation",
    async (location) => {
      const response = await GET(
        new Request(
          `http://localhost/api/outlook?location=${encodeURIComponent(location)}`,
        ),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "地區參數無效。" });
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(buildOutlookPayload).not.toHaveBeenCalled();
    },
  );
});
