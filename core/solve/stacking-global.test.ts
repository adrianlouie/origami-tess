import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { fromSegments, type CreasePattern } from "../pattern/crease-pattern";
import { localMvClauses } from "./clauses";
import { foldFaces } from "./folded-faces";
import { layerOracle } from "./layer-oracle";
import { solveClauses, mvSolutions, withMvAssignment } from "./solver";
import { stackingClauses, type StackingFormula } from "./stacking";
import { allAssignments, foldsFlat, POOL, subsets } from "../validate/testing";
import { kawasakiFlat, maekawaFlat } from "../validate/local-flat-foldability";
import {
  arrangement,
  foldedOrThrow,
  freed,
  lineSets,
  rawTriangleTwist,
  spokePattern,
} from "./testing";

/** The formula's verdict on a fully assigned pattern, or undefined when it does not fold at all. */
function formulaFoldable(cp: CreasePattern): boolean | undefined {
  const folded = foldFaces(cp);
  if (folded.status !== "ok") return undefined;
  const formula = stackingClauses(cp, folded);
  return (
    solveClauses(
      formula.variableCount,
      formula.clauses.map((c) => c.literals),
    ) !== null
  );
}

describe("stackingClauses against the physical layer oracle (whole-pattern, convex faces)", () => {
  it("agrees on lattice-line arrangements, for locally valid and locally broken M/V", () => {
    const stats = { compared: 0, foldable: 0, unfoldable: 0, skipped: 0 };
    for (const size of [2, 3, 4]) {
      for (const lines of lineSets(size)) {
        const creases = arrangement(lines);
        const free = fromSegments([], creases);
        const taken: boolean[][] = [];
        for (const solution of mvSolutions(localMvClauses(free))) {
          taken.push([...solution]);
          if (taken.length >= 6) break;
        }
        // Locally valid assignments, and each one with a single crease flipped (locally broken).
        const variants: CreasePattern[] = [];
        for (const model of taken) {
          variants.push(withMvAssignment(free, model));
          const target = free.edges.findIndex((e) => e.assignment === "U");
          const flipped = model.map((m, i) => (i === target ? !m : m));
          variants.push(withMvAssignment(free, flipped));
        }
        for (const cp of variants) {
          const verdict = layerOracle(cp, foldedOrThrow(cp));
          if (verdict === "too-big") {
            stats.skipped++;
            continue;
          }
          const got = formulaFoldable(cp);
          expect(got, `lines ${JSON.stringify(lines)}`).toBe(verdict === "foldable");
          stats.compared++;
          if (verdict === "foldable") stats.foldable++;
          else stats.unfoldable++;
        }
      }
    }
    // Non-vacuous: both verdicts occur. (Lattice lines never give a pattern that every vertex accepts
    // yet fails globally; the triangle twists below do.)
    expect(stats.foldable).toBeGreaterThan(0);
    expect(stats.unfoldable).toBeGreaterThan(0);
    expect(stats.compared).toBeGreaterThan(stats.skipped);
  });
});

describe("stackingClauses on the gadgets, against the layer oracle", () => {
  it.each([
    ["triangle twist (1, 1)", rawTriangleTwist(1, 1)],
    ["triangle twist (2, 1)", rawTriangleTwist(2, 1)],
  ])("agrees on every locally valid M/V assignment of the %s", (_, shipped) => {
    // Every assignment here passes Maekawa and Big-Little-Big at every vertex, so any failure to
    // fold is a global one that only the stacking constraints can see.
    const base = freed(shipped);
    let folds = 0;
    let fails = 0;
    for (const model of mvSolutions(localMvClauses(base))) {
      const cp = withMvAssignment(base, model);
      const verdict = layerOracle(cp, foldedOrThrow(cp));
      expect(verdict).not.toBe("too-big");
      expect(formulaFoldable(cp)).toBe(verdict === "foldable");
      if (verdict === "foldable") folds++;
      else fails++;
    }
    expect(folds).toBeGreaterThan(0);
    expect(fails).toBeGreaterThan(0);
  });

  it.each([
    ["hexagon twist (1, 2)", hexagonTwist(1, 2)],
    ["hexagon twist (2, 3)", hexagonTwist(2, 3)],
  ])("finds the shipped %s foldable, as the oracle does", (_, cp) => {
    expect(layerOracle(cp, foldedOrThrow(cp), 60)).toBe("foldable");
    expect(formulaFoldable(cp)).toBe(true);
  });

  it.each([
    ["triangle twist (1, 1)", rawTriangleTwist(1, 1)],
    ["triangle twist (2, 1)", rawTriangleTwist(2, 1)],
    ["triangle twist (1, 3)", rawTriangleTwist(1, 3)],
    ["triangle twist (5, 2)", rawTriangleTwist(5, 2)],
  ])("finds the %s below n >= 3m unfoldable, as the oracle does", (_, cp) => {
    // Locally valid (Phase 3) but not globally: the pleats collide when n < 3m, while other locally
    // valid assignments of the same creases do fold (see the test above).
    expect(layerOracle(cp, foldedOrThrow(cp), 60)).toBe("unfoldable");
    expect(formulaFoldable(cp)).toBe(false);
  });

  it("finds the shipped star twist (s = 1) unfoldable, from five faces", () => {
    // The oracle, which samples the folded paper directly, reaches the same verdict from the same
    // five faces. The chain: face 0 lies above face 4 (crease 3), so above 9 (face 0 crosses
    // crease 9), so above 12 (crease 14), so above 5 (face 0 crosses crease 15); then face 5
    // crosses crease 3, so it must also be below face 4, but crease 4 puts it above.
    const cp = starTwist(1);
    expect(formulaFoldable(cp)).toBe(false);
    const folded = foldedOrThrow(cp);
    const core = [0, 4, 5, 9, 12];
    expect(layerOracle(cp, folded, 26, new Set(core))).toBe("unfoldable");
    expect(formulaFoldableOn(stackingClauses(cp, folded), new Set(core))).toBe(false);
  });
});

