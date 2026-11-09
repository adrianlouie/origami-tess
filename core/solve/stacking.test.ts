import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { eis, type Eisenstein } from "../lattice/eisenstein";
import { primitive } from "../lattice/direction";
import type { Assignment, CreasePattern } from "../pattern/crease-pattern";
import {
  allAssignments,
  candidates,
  foldsFlat,
  layerOrderValid,
  permutations,
  POOL,
  subsets,
} from "../validate/testing";
import { kawasakiFlat } from "../validate/local-flat-foldability";
import { foldFaces } from "./folded-faces";
import {
  segmentCrossesFace,
  trianglesOverlap,
  trianglesShareInterior,
  triangulateFace,
  type Triangle,
} from "./overlap";
import { solveClauses } from "./solver";
import { aboveLiteral, stackingClauses, type StackingFormula } from "./stacking";
import { SPOKE_ENDS, sectorFaces, spokePattern } from "./testing";

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

  it("is satisfiable exactly when the vertex folds flat (degrees 4 and 6, every M/V string)", () => {
    let folds = 0;
    let rejected = 0;
    for (const degree of [4, 6]) {
      const strings = allAssignments(degree);
      for (const idx of spokesOf(degree)) {
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
  function withFlatSpokes(degree: number, extra: number, rejects = true) {
    const kinds: Record<string, number> = {};
    let checked = 0;
    let folds = 0;
    candidates(degree).forEach(({ dirs, assigns }) => {
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
    const kinds = withFlatSpokes(4, 1);
    expect(kinds["taco-taco"]).toBeGreaterThan(0);
  });

  it("ignores flat creases: two F spokes on a degree-4 vertex (taco-tortilla clauses)", () => {
    // With one F spoke the taco-tortilla clauses are implied by the others; dropping them from
    // the encoder first fails here, where two flat runs share a fold.
    const kinds = withFlatSpokes(4, 2);
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
