import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { add, eis, type Eisenstein } from "../lattice/eisenstein";
import { affine, IDENTITY } from "../symmetry/affine";
import { primitive } from "../lattice/direction";
import { fromSegments, type Assignment, type CreasePattern } from "../pattern/crease-pattern";
import {
  allAssignments,
  candidates,
  foldsFlat,
  layerOrderValid,
  permutations,
  POOL,
  subsets,
} from "../validate/testing";
import { kawasakiFlat, maekawaFlat } from "../validate/local-flat-foldability";
import { foldFaces } from "./folded-faces";
import {
  sameDirection,
  segmentCrossesFace,
  segmentsOverlapCollinear,
  trianglesOverlap,
  trianglesShareInterior,
  triangulateFace,
  type Triangle,
} from "./overlap";
import { solveClauses } from "./solver";
import { aboveLiteral, stackingClauses, type StackingFormula } from "./stacking";
import { parallelStrip, SPOKE_ENDS, sectorFaces, spokePattern } from "./testing";

/** Folds the pattern and builds its stacking formula; the pattern must fold. */
function stackOf(cp: CreasePattern): { formula: StackingFormula; flipped: readonly boolean[] } {
  const folded = foldFaces(cp);
  if (folded.status !== "ok") throw new Error("pattern does not fold");
  return { formula: stackingClauses(cp, folded), flipped: folded.flipped };
}

const lits = (f: StackingFormula) => f.clauses.map((c) => c.literals);

/** Does the assignment (true = variable true, indexed by variable − 1) satisfy every clause? */
const holds = (f: StackingFormula, model: readonly boolean[]) =>
  f.clauses.every((c) => c.literals.some((l) => model[Math.abs(l) - 1]! === l > 0));

describe("test setup", () => {
  it("POOL and SPOKE_ENDS list the same twelve directions in the same order", () => {
    POOL.forEach((d, k) => expect(primitive(SPOKE_ENDS[k]!)).toEqual(primitive(d)));
  });
});

