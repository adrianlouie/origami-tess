import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { triangleTwist } from "../gadgets/triangle-twist";
import { subsetsOf, spokePattern } from "../solve/testing";
import { faceAdjacency } from "./faces";
import type { CreasePattern } from "./crease-pattern";

/** Faces whose walk uses the directed pair u → v, found by scanning every walk. */
function facesUsing(cp: CreasePattern, u: number, v: number): number[] {
  const out: number[] = [];
  cp.faces.forEach((walk, f) => {
    for (let i = 0; i < walk.length; i++) {
      if (walk[i] === u && walk[(i + 1) % walk.length] === v) out.push(f);
    }
  });
  return out;
}

const patterns: [string, CreasePattern][] = [
  ["hexagon twist", hexagonTwist(2, 4)],
  ["triangle twist", triangleTwist(2, 1)],
  ["star twist", starTwist(1)],
  ["two opposite spokes", spokePattern([0, 6], "M")],
  ["four spokes", spokePattern([0, 4, 6, 8], "M")],
];

describe("faceAdjacency", () => {
  it.each(patterns)("matches a brute-force scan of the face walks (%s)", (_, cp) => {
    const adj = faceAdjacency(cp);
    const byEdge = new Map(adj.map((a) => [a.edge, a]));
    cp.edges.forEach((e, edge) => {
      const left = facesUsing(cp, e.v0, e.v1);
      const right = facesUsing(cp, e.v1, e.v0);
      const found = byEdge.get(edge);
      if (left.length === 1 && right.length === 1) {
        expect(found).toEqual({ edge, left: left[0], right: right[0] });
      } else {
        expect(found).toBeUndefined();
      }
    });
  });

  it("is listed once per crease, in increasing edge order, between two different faces", () => {
    for (const [, cp] of patterns) {
      const adj = faceAdjacency(cp);
      expect(adj.map((a) => a.edge)).toEqual([...adj.map((a) => a.edge)].sort((x, y) => x - y));
      expect(new Set(adj.map((a) => a.edge)).size).toBe(adj.length);
      for (const a of adj) expect(a.left).not.toBe(a.right);
    }
  });

  it("gives one adjacency per spoke and none for the border", () => {
    for (let k = 2; k <= 6; k++) {
      for (const spokes of subsetsOf(12, k)) {
        const cp = spokePattern(spokes, "M");
        const adj = faceAdjacency(cp);
        expect(adj).toHaveLength(k);
        for (const a of adj) expect(cp.edges[a.edge]!.assignment).toBe("M");
        // k spokes cut the disc into k faces.
        expect(cp.faces).toHaveLength(k);
      }
    }
  });

  it("rejects a dangling crease, which has one face on both sides", () => {
    expect(() => faceAdjacency(spokePattern([0], "M"))).toThrow(RangeError);
  });
});
