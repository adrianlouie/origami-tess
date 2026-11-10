import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { onSegment, orientation } from "../lattice/direction";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { triangleTwist } from "../gadgets/triangle-twist";
import { hexagonFrame } from "../gadgets/crease";
import { fromSegments, type CreasePattern } from "../pattern/crease-pattern";
import { localMvClauses } from "./clauses";
import { isAbove, layerOrder, orderFromRelation } from "./layer-order";
import { nearFoldability, stackingCnf } from "./near-foldability";
import { mvSolutions, solveClauses, withMvAssignment } from "./solver";
import {
  facesAbove,
  layeredView,
  stackWithout,
  topFaceAt,
  type LayeredView,
  type ScaledPoint,
} from "./layered-view";
import { eis, ZERO } from "../lattice/eisenstein";
import { arrangement, foldedOrThrow, lineSets, rawTriangleTwist, spokePattern } from "./testing";

function viewOf(cp: CreasePattern): LayeredView {
  const v = layeredView(cp);
  if (v.status === "inconsistent") throw new Error("pattern does not fold consistently");
  return v;
}

/**
 * Sample points inside the paper: the centroid of each folded triangle, and the centroid of each
 * of the three sub-triangles it makes with its own centroid. Scale 9 keeps every one an integer.
 */
function samples(view: LayeredView): ScaledPoint[] {
  const out: ScaledPoint[] = [];
  for (const tris of view.triangles) {
    for (const [p, q, r] of tris) {
      const g = { a: p.a + q.a + r.a, b: p.b + q.b + r.b }; // 3 × centroid
      out.push({ a: 3 * g.a, b: 3 * g.b, d: 9 });
      for (const [u, w] of [
        [p, q],
        [q, r],
        [r, p],
      ] as const) {
        // centroid of (G, u, w) = (G/3 + u + w)/3, in ninths: G + 3u + 3w
        out.push({ a: g.a + 3 * u.a + 3 * w.a, b: g.b + 3 * u.b + 3 * w.b, d: 9 });
      }
    }
  }
  return out;
}

/**
 * Faces of the view that contain `p` in their interior: p lies in a closed triangle of the face but
 * on no edge of its outline (a different route from the winding number used by `topFaceAt`).
 */
function covering(view: LayeredView, p: ScaledPoint): number[] {
  const scale = (z: { a: number; b: number }) => ({ a: z.a * p.d, b: z.b * p.d });
  const q = { a: p.a, b: p.b };
  const out: number[] = [];
  view.triangles.forEach((tris, f) => {
    if (view.dropped.includes(f)) return;
    const ring = view.outlines[f]!.map(scale);
    if (ring.some((v, i) => onSegment(v, ring[(i + 1) % ring.length]!, q))) return;
    const inside = tris.some(([a, b, c]) => {
      const [x, y, z] = [scale(a), scale(b), scale(c)];
      const w = orientation(x, y, z); // negative for a flipped face
      const sides = [orientation(x, y, q), orientation(y, z, q), orientation(z, x, q)];
      return w !== 0 && sides.every((s) => s === w || s === 0);
    });
    if (inside) out.push(f);
  });
  return out;
}

/** The top face by direct comparison under the pairwise relation, or null if nothing covers p. */
function bruteTop(view: LayeredView, p: ScaledPoint): number | null {
  const cover = covering(view, p);
  const tops = cover.filter((f) => cover.every((g) => g === f || isAbove(view, f, g) !== false));
  if (cover.length === 0) return null;
  expect(tops).toHaveLength(1);
  return tops[0]!;
}

describe("layeredView: hexagon twists have no global order but every point has a top face", () => {
  for (const [s, r] of [
    [1, 2],
    [2, 3],
  ] as const) {
    it(`hexagonTwist(${s}, ${r}) is ok, drops nothing, and the ring is cyclic`, () => {
      const cp = hexagonTwist(s, r);
      const view = viewOf(cp);
      expect(view.status).toBe("ok");
      expect(view.dropped).toEqual([]);
      expect(view.conflictCreases).toEqual([]);
      const order = layerOrder(cp);
      expect(order.status === "ok" && order.order).toBeNull(); // the reason masks are needed
      for (const p of samples(view)) {
        const top = topFaceAt(view, p);
        expect(top).not.toBeNull();
        expect(top).toBe(bruteTop(view, p));
      }
    });
  }
});

