import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { eis, type Eisenstein } from "../lattice/eisenstein";
import { triangularGrid } from "../lattice/grid";
import { p6m } from "../symmetry/p6m";
import { tile } from "../symmetry/orbit";
import type { Motif } from "../symmetry/motif";
import {
  componentCount,
  creasePattern,
  faceCount,
  faceDoubledArea,
  fromSegments,
  type CreasePattern,
} from "./crease-pattern";

const pt = (a: number, b: number) => eis(a, b);
const seg = (p: Eisenstein, q: Eisenstein) => ({ from: p, to: q });

/** Independent component count: breadth-first search over an adjacency list. */
function bfsComponents(cp: CreasePattern): number {
  const adj: number[][] = cp.vertices.map(() => []);
  for (const e of cp.edges) {
    adj[e.v0]?.push(e.v1);
    adj[e.v1]?.push(e.v0);
  }
  const seen = new Set<number>();
  let count = 0;
  for (let s = 0; s < cp.vertices.length; s++) {
    if (seen.has(s)) continue;
    count++;
    const queue = [s];
    seen.add(s);
    while (queue.length > 0) {
      const u = queue.pop()!;
      for (const w of adj[u] ?? []) {
        if (seen.has(w)) continue;
        seen.add(w);
        queue.push(w);
      }
    }
  }
  return count;
}

/** Euler's formula for a planar graph: V − E + F = 1 + C, with the outer face counted once. */
function expectEuler(cp: CreasePattern): void {
  const c = bfsComponents(cp);
  expect(componentCount(cp)).toBe(c);
  expect(cp.vertices.length - cp.edges.length + faceCount(cp)).toBe(1 + c);
}

const triangle = () =>
  fromSegments([], [seg(pt(0, 0), pt(1, 0)), seg(pt(1, 0), pt(1, 1)), seg(pt(1, 1), pt(0, 0))]);

describe("Euler relation on faces (acceptance test for step 3.1)", () => {
  it("V − E + F = 1 + C for any subgraph of a triangular grid", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4 }),
        fc.array(fc.boolean(), { minLength: 200, maxLength: 200 }),
        fc.array(fc.boolean(), { minLength: 200, maxLength: 200 }),
        (r, keepEdge, keepVertex) => {
          const grid = triangularGrid(r);
          const edges = grid.edges.filter((_, i) => keepEdge[i % 200]);
          const extra = grid.vertices.filter((_, i) => keepVertex[i % 200]);
          expectEuler(fromSegments(extra, edges));
        },
      ),
    );
  });

  it("the full grid of radius R has 6R² bounded faces, all unit triangles", () => {
    for (let r = 0; r <= 5; r++) {
      const grid = triangularGrid(r);
      const cp = fromSegments(grid.vertices, grid.edges);
      expect(faceCount(cp)).toBe(6 * r * r + 1);
      expectEuler(cp);
      for (const f of cp.faces) expect(faceDoubledArea(cp.vertices, f)).toBe(1);
    }
  });

  it("matches the hand-counted small cases", () => {
    expect(faceCount(fromSegments([pt(0, 0)], []))).toBe(1);
    expect(faceCount(fromSegments([], [seg(pt(0, 0), pt(1, 0))]))).toBe(1);
    expect(faceCount(triangle())).toBe(2);
    const two = fromSegments(
      [],
      [
        seg(pt(0, 0), pt(1, 0)),
        seg(pt(1, 0), pt(1, 1)),
        seg(pt(1, 1), pt(0, 0)),
        seg(pt(5, 0), pt(6, 0)),
        seg(pt(6, 0), pt(6, 1)),
        seg(pt(6, 1), pt(5, 0)),
      ],
    );
    expect(componentCount(two)).toBe(2);
    expectEuler(two);
  });

  it("holds for a triangle nested inside a hexagon ring", () => {
    const hex = triangularGrid(3);
    const boundary = hex.edges.filter((e) =>
      [e.from, e.to].every(
        (z) => Math.max(Math.abs(z.a), Math.abs(z.b), Math.abs(z.a - z.b)) === 3,
      ),
    );
    const inner = [seg(pt(0, 0), pt(1, 0)), seg(pt(1, 0), pt(1, 1)), seg(pt(1, 1), pt(0, 0))];
    const cp = fromSegments([], [...boundary, ...inner]);
    expect(componentCount(cp)).toBe(2);
    expectEuler(cp);
    expect(faceCount(cp)).toBe(3);
  });

  it("holds for Phase 2 output: a p6m(2+ω) tiling feeds the crease graph", () => {
    const motif: Motif = { points: [pt(3, 1)], edges: [seg(pt(0, 0), pt(1, 0))] };
    for (let r = 0; r <= 5; r++) {
      const tiling = tile(p6m(eis(2, 1)), motif, r);
      expectEuler(fromSegments(tiling.points, tiling.edges));
    }
  });
});

