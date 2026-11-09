import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { toCartesian } from "../../app/render/cartesian";
import { windingNumber } from "../lattice/direction";
import { eis, type Eisenstein } from "../lattice/eisenstein";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { triangleTwist } from "../gadgets/triangle-twist";
import { faceDoubledArea, type CreasePattern } from "../pattern/crease-pattern";
import { apply } from "../symmetry/affine";
import { foldFaces } from "./folded-faces";
import { overlappingFacePairs, trianglesOverlap, triangulateFace, type Triangle } from "./overlap";
import { spokePattern, subsetsOf } from "./testing";

/** Twice the signed area of a triangle. */
const area2 = (t: Triangle) => faceDoubledArea([...t], [0, 1, 2]);

const tri = (...p: [number, number][]) => p.map(([a, b]) => eis(a, b)) as unknown as Triangle;

/** Float area of the intersection of two triangles, by Sutherland–Hodgman clipping. */
function intersectionArea(s: Triangle, t: Triangle): number {
  type P = { x: number; y: number };
  const pts = (x: Triangle): P[] => x.map(toCartesian);
  const signed = (p: P[]) =>
    p.reduce((acc, q, i) => {
      const r = p[(i + 1) % p.length]!;
      return acc + (q.x * r.y - r.x * q.y) / 2;
    }, 0);
  const ccw = (p: P[]) => (signed(p) < 0 ? [...p].reverse() : p);
  let subject = ccw(pts(s));
  const clip = ccw(pts(t));
  for (let i = 0; i < clip.length && subject.length > 0; i++) {
    const a = clip[i]!;
    const b = clip[(i + 1) % clip.length]!;
    const side = (p: P) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const next: P[] = [];
    subject.forEach((cur, j) => {
      const prev = subject[(j + subject.length - 1) % subject.length]!;
      const sc = side(cur);
      const sp = side(prev);
      if (sc >= 0 !== sp >= 0) {
        const k = sp / (sp - sc);
        next.push({ x: prev.x + k * (cur.x - prev.x), y: prev.y + k * (cur.y - prev.y) });
      }
      if (sc >= 0) next.push(cur);
    });
    subject = next;
  }
  return subject.length < 3 ? 0 : Math.abs(signed(subject));
}

describe("trianglesOverlap", () => {
  it("separates triangles that only touch, and joins ones that share area", () => {
    const base = tri([0, 0], [2, 0], [0, 2]);
    expect(trianglesOverlap(base, base)).toBe(true);
    expect(trianglesOverlap(base, tri([0, 0], [1, 0], [0, 1]))).toBe(true);
    // The mirror image across the shared edge touches along it.
    expect(trianglesOverlap(tri([0, 0], [1, 0], [0, 1]), tri([1, 0], [1, 1], [0, 1]))).toBe(false);
    // Touching at one vertex only.
    expect(trianglesOverlap(tri([0, 0], [1, 0], [0, 1]), tri([1, 0], [2, 0], [1, 1]))).toBe(false);
    // Orientation of either triangle does not matter.
    expect(trianglesOverlap(tri([0, 0], [0, 2], [2, 0]), base)).toBe(true);
  });

  it("treats a zero-area triangle as overlapping nothing", () => {
    expect(trianglesOverlap(tri([0, 0], [1, 0], [2, 0]), tri([0, 0], [2, 0], [0, 2]))).toBe(false);
  });

  it("agrees with a floating-point intersection area (property)", () => {
    const point = fc.tuple(fc.integer({ min: -3, max: 3 }), fc.integer({ min: -3, max: 3 }));
    const triangle = fc.tuple(point, point, point);
    fc.assert(
      fc.property(triangle, triangle, (p, q) => {
        const s = tri(...p);
        const t = tri(...q);
        // The float clipper cannot handle a degenerate clip triangle; those have their own test.
        fc.pre(area2(s) !== 0 && area2(t) !== 0);
        const area = intersectionArea(s, t);
        // Lattice triangles have area 0 or at least a small positive amount, so 1e-9 separates.
        expect(trianglesOverlap(s, t)).toBe(area > 1e-9);
      }),
      { numRuns: 2000 },
    );
  });
});

