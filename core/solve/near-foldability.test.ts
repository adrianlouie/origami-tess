import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { triangleTwist } from "../gadgets/triangle-twist";
import { faceDoubledArea, fromSegments, type CreasePattern } from "../pattern/crease-pattern";
import { localMvClauses } from "./clauses";
import { layerOracle } from "./layer-oracle";
import { mvConflict, nearFoldability, stackingCnf, type NearFoldability } from "./near-foldability";
import { mvSolutions, solveClauses, solveMv, withMvAssignment } from "./solver";
import { type StackingFormula } from "./stacking";
import {
  foldedOrThrow,
  freed,
  lineSets,
  arrangement,
  rawTriangleTwist,
  spokePattern,
} from "./testing";

type Partial = Extract<NearFoldability, { status: "partial" }>;

function partial(cp: CreasePattern): Partial {
  const result = nearFoldability(cp);
  if (result.status !== "partial") throw new Error(`expected partial, got ${result.status}`);
  return result;
}

/** Whether the stacking clauses whose faces all lie in `kept` are satisfiable (own filter, no shared code). */
function consistentOn(formula: StackingFormula, kept: ReadonlySet<number>): boolean {
  const clauses = formula.clauses
    .filter((c) =>
      c.literals.every((l) => formula.pairs[Math.abs(l) - 1]!.every((f) => kept.has(f))),
    )
    .map((c) => c.literals);
  return solveClauses(formula.variableCount, clauses) !== null;
}

/** All face sets, as sorted lists, of a pattern with n faces. */
function allFaceSets(n: number): number[][] {
  const out: number[][] = [];
  for (let mask = 0; mask < 2 ** n; mask++) {
    out.push(Array.from({ length: n }, (_, f) => f).filter((f) => (mask >> f) & 1));
  }
  return out;
}

/** The brute-force truth for a small pattern: every minimal conflicting face set and the cheapest repair. */
function bruteForce(cp: CreasePattern, formula: StackingFormula) {
  const n = cp.faces.length;
  const area = cp.faces.map((f) => faceDoubledArea(cp.vertices, f));
  const unsat = new Map<string, boolean>();
  const sets = allFaceSets(n);
  for (const s of sets) unsat.set(s.join(","), !consistentOn(formula, new Set(s)));
  const minimal = sets.filter(
    (s) => unsat.get(s.join(",")) && s.every((f) => !unsat.get(s.filter((g) => g !== f).join(","))),
  );
  let best: { size: number; weight: number } | null = null;
  for (const kept of sets) {
    if (unsat.get(kept.join(","))) continue;
    const dropped = Array.from({ length: n }, (_, f) => f).filter((f) => !kept.includes(f));
    const weight = dropped.reduce((sum, f) => sum + area[f]!, 0);
    if (
      best === null ||
      dropped.length < best.size ||
      (dropped.length === best.size && weight < best.weight)
    ) {
      best = { size: dropped.length, weight };
    }
  }
  return { minimal, best: best! };
}