describe("stackingClauses: single vertex against the brute-force fold", () => {
  /** The spoke pattern of a POOL subset, which needs the subset's indices, not its directions. */
  const spokesOf = (degree: number) =>
    subsets(POOL.length, degree).filter((idx) => kawasakiFlat(idx.map((i) => POOL[i]!)));

  it("is satisfiable exactly when the vertex folds flat (degree 4: every M/V string; degree 6: all Maekawa strings and a sample)", () => {
    let folds = 0;
    let rejected = 0;
    for (const degree of [4, 6]) {
      // Degree 4 takes every string. At degree 6 the strings that fail Maekawa are thinned (every
      // fifth): degree 4 already shows the clauses alone reject them, and this halves the run time.
      const strings = allAssignments(degree).filter(
        (a, i) => degree === 4 || maekawaFlat(a) || i % 5 === 0,
      );
      // Degree 6 also takes every third vertex: degree 4 is exhaustive, and degree 6 is there for
      // the longer stacks (transitivity across more than three faces).
      for (const idx of spokesOf(degree).filter((_, n) => degree === 4 || n % 3 === 0)) {
        const dirs = idx.map((i) => POOL[i]!);
        for (const assigns of strings) {
          const { formula } = stackOf(spokePattern(idx, assigns));
          const sat = solveClauses(formula.variableCount, lits(formula)) !== null;
          const expected = foldsFlat(dirs, assigns);
          expect(sat).toBe(expected);
          if (expected) folds++;
          else rejected++;
        }
      }
    }
    // Non-vacuous both ways, including strings that fail Maekawa.
    expect(folds).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  });

  it("accepts a stacking exactly when the oracle's layer order is valid (degree 4, every order)", () => {
    // Pins the M/V convention: swapping every M and V keeps satisfiability but changes which
    // stackings are valid, so only a per-order check can catch an inverted crease rule.
    const orders = permutations(4);
    let valid = 0;
    let invalid = 0;
    for (const { dirs, assigns } of candidates(4)) {
      const idx = dirs.map((d) => POOL.findIndex((p) => p === d));
      const cp = spokePattern(idx, assigns);
      const { formula, flipped } = stackOf(cp);
      const sector = sectorFaces(cp);
      // The oracle puts sector 0 unflipped and calls a higher rank nearer the viewer; the formula
      // keeps face 0 unflipped. If sector 0's face is upside down in the formula's frame, the two
      // pictures differ by turning the whole model over, which reverses every "above".
      const turned = flipped[sector[0]!]!;
      for (const rank of orders) {
        const faceRank = new Map(sector.map((f, s) => [f, turned ? 3 - rank[s]! : rank[s]!]));
        const model = formula.pairs.map(([i, j]) => faceRank.get(i)! > faceRank.get(j)!);
        const ok = holds(formula, model);
        expect(ok).toBe(layerOrderValid(dirs, assigns, rank));
        if (ok) valid++;
        else invalid++;
      }
    }
    expect(valid).toBeGreaterThan(0);
    expect(invalid).toBeGreaterThan(0);
  });

  it("puts the far side of a valley crease above, and of a mountain crease below", () => {
    // One straight crease: spokes at 0° and 180° split the frame into two half-hexagons.
    for (const [assignment, farIsAbove] of [
      ["V", true],
      ["M", false],
    ] as const) {
      const cp = spokePattern([0, 6], assignment);
      const { formula, flipped } = stackOf(cp);
      const far = flipped.findIndex((f) => f);
      const near = flipped.findIndex((f) => !f);
      expect(formula.pairs).toEqual([[0, 1]]);
      const sat = solveClauses(formula.variableCount, [
        ...lits(formula),
        [aboveLiteral(formula, far, near)],
      ]);
      expect(sat !== null).toBe(farIsAbove);
    }
  });

  /**
   * Adds `extra` flat ("F") spokes in every way to each base vertex and checks the formula against
   * the oracle on the base. An F crease only splits a face in two, so foldability must not change.
   * Returns how many clauses of each kind were generated.
   */
  function withFlatSpokes(degree: number, extra: number, rejects = true, stride = 1) {
    const kinds: Record<string, number> = {};
    let checked = 0;
    let folds = 0;
    candidates(degree).forEach(({ dirs, assigns }, n) => {
      if (n % stride !== 0) return;
      const idx = dirs.map((d) => POOL.findIndex((p) => p === d));
      const free = POOL.map((_, i) => i).filter((i) => !idx.includes(i));
      const expected = foldsFlat(dirs, assigns);
      for (const pick of subsets(free.length, extra)) {
        const flat = pick.map((k) => free[k]!);
        const spokes = [...idx, ...flat].sort((x, y) => x - y);
        const mv = [...assigns];
        const labels = spokes.map((sp) => (flat.includes(sp) ? "F" : mv.shift()!));
        const { formula } = stackOf(spokePattern(spokes, labels as Assignment[]));
        for (const c of formula.clauses) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
        const sat = solveClauses(formula.variableCount, lits(formula)) !== null;
        expect(sat).toBe(expected);
        checked++;
        if (expected) folds++;
      }
    });
    expect(folds).toBeGreaterThan(0);
    // A straight crease (degree 2) always folds, so only larger vertices have cases to reject.
    if (rejects) expect(checked - folds).toBeGreaterThan(0);
    return kinds;
  }

  it("ignores flat creases: one F spoke added to a degree-4 vertex", () => {
    const kinds = withFlatSpokes(4, 1, true, 4);
    expect(kinds["taco-taco"]).toBeGreaterThan(0);
  });

  it("ignores flat creases: two F spokes on a degree-4 vertex (taco-tortilla clauses)", () => {
    // With one F spoke the taco-tortilla clauses are implied by the others; dropping them from
    // the encoder first fails here, where two flat runs share a fold.
    const kinds = withFlatSpokes(4, 2, true, 8);
    expect(kinds["taco-tortilla"]).toBeGreaterThan(0);
  });

  it("ignores flat creases: two to four F spokes on a straight crease (tortilla-tortilla)", () => {
    // Dropping the tortilla-tortilla clauses first fails here: two flat runs on one line may not
    // cross, and nothing else relates the sheets on the far side of the line.
    let tortillas = 0;
    for (const extra of [2, 3, 4]) {
      tortillas += withFlatSpokes(2, extra, false)["tortilla-tortilla"] ?? 0;
    }
    expect(tortillas).toBeGreaterThan(0);
  });

  it("has no variables or clauses when nothing is folded", () => {
    const { formula } = stackOf(spokePattern([0, 6], "F"));
    expect(formula.variableCount).toBe(0);
    expect(formula.clauses).toEqual([]);
  });
});

