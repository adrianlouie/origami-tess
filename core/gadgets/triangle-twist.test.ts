import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { cross } from "../lattice/direction";
import { add, eis, equals, mul, OMEGA, sub, type Eisenstein } from "../lattice/eisenstein";
import { componentCount, faceCount, fromSegments } from "../pattern/crease-pattern";
import { checkLocalFlatFoldability, interiorVertices } from "../validate/local-flat-foldability";
import type { Crease } from "./crease";
import { triangleTwist, triangleTwistCreases } from "./triangle-twist";

/** ω̄ = −1 − ω, the 240° direction. */
const OMEGA_BAR = eis(-1, -1);

/** The three corners P₀ = 0, P₁ = n, P₂ = n·(1 + ω). */
const corners = (n: number): Eisenstein[] => [eis(0, 0), eis(n, 0), eis(n, n)];

/** The 120° rotation about the twist centre, ρ(z) = ωz + n, which permutes the corners. */
const rho = (n: number) => (z: Eisenstein) => add(mul(OMEGA, z), eis(n, 0));

const scale = (z: Eisenstein, k: number) => eis(z.a * k, z.b * k);

const sizes = fc.tuple(fc.integer({ min: 1, max: 6 }), fc.integer({ min: 1, max: 5 }));

const key = (c: Crease) => {
  const [x, y] = [c.from, c.to].map((z) => `${z.a},${z.b}`).sort();
  return `${x}|${y}|${c.assignment}`;
};

/** The raw pattern for any size: locally valid even where it cannot fold (n < 3m). */
const raw = (n: number, m: number) => fromSegments([], triangleTwistCreases(n, m));

const clean = {
  kawasaki: [],
  maekawa: [],
  unassigned: [],
  bigLittleBig: [],
  borderBigLittleBig: [],
  singleVertex: [],
};

describe("triangleTwist", () => {
  it("passes Kawasaki, Maekawa and Big-Little-Big at the three corners (n=3, m=1)", () => {
    const cp = triangleTwist(3, 1);
    expect(checkLocalFlatFoldability(cp)).toEqual(clean);
    const interior = interiorVertices(cp).map((v) => cp.vertices[v]!);
    expect(interior).toHaveLength(3);
    for (const p of corners(3)) expect(interior.some((z) => equals(z, p))).toBe(true);
  });

  it("passes all three local conditions at exactly the three corners, for all sizes", () => {
    fc.assert(
      fc.property(sizes, ([n, m]) => {
        const cp = raw(n, m);
        expect(checkLocalFlatFoldability(cp)).toEqual(clean);
        const interior = interiorVertices(cp).map((v) => cp.vertices[v]!);
        expect(interior).toHaveLength(3);
        for (const p of corners(n)) expect(interior.some((z) => equals(z, p))).toBe(true);
      }),
    );
  });

  it("has the counted V, E and 7 bounded faces, and satisfies Euler's formula", () => {
    fc.assert(
      fc.property(sizes, ([n, m]) => {
        const cp = raw(n, m);
        const ring = 3 * (n + 3 * m);
        expect(cp.vertices).toHaveLength(3 + ring);
        expect(cp.edges).toHaveLength(9 + ring);
        expect(cp.faces).toHaveLength(7);
        expect(cp.vertices.length - cp.edges.length + faceCount(cp)).toBe(1 + componentCount(cp));
      }),
    );
  });

  it("is invariant under the 120° rotation z ↦ ωz + n, assignments included", () => {
    fc.assert(
      fc.property(sizes, ([n, m]) => {
        const creases = triangleTwistCreases(n, m);
        const r = rho(n);
        const rotated = creases.map((c) => ({ ...c, from: r(c.from), to: r(c.to) }));
        expect(new Set(rotated.map(key))).toEqual(new Set(creases.map(key)));
      }),
    );
  });

  it("builds each pleat from two parallel rays of length m with opposite M/V", () => {
    fc.assert(
      fc.property(sizes, ([n, m]) => {
        const have = new Set(triangleTwistCreases(n, m).map(key));
        const [p0, p1, p2] = corners(n) as [Eisenstein, Eisenstein, Eisenstein];
        const ray = (p: Eisenstein, d: Eisenstein, assignment: "M" | "V"): Crease => ({
          from: p,
          to: add(p, scale(d, m)),
          assignment,
        });
        // Pleat 1: P₁'s +1 ray (M) with P₂'s +1 ray (V).
        const a = ray(p1, eis(1, 0), "M");
        const b = ray(p2, eis(1, 0), "V");
        // Pleat 2: P₁'s ω̄ ray (V) with P₀'s ω̄ ray (M).
        const c = ray(p1, OMEGA_BAR, "V");
        const d = ray(p0, OMEGA_BAR, "M");
        for (const [x, y] of [
          [a, b],
          [c, d],
        ] as const) {
          expect(cross(sub(x.to, x.from), sub(y.to, y.from))).toBe(0);
          expect(have.has(key(x))).toBe(true);
          expect(have.has(key(y))).toBe(true);
        }
      }),
    );
  });

  it("fails Big-Little-Big, and only that, when each ray's M/V is swapped", () => {
    fc.assert(
      fc.property(sizes, ([n, m]) => {
        const ps = corners(n);
        const isCorner = (z: Eisenstein) => ps.some((p) => equals(p, z));
        // A ray has exactly one corner endpoint; triangle edges have two, frame edges are "B".
        const swapped = triangleTwistCreases(n, m).map((c) =>
          c.assignment !== "B" && isCorner(c.from) !== isCorner(c.to)
            ? { ...c, assignment: c.assignment === "M" ? ("V" as const) : ("M" as const) }
            : c,
        );
        const report = checkLocalFlatFoldability(fromSegments([], swapped));
        expect(report.kawasaki).toEqual([]);
        expect(report.maekawa).toEqual([]);
        expect(report.unassigned).toEqual([]);
        expect(report.bigLittleBig).toHaveLength(3);
      }),
    );
  });

  it("rejects sizes below n >= 3m, which are locally valid but do not fold flat", () => {
    for (const [n, m] of [
      [1, 1],
      [2, 1],
      [5, 2],
      [1, 3],
    ] as const) {
      expect(() => triangleTwist(n, m)).toThrow(RangeError);
      expect(checkLocalFlatFoldability(raw(n, m))).toEqual(clean);
    }
    expect(() => triangleTwist(3, 1)).not.toThrow();
  });

  it("rejects bad sizes", () => {
    expect(() => triangleTwist(0, 1)).toThrow(RangeError);
    expect(() => triangleTwist(1, 0)).toThrow(RangeError);
    expect(() => triangleTwist(-1, 1)).toThrow(RangeError);
    expect(() => triangleTwist(1, -1)).toThrow(RangeError);
    expect(() => triangleTwist(1.5, 1)).toThrow(RangeError);
    expect(() => triangleTwist(1, 1.5)).toThrow(RangeError);
    expect(() => triangleTwist(2 ** 53, 1)).toThrow(RangeError);
    expect(() => triangleTwist(1, 2 ** 53)).toThrow(RangeError);
  });
});
