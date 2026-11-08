import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { eis, mul, ZERO, type Eisenstein } from "../lattice/eisenstein";
import { hexDistance, triangularGrid } from "../lattice/grid";
import { apply, compose, translation } from "./affine";
import { orbit, tile } from "./orbit";
import type { Motif } from "./motif";
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

const edgeKey = (from: Eisenstein, to: Eisenstein) => {
  const [p, q] = (from.a - to.a || from.b - to.b) <= 0 ? [from, to] : [to, from];
  return `${key(p)}|${key(q)}`;
};
const edgeArb = fc.record({ from: point, to: point });
const motifArb: fc.Arbitrary<Motif> = fc.record({
  points: fc.array(point, { maxLength: 2 }),
  edges: fc.array(edgeArb, { maxLength: 2 }),
});

describe("tile", () => {
  it("has the points of orbit(group, motif.points, R)", () => {
    fc.assert(
      fc.property(validPeriod, motifArb, fc.integer({ min: 0, max: 8 }), (period, m, radius) => {
        const group = p6m(period);
        expect(tile(group, m, radius).points).toEqual(orbit(group, m.points, radius));
      }),
    );
  });

  it("is closed under the group: g(e) is a tiled edge whenever both ends stay in the window", () => {
    fc.assert(
      fc.property(
        validPeriod,
        motifArb,
        fc.integer({ min: 0, max: 8 }),
        wordArb,
        (period, m, radius, word) => {
          const group = p6m(period);
          const t = tile(group, m, radius);
          const members = new Set(t.edges.map((e) => edgeKey(e.from, e.to)));
          const f = randomElement(group, word);
          for (const e of t.edges) {
            const p = apply(f, e.from);
            const q = apply(f, e.to);
            if (hexDistance(p) <= radius && hexDistance(q) <= radius) {
              expect(members.has(edgeKey(p, q))).toBe(true);
            }
          }
        },
      ),
    );
  });

  it("matches a brute-force expansion by D6 and explicit translations (completeness)", () => {
    fc.assert(
      fc.property(validPeriod, motifArb, fc.integer({ min: 0, max: 4 }), (period, m, radius) => {
        const group = p6m(period);
        const expected = new Set<string>();
        // Translations up to 40 steps cover every edge of a window of radius <= 4 with motif coordinates <= 10.
        for (let u = -40; u <= 40; u++) {
          for (let v = -40; v <= 40; v++) {
            const lam = mul(period, eis(u, v));
            for (const g of group.pointGroup) {
              const f = compose(translation(lam), g);
              for (const e of m.edges) {
                const p = apply(f, e.from);
                const q = apply(f, e.to);
                if (hexDistance(p) <= radius && hexDistance(q) <= radius) {
                  expected.add(edgeKey(p, q));
                }
              }
            }
          }
        }
        const got = tile(group, m, radius).edges.map((e) => edgeKey(e.from, e.to));
        expect(new Set(got)).toEqual(expected);
      }),
      { numRuns: 20 },
    );
  });

  it("has no duplicate edges, counting {p, q} and {q, p} as one", () => {
    fc.assert(
      fc.property(validPeriod, motifArb, fc.integer({ min: 0, max: 8 }), (period, m, radius) => {
        const keys = tile(p6m(period), m, radius).edges.map((e) => edgeKey(e.from, e.to));
        expect(new Set(keys).size).toBe(keys.length);
      }),
    );
  });

  it("rejects an invalid radius", () => {
    expect(() => tile(p6m(), { points: [], edges: [] }, -1)).toThrow(RangeError);
    expect(() => tile(p6m(), { points: [], edges: [] }, 1.5)).toThrow(RangeError);
  });
});
