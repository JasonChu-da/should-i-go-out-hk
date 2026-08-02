import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("project baseline", () => {
  it("runs the local unit-test harness", () => {
    expect("香港現在適合出門嗎？").toContain("香港");
  });

  it("sets baseline security headers on every route", async () => {
    const entries = await nextConfig.headers?.();
    const global = entries?.find((entry) => entry.source === "/(.*)");
    const headers = Object.fromEntries(
      global?.headers.map(({ key, value }) => [key, value]) ?? [],
    );

    expect(headers).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
    });
  });
});
