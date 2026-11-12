import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { triangleTwist } from "../gadgets/triangle-twist";
import { sectorFaces, subsetsOf, spokePattern } from "../solve/testing";
import { faceAdjacency, twoColor } from "./faces";
import { componentCount, faceCount, type CreasePattern } from "./crease-pattern";

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
  ["triangle twist", triangleTwist(6, 2)],
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

  it.each(patterns)("agrees with Euler's formula and the walk lengths (%s)", (_, cp) => {
    // V - E + F = 1 + C counting the unbounded face (Euler 1758).
    expect(cp.vertices.length - cp.edges.length + faceCount(cp)).toBe(1 + componentCount(cp));
    // Every crease has one or two bounded sides and each side is one step of one walk, so the
    // walks hold E + (creases with two bounded sides) steps, which is E + adjacencies.
    const steps = cp.faces.reduce((sum, walk) => sum + walk.length, 0);
    expect(steps).toBe(cp.edges.length + faceAdjacency(cp).length);
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

describe("twoColor (Lang §1.1, pp. 14–15: the facets of a flat fold are two-coloured)", () => {
  it("colours the two sides of one fold differently, whatever its assignment", () => {
    for (const mark of ["M", "V", "U"] as const) {
      expect(twoColor(spokePattern([0, 6], mark))).toEqual([0, 1]);
    }
  });

  it("keeps the colour across a flat (F) crease", () => {
    // Five spokes, one flat: four folded creases round the vertex, an even number, so it colours.
    const cp = spokePattern([0, 2, 4, 6, 8], ["M", "F", "V", "M", "V"]);
    const colours = twoColor(cp);
    expect(colours).not.toBeNull();
    const faces = sectorFaces(cp);
    // Spoke 1 is the flat crease: the faces on either side of it carry one colour.
    expect(colours![faces[0]!]).toBe(colours![faces[1]!]);
    expect(colours![faces[1]!]).not.toBe(colours![faces[2]!]);
    expect(colours![faces[2]!]).not.toBe(colours![faces[3]!]);
  });

  it("alternates round an even vertex and fails round an odd one, which cannot fold flat", () => {
    const colours = twoColor(spokePattern([0, 3, 6, 9], "U"))!;
    const faces = sectorFaces(spokePattern([0, 3, 6, 9], "U"));
    const first = colours[faces[0]!]!;
    expect(faces.map((f) => colours[f])).toEqual([first, 1 - first, first, 1 - first]);
    // Three spokes make three faces that pairwise share a crease: an odd cycle (Lang p. 15).
    expect(twoColor(spokePattern([0, 4, 8], "U"))).toBeNull();
  });

  it.each(patterns)("colours the faces of a pattern in two classes (%s)", (_, cp) => {
    const colours = twoColor(cp);
    expect(colours).not.toBeNull();
    expect(colours).toHaveLength(cp.faces.length);
    expect(colours![0]).toBe(0);
    // Every crease between two faces separates the colours unless it is flat.
    for (const { edge, left, right } of faceAdjacency(cp)) {
      const flat = cp.edges[edge]!.assignment === "F";
      expect(colours![left] === colours![right]).toBe(flat);
    }
  });

  it("colours the faces of a sheet with no creases as one class", () => {
    expect(twoColor(spokePattern([], "U"))).toEqual([0]);
  });
});
