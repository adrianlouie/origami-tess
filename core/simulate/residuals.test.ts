/**
 * Tests for the residuals of a settled bar-and-hinge state (step 7.3c): the angle defect, the
 * consistency (closure) residual, the face normals, and Theorem 11 on the fold signs. They check
 * what `relax` leaves behind, from the geometry alone, so none of them reads a spring.
 */

import { describe, expect, it } from "vitest";
import { GADGET_ENTRIES } from "../../app/viewer/gadgets";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { sub } from "../lattice/eisenstein";
import { fromSegments, type CreasePattern } from "../pattern/crease-pattern";
import { solveMv, withMvAssignment } from "../solve/solver";
import { arrangement, spokePattern } from "../solve/testing";
import { interiorVertices } from "../validate/border-vertices";
import { halfPlaneMvSplit } from "../validate/half-plane";
import { foldAngle } from "./dihedral";
import { RENDER_TOLERANCE, toCartesian } from "./embed";
import { barHingeModel, DEFAULT_PARAMS, type BarHingeModel } from "./model";
import { foldSweep, restState } from "./relax";
import {
  angleDefect,
  closureResidual,
  consistencyResidual,
  faceNormals,
  interiorMeshVertices,
  maxStrain,
  settledResiduals,
} from "./residuals";

/** The pattern, its model, and the origin vertex of a spoke pattern with the solver's M/V. */
function solvedSpokes(spokes: number[], params = DEFAULT_PARAMS) {
  const free = spokePattern(spokes, "U");
  const solved = solveMv(free);
  if (solved.status !== "sat") throw new Error("vertex has no M/V assignment");
  const cp = withMvAssignment(free, solved.assignment);
  const origin = cp.vertices.findIndex((p) => p.a === 0 && p.b === 0);
  return { cp, model: barHingeModel(cp, params), origin };
}

/** The fold angle of the hinge on a crease-pattern edge. */
function creaseAngle(model: BarHingeModel, x: Float64Array, edge: number): number {
  const hinge = model.hinges.find((h) => h.edge === edge);
  if (!hinge) throw new Error(`edge ${edge} has no hinge`);
  return foldAngle(x, hinge);
}

describe("closureResidual (Lang §9.4.2, Eqs. 9.57 to 9.62)", () => {
  it("is zero for a flat vertex whose sectors fill the full turn", () => {
    expect(closureResidual([1, 2, Math.PI, 2 * Math.PI - 3 - Math.PI], [0, 0, 0, 0])).toBeCloseTo(
      0,
      12,
    );
  });

  it("is zero for a straight crease folded by the same angle on both rays", () => {
    // Two half-planes folded along one line: the creases at 0° and 180° carry the same fold.
    for (const fold of [0.3, 1.2, 3]) {
      expect(closureResidual([Math.PI, Math.PI], [fold, fold])).toBeCloseTo(0, 12);
    }
  });

  it("is not zero when one crease of that straight fold is turned the wrong way", () => {
    expect(closureResidual([Math.PI, Math.PI], [0.8, -0.8])).toBeGreaterThan(0.5);
  });

  it("does not change when every fold angle changes sign (a mirror image folds as well)", () => {
    const sectors = [1, 1, Math.PI - 1, Math.PI - 1];
    const folds = [0.4, 0.9, -0.4, 0.9];
    expect(closureResidual(sectors, folds)).toBeCloseTo(
      closureResidual(
        sectors,
        folds.map((v) => -v),
      ),
      12,
    );
  });

  it("rejects mismatched lengths", () => {
    expect(() => closureResidual([1, 2], [0])).toThrow(RangeError);
  });
});

describe("the flat rest state has no residual", () => {
  describe.each(GADGET_ENTRIES)("$name", ({ build }) => {
    it("has zero strain, angle defect, consistency residual and panel flex", () => {
      const model = barHingeModel(build());
      const r = settledResiduals(model, restState(model).positions);
      expect(r.maxStrain).toBeLessThan(RENDER_TOLERANCE);
      expect(r.maxDefect).toBeLessThan(RENDER_TOLERANCE);
      expect(r.maxConsistency).toBeLessThan(RENDER_TOLERANCE);
      expect(r.maxPanelFlex).toBeLessThan(RENDER_TOLERANCE);
    });

    it("has the interior vertices of the crease pattern as its interior mesh vertices", () => {
      const cp = build();
      expect(interiorMeshVertices(barHingeModel(cp))).toEqual(interiorVertices(cp));
    });
  });
});

