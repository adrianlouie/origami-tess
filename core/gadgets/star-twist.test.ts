import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { add, eis, equals, neg, ZERO, type Eisenstein } from "../lattice/eisenstein";
import { componentCount, faceCount, fromSegments } from "../pattern/crease-pattern";
import { isAbove, layerOrder } from "../solve/layer-order";
import { oracleBrokenRules } from "../solve/layer-oracle";
import { nearFoldability } from "../solve/near-foldability";
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

const clean = {
  kawasaki: [],
  maekawa: [],
  unassigned: [],
  bigLittleBig: [],
  borderBigLittleBig: [],
  singleVertex: [],
};

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

describe("starTwist fold variants", () => {
  const variants = ["full", "partial"] as const;

  it("defaults to the full variant", () => {
    expect(starTwistCreases(1)).toEqual(starTwistCreases(1, "full"));
    expect(starTwist(1).edges.map((e) => e.assignment)).toEqual(
      starTwist(1, "full").edges.map((e) => e.assignment),
    );
  });

  it("folds flat with the full variant: nearFoldability is ok with score 1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 }), (s) => {
        const result = nearFoldability(starTwist(s, "full"));
        expect(result.status).toBe("ok");
        if (result.status !== "ok") return;
        expect(result.score.num).toBe(result.score.den);
        expect(result.score.num).toBeGreaterThan(0);
      }),
    );
  });

  it("has a layer order for the full variant that breaks none of the oracle's physical rules", () => {
    // The oracle samples the folded paper directly and shares no code with the stacking clauses.
    // It cannot search all 435 pairs, so it checks the found stacking instead of deciding the star.
    const cp = starTwist(1, "full");
    const result = layerOrder(cp);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.order).not.toBeNull();
    expect(oracleBrokenRules(cp, result.folded, (p, q) => isAbove(result, p, q)!)).toEqual([]);
  });

  it("folds only in part with the partial variant: four of thirty faces, score 50/54", () => {
    const result = nearFoldability(starTwist(1, "partial"));
    expect(result.status).toBe("partial");
    if (result.status !== "partial") return;
    expect(result.score).toEqual({ num: 50, den: 54 });
    expect(result.repair.faces).toHaveLength(4);
    expect(result.repair.exact).toBe(true);
  });

  it("shares all geometry between the variants and differs only in the M/V assignment", () => {
    fc.assert(
      fc.property(sizes, (s) => {
        const full = starTwistCreases(s, "full");
        const partial = starTwistCreases(s, "partial");
        expect(full).toHaveLength(partial.length);
        full.forEach((c, i) => {
          const d = partial[i]!;
          expect(equals(c.from, d.from) && equals(c.to, d.to)).toBe(true);
          if (c.assignment === "B") expect(d.assignment).toBe("B");
        });
        expect(full.map((c) => c.assignment)).not.toEqual(partial.map((c) => c.assignment));
        const a = starTwist(s, "full");
        const b = starTwist(s, "partial");
        expect(a.vertices).toEqual(b.vertices);
        expect(a.faces).toEqual(b.faces);
      }),
    );
  });

  it("passes all three local conditions at the 19 star vertices for both variants", () => {
    fc.assert(
      fc.property(sizes, fc.constantFrom(...variants), (s, fold) => {
        expect(checkLocalFlatFoldability(starTwist(s, fold))).toEqual(clean);
      }),
    );
  });

  it("writes the full variant as the documented 3-row table, repeating every three spokes", () => {
    // Per spoke k, in the order a, b, e, g, h, x, y⁺, y⁻ (the emission order of starTwistCreases).
    const rows = ["VVVMMMVV", "MVMVMMVV", "VMVMMMMV"];
    fc.assert(
      fc.property(sizes, (s) => {
        const assignments = starTwistCreases(s, "full")
          .slice(0, 48)
          .map((c) => c.assignment)
          .join("");
        expect(assignments).toBe(Array.from({ length: 6 }, (_, k) => rows[k % 3]).join(""));
      }),
    );
  });

  it("rejects an unknown fold variant", () => {
    expect(() => starTwist(1, "none" as never)).toThrow(RangeError);
    expect(() => starTwistCreases(1, "" as never)).toThrow(RangeError);
  });
});