describe("face walk", () => {
  it("puts every half-edge on exactly one face or on the outer boundary", () => {
    const grid = triangularGrid(3);
    const cp = fromSegments(grid.vertices, grid.edges);
    const counted = cp.faces.reduce((n, f) => n + f.length, 0);
    // bounded faces are triangles; the outer boundary has 6R half-edges
    expect(counted + 6 * 3).toBe(2 * cp.edges.length);
  });

  it("lists bounded faces counter-clockwise (positive doubled area)", () => {
    const grid = triangularGrid(2);
    const cp = fromSegments(grid.vertices, grid.edges);
    for (const f of cp.faces) expect(faceDoubledArea(cp.vertices, f)).toBeGreaterThan(0);
  });

  it("sorts each vertex's edges counter-clockwise", () => {
    const grid = triangularGrid(1);
    const cp = fromSegments(grid.vertices, grid.edges);
    const centre = cp.vertices.findIndex((z) => z.a === 0 && z.b === 0);
    const dirs = (cp.rotation[centre] ?? []).map((ei) => {
      const e = cp.edges[ei]!;
      return cp.vertices[e.v0 === centre ? e.v1 : e.v0];
    });
    expect(dirs).toEqual([pt(1, 0), pt(1, 1), pt(0, 1), pt(-1, 0), pt(-1, -1), pt(0, -1)]);
  });
});

describe("validation", () => {
  const v = [pt(0, 0), pt(2, 0), pt(1, 1), pt(1, -1)];
  it("rejects proper crossings", () => {
    const crossing = [pt(0, 0), pt(2, 2), pt(0, 2), pt(2, 0)];
    expect(() =>
      creasePattern(crossing, [
        { v0: 0, v1: 1 },
        { v0: 2, v1: 3 },
      ]),
    ).toThrow(RangeError);
  });
  it("rejects a vertex lying inside an edge (T-junction)", () => {
    expect(() =>
      creasePattern(
        [pt(0, 0), pt(4, 0), pt(2, 0), pt(2, 1)],
        [
          { v0: 0, v1: 1 },
          { v0: 2, v1: 3 },
        ],
      ),
    ).toThrow(RangeError);
  });
  it("rejects duplicate edges, self-loops, duplicate positions and bad indices", () => {
    expect(() =>
      creasePattern(v, [
        { v0: 0, v1: 1 },
        { v0: 1, v1: 0 },
      ]),
    ).toThrow(RangeError);
    expect(() => creasePattern(v, [{ v0: 1, v1: 1 }])).toThrow(RangeError);
    expect(() => creasePattern([pt(0, 0), pt(0, 0)], [])).toThrow(RangeError);
    expect(() => creasePattern(v, [{ v0: 0, v1: 9 }])).toThrow(RangeError);
    expect(() => creasePattern(v, [{ v0: 0, v1: 1.5 }])).toThrow(RangeError);
  });
  it("throws RangeError instead of misjudging when coordinates are too large", () => {
    const big = 2 ** 27;
    expect(() =>
      creasePattern(
        [pt(0, 0), pt(big, -big), pt(big, big), pt(-big, 0)],
        [
          { v0: 0, v1: 1 },
          { v0: 2, v1: 3 },
        ],
      ),
    ).toThrow(RangeError);
  });
});

describe("construction", () => {
  it("defaults every assignment to U and keeps a given one", () => {
    const cp = fromSegments([], [seg(pt(0, 0), pt(1, 0))]);
    expect(cp.edges[0]?.assignment).toBe("U");
    expect(fromSegments([], [seg(pt(0, 0), pt(1, 0))], "M").edges[0]?.assignment).toBe("M");
  });
  it("merges repeated positions and undirected duplicate segments", () => {
    const cp = fromSegments(
      [pt(0, 0), pt(0, 0)],
      [seg(pt(0, 0), pt(1, 0)), seg(pt(1, 0), pt(0, 0))],
    );
    expect(cp.vertices).toHaveLength(2);
    expect(cp.edges).toHaveLength(1);
  });
  it("is deeply frozen", () => {
    const cp = triangle();
    expect(Object.isFrozen(cp)).toBe(true);
    expect(Object.isFrozen(cp.vertices)).toBe(true);
    expect(Object.isFrozen(cp.edges)).toBe(true);
    expect(Object.isFrozen(cp.edges[0])).toBe(true);
    expect(Object.isFrozen(cp.faces)).toBe(true);
    expect(Object.isFrozen(cp.faces[0])).toBe(true);
    expect(Object.isFrozen(cp.rotation[0])).toBe(true);
  });
});