describe("angleDefect (Lang Eq. 1.43: the angles round an interior vertex sum to 2π)", () => {
  it("equals 2π minus six apex angles for a hexagonal cone, a closed form", () => {
    // Six spokes to the corners, and the origin raised by h: the triangle O, A, B (|A| = |B| = 2,
    // A·B = 2) has apex angle acos((2 + h²) / (4 + h²)), and the midpoint M of AB splits it without
    // changing the sum.
    const { model, origin } = solvedSpokes([0, 2, 4, 6, 8, 10]);
    const x = Float64Array.from(model.rest);
    for (const h of [0.2, 0.5, 1]) {
      x[3 * origin + 2] = h;
      const expected = 2 * Math.PI - 6 * Math.acos((2 + h * h) / (4 + h * h));
      expect(angleDefect(model, x, origin)).toBeCloseTo(expected, 10);
      expect(expected).toBeGreaterThan(0);
    }
  });

  it("is negative at a saddle (the vertex lowered and its neighbours alternately raised)", () => {
    const { model, origin } = solvedSpokes([0, 2, 4, 6, 8, 10]);
    const x = Float64Array.from(model.rest);
    // Raise every other corner and lower the others: the angles round the origin grow past 2π.
    const ring = model.triangles.flatMap((t) => (t.includes(origin) ? [...t] : []));
    let sign = 1;
    for (const n of new Set(ring)) {
      if (n === origin) continue;
      x[3 * n + 2] = 0.4 * sign;
      sign = -sign;
    }
    expect(angleDefect(model, x, origin)).toBeLessThan(0);
  });

  it("rejects a vertex on the edge of the sheet, which has no full turn", () => {
    const { model } = solvedSpokes([0, 2, 4, 6, 8, 10]);
    const border = [...Array(model.rest.length / 3).keys()].find(
      (v) => !interiorMeshVertices(model).includes(v),
    )!;
    expect(() => angleDefect(model, model.rest, border)).toThrow(RangeError);
    expect(() => consistencyResidual(model, model.rest, border)).toThrow(RangeError);
  });
});

describe("a rigid fold by hand has no residual, and a cone does", () => {
  // One straight crease through the origin, the upper half-plane turned about the x axis by φ:
  // every triangle keeps its shape, so the fold is an isometry.
  const { cp, model, origin } = solvedSpokes([0, 6]);
  const fold = (phi: number): Float64Array => {
    const x = Float64Array.from(model.rest);
    for (let n = 0; n < x.length / 3; n++) {
      const y = model.rest[3 * n + 1]!;
      if (y > 1e-9) {
        x[3 * n + 1] = y * Math.cos(phi);
        x[3 * n + 2] = y * Math.sin(phi);
      }
    }
    return x;
  };

  it.each([0.3, 0.8, 2])("has zero strain, defect and consistency at φ = %d", (phi) => {
    const x = fold(phi);
    expect(maxStrain(model, x)).toBeLessThan(1e-12);
    expect(angleDefect(model, x, origin)).toBeCloseTo(0, 10);
    expect(consistencyResidual(model, x, origin)).toBeLessThan(1e-9);
    const creases = cp.edges.flatMap((e, i) => (e.assignment === "V" ? [i] : []));
    for (const edge of creases) expect(creaseAngle(model, x, edge)).toBeCloseTo(phi, 10);
  });

  it("gives every triangle of the upper half the normal (0, −sin φ, cos φ)", () => {
    const phi = 0.8;
    const normals = faceNormals(fold(phi), model.triangles);
    model.triangles.forEach((t, i) => {
      const upper = t.some((n) => model.rest[3 * n + 1]! > 1e-9);
      expect(normals[3 * i]!).toBeCloseTo(0, 12);
      expect(normals[3 * i + 1]!).toBeCloseTo(upper ? -Math.sin(phi) : 0, 12);
      expect(normals[3 * i + 2]!).toBeCloseTo(upper ? Math.cos(phi) : 1, 12);
    });
  });

  it("has a consistency residual at a cone that the 3D corner angles alone would hide", () => {
    // Raising the origin of a flat hexagonal fan changes the corner angles but keeps every real
    // dihedral angle consistent with them, so a closure built from the 3D angles is the identity
    // for any vertex. The flat sector angles are what make it a test.
    const fan = solvedSpokes([0, 2, 4, 6, 8, 10]);
    const x = Float64Array.from(fan.model.rest);
    x[3 * fan.origin + 2] = 0.5;
    expect(consistencyResidual(fan.model, x, fan.origin)).toBeGreaterThan(0.05);
  });
});