describe("triangulateFace", () => {
  const shapes: [string, Eisenstein[]][] = [
    ["L shape", [eis(0, 0), eis(2, 0), eis(2, 1), eis(1, 1), eis(1, 2), eis(0, 2)]],
    ["square with collinear vertices", [eis(0, 0), eis(1, 0), eis(2, 0), eis(2, 2), eis(0, 2)]],
    ["arrowhead", [eis(0, 0), eis(4, 0), eis(4, 1), eis(2, 1), eis(2, 3), eis(0, 3)]],
  ];

  it.each(shapes)("covers a %s exactly with positive counter-clockwise triangles", (_, ring) => {
    const face = ring.map((_, i) => i);
    const triangles = triangulateFace(ring, face);
    expect(faceDoubledArea(ring, face)).toBeGreaterThan(0);
    const sum = triangles.reduce((acc, t) => acc + area2(t), 0);
    expect(sum).toBe(faceDoubledArea(ring, face));
    for (const t of triangles) expect(area2(t)).toBeGreaterThan(0);
    // Each triangle's centroid lies inside the face (×3 keeps it an integer point).
    const big = ring.map((z) => eis(3 * z.a, 3 * z.b));
    for (const t of triangles) {
      const c = eis(t[0].a + t[1].a + t[2].a, t[0].b + t[1].b + t[2].b);
      expect(windingNumber(big, c)).toBe(1);
    }
  });

  it("returns nothing for a face of zero area", () => {
    const ring = [eis(0, 0), eis(1, 0), eis(2, 0)];
    expect(triangulateFace(ring, [0, 1, 2])).toEqual([]);
  });

  it("triangulates every face of every gadget with the right total area", () => {
    for (const cp of [hexagonTwist(2, 4), triangleTwist(2, 1), starTwist(1)]) {
      for (const face of cp.faces) {
        const sum = triangulateFace(cp.vertices, face).reduce((acc, t) => acc + area2(t), 0);
        expect(sum).toBe(faceDoubledArea(cp.vertices, face));
      }
    }
  });
});

/**
 * Brute-force reference for patterns whose creases all lie on lattice lines: every face is a union
 * of unit lattice triangles, and an isometry of the lattice maps unit triangles to unit triangles,
 * so two faces overlap iff they cover a common unit triangle after folding.
 */
function overlapByUnitTriangles(cp: CreasePattern): string[] {
  const folded = foldFaces(cp);
  if (folded.status !== "ok") throw new Error("pattern does not fold");
  const covered = cp.faces.map((face, f) => {
    const ring = face.map((v) => cp.vertices[v]!);
    const big = ring.map((z) => eis(3 * z.a, 3 * z.b));
    const as = ring.map((z) => z.a);
    const bs = ring.map((z) => z.b);
    const keys = new Set<string>();
    for (let a = Math.min(...as) - 1; a <= Math.max(...as); a++) {
      for (let b = Math.min(...bs) - 1; b <= Math.max(...bs); b++) {
        for (const unit of [
          [eis(a, b), eis(a + 1, b), eis(a + 1, b + 1)],
          [eis(a, b), eis(a + 1, b + 1), eis(a, b + 1)],
        ]) {
          const centroid3 = eis(
            unit[0]!.a + unit[1]!.a + unit[2]!.a,
            unit[0]!.b + unit[1]!.b + unit[2]!.b,
          );
          if (windingNumber(big, centroid3) === 0) continue;
          const image = unit.map((p) => apply(folded.transforms[f]!, p));
          keys.add(
            image
              .map((p) => `${p.a},${p.b}`)
              .sort()
              .join("|"),
          );
        }
      }
    }
    return keys;
  });
  const pairs: string[] = [];
  for (let i = 0; i < covered.length; i++) {
    for (let j = i + 1; j < covered.length; j++) {
      if ([...covered[i]!].some((k) => covered[j]!.has(k))) pairs.push(`${i},${j}`);
    }
  }
  return pairs;
}

describe("overlappingFacePairs", () => {
  const cases: [string, CreasePattern][] = [
    ["hexagon twist (1, 2)", hexagonTwist(1, 2)],
    ["hexagon twist (2, 3)", hexagonTwist(2, 3)],
    ["triangle twist (1, 1)", triangleTwist(1, 1)],
    ["triangle twist (2, 1)", triangleTwist(2, 1)],
    ["star twist (1)", starTwist(1)],
  ];

  it.each(cases)("matches the unit-triangle brute force on the %s", (_, cp) => {
    const folded = foldFaces(cp);
    if (folded.status !== "ok") throw new Error("gadget does not fold");
    const got = overlappingFacePairs(cp, folded.transforms).map(([i, j]) => `${i},${j}`);
    expect(got).toEqual(overlapByUnitTriangles(cp));
    // A flat-folded twist stacks layers, so something must overlap.
    expect(got.length).toBeGreaterThan(0);
  });

  it("matches the brute force on every Kawasaki pattern with spokes along lattice lines", () => {
    let checked = 0;
    for (let k = 2; k <= 6; k++) {
      for (const idx of subsetsOf(6, k)) {
        const cp = spokePattern(
          idx.map((i) => 2 * i),
          "M",
        );
        const folded = foldFaces(cp);
        if (folded.status !== "ok") continue;
        checked++;
        const got = overlappingFacePairs(cp, folded.transforms).map(([i, j]) => `${i},${j}`);
        expect(got).toEqual(overlapByUnitTriangles(cp));
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("finds no overlap when nothing is folded", () => {
    const cp = spokePattern([0, 6], "F");
    const folded = foldFaces(cp);
    if (folded.status !== "ok") throw new Error("flat pattern must fold");
    expect(overlappingFacePairs(cp, folded.transforms)).toEqual([]);
  });

  it("rejects a transform list of the wrong length", () => {
    expect(() => overlappingFacePairs(spokePattern([0, 6], "M"), [])).toThrow(RangeError);
  });
});
