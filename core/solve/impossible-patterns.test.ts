import { describe, expect, it } from "vitest";
import { toCartesian } from "../simulate/embed";
import { equals, eis, type Eisenstein } from "../lattice/eisenstein";
import type { CreasePattern } from "../pattern/crease-pattern";
import { borderRuns } from "../validate/border-vertices";
import {
  checkLocalFlatFoldability,
  foldingCreases,
  interiorVertices,
  kawasakiFlat,
} from "../validate/local-flat-foldability";
import { localMvClauses, type MvFormula } from "./clauses";
import { minimalConflict } from "./conflict";
import { layerOrder } from "./layer-order";
import { solveClauses, solveFormula, solveMv, withMvAssignment } from "./solver";
import { hullTriangle } from "./testing";

/**
 * Patterns where Kawasaki and Maekawa hold at every interior vertex and a valid assignment still
 * does not exist, because the Big-Little-Big conditions form an odd loop: two creases must differ
 * at each corner of a triangle and three creases cannot pairwise differ (Lang, *Twists, Tilings,
 * and Tessellations*, §1.5.3, Thm 16, p. 47, Figs. 1.40 and 1.45).
 */

const indexOf = (cp: CreasePattern, z: Eisenstein) => cp.vertices.findIndex((p) => equals(p, z));

/** The angles in degrees, counter-clockwise from the first crease, between the creases at v. */
function sectorsAt(cp: CreasePattern, v: number): number[] {
  const { directions } = foldingCreases(cp, v);
  const angles = directions.map((d) => {
    const p = toCartesian(d);
    return (Math.atan2(p.y, p.x) * 180) / Math.PI;
  });
  return angles.map((a, i) => {
    const next = angles[(i + 1) % angles.length]!;
    return Math.round(next - a + (next <= a ? 360 : 0));
  });
}

/** The formula's clauses as a tagged formula whose tag is the vertex that produced each clause. */
function conflictOf(formula: MvFormula) {
  return minimalConflict({
    variableCount: formula.variableCount,
    clauses: formula.clauses.map((c) => c.literals),
    tags: formula.clauses.map((c) => ("vertex" in c ? [c.vertex] : [])),
  });
}

describe.each([2, 4])("Hull's impossible triangle, side %i (Fig. 1.40)", (side) => {
  const { pattern: cp } = hullTriangle(side);
  const corners = [eis(0, 0), eis(side, 0), eis(side, side)].map((z) => indexOf(cp, z));

  it("has Kawasaki at every vertex and sectors 60°, 90°, 120°, 90° at each corner", () => {
    expect(interiorVertices(cp)).toEqual(expect.arrayContaining(corners));
    expect(checkLocalFlatFoldability(cp).kawasaki).toEqual([]);
    for (const v of corners) {
      expect(kawasakiFlat(foldingCreases(cp, v).directions)).toBe(true);
      expect([...sectorsAt(cp, v)].sort((a, b) => a - b)).toEqual([60, 90, 90, 120]);
    }
  });

  it("is satisfiable at each corner on its own: the contradiction is global", () => {
    const formula = localMvClauses(cp);
    for (const v of corners) {
      const own = formula.clauses.filter((c) => "vertex" in c && c.vertex === v);
      expect(
        solveClauses(
          formula.variableCount,
          own.map((c) => c.literals),
        ),
      ).not.toBeNull();
    }
  });

  it("has no assignment, and the minimal conflict is the three corners' Big-Little-Big clauses", () => {
    expect(solveMv(cp).status).toBe("unsat");
    const conflict = conflictOf(localMvClauses(cp))!;
    expect(conflict.tags).toEqual([...corners].sort((a, b) => a - b));
    const formula = localMvClauses(cp);
    // The odd loop needs only the "differ" half of each corner's pair, never a Maekawa clause.
    expect(conflict.clauses.every((c) => formula.clauses[c]!.kind === "big-little-big")).toBe(true);
  });
});

describe.each([2, 4])("a border vertex closes the odd loop, side %i (Fig. 1.45)", (side) => {
  const { pattern: cp } = hullTriangle(side, true);
  const [a, b, c] = [eis(0, 0), eis(side, 0), eis(side, side)].map((z) => indexOf(cp, z)) as [
    number,
    number,
    number,
  ];

  it("passes Kawasaki and has valid corners A and B, while C is on the edge of the sheet", () => {
    expect(interiorVertices(cp).sort((x, y) => x - y)).toEqual([a, b].sort((x, y) => x - y));
    expect(checkLocalFlatFoldability(cp).kawasaki).toEqual([]);
    expect(sectorsAt(cp, a).sort((x, y) => x - y)).toEqual([60, 90, 90, 120]);
    // C has paper on 240° only: sectors 90°, 60°, 90° between its two notch edges.
    expect(borderRuns(cp)).toHaveLength(1);
    expect(borderRuns(cp)[0]!.vertex).toBe(c);
  });

  it("is unsatisfiable because of the border vertex, and the conflict names all three corners", () => {
    expect(solveMv(cp).status).toBe("unsat");
    const conflict = conflictOf(localMvClauses(cp))!;
    expect(conflict.tags).toEqual([a, b, c].sort((x, y) => x - y));
    const formula = localMvClauses(cp);
    expect(conflict.clauses.some((k) => formula.clauses[k]!.kind === "border-big-little-big")).toBe(
      true,
    );
  });

  it("was satisfiable without the border clauses, and that assignment cannot fold flat", () => {
    const formula = localMvClauses(cp);
    const interiorOnly = {
      ...formula,
      clauses: formula.clauses.filter((k) => k.kind !== "border-big-little-big"),
    };
    const old = solveFormula(interiorOnly);
    expect(old.status).toBe("sat");
    if (old.status !== "sat") return;
    const assigned = withMvAssignment(cp, old.assignment);
    // The report now names the border vertex, and the layer stage rejects the folding.
    expect(checkLocalFlatFoldability(assigned).borderBigLittleBig).toEqual([c]);
    expect(layerOrder(assigned).status).not.toBe("ok");
  });
});
