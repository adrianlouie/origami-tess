import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  ONE,
  ZERO,
  eis,
  equals,
  neg,
  norm,
  rot60,
  sub,
  type Eisenstein,
} from "./eisenstein";
import { hexDistance, triangularGrid } from "./grid";

/** Radii kept small enough that the O(R²) grid builds quickly under fast-check. */
const radius = fc.integer({ min: 0, max: 30 });
const coord = fc.integer({ min: -1_000, max: 1_000 });
const eisenstein = fc.tuple(coord, coord).map(([a, b]) => eis(a, b));

const key = (z: Eisenstein) => `${z.a},${z.b}`;
/** Order-independent key for an undirected edge. */
const edgeKey = (p: Eisenstein, q: Eisenstein) => {
  const [k1, k2] = [key(p), key(q)].sort();
  return `${k1}|${k2}`;
};

describe("triangularGrid edge count (acceptance test for step 1.2)", () => {
  it("has 9R² + 3R edges (3F + 6R = 2E with F = 6R² triangles)", () => {
    fc.assert(
      fc.property(radius, (r) => triangularGrid(r).edges.length === 9 * r * r + 3 * r),
    );
  });

  it("matches the known counts for R = 0, 1, 2, 3", () => {
    expect([0, 1, 2, 3].map((r) => triangularGrid(r).edges.length)).toEqual([0, 12, 42, 90]);
  });
});

describe("triangularGrid vertices", () => {
  it("has 3R² + 3R + 1 vertices (centred hexagonal number)", () => {
    fc.assert(
      fc.property(
        radius,
        (r) => triangularGrid(r).vertices.length === 3 * r * r + 3 * r + 1,
      ),
    );
  });

  it("has no duplicate vertices and all lie within hex distance R", () => {
    fc.assert(
      fc.property(radius, (r) => {
        const { vertices } = triangularGrid(r);
        return (
          new Set(vertices.map(key)).size === vertices.length &&
          vertices.every((v) => hexDistance(v) <= r)
        );
      }),
    );
  });

  it("is invariant under rot60 (the hexagon has 6-fold symmetry)", () => {
    fc.assert(
      fc.property(radius, (r) => {
        const { vertices } = triangularGrid(r);
        const keys = new Set(vertices.map(key));
        return vertices.every((v) => keys.has(key(rot60(v))));
      }),
    );
  });
});

describe("triangularGrid edges", () => {
  it("has unit-length edges with both ends inside the grid", () => {
    fc.assert(
      fc.property(radius, (r) => {
        const { edges, vertices } = triangularGrid(r);
        const keys = new Set(vertices.map(key));
        return edges.every(
          (e) =>
            norm(sub(e.to, e.from)) === 1 && keys.has(key(e.from)) && keys.has(key(e.to)),
        );
      }),
    );
  });

  it("lists each undirected edge exactly once", () => {
    fc.assert(
      fc.property(radius, (r) => {
        const { edges } = triangularGrid(r);
        return new Set(edges.map((e) => edgeKey(e.from, e.to))).size === edges.length;
      }),
    );
  });

  it("gives interior vertices degree 6 and the six corners degree 3", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (r) => {
        const { vertices, edges } = triangularGrid(r);
        const degree = new Map<string, number>();
        for (const e of edges) {
          for (const p of [e.from, e.to]) degree.set(key(p), (degree.get(key(p)) ?? 0) + 1);
        }
        const corners: Eisenstein[] = [];
        let c = eis(r, 0);
        for (let i = 0; i < 6; i++) {
          corners.push(c);
          c = rot60(c);
        }
        const cornerKeys = new Set(corners.map(key));
        return vertices.every((v) => {
          const d = degree.get(key(v)) ?? 0;
          if (cornerKeys.has(key(v))) return d === 3;
          if (hexDistance(v) < r) return d === 6;
          return d === 4; // non-corner boundary vertex
        });
      }),
    );
  });
});

describe("hexDistance d(a + bω) = max(|a|, |b|, |a − b|)", () => {
  it("is zero only at the origin", () => {
    fc.assert(
      fc.property(
        eisenstein,
        (z) => hexDistance(z) >= 0 && (hexDistance(z) === 0) === equals(z, ZERO),
      ),
    );
  });

  it("is invariant under rot60 and negation", () => {
    fc.assert(
      fc.property(
        eisenstein,
        (z) => hexDistance(rot60(z)) === hexDistance(z) && hexDistance(neg(z)) === hexDistance(z),
      ),
    );
  });

  it("equals 1 on the six unit vectors", () => {
    let z = ONE;
    for (let i = 0; i < 6; i++) {
      expect(hexDistance(z)).toBe(1);
      z = rot60(z);
    }
  });

  it("is subadditive-compatible with unit steps: neighbours differ by at most 1", () => {
    fc.assert(
      fc.property(eisenstein, (z) => {
        let u = ONE;
        for (let i = 0; i < 6; i++) {
          const w = eis(z.a + u.a, z.b + u.b);
          if (Math.abs(hexDistance(w) - hexDistance(z)) > 1) return false;
          u = rot60(u);
        }
        return true;
      }),
    );
  });
});

describe("triangularGrid argument validation", () => {
  it("rejects negative, non-integer and NaN radii", () => {
    expect(() => triangularGrid(-1)).toThrow(RangeError);
    expect(() => triangularGrid(1.5)).toThrow(RangeError);
    expect(() => triangularGrid(NaN)).toThrow(RangeError);
  });
});

describe("hexDistance agrees with graph distance", () => {
  it("equals the breadth-first shortest path from the origin on the R = 6 grid", () => {
    const grid = triangularGrid(6);
    const k = (z: Eisenstein) => `${z.a},${z.b}`;
    const adj = new Map<string, Eisenstein[]>();
    for (const v of grid.vertices) adj.set(k(v), []);
    for (const e of grid.edges) {
      adj.get(k(e.from))!.push(e.to);
      adj.get(k(e.to))!.push(e.from);
    }
    const dist = new Map<string, number>([[k(eis(0, 0)), 0]]);
    const queue: Eisenstein[] = [eis(0, 0)];
    for (const z of queue) {
      for (const n of adj.get(k(z))!) {
        if (!dist.has(k(n))) {
          dist.set(k(n), dist.get(k(z))! + 1);
          queue.push(n);
        }
      }
    }
    for (const v of grid.vertices) expect(hexDistance(v)).toBe(dist.get(k(v)));
  });
});
