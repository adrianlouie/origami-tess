import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { triangleTwist } from "../gadgets/triangle-twist";
import { faceDoubledArea, fromSegments, type CreasePattern } from "../pattern/crease-pattern";
import { faceAdjacency } from "../pattern/faces";
import { boundaryDepth, conflictLocality } from "./locality";
import { nearFoldability } from "./near-foldability";
import { arrangement, lineSets, rawTriangleTwist } from "./testing";

function partial(cp: CreasePattern) {
  const r = nearFoldability(cp);
  if (r.status !== "partial") throw new Error(`expected partial, got ${r.status}`);
  return r;
}

/** Independent reference: Floyd–Warshall hops to the nearest face that has an outline crease. */
function referenceDepth(cp: CreasePattern): number[] {
  const n = cp.faces.length;
  const dist = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)),
  );
  const shared = new Map<number, number>();
  for (const { left, right } of faceAdjacency(cp)) {
    dist[left]![right] = 1;
    dist[right]![left] = 1;
    shared.set(left, (shared.get(left) ?? 0) + 1);
    shared.set(right, (shared.get(right) ?? 0) + 1);
  }
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) dist[i]![j] = Math.min(dist[i]![j]!, dist[i]![k]! + dist[k]![j]!);
  const outline = cp.faces.map((w, f) => (shared.get(f) ?? 0) < w.length);
  return cp.faces.map((_, f) =>
    Math.min(...cp.faces.map((__, g) => (outline[g] ? dist[f]![g]! : Infinity))),
  );
}

/** Independent reference: union-find components of a face set over shared creases. */
function referenceClusters(cp: CreasePattern, set: readonly number[]): number {
  const parent = new Map(set.map((f) => [f, f]));
  const find = (x: number): number => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const { left, right } of faceAdjacency(cp)) {
    if (parent.has(left) && parent.has(right)) parent.set(find(left), find(right));
  }
  return new Set(set.map(find)).size;
}

const star = starTwist(1, "partial");
const triangle = rawTriangleTwist(1, 2);
const gadgets: [string, CreasePattern][] = [
  ["star", star],
  ["unfoldable triangle", triangle],
  ["hexagon", hexagonTwist(1, 2)],
  ["triangle", triangleTwist(3, 1)],
  ["lines", fromSegments([], arrangement(lineSets(3)[10]!))],
];

describe("conflict locality (acceptance, step 5.2e)", () => {
  it("places the star twist's repair faces one hop inside the outline, in four separate pieces", () => {
    const r = partial(star);
    expect(r.repair.faces).toEqual([3, 4, 10, 20]);
    expect(conflictLocality(star, r.repair.faces)).toEqual({
      size: 4,
      maxDepth: 1,
      meanDepth: { num: 4, den: 4 },
      clusters: 4,
      area: { num: 4, den: 54 },
      atEdge: false,
    });
  });

  it("places the star twist's minimal conflict in one piece reaching two hops in", () => {
    const r = partial(star);
    expect(conflictLocality(star, r.conflict.faces)).toEqual({
      size: 5,
      maxDepth: 2,
      meanDepth: { num: 7, den: 9 },
      clusters: 1,
      area: { num: 9, den: 54 },
      atEdge: false,
    });
  });

  it("reports the unfoldable triangle twist's repair against the same reference", () => {
    const r = partial(triangle);
    const loc = conflictLocality(triangle, r.repair.faces);
    const depth = referenceDepth(triangle);
    expect(loc.maxDepth).toBe(Math.max(...r.repair.faces.map((f) => depth[f]!)));
    expect(loc.clusters).toBe(referenceClusters(triangle, r.repair.faces));
  });
});