describe("nearFoldability: acceptance, a pattern that does not fold names a minimal conflict", () => {
  it.each([
    ["triangle twist (1, 1)", rawTriangleTwist(1, 1)],
    ["triangle twist (2, 1)", rawTriangleTwist(2, 1)],
    ["triangle twist (5, 2)", rawTriangleTwist(5, 2)],
    ["partial star twist (1)", starTwist(1, "partial")],
  ])(
    "reports a minimal conflict of the %s, and removing its repair satisfies the clauses",
    (_, cp) => {
      const result = partial(cp);
      const { formula } = result;
      const all = new Set(cp.faces.keys());
      const conflict = new Set(result.conflict.faces);
      expect(consistentOn(formula, all)).toBe(false);
      // The conflict is contradictory on its own, and giving up any one of its faces fixes it.
      expect(consistentOn(formula, conflict)).toBe(false);
      for (const f of conflict) {
        expect(consistentOn(formula, new Set([...conflict].filter((g) => g !== f)))).toBe(true);
      }
      // Its clauses are contradictory on their own too, and minimally so.
      const cnf = stackingCnf(formula);
      const lits = result.conflict.clauses.map((c) => c.literals);
      expect(solveClauses(cnf.variableCount, lits)).toBeNull();
      result.conflict.clauses.forEach((_c, i) => {
        expect(
          solveClauses(
            cnf.variableCount,
            lits.filter((_l, j) => j !== i),
          ),
        ).not.toBeNull();
      });
      // Every named crease is an edge of the pattern.
      for (const e of result.conflict.creases) expect(cp.edges[e]).toBeDefined();
      // The repair makes the rest consistent, and it does not remove more than it must.
      const kept = new Set([...all].filter((f) => !result.repair.faces.includes(f)));
      expect(consistentOn(formula, kept)).toBe(true);
      for (const f of result.repair.faces) {
        expect(consistentOn(formula, new Set([...kept, f]))).toBe(false);
      }
      expect(result.repair.exact).toBe(true);
      // The score is the exact kept share of the area.
      const area = cp.faces.map((f) => faceDoubledArea(cp.vertices, f));
      const total = area.reduce((a, b) => a + b, 0);
      expect(result.score).toEqual({
        num: total - result.repair.faces.reduce((s, f) => s + area[f]!, 0),
        den: total,
      });
      expect(result.score.num).toBeGreaterThan(0);
      expect(result.score.num).toBeLessThan(result.score.den);
    },
  );

  it("finds the partial star twist (1) is a near miss: four faces of thirty give it up", () => {
    // The five faces of 5.1b (0, 4, 5, 9, 12) are not a minimal conflict: face 9 can be dropped,
    // leaving the four faces 0, 4, 5, 12. A minimal conflict is not a minimum one, so the engine's
    // first conflict (a different, five-face one) is only required to be minimal, checked above.
    const result = partial(starTwist(1, "partial"));
    const four = new Set([0, 4, 5, 12]);
    expect(consistentOn(result.formula, new Set([0, 4, 5, 9, 12]))).toBe(false);
    expect(consistentOn(result.formula, four)).toBe(false);
    for (const f of four) {
      expect(consistentOn(result.formula, new Set([...four].filter((g) => g !== f)))).toBe(true);
    }
    expect(result.conflict.faces.length).toBeGreaterThanOrEqual(4);
    expect(result.conflict.faces.length).toBeLessThanOrEqual(5);
    expect(result.repair.faces).toHaveLength(4);
    expect(result.score).toEqual({ num: 50, den: 54 });
  });

  it("finds the triangle twist below n = 3m conflicts in six faces around its centre, and gives up one", () => {
    for (const [n, m] of [
      [1, 1],
      [2, 1],
      [5, 2],
    ] as const) {
      const result = partial(rawTriangleTwist(n, m));
      expect(result.conflict.faces).toEqual([1, 2, 3, 4, 5, 6]);
      expect(result.repair.faces).toHaveLength(1);
    }
  });

  it("agrees with the physical layer oracle that the repaired triangle twist stacks", () => {
    for (const [n, m] of [
      [1, 1],
      [2, 1],
    ] as const) {
      const cp = rawTriangleTwist(n, m);
      const result = partial(cp);
      const folded = foldedOrThrow(cp);
      const conflict = new Set(result.conflict.faces);
      // The oracle samples the folded paper directly and shares no code with the clauses.
      expect(layerOracle(cp, folded, 26, conflict)).toBe("unfoldable");
      const kept = new Set([...cp.faces.keys()].filter((f) => !result.repair.faces.includes(f)));
      expect(layerOracle(cp, folded, 26, kept)).toBe("foldable");
    }
  });

  it.each([
    ["hexagon twist (1, 2)", hexagonTwist(1, 2)],
    ["hexagon twist (2, 3)", hexagonTwist(2, 3)],
    ["triangle twist (3, 1)", triangleTwist(3, 1)],
    ["triangle twist (6, 2)", triangleTwist(6, 2)],
  ])("scores the foldable %s as 1", (_, cp) => {
    const result = nearFoldability(cp);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.score.num).toBe(result.score.den);
    expect(result.score.num).toBeGreaterThan(0);
  });
});