describe("faceNormals", () => {
  it("gives +z for every triangle of a flat sheet", () => {
    const { model } = solvedSpokes([0, 2, 4, 6, 8, 10]);
    const normals = faceNormals(model.rest, model.triangles);
    model.triangles.forEach((_, i) => {
      expect(normals[3 * i]!).toBeCloseTo(0, 12);
      expect(normals[3 * i + 1]!).toBeCloseTo(0, 12);
      expect(normals[3 * i + 2]!).toBeCloseTo(1, 12);
    });
  });

  it("gives the zero vector for a collapsed triangle instead of NaN", () => {
    const { model } = solvedSpokes([0, 2, 4, 6, 8, 10]);
    const x = new Float64Array(model.rest.length);
    const normals = faceNormals(x, model.triangles);
    expect(Array.from(normals).every((v) => v === 0)).toBe(true);
  });
});

describe("settled degree-4 vertices stay isometric as the panels stiffen", () => {
  // The panels of a bar-and-hinge model flex a little, so the residuals are small and not zero;
  // they must fall as the panel stiffness grows. The two settings are the 6.2a closure test (×1)
  // and the 6.3 energy test (×10).
  const soft = { ...DEFAULT_PARAMS, axial: 2000, facet: 500, angle: 1000 };
  const stiff = { ...DEFAULT_PARAMS, axial: 20000, facet: 5000, angle: 10000 };
  const vertices = [
    { name: "sectors 60, 90, 120, 90", spokes: [0, 2, 5, 9] },
    { name: "sectors 60, 60, 120, 120", spokes: [0, 2, 4, 8] },
    { name: "sectors 30, 30, 150, 150", spokes: [0, 1, 2, 7] },
  ];

  it.each(vertices)("$name", ({ spokes }) => {
    const at = (params: typeof soft) => {
      const { model, origin } = solvedSpokes(spokes, params);
      return foldSweep(model, [0.2, 0.4]).map((r) => ({
        defect: Math.abs(angleDefect(model, r.positions, origin)),
        consistency: consistencyResidual(model, r.positions, origin),
      }));
    };
    const loose = at(soft);
    const tight = at(stiff);
    loose.forEach((l, i) => {
      expect(l.defect).toBeLessThan(0.05);
      expect(l.consistency).toBeLessThan(0.05);
      expect(tight[i]!.defect).toBeLessThan(l.defect);
      expect(tight[i]!.consistency).toBeLessThan(l.consistency);
    });
  });
});