describe("stackingClauses: gadgets", () => {
  it.each([
    ["hexagon twist (1, 2)", hexagonTwist(1, 2)],
    ["hexagon twist (2, 3)", hexagonTwist(2, 3)],
  ])("finds a layer order for the %s, which folds flat", (_, cp) => {
    const { formula } = stackOf(cp);
    expect(formula.variableCount).toBeGreaterThan(0);
    const model = solveClauses(formula.variableCount, lits(formula));
    expect(model).not.toBeNull();
    expect(holds(formula, model!)).toBe(true);
  });
});

describe("exact geometry for the clauses", () => {
  const z = (a: number, b: number) => eis(a, b);

  it("segmentCrossesFace: along a diagonal yes, along the boundary no", () => {
    const square = [z(0, 0), z(2, 0), z(2, 2), z(0, 2)];
    const tris = triangulateFace(square, [0, 1, 2, 3]);
    expect(tris).toHaveLength(2);
    // The triangulation's one diagonal runs between two opposite corners.
    const diagonals = [
      [z(0, 0), z(2, 2)],
      [z(2, 0), z(0, 2)],
    ];
    expect(diagonals.some(([p, q]) => segmentCrossesFace(p!, q!, tris))).toBe(true);
    expect(segmentCrossesFace(z(0, 0), z(2, 0), tris)).toBe(false); // along an edge
    expect(segmentCrossesFace(z(-1, 0), z(3, 0), tris)).toBe(false); // along the line of an edge
    expect(segmentCrossesFace(z(1, -1), z(1, 3), tris)).toBe(true); // straight through
    expect(segmentCrossesFace(z(3, 0), z(3, 2), tris)).toBe(false); // outside
    expect(segmentCrossesFace(z(2, 0), z(2, 2), tris)).toBe(false); // along a side
  });

  /** Sutherland–Hodgman area of the intersection of convex CCW polygons, in floats. */
  function clipArea(polys: readonly (readonly Eisenstein[])[]): number {
    let ring: [number, number][] = polys[0]!.map((p) => [p.a, p.b]);
    for (const poly of polys.slice(1)) {
      for (let i = 0; i < poly.length; i++) {
        const u = poly[i]!;
        const v = poly[(i + 1) % poly.length]!;
        const side = (r: [number, number]) =>
          (v.a - u.a) * (r[1] - u.b) - (v.b - u.b) * (r[0] - u.a);
        const out: [number, number][] = [];
        ring.forEach((r, k) => {
          const n = ring[(k + 1) % ring.length]!;
          const sr = side(r);
          const sn = side(n);
          if (sr >= 0) out.push(r);
          if (sr * sn < 0) {
            const t = sr / (sr - sn);
            out.push([r[0] + t * (n[0] - r[0]), r[1] + t * (n[1] - r[1])]);
          }
        });
        ring = out;
        if (ring.length === 0) return 0;
      }
    }
    let area = 0;
    ring.forEach((r, k) => {
      const n = ring[(k + 1) % ring.length]!;
      area += r[0] * n[1] - n[0] * r[1];
    });
    return Math.abs(area) / 2;
  }

  const ccw = (t: Triangle): Triangle =>
    (t[1].a - t[0].a) * (t[2].b - t[0].b) - (t[1].b - t[0].b) * (t[2].a - t[0].a) >= 0
      ? t
      : [t[0], t[2], t[1]];
  const point = fc.record({
    a: fc.integer({ min: -3, max: 3 }),
    b: fc.integer({ min: -3, max: 3 }),
  });
  const triangle = fc.tuple(point, point, point).map((t) => ccw(t as unknown as Triangle));
  const nonDegenerate = (t: Triangle) => clipArea([t]) > 0;

  it("trianglesShareInterior agrees with a float clipping area (three triangles)", () => {
    let common = 0;
    let ringOnly = 0;
    fc.assert(
      fc.property(triangle, triangle, triangle, (s, t, u) => {
        fc.pre(nonDegenerate(s) && nonDegenerate(t) && nonDegenerate(u));
        const got = trianglesShareInterior([s, t, u]);
        expect(got).toBe(clipArea([s, t, u]) > 1e-9);
        if (got) common++;
        else if (trianglesOverlap(s, t) && trianglesOverlap(t, u) && trianglesOverlap(s, u))
          ringOnly++;
      }),
      { numRuns: 3000 },
    );
    expect(common).toBeGreaterThan(0);
    // Non-vacuous: three triangles that overlap pairwise yet share no point do occur.
    expect(ringOnly).toBeGreaterThan(0);
  });

  it("trianglesShareInterior agrees with trianglesOverlap for two triangles", () => {
    fc.assert(
      fc.property(triangle, triangle, (s, t) => {
        expect(trianglesShareInterior([s, t])).toBe(trianglesOverlap(s, t));
      }),
      { numRuns: 2000 },
    );
  });
});