describe("nearFoldability against brute force over every set of faces", () => {
  it("matches the true minimal conflicts and the cheapest repair on the triangle twists", () => {
    for (const [n, m] of [
      [1, 1],
      [2, 1],
      [5, 2],
      [1, 3],
    ] as const) {
      const cp = rawTriangleTwist(n, m);
      const result = partial(cp);
      const truth = bruteForce(cp, result.formula);
      expect(truth.minimal.map((s) => s.join(","))).toContain(result.conflict.faces.join(","));
      const area = cp.faces.map((f) => faceDoubledArea(cp.vertices, f));
      expect(result.repair.faces.length).toBe(truth.best.size);
      expect(result.repair.faces.reduce((s, f) => s + area[f]!, 0)).toBe(truth.best.weight);
    }
  });

  it("matches on lattice-line arrangements, both locally valid and with one crease flipped", () => {
    let checked = 0;
    let broken = 0;
    for (const size of [2, 3]) {
      for (const lines of lineSets(size)) {
        const free = fromSegments([], arrangement(lines));
        if (free.faces.length > 12) continue;
        const taken: boolean[][] = [];
        for (const solution of mvSolutions(localMvClauses(free))) {
          taken.push([...solution]);
          if (taken.length >= 3) break;
        }
        const target = free.edges.findIndex((e) => e.assignment === "U");
        for (const model of taken) {
          for (const flip of [false, true]) {
            const cp = withMvAssignment(
              free,
              model.map((m, i) => (flip && i === target ? !m : m)),
            );
            const result = nearFoldability(cp);
            if (result.status === "inconsistent") continue;
            checked++;
            const truth = bruteForce(cp, result.formula);
            if (result.status === "ok") {
              expect(truth.best.size).toBe(0);
              continue;
            }
            broken++;
            expect(truth.minimal.map((s) => s.join(","))).toContain(
              result.conflict.faces.join(","),
            );
            expect(result.repair.faces.length).toBe(truth.best.size);
          }
        }
      }
    }
    // Non-vacuous: both verdicts were compared.
    expect(checked).toBeGreaterThan(10);
    expect(broken).toBeGreaterThan(0);
  });
});

describe("mvConflict: a vertex-level explanation of local M/V failures", () => {
  it("is sat for a pattern the solver completes", () => {
    expect(mvConflict(hexagonTwist(1, 2)).status).toBe("sat");
  });

  it("reports Kawasaki failures as they are", () => {
    const cp = spokePattern([0, 2], "U");
    const result = mvConflict(cp);
    expect(result.status).toBe("kawasaki");
    expect(solveMv(cp).status).toBe("kawasaki");
  });

  it("names the one vertex whose fixed creases break Maekawa", () => {
    // Spokes at 0°, 90°, 180°, 270° have four equal sectors, so Kawasaki holds; four mountains give
    // #M − #V = 4, not ±2.
    const cp = spokePattern([0, 3, 6, 9], "M");
    const result = mvConflict(cp);
    expect(result.status).toBe("unsat");
    if (result.status !== "unsat") return;
    expect(result.conflict.vertices).toHaveLength(1);
    expect(result.repair.vertices).toEqual(result.conflict.vertices);
    expect(result.repair.exact).toBe(true);
    expect(result.conflict.clauses.every((c) => c.kind === "maekawa" || c.kind === "fixed")).toBe(
      true,
    );
  });

  it("agrees with the solver on freed gadgets: satisfiable exactly when solveMv is sat", () => {
    for (const cp of [hexagonTwist(1, 2), triangleTwist(3, 1), starTwist(1)]) {
      const free = freed(cp);
      expect(mvConflict(free).status === "sat").toBe(solveMv(free).status === "sat");
    }
  });
});