describe("topFaceAt: a point on an internal diagonal of a face's triangulation is still covered", () => {
  it("hexagonTwist(1, 2): face 0 (a hexagon) covers (2/3, 1/3) and is above the three faces over it", () => {
    const view = viewOf(hexagonTwist(1, 2));
    const p = { a: 6, b: 3, d: 9 };
    // The point lies on a diagonal of face 0's ear-clipping triangulation, so no triangle of the
    // face strictly contains it; only the whole outline does.
    expect(covering(view, p)).toContain(0);
    expect(topFaceAt(view, p)).toBe(0);
  });
});

describe("layeredView: the partial star twist drops its repair faces", () => {
  const cp = starTwist(1, "partial");
  const view = viewOf(cp);

  it("drops {3, 4, 10, 20} and marks the conflict creases of nearFoldability", () => {
    const nf = nearFoldability(cp);
    if (nf.status !== "partial") throw new Error("expected partial");
    expect(view.status).toBe("partial");
    expect(view.dropped).toEqual([3, 4, 10, 20]);
    expect(view.conflictCreases).toEqual(nf.conflict.creases);
  });

  it("stacks the kept faces consistently (satisfiable without the dropped faces)", () => {
    const formula = nearFoldability(cp);
    if (formula.status !== "partial") throw new Error("expected partial");
    expect(stackWithout(formula.formula, view.dropped)).not.toBeNull();
    // with nothing dropped the formula is unsatisfiable: that is why it is partial
    expect(stackWithout(formula.formula, [])).toBeNull();
  });

  it("never reports a dropped face as top or as above anything", () => {
    for (const p of samples(view)) {
      const top = topFaceAt(view, p);
      if (top !== null) expect(view.dropped).not.toContain(top);
      expect(top).toBe(bruteTop(view, p));
    }
    for (let f = 0; f < cp.faces.length; f++) {
      for (const g of facesAbove(view, f)) expect(view.dropped).not.toContain(g);
    }
  });
});

describe("topFaceAt: agrees with the layer order and with brute force", () => {
  const cases: [string, CreasePattern][] = [
    ["triangleTwist(3, 1)", triangleTwist(3, 1)],
    ["starTwist full", starTwist(1, "full")],
    ["single degree-4 vertex", spokePattern([0, 3, 6, 9], ["M", "M", "M", "V"])],
  ];
  for (const [name, cp] of cases) {
    it(`${name}: the top face is the one with nothing above it`, () => {
      const view = viewOf(cp);
      for (const p of samples(view)) expect(topFaceAt(view, p)).toBe(bruteTop(view, p));
    });
  }

  it("single vertex: equals the first covering face of a linear order", () => {
    const cp = spokePattern([0, 3, 6, 9], ["M", "M", "M", "V"]);
    const view = viewOf(cp);
    const order = layerOrder(cp);
    if (order.status !== "ok" || order.order === null) throw new Error("expected a linear order");
    for (const p of samples(view)) {
      const cover = covering(view, p);
      expect(topFaceAt(view, p)).toBe(order.order.find((f) => cover.includes(f)) ?? null);
    }
  });
});

describe("topFaceAt and facesAbove: edge cases", () => {
  const view = viewOf(starTwist(1, "full"));

  it("returns null for a point outside the paper", () => {
    expect(topFaceAt(view, { a: 1000, b: 1000, d: 1 })).toBeNull();
  });

  it("rejects a non-positive or non-integer denominator and non-integer coordinates", () => {
    expect(() => topFaceAt(view, { a: 0, b: 0, d: 0 })).toThrow(RangeError);
    expect(() => topFaceAt(view, { a: 0, b: 0, d: -3 })).toThrow(RangeError);
    expect(() => topFaceAt(view, { a: 0.5, b: 0, d: 1 })).toThrow(RangeError);
  });

  it("facesAbove rejects a bad face index", () => {
    expect(() => facesAbove(view, -1)).toThrow(RangeError);
    expect(() => facesAbove(view, view.triangles.length)).toThrow(RangeError);
  });

  it("an empty drop on a foldable pattern keeps the full model", () => {
    const cp = starTwist(1, "full");
    const nf = nearFoldability(cp);
    if (nf.status !== "ok") throw new Error("expected ok");
    const model = stackWithout(nf.formula, []);
    expect(model).not.toBeNull();
    const cnf = stackingCnf(nf.formula);
    expect(solveClauses(cnf.variableCount, cnf.clauses)).not.toBeNull();
    expect(foldedOrThrow(cp).transforms).toHaveLength(cp.faces.length);
  });
});