describe("stackingClauses: inputs and outputs", () => {
  const split = spokePattern([0, 6], "M");

  it("returns a frozen formula", () => {
    const { formula } = stackOf(split);
    expect(Object.isFrozen(formula)).toBe(true);
    expect(Object.isFrozen(formula.clauses)).toBe(true);
    expect(Object.isFrozen(formula.pairs)).toBe(true);
    expect(Object.isFrozen(formula.pairs[0])).toBe(true);
    expect(Object.isFrozen(formula.clauses[0])).toBe(true);
    expect(Object.isFrozen(formula.clauses[0]!.literals)).toBe(true);
  });

  it("looks pairs up in either order, and refuses a pair with no variable", () => {
    const { formula } = stackOf(split);
    expect(aboveLiteral(formula, 0, 1)).toBe(-aboveLiteral(formula, 1, 0));
    expect(Math.abs(aboveLiteral(formula, 0, 1))).toBe(1);
    expect(() => aboveLiteral(formula, 0, 0)).toThrow(RangeError);
    expect(() => aboveLiteral(formula, 0, 7)).toThrow(RangeError);
    // Flat creases give faces that touch but do not overlap, so there is no variable at all.
    const flat = stackOf(spokePattern([0, 6], "F")).formula;
    expect(() => aboveLiteral(flat, 0, 1)).toThrow(RangeError);
  });

  it("rejects an unassigned crease", () => {
    const folded = foldFaces(spokePattern([0, 6], "M"));
    if (folded.status !== "ok") throw new Error("must fold");
    expect(() => stackingClauses(spokePattern([0, 6], "U"), folded)).toThrow(RangeError);
  });

  it("rejects a folded placement that does not belong to the pattern", () => {
    const folded = foldFaces(split);
    if (folded.status !== "ok") throw new Error("must fold");
    expect(() =>
      stackingClauses(split, { transforms: folded.transforms.slice(1), flipped: folded.flipped }),
    ).toThrow(RangeError);
    expect(() =>
      stackingClauses(split, { transforms: folded.transforms, flipped: [true] }),
    ).toThrow(RangeError);
    // A flip flag that contradicts its map would silently invert every crease clause.
    expect(() =>
      stackingClauses(split, {
        transforms: folded.transforms,
        flipped: folded.flipped.map((f) => !f),
      }),
    ).toThrow(RangeError);
  });

  it("fails loudly, not silently, if a crease's faces do not overlap in the placement given", () => {
    // Identity maps leave both halves where they were, so the M crease's faces never overlap.
    const unfolded = { transforms: [IDENTITY, IDENTITY], flipped: [false, false] };
    expect(() => stackingClauses(split, unfolded)).toThrow(/should overlap/);
  });
});

