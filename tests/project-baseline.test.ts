import { describe, expect, it } from "vitest";

describe("project baseline", () => {
  it("runs the local unit-test harness", () => {
    expect("香港現在適合出門嗎？").toContain("香港");
  });
});
