import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { THIRTY_DEGREE_RAYS } from "../gadgets/twist-limits";
import { cross, gcd, primitive } from "../lattice/direction";
import { conj, eis, equals, norm, sub } from "../lattice/eisenstein";
import { interiorVertices, checkLocalFlatFoldability } from "../validate/local-flat-foldability";
import { assignmentFromPattern } from "../solve/clauses";
import { locallyValidAssignments } from "../solve/local-solutions";
import { mulberry32 } from "./symmetric-motif";
import {
  LATTICE_LAMBDA,
  orientedPattern,
  regularTiling,
  shrinkRotate,
  type TilingKind,
} from "./shrink-rotate";

const onRay = (d: { a: number; b: number }) =>
  THIRTY_DEGREE_RAYS.some((r) => equals(r, primitive(eis(d.a, d.b))));

describe("the shrink-rotate multiplier λ (Lang §6.1–6.2)", () => {
  it("is the only non-real λ = μ/m, |λ| < 1, that keeps every crease on a 30° ray and the twist parallelogram non-degenerate, up to its conjugate", () => {
    const onLattice: string[] = [];
    const valid: string[] = [];
    for (let m = 1; m <= 12; m++) {
      for (let a = -12; a <= 12; a++) {
        for (let b = -12; b <= 12; b++) {
          if (b === 0 || norm(eis(a, b)) >= m * m) continue;
          // λ = μ/m; arg λ = arg μ and arg(1 − λ) = arg(m − μ), both needing to be 30° multiples.
          if (!onRay(eis(a, b)) || !onRay(sub(eis(m, 0), eis(a, b)))) continue;
          const g = gcd(gcd(Math.abs(a), Math.abs(b)), m);
          const name = `${a / g},${b / g}/${m / g}`;
          if (!onLattice.includes(name)) onLattice.push(name);
          // Signed area of the parallelogram is proportional to Re λ − |λ|².
          if ((2 * a - b) * m > 2 * norm(eis(a, b)) && !valid.includes(name)) valid.push(name);
        }
      }
    }
    expect(onLattice.length).toBe(8);
    expect([...valid].sort()).toEqual(["1,-1/3", "2,1/3"]);
    expect(LATTICE_LAMBDA.mu).toEqual(eis(2, 1));
    expect(conj(LATTICE_LAMBDA.mu)).toEqual(eis(1, -1));
    expect(LATTICE_LAMBDA.m).toBe(3);
  });
});

const CASES: readonly (readonly [TilingKind, number])[] = [
  ["3^6", 1],
  ["3^6", 2],
  ["6^3", 3],
  ["3.6.3.6", 2],
  ["3.6.3.6", 3],
];