describe("exact segment and triangle predicates", () => {
  const z = (a: number, b: number) => eis(a, b);

  it("segmentsOverlapCollinear needs a shared stretch, not a shared point or a parallel line", () => {
    expect(segmentsOverlapCollinear(z(0, 0), z(2, 0), z(1, 0), z(3, 0))).toBe(true);
    expect(segmentsOverlapCollinear(z(0, 0), z(2, 0), z(3, 0), z(1, 0))).toBe(true); // reversed
    expect(segmentsOverlapCollinear(z(0, 0), z(2, 0), z(0, 0), z(2, 0))).toBe(true); // identical
    expect(segmentsOverlapCollinear(z(0, 0), z(4, 0), z(1, 0), z(2, 0))).toBe(true); // contained
    expect(segmentsOverlapCollinear(z(0, 0), z(2, 0), z(2, 0), z(4, 0))).toBe(false); // end to end
    expect(segmentsOverlapCollinear(z(0, 0), z(2, 0), z(5, 0), z(6, 0))).toBe(false); // apart
    expect(segmentsOverlapCollinear(z(0, 0), z(2, 0), z(0, 1), z(2, 1))).toBe(false); // parallel
    expect(segmentsOverlapCollinear(z(0, 0), z(2, 0), z(1, -1), z(1, 1))).toBe(false); // crossing
    // A segment along the b axis, where the a coordinate does not vary.
    expect(segmentsOverlapCollinear(z(1, 0), z(1, 3), z(1, 2), z(1, 5))).toBe(true);
    expect(segmentsOverlapCollinear(z(1, 0), z(1, 3), z(1, 3), z(1, 5))).toBe(false);
    expect(() => segmentsOverlapCollinear(z(1, 1), z(1, 1), z(0, 0), z(2, 2))).toThrow(RangeError);
  });

  it("sameDirection tells parallel segments apart by sense", () => {
    expect(sameDirection(z(0, 0), z(2, 0), z(5, 0), z(9, 0))).toBe(1);
    expect(sameDirection(z(0, 0), z(2, 0), z(9, 0), z(5, 0))).toBe(-1);
    expect(sameDirection(z(0, 0), z(0, 2), z(3, 7), z(3, 4))).toBe(-1);
    expect(sameDirection(z(0, 0), z(1, 1), z(0, 0), z(3, 3))).toBe(1);
    expect(() => sameDirection(z(0, 0), z(2, 0), z(0, 0), z(0, 2))).toThrow(RangeError); // not parallel
    expect(() => sameDirection(z(0, 0), z(0, 0), z(0, 0), z(2, 0))).toThrow(RangeError);
  });

  it("segmentCrossesFace on a face with a notch (non-convex)", () => {
    // An L: the unit square at (1,1) is missing. Its vertices are listed counter-clockwise.
    const L = [z(0, 0), z(2, 0), z(2, 1), z(1, 1), z(1, 2), z(0, 2)];
    const tris = triangulateFace(L, [0, 1, 2, 3, 4, 5]);
    expect(tris).toHaveLength(4);
    expect(segmentCrossesFace(z(0, 0), z(1, 1), tris)).toBe(true); // across the lower-left square
    expect(segmentCrossesFace(z(0, 1), z(1, 1), tris)).toBe(true); // inside, ends on the notch
    expect(segmentCrossesFace(z(2, 1), z(1, 2), tris)).toBe(false); // spans the notch, outside L
    expect(segmentCrossesFace(z(1, 1), z(2, 1), tris)).toBe(false); // along the notch's edge
    expect(segmentCrossesFace(z(1, 1), z(3, 3), tris)).toBe(false); // leaves into the notch
    expect(segmentCrossesFace(z(-1, 1), z(3, 1), tris)).toBe(true); // through both arms
  });

  it("trianglesShareInterior is exact at large coordinates and rejects overflow", () => {
    const scale = (t: Triangle, k: number): Triangle =>
      t.map((p) => eis(p.a * k, p.b * k)) as unknown as Triangle;
    const near: Triangle = [z(0, 0), z(4, 0), z(0, 4)];
    const over: Triangle = [z(1, 1), z(5, 1), z(1, 5)];
    const apart: Triangle = [z(5, 5), z(7, 5), z(5, 7)];
    for (const k of [1, 1000, 1_000_000]) {
      expect(trianglesShareInterior([scale(near, k), scale(over, k)])).toBe(true);
      expect(trianglesShareInterior([scale(near, k), scale(apart, k)])).toBe(false);
      expect(trianglesShareInterior([scale(near, k), scale(over, k), scale(apart, k)])).toBe(false);
    }
    // Past 2^53 the orientation test throws rather than answering from rounded numbers.
    expect(() => trianglesShareInterior([scale(near, 2 ** 40), scale(over, 2 ** 40)])).toThrow(
      RangeError,
    );
  });

  it("trianglesShareInterior treats degenerate and empty input as no shared area", () => {
    const flat: Triangle = [z(0, 0), z(1, 1), z(2, 2)];
    const real: Triangle = [z(0, 0), z(4, 0), z(0, 4)];
    expect(trianglesShareInterior([])).toBe(false);
    expect(trianglesShareInterior([flat, real])).toBe(false);
    expect(trianglesShareInterior([real])).toBe(true);
    // Triangles that only touch along an edge or at a corner share no interior.
    expect(trianglesShareInterior([real, [z(4, 0), z(0, 4), z(4, 4)]])).toBe(false);
    expect(trianglesShareInterior([real, [z(4, 0), z(8, 0), z(4, 4)]])).toBe(false);
  });
});

