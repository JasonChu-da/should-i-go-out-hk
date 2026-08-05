import { describe, expect, it } from "vitest";
import nextConfig, { buildContentSecurityPolicy } from "../next.config";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((entry) => {
      const [name, ...sources] = entry.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

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
      "Content-Security-Policy-Report-Only": buildContentSecurityPolicy(),
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
    });
    expect(headers).not.toHaveProperty("Content-Security-Policy");
  });

  it("keeps the production report-only policy narrow and syntactically safe", () => {
    const policy = buildContentSecurityPolicy("production");
    const parsed = directives(policy);

    expect([...parsed]).toEqual([
      ["default-src", ["'self'"]],
      ["script-src", ["'self'", "'unsafe-inline'"]],
      ["style-src", ["'self'", "'unsafe-inline'"]],
      ["img-src", ["'self'"]],
      ["font-src", ["'none'"]],
      ["connect-src", ["'self'"]],
      ["worker-src", ["'self'"]],
      ["manifest-src", ["'self'"]],
      ["object-src", ["'none'"]],
      ["base-uri", ["'none'"]],
      ["frame-ancestors", ["'none'"]],
      ["form-action", ["'none'"]],
      ["media-src", ["'none'"]],
      ["frame-src", ["'none'"]],
    ]);
    expect(policy).not.toMatch(/[\r\n*]/);
    expect(policy).not.toMatch(/report-(?:to|uri)/);
    expect(policy).not.toMatch(/(?:data|blob):|https?:/);
    expect(parsed.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(parsed.get("font-src")).toEqual(["'none'"]);
    expect(parsed.get("object-src")).toEqual(["'none'"]);
    expect(parsed.get("frame-ancestors")).toEqual(["'none'"]);
    expect(parsed.get("base-uri")).toEqual(["'none'"]);
    expect(parsed.get("form-action")).toEqual(["'none'"]);
  });

  it("allows eval only in the development report-only policy", () => {
    expect(
      directives(buildContentSecurityPolicy("development")).get("script-src"),
    ).toContain("'unsafe-eval'");
    expect(
      directives(buildContentSecurityPolicy("development")).get("font-src"),
    ).toEqual(["'self'"]);
    expect(
      directives(buildContentSecurityPolicy("production")).get("script-src"),
    ).not.toContain("'unsafe-eval'");
  });
});
