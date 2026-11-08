import { describe, expect, it } from "vitest";
import fc from "fast-check";

describe("toolchain smoke test", () => {
  it("runs a unit test", () => {
    expect(1 + 1).toBe(2);
  });

  it("runs a property-based test", () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a));
  });
});