describe("stackingClauses: transitivity only where three faces share a point", () => {
  /**
   * Three separate right triangles of side 4 (so no creases and no crease clauses), placed in the
   * folded plane by translations: the first at the origin, the others at `second` and `third`.
   */
  function threeTriangles(second: Eisenstein, third: Eisenstein) {
    const corner = (at: Eisenstein) => {
      const pts = [at, add(at, eis(4, 0)), add(at, eis(0, 4))];
      return [
        { from: pts[0]!, to: pts[1]!, assignment: "B" as const },
        { from: pts[1]!, to: pts[2]!, assignment: "B" as const },
        { from: pts[2]!, to: pts[0]!, assignment: "B" as const },
      ];
    };
    const cp = fromSegments(
      [],
      [...corner(eis(0, 0)), ...corner(eis(10, 0)), ...corner(eis(0, 10))],
    );
    const target = [eis(0, 0), second, third];
    const transforms = cp.faces.map((face) => {
      const v = cp.vertices[Math.min(...face)]!;
      const home = v.a >= 10 ? 1 : v.b >= 10 ? 2 : 0;
      const origin = [eis(0, 0), eis(10, 0), eis(0, 10)][home]!;
      const t = target[home]!;
      return affine([1, 0, 0, 1], eis(t.a - origin.a, t.b - origin.b));
    });
    return stackingClauses(cp, { transforms, flipped: transforms.map(() => false) });
  }

  it("emits two clauses when the three faces have a common point", () => {
    const formula = threeTriangles(eis(1, 0), eis(0, 1));
    expect(formula.pairs).toHaveLength(3);
    expect(formula.clauses.map((c) => c.kind)).toEqual(["transitivity", "transitivity"]);
  });

  it("emits none when they overlap pairwise but no point lies in all three", () => {
    // Translates by (3, 0) and (0, 3): each pair overlaps in a small triangle, the three do not
    // meet (a point in all three would need x ≥ 3, y ≥ 3 and x + y ≤ 4). A cyclic stacking of such
    // faces is physically possible, so forcing a linear order would reject valid foldings.
    const formula = threeTriangles(eis(3, 0), eis(0, 3));
    expect(formula.pairs).toHaveLength(3);
    expect(formula.clauses).toEqual([]);
  });
});

