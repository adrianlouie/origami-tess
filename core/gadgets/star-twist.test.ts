import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { add, eis, equals, neg, ZERO, type Eisenstein } from "../lattice/eisenstein";
import { componentCount, faceCount, fromSegments } from "../pattern/crease-pattern";
import { checkLocalFlatFoldability, interiorVertices } from "../validate/local-flat-foldability";
import { rotate, scale, type Crease } from "./crease";
import { starTwist, starTwistCreases } from "./star-twist";

const sizes = fc.integer({ min: 1, max: 4 });

const unit = (k: number) => rotate(eis(1, 0), k);

/** The 19 interior points: the centre O, the corners Pₖ, the tips Tₖ and the outer corners Qₖ. */
const starPoints = (s: number): Eisenstein[] => {
  const pts: Eisenstein[] = [ZERO];
  for (let k = 0; k < 6; k++) {
    pts.push(
      scale(unit(k), s),
      add(scale(unit(k), s), scale(unit(k + 1), s)),
      scale(unit(k), 2 * s),
    );
  }
  return pts;
};

const key = (c: Crease, withAssignment = true) => {
  const [x, y] = [c.from, c.to].map((z) => `${z.a},${z.b}`).sort();
  return withAssignment ? `${x}|${y}|${c.assignment}` : `${x}|${y}`;
};

const clean = { kawasaki: [], maekawa: [], unassigned: [], bigLittleBig: [] };

const hasPoint = (pts: Eisenstein[], p: Eisenstein) => pts.some((z) => equals(z, p));

describe("starTwist", () => {
  it("passes Kawasaki, Maekawa and Big-Little-Big at the 19 star vertices (s=1)", () => {
    const cp = starTwist(1);
    expect(checkLocalFlatFoldability(cp)).toEqual(clean);
    const interior = interiorVertices(cp).map((v) => cp.vertices[v]!);
    expect(interior).toHaveLength(19);
    for (const p of starPoints(1)) expect(hasPoint(interior, p)).toBe(true);
  });

  it("passes all three local conditions at exactly the 19 star vertices, for all sizes", () => {
    fc.assert(
      fc.property(sizes, (s) => {
        const cp = starTwist(s);
        expect(checkLocalFlatFoldability(cp)).toEqual(clean);
        const interior = interiorVertices(cp).map((v) => cp.vertices[v]!);
        expect(interior).toHaveLength(19);
        for (const p of starPoints(s)) expect(hasPoint(interior, p)).toBe(true);
      }),
    );
  });

  it("has the counted V, E and 30 bounded faces, and satisfies Euler's formula", () => {
    fc.assert(
      fc.property(sizes, (s) => {
        const cp = starTwist(s);
        expect(cp.vertices).toHaveLength(19 + 18 * s);
        expect(cp.edges).toHaveLength(48 + 18 * s);
        expect(cp.faces).toHaveLength(30);
        expect(cp.vertices.length - cp.edges.length + faceCount(cp)).toBe(1 + componentCount(cp));
      }),
    );
  });

  it("has a six-fold symmetric crease set and a half-turn symmetric M/V assignment", () => {
    fc.assert(
      fc.property(sizes, (s) => {
        const creases = starTwistCreases(s);
        const turn = (k: number) =>
          creases.map((c) => ({ ...c, from: rotate(c.from, k), to: rotate(c.to, k) }));
        const bare = new Set(creases.map((c) => key(c, false)));
        for (let k = 1; k < 6; k++) {
          expect(new Set(turn(k).map((c) => key(c, false)))).toEqual(bare);
        }
        const half = creases.map((c) => ({ ...c, from: neg(c.from), to: neg(c.to) }));
        expect(new Set(half.map((c) => key(c)))).toEqual(new Set(creases.map((c) => key(c))));
      }),
    );
  });

  it("puts two M and four V on the spokes at the centre (Maekawa, |#M − #V| = 2)", () => {
    const spokes = starTwistCreases(2).filter((c) => equals(c.from, ZERO));
    expect(spokes).toHaveLength(6);
    expect(spokes.filter((c) => c.assignment === "M")).toHaveLength(2);
    expect(spokes.filter((c) => c.assignment === "V")).toHaveLength(4);
  });

  it("is caught by Maekawa when any single crease is flipped", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 }), (s) => {
        const creases = starTwistCreases(s);
        creases.forEach((c, i) => {
          if (c.assignment === "B") return;
          const flipped = creases.map((d, j) =>
            j === i
              ? { ...d, assignment: d.assignment === "M" ? ("V" as const) : ("M" as const) }
              : d,
          );
          expect(
            checkLocalFlatFoldability(fromSegments([], flipped)).maekawa.length,
          ).toBeGreaterThan(0);
        });
      }),
    );
  });

  it("fails Big-Little-Big, and only that, when the b, e and h creases are all swapped", () => {
    fc.assert(
      fc.property(sizes, (s) => {
        // starTwistCreases emits eight creases per k in the order a, b, e, g, h, x, y⁺, y⁻.
        const swapped = starTwistCreases(s).map((c, i) =>
          i < 48 && [1, 2, 4].includes(i % 8)
            ? { ...c, assignment: c.assignment === "M" ? ("V" as const) : ("M" as const) }
            : c,
        );
        const report = checkLocalFlatFoldability(fromSegments([], swapped));
        expect(report.kawasaki).toEqual([]);
        expect(report.maekawa).toEqual([]);
        expect(report.unassigned).toEqual([]);
        expect(report.bigLittleBig).toHaveLength(6);
      }),
    );
  });

  it("fails Maekawa at exactly the six inner corners when every spoke is swapped", () => {
    fc.assert(
      fc.property(sizes, (s) => {
        const swapped = starTwistCreases(s).map((c) =>
          equals(c.from, ZERO)
            ? { ...c, assignment: c.assignment === "M" ? ("V" as const) : ("M" as const) }
            : c,
        );
        const cp = fromSegments([], swapped);
        const report = checkLocalFlatFoldability(cp);
        expect(report.kawasaki).toEqual([]);
        const bad = report.maekawa.map((v) => cp.vertices[v]!);
        expect(bad).toHaveLength(6);
        for (let k = 0; k < 6; k++) expect(hasPoint(bad, scale(unit(k), s))).toBe(true);
      }),
    );
  });

  it("rejects bad sizes", () => {
    expect(() => starTwist(0)).toThrow(RangeError);
    expect(() => starTwist(-1)).toThrow(RangeError);
    expect(() => starTwist(1.5)).toThrow(RangeError);
    expect(() => starTwist(Number.NaN)).toThrow(RangeError);
    expect(() => starTwist(2 ** 53)).toThrow(RangeError);
  });
});
