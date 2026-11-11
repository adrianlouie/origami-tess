import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { triangleTwist } from "../gadgets/triangle-twist";
import { eis } from "../lattice/eisenstein";
import { orientation } from "../lattice/direction";
import { faceDoubledArea, fromSegments, type CreasePattern } from "../pattern/crease-pattern";
import { trianglesOverlap, triangulateFace } from "../solve/overlap";
import { ALL_LINES, arrangement } from "../solve/testing";
import { triangulateFaceKeepingVertices } from "./mesh";

const GADGETS: [string, CreasePattern][] = [
  ["hexagon twist (1, 2)", hexagonTwist(1, 2)],
  ["hexagon twist (2, 3)", hexagonTwist(2, 3)],
  ["triangle twist (3, 1)", triangleTwist(3, 1)],
  ["triangle twist (6, 2)", triangleTwist(6, 2)],
  ["star twist, full", starTwist(1, "full")],
];

/** The shape every mesh must have: all vertices used, exact area, no sliver, no overlap. */
function checkMesh(cp: CreasePattern): void {
  cp.faces.forEach((face, f) => {
    const tris = triangulateFaceKeepingVertices(cp.vertices, face);
    const used = new Set(tris.flat());
    expect(
      [...used].sort((a, b) => a - b),
      `face ${f} uses every vertex`,
    ).toEqual([...face].sort((a, b) => a - b));
    let doubled = 0;
    for (const t of tris) {
      const [p, q, r] = t.map((v) => cp.vertices[v]!) as [
        (typeof cp.vertices)[number],
        (typeof cp.vertices)[number],
        (typeof cp.vertices)[number],
      ];
      expect(orientation(p, q, r), `face ${f} has a counter-clockwise triangle`).toBe(1);
      doubled += faceDoubledArea(cp.vertices, [...t]);
    }
    expect(doubled, `face ${f} area`).toBe(faceDoubledArea(cp.vertices, face));
    for (let i = 0; i < tris.length; i++) {
      for (let j = i + 1; j < tris.length; j++) {
        const s = tris[i]!.map((v) => cp.vertices[v]!) as unknown as Parameters<
          typeof trianglesOverlap
        >[0];
        const t = tris[j]!.map((v) => cp.vertices[v]!) as unknown as Parameters<
          typeof trianglesOverlap
        >[1];
        expect(trianglesOverlap(s, t), `face ${f} triangles ${i}, ${j}`).toBe(false);
      }
    }
  });
}

describe("triangulateFaceKeepingVertices", () => {
  it.each(GADGETS)("%s: uses every vertex, exact area, no overlap", (_name, cp) => {
    checkMesh(cp);
  });

  it("keeps a straight vertex that triangulateFace drops", () => {
    // A 2×1 rectangle with a vertex in the middle of its bottom edge.
    const cp = fromSegments(
      [eis(0, 0), eis(1, 0), eis(2, 0), eis(2, 1), eis(1, 1), eis(0, 1)],
      [
        { from: eis(0, 0), to: eis(1, 0) },
        { from: eis(1, 0), to: eis(2, 0) },
        { from: eis(2, 0), to: eis(2, 1) },
        { from: eis(2, 1), to: eis(1, 1) },
        { from: eis(1, 1), to: eis(0, 1) },
        { from: eis(0, 1), to: eis(0, 0) },
      ],
    );
    const face = cp.faces[0]!;
    const dropped = new Set(triangulateFace(cp.vertices, face).flatMap((t) => t));
    expect(dropped.size).toBeLessThan(face.length);
    const kept = triangulateFaceKeepingVertices(cp.vertices, face);
    expect(new Set(kept.flat()).size).toBe(face.length);
    checkMesh(cp);
  });

  it("holds on random lattice-line arrangements", () => {
    fc.assert(
      fc.property(fc.subarray([...ALL_LINES], { minLength: 0, maxLength: 9 }), (lines) => {
        const creases = arrangement(lines);
        const cp = fromSegments(
          [],
          creases.map((c) => ({ from: c.from, to: c.to, assignment: c.assignment })),
        );
        checkMesh(cp);
      }),
      { numRuns: 60 },
    );
  });

  it("throws on an out-of-range vertex and on a clockwise (non-simple) walk", () => {
    const cp = fromSegments(
      [eis(0, 0), eis(1, 0), eis(0, 1)],
      [
        { from: eis(0, 0), to: eis(1, 0) },
        { from: eis(1, 0), to: eis(0, 1) },
        { from: eis(0, 1), to: eis(0, 0) },
      ],
    );
    expect(() => triangulateFaceKeepingVertices(cp.vertices, [0, 1, 9])).toThrow(RangeError);
    expect(() => triangulateFaceKeepingVertices(cp.vertices, [0, 2, 1])).toThrow(RangeError);
  });
});