/** A strip of three facets A, B, C of widths a, b, c (Lang, Fig. 1.5, pp. 10–11): both creases the same. */
const stripOfThirds = (a: number, b: number, c: number, assignment: "M" | "V") =>
  parallelStrip([a, b, c], [assignment, assignment]);

describe("the strip of thirds (Lang, Fig. 1.5): the order of the outer facets", () => {
  const widths = [1, 2, 3, 4];
  const cases = widths.flatMap((a) => widths.flatMap((b) => widths.map((c) => ({ a, b, c }))));

  /** The faces of the strip from left to right, by the mean x of their corners. */
  const leftToRight = (cp: CreasePattern): number[] => {
    const meanX = (face: readonly number[]) =>
      face.reduce((sum, v) => sum + cp.vertices[v]!.a - cp.vertices[v]!.b / 2, 0) / face.length;
    return cp.faces.map((_, f) => f).sort((p, q) => meanX(cp.faces[p]!) - meanX(cp.faces[q]!));
  };

  /**
   * Can flap `inner` be the one next to B, with `outer` on its far side?
   *
   * Both flaps fold onto the same side of B, so the stack is B, inner, outer going up or going
   * down; the solver's frame fixes the first facet and may view the fold from either side, so
   * both directions are tried. The inner flap lies between B and the outer one, and its far edge
   * must not pass the hinge that joins B to the outer flap: it has to fit within B.
   */
  const innerFeasible = (
    formula: StackingFormula,
    inner: number,
    outer: number,
    middle: number,
  ): boolean => {
    const sat = (extra: number[][]) =>
      solveClauses(formula.variableCount, [...lits(formula), ...extra]) !== null;
    return (
      sat([[aboveLiteral(formula, inner, middle)], [aboveLiteral(formula, outer, inner)]]) ||
      sat([[aboveLiteral(formula, middle, inner)], [aboveLiteral(formula, inner, outer)]])
    );
  };

  it.each(["V", "M"] as const)(
    "lets a flap sit next to B only if it fits within B, and none if neither does (%s folds)",
    (assignment) => {
      let neither = 0;
      let both = 0;
      let one = 0;
      for (const { a, b, c } of cases) {
        const cp = stripOfThirds(a, b, c, assignment);
        expect(cp.faces).toHaveLength(3);
        const [fa, fb, fc] = leftToRight(cp) as [number, number, number];
        const { formula } = stackOf(cp);
        const overlap = formula.pairs.some(
          ([p, q]) => p === Math.min(fa, fc) && q === Math.max(fa, fc),
        );
        // Folded onto B, A covers [a, 2a] and C covers [a + b − c, a + b]: they overlap in area
        // exactly when a + c > b.
        expect(overlap).toBe(a + c > b);
        const feasible = solveClauses(formula.variableCount, lits(formula)) !== null;
        if (!overlap) {
          expect(feasible).toBe(true);
          continue;
        }
        const aInner = innerFeasible(formula, fa, fc, fb);
        const cInner = innerFeasible(formula, fc, fa, fb);
        expect(aInner).toBe(a <= b);
        expect(cInner).toBe(c <= b);
        expect(feasible).toBe(aInner || cInner);
        if (aInner && cInner) both++;
        else if (aInner || cInner) one++;
        else neither++;
      }
      // Non-vacuous: some strips allow both orders, some one, and some none (A and C both wider
      // than B: the third case of Fig. 1.5, where the assignment is invalid).
      expect(both).toBeGreaterThan(0);
      expect(one).toBeGreaterThan(0);
      expect(neither).toBeGreaterThan(0);
    },
  );

  it("leaves a strip of equal thirds with exactly two stacking orders of its outer facets", () => {
    const cp = stripOfThirds(2, 2, 2, "V");
    const [fa, fb, fc] = leftToRight(cp) as [number, number, number];
    const { formula } = stackOf(cp);
    expect([innerFeasible(formula, fa, fc, fb), innerFeasible(formula, fc, fa, fb)]).toEqual([
      true,
      true,
    ]);
  });
});
