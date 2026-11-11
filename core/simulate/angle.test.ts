import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cornerAngleGradient, type Corner } from "./angle";

const CORNER: Corner = { a: 0, b: 1, c: 2 };
const angleOf = (x: Float64Array) => cornerAngleGradient(x, CORNER, new Float64Array(9));

const finite = (lo: number, hi: number) => fc.double({ min: lo, max: hi, noNaN: true });
const point = fc.tuple(finite(-2, 2), finite(-2, 2), finite(-2, 2));

/** Three nodes with both rays at least 0.3 long and the corner at least 0.2 rad from flat. */
const corners = fc
  .tuple(point, point, point)
  .map(([a, b, c]) => Float64Array.from([...a, ...b, ...c]))
  .filter((x) => {
    const u = [x[0]! - x[3]!, x[1]! - x[4]!, x[2]! - x[5]!];
    const w = [x[6]! - x[3]!, x[7]! - x[4]!, x[8]! - x[5]!];
    if (Math.hypot(...u) < 0.3 || Math.hypot(...w) < 0.3) return false;
    const t = angleOf(x);
    return t > 0.2 && t < Math.PI - 0.2;
  });

describe("cornerAngleGradient", () => {
  it("returns the angle between the rays", () => {
    const right = Float64Array.from([1, 0, 0, 0, 0, 0, 0, 1, 0]);
    expect(angleOf(right)).toBeCloseTo(Math.PI / 2, 12);
    const equilateral = Float64Array.from([1, 0, 0, 0, 0, 0, 0.5, Math.sqrt(3) / 2, 0]);
    expect(angleOf(equilateral)).toBeCloseTo(Math.PI / 3, 12);
    const straight = Float64Array.from([1, 0, 0, 0, 0, 0, -1, 0, 0]);
    expect(angleOf(straight)).toBeCloseTo(Math.PI, 12);
  });

  it("matches central differences", () => {
    fc.assert(
      fc.property(corners, (x) => {
        const g = new Float64Array(9);
        cornerAngleGradient(x, CORNER, g);
        const h = 1e-6;
        for (let p = 0; p < 9; p++) {
          const up = Float64Array.from(x);
          const down = Float64Array.from(x);
          up[p] = up[p]! + h;
          down[p] = down[p]! - h;
          expect(g[p]!).toBeCloseTo((angleOf(up) - angleOf(down)) / (2 * h), 5);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("sums to zero, so a translation does not change the angle", () => {
    fc.assert(
      fc.property(corners, (x) => {
        const g = new Float64Array(9);
        cornerAngleGradient(x, CORNER, g);
        for (let d = 0; d < 3; d++)
          expect(Math.abs(g[d]! + g[3 + d]! + g[6 + d]!)).toBeLessThan(1e-12);
      }),
    );
  });

  it("has zero gradient at a flat corner", () => {
    const g = new Float64Array(9).fill(7);
    cornerAngleGradient(Float64Array.from([1, 0, 0, 0, 0, 0, -1, 0, 0]), CORNER, g);
    expect([...g]).toEqual(new Array(9).fill(0));
  });
});