/** Views of lattice-line arrangements (foldable or not), the gadgets and an unfoldable twist. */
const POOL_VIEWS: LayeredView[] = (() => {
  const views: LayeredView[] = [];
  const keep = (cp: CreasePattern) => {
    const v = layeredView(cp);
    if (v.status !== "inconsistent") views.push(v);
  };
  [...lineSets(2), ...lineSets(3)].forEach((lines, i) => {
    if (i % 5 !== 0) return;
    const free = fromSegments([], arrangement(lines));
    for (const solution of mvSolutions(localMvClauses(free))) {
      keep(withMvAssignment(free, [...solution]));
      break;
    }
  });
  keep(hexagonTwist(1, 2));
  keep(hexagonTwist(2, 3));
  keep(triangleTwist(3, 1));
  keep(starTwist(1, "full"));
  keep(starTwist(1, "partial"));
  keep(rawTriangleTwist(1, 1));
  return views;
})();

describe("topFaceAt: properties over arrangements and gadgets", () => {
  it("has some views of each status to test", () => {
    expect(POOL_VIEWS.length).toBeGreaterThan(8);
    expect(POOL_VIEWS.some((v) => v.status === "partial")).toBe(true);
    expect(POOL_VIEWS.some((v) => v.status === "ok")).toBe(true);
  });

  it("never throws, and names the face that exact covering plus the relation say is on top", () => {
    const point = fc
      .integer({ min: 1, max: 12 })
      .chain((d) =>
        fc.tuple(
          fc.constant(d),
          fc.integer({ min: -3 * d, max: 3 * d }),
          fc.integer({ min: -3 * d, max: 3 * d }),
        ),
      );
    fc.assert(
      fc.property(fc.integer({ min: 0, max: POOL_VIEWS.length - 1 }), point, (i, [d, a, b]) => {
        const view = POOL_VIEWS[i]!;
        const p = { a, b, d };
        const top = topFaceAt(view, p);
        expect(top).toBe(bruteTop(view, p));
        if (top !== null) expect(view.dropped).not.toContain(top);
      }),
      { numRuns: 600 },
    );
  });

  it("agrees with the global order wherever the view has one", () => {
    const ordered = POOL_VIEWS.filter((v) => v.status === "ok").flatMap((v) => {
      const order = orderOf(v);
      return order === null ? [] : [{ v, order }];
    });
    expect(ordered.length).toBeGreaterThan(0);
    for (const { v, order } of ordered) {
      for (const p of samples(v)) {
        const cover = covering(v, p);
        expect(topFaceAt(v, p)).toBe(order.find((f) => cover.includes(f)) ?? null);
      }
    }
  });
});

/** A linear order of the view's faces from its `above` bits, or null if they contain a cycle. */
function orderOf(view: LayeredView): number[] | null {
  const result = orderFromRelation(
    view.triangles.length,
    view.formula.pairs.map(([i, j], k) => (view.above[k]! ? [i, j] : [j, i]) as [number, number]),
  );
  return "order" in result ? result.order : null;
}

describe("layeredView: a pattern with a single face", () => {
  const cp = fromSegments([], hexagonFrame(1));
  const view = viewOf(cp);

  it("has no overlapping pairs, nothing above the face, and the face on top of its own interior", () => {
    expect(cp.faces).toHaveLength(1);
    expect(view.status).toBe("ok");
    expect(view.formula.variableCount).toBe(0);
    expect(facesAbove(view, 0)).toEqual([]);
    expect(topFaceAt(view, { a: 1, b: 1, d: 3 })).toBe(0);
    expect(topFaceAt(view, { a: 100, b: 0, d: 1 })).toBeNull();
  });
});

describe("layeredView near the exact-integer limit", () => {
  /** Two equilateral triangles of side n sharing one M crease: a rhombus folded in half. */
  const rhombus = (n: number) =>
    fromSegments(
      [],
      [
        { from: ZERO, to: eis(n, 0), assignment: "B" as const },
        { from: eis(n, 0), to: eis(2 * n, n), assignment: "B" as const },
        { from: eis(2 * n, n), to: eis(n, n), assignment: "B" as const },
        { from: eis(n, n), to: ZERO, assignment: "B" as const },
        { from: eis(n, 0), to: eis(n, n), assignment: "M" as const },
      ],
    );

  it("folds a pattern whose products stay below 2^53, and its two faces overlap", () => {
    const view = viewOf(rhombus(2 ** 25));
    expect(view.status).toBe("ok");
    expect(view.formula.pairs).toEqual([[0, 1]]);
  });

  it("throws RangeError rather than rounding when a point scale pushes a product past 2^53", () => {
    const view = viewOf(rhombus(2 ** 25));
    expect(() => topFaceAt(view, { a: 3 * 2 ** 25, b: 2 ** 25, d: 3 })).toThrow(RangeError);
  });

  it("refuses to build a pattern whose coordinates are too large for exact arithmetic", () => {
    expect(() => rhombus(2 ** 26)).toThrow(RangeError);
  });
});