describe("boundaryDepth (BFS shortest paths, CLRS §22.2)", () => {
  it.each(gadgets)("equals the Floyd–Warshall reference on the %s", (_, cp) => {
    expect(boundaryDepth(cp)).toEqual(referenceDepth(cp));
  });

  it.each(gadgets)(
    "is 0 exactly on faces with a crease that has no face beyond it (%s)",
    (_, cp) => {
      const shared = cp.faces.map(() => 0);
      for (const { left, right } of faceAdjacency(cp)) {
        shared[left]!++;
        shared[right]!++;
      }
      boundaryDepth(cp).forEach((d, f) => {
        expect(d === 0).toBe(shared[f]! < cp.faces[f]!.length);
      });
    },
  );

  it.each(gadgets)("changes by at most 1 across a crease and is finite (%s)", (_, cp) => {
    const depth = boundaryDepth(cp);
    for (const { left, right } of faceAdjacency(cp)) {
      expect(Math.abs(depth[left]! - depth[right]!)).toBeLessThanOrEqual(1);
    }
    expect(depth.every(Number.isFinite)).toBe(true);
  });

  it("does not need a B frame: outline faces of a frame-less pattern still have depth 0", () => {
    const framed = fromSegments([], arrangement([{ dir: 0, offset: 0 }]));
    const bare = fromSegments(
      [],
      arrangement([{ dir: 0, offset: 0 }]).map((c) => ({ ...c, assignment: "U" as const })),
    );
    expect(boundaryDepth(bare)).toEqual(boundaryDepth(framed));
    expect(Math.min(...boundaryDepth(bare))).toBe(0);
  });
});

describe("conflictLocality", () => {
  it.each(gadgets)(
    "matches the union-find and area references on random face sets (%s)",
    (_, cp) => {
      const area = cp.faces.map((f) => faceDoubledArea(cp.vertices, f));
      const total = area.reduce((a, b) => a + b, 0);
      const depth = referenceDepth(cp);
      fc.assert(
        fc.property(fc.uniqueArray(fc.nat(cp.faces.length - 1), { maxLength: 8 }), (set) => {
          const loc = conflictLocality(cp, set);
          const setArea = set.reduce((s, f) => s + area[f]!, 0);
          expect(loc.size).toBe(set.length);
          expect(loc.clusters).toBe(referenceClusters(cp, set));
          expect(loc.area).toEqual({ num: setArea, den: total });
          expect(loc.maxDepth).toBe(Math.max(0, ...set.map((f) => depth[f]!)));
          expect(loc.atEdge).toBe(loc.maxDepth === 0);
          if (set.length > 0) {
            expect(loc.meanDepth).toEqual({
              num: set.reduce((s, f) => s + area[f]! * depth[f]!, 0),
              den: setArea,
            });
          }
        }),
        { numRuns: 60 },
      );
    },
  );

  it("does not depend on the order of the faces or on duplicates", () => {
    fc.assert(
      fc.property(fc.array(fc.nat(star.faces.length - 1), { maxLength: 10 }), (set) => {
        expect(conflictLocality(star, [...set].reverse().concat(set))).toEqual(
          conflictLocality(star, [...new Set(set)]),
        );
      }),
      { numRuns: 60 },
    );
  });

  it("gives an empty set depth 0, no clusters and no area", () => {
    expect(conflictLocality(star, [])).toEqual({
      size: 0,
      maxDepth: 0,
      meanDepth: { num: 0, den: 1 },
      clusters: 0,
      area: { num: 0, den: 54 },
      atEdge: true,
    });
  });

  it("gives one face its own depth and a single cluster", () => {
    const depth = boundaryDepth(star);
    const f = depth.indexOf(2);
    const loc = conflictLocality(star, [f]);
    expect(loc.maxDepth).toBe(2);
    expect(loc.clusters).toBe(1);
    expect(loc.atEdge).toBe(false);
  });

  it("gives every face as one cluster covering all the paper", () => {
    const all = star.faces.map((_, f) => f);
    const loc = conflictLocality(star, all);
    expect(loc.clusters).toBe(1);
    expect(loc.area).toEqual({ num: 54, den: 54 });
    expect(loc.maxDepth).toBe(Math.max(...boundaryDepth(star)));
  });

  it("rejects an index that is not a face", () => {
    expect(() => conflictLocality(star, [star.faces.length])).toThrow(RangeError);
    expect(() => conflictLocality(star, [-1])).toThrow(RangeError);
    expect(() => conflictLocality(star, [1.5])).toThrow(RangeError);
  });
});