describe("every shipped gadget stays close to an isometric fold", () => {
  // Fold 0.6 is left out: triangle twist (6, 2) does not settle there within the 100 000 steps of
  // `relax` (strain 8.5%), a finding recorded in docs/PLAN.md 7.3c.
  const FOLDS = [0.25, 0.4, 0.5, 0.75, 0.9];
  // About twice the worst values measured in 7.3c: strain 0.045 (triangle twist (6, 2), fold 0.5),
  // angle defect 0.20 and consistency 0.26 (partial star, fold 0.4). The panel flex is a guard on
  // what was seen (1.64 rad, partial star, fold 0.5) and not a claim that it should be that large:
  // with the default facet stiffness a panel folds about a diagonal a long way mid-fold, and that
  // costs no strain (see the next test).
  const BOUNDS = { maxStrain: 0.1, maxDefect: 0.4, maxConsistency: 0.55, maxPanelFlex: 2 };

  describe.each(GADGET_ENTRIES)("$name", ({ name, build }) => {
    const cp = build();
    const model = barHingeModel(cp);
    const results = foldSweep(model, FOLDS);
    const isStar = name.startsWith("Star");

    it.each(FOLDS)("keeps the residuals bounded at fold %d", (fold) => {
      const r = settledResiduals(model, results[FOLDS.indexOf(fold)]!.positions);
      expect(r.maxStrain).toBeLessThan(BOUNDS.maxStrain);
      expect(r.maxDefect).toBeLessThan(BOUNDS.maxDefect);
      expect(r.maxConsistency).toBeLessThan(BOUNDS.maxConsistency);
      expect(r.maxPanelFlex).toBeLessThan(BOUNDS.maxPanelFlex);
    });

    it("breaks Theorem 11 (Lang, p. 41) only where a crease has left its assignment", () => {
      // The signs are those of the unwrapped angles `relax` keeps, not of `foldAngle`: a crease
      // near the flat-folded state can pass π, where the wrapped angle changes sign.
      const flagged = results.flatMap((result, k) =>
        interiorVertices(cp).flatMap((v) => {
          const edges = cp.rotation[v]!;
          const rho = edges.map((e) => result.angles[model.hinges.findIndex((h) => h.edge === e)]!);
          const directions = edges.map((e) => {
            const edge = cp.edges[e]!;
            return sub(cp.vertices[edge.v0 === v ? edge.v1 : edge.v0]!, cp.vertices[v]!);
          });
          const signs = rho.map((x) => (Math.abs(x) < 1e-3 ? 0 : x > 0 ? 1 : -1));
          if (!halfPlaneMvSplit(directions, signs as (-1 | 0 | 1)[])) return [];
          const wrongSide = edges.some((e, i) => {
            const a = cp.edges[e]!.assignment;
            return (a === "V" && rho[i]! <= 0) || (a === "M" && rho[i]! >= 0);
          });
          return [{ fold: FOLDS[k]!, vertex: v, wrongSide }];
        }),
      );
      // A vertex whose creases all turned the way they were assigned folds like a flat-foldable one,
      // which Thm 11 allows; a flag means the simulated fold is not a real partial fold there.
      for (const f of flagged) expect(f.wrongSide, `vertex ${f.vertex}, fold ${f.fold}`).toBe(true);
      // The hexagon and triangle twists never leave their assignments (6.2a). The star twists form a
      // crease late (edge 43 of the full star, 42 of the partial one, at vertex 28), and by fold
      // 0.75 every crease of every gadget has turned the right way.
      if (!isStar) expect(flagged).toEqual([]);
      expect(flagged.filter((f) => f.fold >= 0.75)).toEqual([]);
    });
  });
});

describe("stiffening only the facet hinges trades panel flex for shear (7.3c finding)", () => {
  // A twist is not rigidly foldable, so the paper must bend or stretch. With the default facet
  // stiffness (0.2 against 0.7 for a crease) a panel bends about a diagonal, which costs no strain;
  // stiffening the facet hinges alone (the bars and corner springs unchanged) forces it into shear
  // instead. The isometry residuals only fall when the bars and corner springs stiffen with them,
  // as in the single-vertex tests above.
  it("hexagon twist (1, 2) at fold 0.5", () => {
    const cp = hexagonTwist(1, 2);
    const at = (facet: number) => {
      const model = barHingeModel(cp, { ...DEFAULT_PARAMS, facet });
      return settledResiduals(model, foldSweep(model, [0.5])[0]!.positions);
    };
    const soft = at(0.2);
    const stiff = at(20);
    expect(stiff.maxPanelFlex).toBeLessThan(soft.maxPanelFlex / 4);
    expect(stiff.maxDefect).toBeGreaterThan(4 * soft.maxDefect);
    expect(stiff.maxStrain).toBeGreaterThan(soft.maxStrain);
  });
});

describe("a parallel pleat folds into a cylinder (Lang p. 602; Gauss map, §8.5)", () => {
  // Three parallel creases across the sheet, valley, mountain, valley. Every facet normal of the
  // folded sheet is perpendicular to the crease direction (+x): the traces lie on one great circle.
  const creases = arrangement([-1, 0, 1].map((offset) => ({ dir: 0, offset }))).map((c) => {
    if (c.assignment !== "U") return c;
    const outer = Math.abs(toCartesian(c.from).y) > 0.5;
    return { ...c, assignment: outer ? ("V" as const) : ("M" as const) };
  });
  const cp: CreasePattern = fromSegments([], creases);
  const model = barHingeModel(cp);

  it.each([0.3, 0.6, 0.9])("has no normal component along the creases at fold %d", (fold) => {
    const [result] = foldSweep(model, [fold]);
    const normals = faceNormals(result!.positions, model.triangles);
    let along = 0;
    let flattest = 1;
    model.triangles.forEach((_, i) => {
      along = Math.max(along, Math.abs(normals[3 * i]!));
      flattest = Math.min(flattest, normals[3 * i + 2]!);
    });
    expect(result!.settled).toBe(true);
    expect(along).toBeLessThan(RENDER_TOLERANCE);
    // The sheet did fold: some facet is tilted well away from +z, so the bound is not met by a flat one.
    expect(flattest).toBeLessThan(0.9);
  });
});
