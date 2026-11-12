import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { eis, rot60 } from "../lattice/eisenstein";
import {
  criticalTwistAngle,
  latticeAngle,
  lineAngle,
  piFraction,
  twistRegime,
  type PiFraction,
} from "./twist-limits";

const toDegrees = (a: PiFraction) => (180 * a.num) / a.den;
const degrees = (d: number) => piFraction(d, 180);

describe("criticalTwistAngle (Lang Eq. 3.13: αcrit = 90° − 180°/n)", () => {
  it.each([
    [3, 30],
    [4, 45],
    [5, 54],
    [6, 60],
    [12, 75],
  ])("is %i-gon: %i degrees", (n, deg) => {
    expect(toDegrees(criticalTwistAngle(n))).toBeCloseTo(deg, 10);
  });

  it("is reduced, strictly increasing in n and below 90 degrees", () => {
    let previous = 0;
    for (let n = 3; n <= 60; n++) {
      const a = criticalTwistAngle(n);
      expect(toDegrees(a)).toBeCloseTo(90 - 180 / n, 9);
      expect(toDegrees(a)).toBeGreaterThan(previous);
      expect(toDegrees(a)).toBeLessThan(90);
      previous = toDegrees(a);
    }
  });

  it("rejects n below 3 and non-integer n", () => {
    for (const n of [2, 1, 0, -4, 3.5, Number.NaN]) {
      expect(() => criticalTwistAngle(n)).toThrow(RangeError);
    }
  });
});

describe("twistRegime", () => {
  it("names the three cases of the hexagon and triangle (αcrit = 60° and 30°)", () => {
    expect(twistRegime(6, degrees(60))).toBe("closed-back");
    expect(twistRegime(6, degrees(30))).toBe("open-back");
    expect(twistRegime(3, degrees(60))).toBe("supercritical");
    expect(twistRegime(3, degrees(30))).toBe("closed-back");
  });

  it("gives exactly one regime, consistent with the order on angles", () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 24 }), fc.integer({ min: 1, max: 89 }), (n, deg) => {
        const crit = toDegrees(criticalTwistAngle(n));
        const expected =
          deg < crit - 1e-9 ? "open-back" : deg > crit + 1e-9 ? "supercritical" : "closed-back";
        expect(twistRegime(n, degrees(deg))).toBe(expected);
      }),
    );
  });
});

describe("latticeAngle", () => {
  it("measures multiples of 30° counter-clockwise, exactly", () => {
    let z = eis(1, 0);
    for (let k = 0; k < 6; k++) {
      expect(latticeAngle(eis(1, 0), z)).toEqual(piFraction(k, 3));
      z = rot60(z);
    }
    expect(latticeAngle(eis(1, 0), eis(2, 1))).toEqual(piFraction(1, 6));
    expect(latticeAngle(eis(2, 1), eis(1, 0))).toEqual(piFraction(11, 6));
  });

  it("ignores the length of each direction", () => {
    expect(latticeAngle(eis(3, 0), eis(0, 5))).toEqual(piFraction(2, 3));
  });

  it("throws for a zero direction and for a direction that is not a multiple of 30°", () => {
    expect(() => latticeAngle(eis(0, 0), eis(1, 0))).toThrow(RangeError);
    expect(() => latticeAngle(eis(1, 0), eis(0, 0))).toThrow(RangeError);
    expect(() => latticeAngle(eis(1, 0), eis(2, -1))).toThrow(RangeError);
  });
});

describe("piFraction", () => {
  it("reduces to lowest terms with a positive denominator", () => {
    expect(piFraction(2, 4)).toEqual({ num: 1, den: 2 });
    expect(piFraction(-2, -4)).toEqual({ num: 1, den: 2 });
    expect(piFraction(0, 7)).toEqual({ num: 0, den: 1 });
  });

  it("rejects a zero denominator and non-integers", () => {
    expect(() => piFraction(1, 0)).toThrow(RangeError);
    expect(() => piFraction(0.5, 2)).toThrow(RangeError);
  });
});

describe("lineAngle (the twist angle α between a pleat and a side)", () => {
  it("is the acute angle between lines, whatever the direction of each", () => {
    expect(lineAngle(eis(1, 0), eis(0, 1))).toEqual(piFraction(1, 3));
    expect(lineAngle(eis(1, 0), eis(-1, 0))).toEqual(piFraction(0, 1));
    expect(lineAngle(eis(1, 0), eis(1, 2))).toEqual(piFraction(1, 2));
    expect(lineAngle(eis(1, 0), eis(-1, -1))).toEqual(piFraction(1, 3));
  });

  it("is symmetric, never above 90 degrees, and unchanged by reversing a direction", () => {
    const dirs = Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? eis(1, 0) : eis(2, 1))).map(
      (z, i) => {
        let w = z;
        for (let k = 0; k < Math.floor(i / 2); k++) w = rot60(w);
        return w;
      },
    );
    for (const u of dirs) {
      for (const v of dirs) {
        const a = lineAngle(u, v);
        expect(a).toEqual(lineAngle(v, u));
        expect(a).toEqual(lineAngle(u, eis(-v.a, -v.b)));
        expect(2 * a.num).toBeLessThanOrEqual(a.den);
      }
    }
  });
});
