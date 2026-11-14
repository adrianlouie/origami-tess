import { describe, expect, it } from "vitest";
import { assignmentFromPattern } from "../solve/clauses";
import { nearFoldability } from "../solve/near-foldability";
import { isBetter, repairAssignment, scoreAssignment, singleCreaseMoves } from "./repair";
import { edgeOrbits, mulberry32, randomOrientation } from "./symmetric-motif";
import { orientedPattern, regularTiling, shrinkRotate, type TilingKind } from "./shrink-rotate";

/**
 * Step 8.2 acceptance: every generated shrink-rotate pattern runs through the stacking solver
 * (`nearFoldability` calls `stackingClauses`), and repair never lowers the score (Lang §6.4.3 for
 * the construction; docs/PLAN.md 8.2 for the decision and the sizes).
 */
const SIZES: readonly (readonly [TilingKind, number])[] = [
  ["3^6", 2],
  ["6^3", 4],
  ["3.6.3.6", 3],
];
const SEEDS = [1, 2, 3, 4];

describe("generated shrink-rotate patterns (step 8.2 acceptance)", () => {
  for (const [kind, radius] of SIZES) {
    for (const mirror of [false, true]) {
      it(`every seeded orientation of ${kind} (radius ${radius}, ${mirror ? "mirror" : "default"} hand) folds flat`, () => {
        const sr = shrinkRotate(regularTiling(kind, radius), { mirror });
        const orbits = edgeOrbits(sr, { rotation: 1 });
        for (const seed of SEEDS) {
          const start = randomOrientation(orbits, sr.interior.length, mulberry32(seed));
          const cp = orientedPattern(sr, start);
          expect(cp).not.toBeNull();
          const verdict = nearFoldability(cp!);
          expect(verdict.status).toBe("ok");
        }
      });
    }
  }

  it("repair turns a random raw assignment of 3^6 into a folding one and the score never drops", () => {
    const sr = shrinkRotate(regularTiling("3^6", 1), { mirror: false });
    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      const start = sr.cp.edges.map(() => rng() < 0.5);
      const result = repairAssignment(sr.cp, start, singleCreaseMoves(sr.cp), { maxRounds: 8 });
      for (let i = 1; i < result.trace.length; i++) {
        expect(isBetter(result.trace[i]!, result.trace[i - 1]!)).toBe(true);
      }
      expect(result.trace[0]!.num).toBeLessThan(result.trace[0]!.den);
      expect(result.status).toBe("ok");
      expect(scoreAssignment(sr.cp, result.assignment)).toEqual(result.trace.at(-1));
    }
  });

  it("repair undoes one flipped pleat crease on every tiling", () => {
    for (const [kind, radius] of [
      ["3^6", 1],
      ["6^3", 3],
      ["3.6.3.6", 2],
    ] as const) {
      const sr = shrinkRotate(regularTiling(kind, radius), { mirror: false });
      const good = orientedPattern(
        sr,
        sr.interior.map((_, j) => j % 2 === 0),
      )!;
      const assignment = assignmentFromPattern(good);
      const broken = [...assignment];
      broken[sr.interior[0]!.creases[0]] = !broken[sr.interior[0]!.creases[0]];
      expect(isBetter(scoreAssignment(sr.cp, assignment), scoreAssignment(sr.cp, broken))).toBe(
        true,
      );
      const result = repairAssignment(sr.cp, broken, singleCreaseMoves(sr.cp), { maxRounds: 4 });
      expect(result.status).toBe("ok");
    }
  });
});
