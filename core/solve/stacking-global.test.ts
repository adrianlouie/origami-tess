import { describe, expect, it } from "vitest";
import { hexagonFrame, type Crease } from "../gadgets/crease";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { triangleTwist } from "../gadgets/triangle-twist";
import { add, eis, type Eisenstein } from "../lattice/eisenstein";
import { hexDistance } from "../lattice/grid";
import { fromSegments, type CreasePattern } from "../pattern/crease-pattern";
import { localMvClauses } from "./clauses";
import { foldFaces } from "./folded-faces";
import { layerOracle } from "./layer-oracle";
import { solveClauses, mvSolutions, withMvAssignment } from "./solver";
import { stackingClauses, type StackingFormula } from "./stacking";
import { allAssignments, foldsFlat, POOL, subsets } from "../validate/testing";
import { kawasakiFlat, maekawaFlat } from "../validate/local-flat-foldability";
import { spokePattern } from "./testing";

/**
 * Whole lattice lines in a radius-2 hexagon, as unit edges inside a "B" frame, all unassigned.
 * Every crossing of lattice lines passes Kawasaki, so M/V is the only thing left to get right.
 */
function arrangement(lines: readonly { dir: number; offset: number }[]): Crease[] {
  const dirs = [eis(1, 0), eis(0, 1), eis(1, 1)];
  const creases: Crease[] = hexagonFrame(2);
  const seen = new Set<string>();
  for (const { dir, offset } of lines) {
    const d = dirs[dir]!;
    const base = dir === 0 ? eis(0, offset) : eis(offset, 0);
    const points: Eisenstein[] = [];
    for (let t = -6; t <= 6; t++) {
      const p = add(base, { a: d.a * t, b: d.b * t });
      if (hexDistance(p) <= 2) points.push(p);
    }
    for (let i = 0; i + 1 < points.length; i++) {
      const from = points[i]!;
      const to = points[i + 1]!;
      if (hexDistance(from) === 2 && hexDistance(to) === 2) continue;
      const key = `${from.a},${from.b}-${to.a},${to.b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      creases.push({ from, to, assignment: "U" });
    }
  }
  return creases;
}

const ALL_LINES = [0, 1, 2].flatMap((dir) => [-1, 0, 1].map((offset) => ({ dir, offset })));

/** Every choice of `size` lines from the nine that cross the radius-2 hexagon. */
function lineSets(size: number): { dir: number; offset: number }[][] {
  const out: { dir: number; offset: number }[][] = [];
  const pick = (start: number, chosen: { dir: number; offset: number }[]) => {
    if (chosen.length === size) {
      out.push(chosen);
      return;
    }
    for (let i = start; i < ALL_LINES.length; i++) pick(i + 1, [...chosen, ALL_LINES[i]!]);
  };
  pick(0, []);
  return out;
}

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

function foldedOrThrow(cp: CreasePattern) {
  const folded = foldFaces(cp);
  if (folded.status !== "ok") throw new Error("pattern does not fold");
  return folded;
}

/** The pattern with every M/V crease reset to "U", ready for the M/V solver. */
function freed(cp: CreasePattern): CreasePattern {
  return {
    ...cp,
    edges: cp.edges.map((e) =>
      e.assignment === "M" || e.assignment === "V" ? { ...e, assignment: "U" as const } : e,
    ),
  };
}

describe("stackingClauses on the gadgets, against the layer oracle", () => {
  it.each([
    ["triangle twist (1, 1)", triangleTwist(1, 1)],
    ["triangle twist (2, 1)", triangleTwist(2, 1)],
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
    ["triangle twist (1, 1)", triangleTwist(1, 1)],
    ["triangle twist (2, 1)", triangleTwist(2, 1)],
    ["triangle twist (1, 3)", triangleTwist(1, 3)],
  ])("finds the shipped %s unfoldable, as the oracle does", (_, cp) => {
    // Locally valid (Phase 3) but not globally: the assignment is one of the bad ones, while other
    // locally valid assignments of the same creases do fold (see the test above).
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
    ["triangle twist (1, 1)", triangleTwist(1, 1)],
    ["triangle twist (2, 1)", triangleTwist(2, 1)],
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