describe("the generated tessellation", () => {
  it.each(CASES)("%s radius %i: every non-outline crease lies on a 30° ray", (kind, radius) => {
    for (const mirror of [false, true]) {
      const sr = shrinkRotate(regularTiling(kind, radius), { mirror });
      for (const e of sr.cp.edges) {
        if (e.assignment === "B") continue;
        const d = sub(sr.cp.vertices[e.v1]!, sr.cp.vertices[e.v0]!);
        expect(onRay(d)).toBe(true);
      }
    }
  });

  it("has the face counts of tiles + interior edges + closed vertex polygons", () => {
    // 3^6 radius 1: 6 triangles, 6 shared sides, one hexagon twist polygon at the centre.
    expect(shrinkRotate(regularTiling("3^6", 1), { mirror: false }).cp.faces.length).toBe(13);
    // 6^3 radius 3: 7 hexagons, 12 shared sides, 6 interior triangle polygons.
    expect(shrinkRotate(regularTiling("6^3", 3), { mirror: false }).cp.faces.length).toBe(25);
  });

  it("pairs each interior edge with two creases of one pleat, in a fixed order", () => {
    const sr = shrinkRotate(regularTiling("3^6", 2), { mirror: false });
    const seen = new Set<number>();
    for (const e of sr.interior) {
      expect(e.tiles[0]).toBeLessThan(e.tiles[1]);
      for (const c of e.creases) {
        expect(seen.has(c)).toBe(false);
        seen.add(c);
      }
      const [x, y] = e.creases.map((c) => {
        const edge = sr.cp.edges[c]!;
        return sub(sr.cp.vertices[edge.v1]!, sr.cp.vertices[edge.v0]!);
      }) as [{ a: number; b: number }, { a: number; b: number }];
      expect(cross(eis(x.a, x.b), eis(y.a, y.b))).toBe(0);
    }
  });

  it("builds the mirror hand as a different pattern", () => {
    const plain = shrinkRotate(regularTiling("3^6", 1), { mirror: false });
    const mirror = shrinkRotate(regularTiling("3^6", 1), { mirror: true });
    const keys = (cp: typeof plain.cp) => cp.vertices.map((z) => `${z.a},${z.b}`).sort();
    expect(keys(mirror.cp)).not.toEqual(keys(plain.cp));
  });

  it("rejects bad arguments", () => {
    expect(() => regularTiling("3^6", 0)).toThrow(RangeError);
    expect(() => regularTiling("3^6", Number.NaN)).toThrow(RangeError);
    expect(() => shrinkRotate([], { mirror: false })).toThrow(RangeError);
    // A tile at scale 1: the centroid is not an integer, so the map is not exact.
    expect(() => shrinkRotate([[eis(0, 0), eis(1, 0), eis(1, 1)]], { mirror: false })).toThrow(
      RangeError,
    );
    const sr = shrinkRotate(regularTiling("3^6", 1), { mirror: false });
    expect(() => orientedPattern(sr, [true])).toThrow(RangeError);
  });
});

describe("Thm 23: Kawasaki holds at every vertex of a shrink-rotate tessellation", () => {
  it("passes every local validator for random orientations, and every inner vertex has degree 4", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CASES),
        fc.boolean(),
        fc.integer({ min: 1, max: 1000 }),
        ([kind, radius], mirror, seed) => {
          const sr = shrinkRotate(regularTiling(kind, radius), { mirror });
          const rng = mulberry32(seed);
          const cp = orientedPattern(
            sr,
            sr.interior.map(() => rng() < 0.5),
          );
          expect(cp).not.toBeNull();
          const report = checkLocalFlatFoldability(cp!);
          expect(report.kawasaki).toEqual([]);
          expect(report.maekawa).toEqual([]);
          expect(report.bigLittleBig).toEqual([]);
          for (const v of interiorVertices(cp!)) {
            // The twist polygon's corners have degree 4; the vertices of a degree-3, 4 or 6 twist
            // all are corners (no other interior vertex exists).
            expect(cp!.rotation[v]!.length).toBe(4);
          }
        },
      ),
      { numRuns: 15 },
    );
  });

  it("gives exactly one locally valid assignment for each of the 2^6 orientations at a degree-6 vertex (Fig. 6.17)", () => {
    const sr = shrinkRotate(regularTiling("3^6", 1), { mirror: false });
    expect(sr.interior.length).toBe(6);
    const solutions = locallyValidAssignments(sr.cp);
    const anto = solutions.filter((a) =>
      sr.interior.every((e) => a[e.creases[0]] !== a[e.creases[1]]),
    );
    expect(anto.length).toBe(64);
    for (let bits = 0; bits < 64; bits++) {
      const b = sr.interior.map((_, j) => Math.floor(bits / 2 ** j) % 2 === 1);
      const cp = orientedPattern(sr, b)!;
      const mine = assignmentFromPattern(cp);
      const matches = anto.filter((a) => sr.interior.every((e, j) => a[e.creases[0]] === b[j]));
      expect(matches.length).toBe(1);
      sr.cp.edges.forEach((e, i) => {
        if (e.assignment === "U") expect(mine[i]).toBe(matches[0]![i]);
      });
    }
  });
});
