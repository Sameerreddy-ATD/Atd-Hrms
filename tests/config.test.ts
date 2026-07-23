import { describe, expect, it } from "vitest";
import { parseTrustProxy } from "../server/src/config.js";

describe("deployment proxy configuration", () => {
  it("uses loopback as the safe single-server default", () => {
    expect(parseTrustProxy()).toBe("loopback");
    expect(parseTrustProxy("  ")).toBe("loopback");
  });

  it("accepts an exact proxy hop count for load-balanced deployments", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy("2")).toBe(2);
  });

  it("supports explicit false and trusted subnet expressions", () => {
    expect(parseTrustProxy("false")).toBe(false);
    expect(parseTrustProxy("loopback, linklocal")).toBe("loopback, linklocal");
  });
});
