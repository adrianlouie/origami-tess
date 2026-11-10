import { describe, expect, it } from "vitest";
import { onSegment, orientation } from "../lattice/direction";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { triangleTwist } from "../gadgets/triangle-twist";
import type { CreasePattern } from "../pattern/crease-pattern";
import { isAbove, layerOrder } from "./layer-order";
import { nearFoldability, stackingCnf } from "./near-foldability";
import { solveClauses } from "./solver";
import {
  facesAbove,
  layeredView,
  stackWithout,
  topFaceAt,
  type LayeredView,
  type ScaledPoint,
} from "./layered-view";
import { foldedOrThrow, spokePattern } from "./testing";

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
