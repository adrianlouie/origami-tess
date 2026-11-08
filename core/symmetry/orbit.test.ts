import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { eis, ZERO, type Eisenstein } from "../lattice/eisenstein";
import { hexDistance, triangularGrid } from "../lattice/grid";
import { apply } from "./affine";
import { orbit } from "./orbit";
import { contains, p6m } from "./p6m";
import { randomElement, validPeriod, wordArb } from "./testing";

const key = (z: Eisenstein) => `${z.a},${z.b}`;
const coord = fc.integer({ min: -10, max: 10 });
const point = fc.tuple(coord, coord).map(([a, b]) => eis(a, b));

describe("orbit closed under the group (acceptance test for step 2.2)", () => {
  it("f(x) is in the orbit for every orbit point x and group element f that keeps it in the window", () => {
    fc.assert(
      fc.property(
        validPeriod,
        fc.array(point, { minLength: 1, maxLength: 3 }),
        fc.integer({ min: 0, max: 12 }),
        wordArb,
        (period, motif, radius, word) => {
          const group = p6m(period);
          const points = orbit(group, motif, radius);
          const members = new Set(points.map(key));
          const f = randomElement(group, word);
          expect(contains(group, f)).toBe(true);
          for (const x of points) {
            const y = apply(f, x);
            if (hexDistance(y) <= radius) expect(members.has(key(y))).toBe(true);
          }
        },
      ),
    );
  });
});

describe("orbit", () => {
  it("contains each motif point inside the window", () => {
    fc.assert(
      fc.property(validPeriod, point, fc.integer({ min: 0, max: 12 }), (period, p, radius) => {
        const members = new Set(orbit(p6m(period), [p], radius).map(key));
        expect(members.has(key(p))).toBe(hexDistance(p) <= radius);
      }),
    );
  });

  it("the origin's orbit under period 1 is the whole grid: 3R² + 3R + 1 points", () => {
    for (const r of [0, 1, 4, 7]) {
      const got = orbit(p6m(), [ZERO], r).map(key);
      expect(got).toHaveLength(3 * r * r + 3 * r + 1);
      expect(new Set(got)).toEqual(new Set(triangularGrid(r).vertices.map(key)));
    }
  });

  it("a generic point has 12 images per lattice cell (trivial stabiliser)", () => {
    // (3, 1) lies at 19° from the axis, on none of D6's mirrors (multiples of 30°), so |D6·p| = 12.
    expect(orbit(p6m(eis(100, 0)), [eis(3, 1)], 3)).toHaveLength(12);
  });

  it("has no duplicates and is sorted by a then b", () => {
    const pts = orbit(p6m(eis(2, 0)), [eis(1, 0), eis(0, 1)], 8);
    expect(new Set(pts.map(key)).size).toBe(pts.length);
    const sorted = [...pts].sort((x, y) => x.a - y.a || x.b - y.b);
    expect(pts).toEqual(sorted);
  });

  it("rejects an invalid radius", () => {
    expect(() => orbit(p6m(), [ZERO], -1)).toThrow(RangeError);
    expect(() => orbit(p6m(), [ZERO], 1.5)).toThrow(RangeError);
  });
});