/** The formula restricted to the clauses that mention only the given faces. */
function formulaFoldableOn(formula: StackingFormula, faces: ReadonlySet<number>): boolean {
  const kept = formula.clauses.filter((c) =>
    c.literals.every((l) => {
      const [i, j] = formula.pairs[Math.abs(l) - 1]!;
      return faces.has(i) && faces.has(j);
    }),
  );
  return (
    solveClauses(
      formula.variableCount,
      kept.map((c) => c.literals),
    ) !== null
  );
}

describe("stackingClauses and the layer oracle agree on every sampled set of faces", () => {
  // Every clause is a necessary condition, so the clauses inside a set of faces must be exactly as
  // satisfiable as the oracle's constraints inside the same set. This reaches patterns whose full
  // search is out of the oracle's range (the star twist has 435 overlapping pairs).
  it.each([
    ["star twist (1)", starTwist(1)],
    ["triangle twist (1, 1)", rawTriangleTwist(1, 1)],
    ["triangle twist (2, 1)", rawTriangleTwist(2, 1)],
    ["hexagon twist (2, 3)", hexagonTwist(2, 3)],
  ])("on the %s", (_, cp) => {
    const folded = foldedOrThrow(cp);
    const formula = stackingClauses(cp, folded);
    let seed = 987654321;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let unsat = 0;
    for (let trial = 0; trial < 150; trial++) {
      const size = Math.min(cp.faces.length, 3 + Math.floor(next() * 5));
      const faces = new Set<number>();
      while (faces.size < size) faces.add(Math.floor(next() * cp.faces.length));
      const verdict = layerOracle(cp, folded, 26, faces);
      expect(verdict).not.toBe("too-big");
      const expected = verdict === "foldable";
      expect(formulaFoldableOn(formula, faces), `faces ${[...faces].sort((a, b) => a - b)}`).toBe(
        expected,
      );
      if (!expected) unsat++;
    }
    // Both outcomes must occur for the triangle twists, which are the interesting ones.
    if (cp.faces.length === 7) expect(unsat).toBeGreaterThan(0);
  });
});

describe("the layer oracle itself", () => {
  it("agrees with the single-vertex brute force on every Kawasaki vertex of degree 4 and 6", () => {
    // The two oracles are written separately (a 1D cross-section against 2D point sampling), so
    // agreement here is what makes the oracle's verdicts on the twists worth trusting.
    let folds = 0;
    let rejects = 0;
    for (const degree of [4, 6]) {
      const strings = allAssignments(degree).filter(
        (a, i) => degree === 4 || maekawaFlat(a) || i % 5 === 0,
      );
      for (const idx of subsets(POOL.length, degree).filter(
        (_, n) => degree === 4 || n % 3 === 0,
      )) {
        const dirs = idx.map((i) => POOL[i]!);
        if (!kawasakiFlat(dirs)) continue;
        for (const assigns of strings) {
          const cp = spokePattern(idx, assigns);
          const verdict = layerOracle(cp, foldedOrThrow(cp));
          expect(verdict).not.toBe("too-big");
          const expected = foldsFlat(dirs, assigns);
          expect(verdict === "foldable").toBe(expected);
          if (expected) folds++;
          else rejects++;
        }
      }
    }
    expect(folds).toBeGreaterThan(0);
    expect(rejects).toBeGreaterThan(0);
  });
});
