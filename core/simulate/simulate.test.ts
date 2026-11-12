/**
 * Acceptance tests for step 6.2a: the bar-and-hinge model folds, and the folds it finds are the
 * right ones. The model is approximate (twist folds are not rigid-foldable), so these tests check
 * physical properties of the result, not a reference shape: the target angle where the answer is
 * exact (one crease), closure around a vertex, strain, and the mountain/valley sign of every crease.
 */

import { describe, expect, it } from "vitest";
import { GADGET_ENTRIES } from "../../app/viewer/gadgets";
import { eis, ZERO } from "../lattice/eisenstein";
import { fromSegments, type CreasePattern } from "../pattern/crease-pattern";
import { solveMv, withMvAssignment } from "../solve/solver";
import { SPOKE_ENDS, spokePattern } from "../solve/testing";
import { RENDER_TOLERANCE, toCartesian } from "./embed";
import { barHingeModel, DEFAULT_PARAMS, type BarHingeModel } from "./model";
import { foldSweep, relax, restState, type RelaxState } from "./relax";

/** Largest |L/L₀ − 1| over all bars. */
function maxStrain(model: BarHingeModel, x: Float64Array): number {
  let worst = 0;
  for (const b of model.bars) {
    const length = Math.hypot(
      x[3 * b.a]! - x[3 * b.b]!,
      x[3 * b.a + 1]! - x[3 * b.b + 1]!,
      x[3 * b.a + 2]! - x[3 * b.b + 2]!,
    );
    worst = Math.max(worst, Math.abs(length / b.rest - 1));
  }
  return worst;
}

/** The fold angle of the hinge on a pattern edge (a crease edge has exactly one). */
function edgeAngle(model: BarHingeModel, state: RelaxState, edge: number): number {
  const i = model.hinges.findIndex((h) => h.edge === edge);
  if (i < 0) throw new Error(`edge ${edge} has no hinge`);
  return state.angles[i]!;
}

/** M and V creases whose angle has the wrong sign (or is zero). */
function offSign(model: BarHingeModel, state: RelaxState): { edge: number; angle: number }[] {
  const out: { edge: number; angle: number }[] = [];
  model.hinges.forEach((h, i) => {
    if (h.sign !== 0 && state.angles[i]! * h.sign <= 0) {
      out.push({ edge: h.edge, angle: state.angles[i]! });
    }
  });
  return out;
}

/** Two triangles sharing the crease from (1, 0) to (0, 1); the rest is the paper border. */
function creasedRhombus(assignment: "M" | "V"): CreasePattern {
  return fromSegments(
    [],
    [
      { from: eis(0, 0), to: eis(1, 0), assignment: "B" },
      { from: eis(1, 0), to: eis(1, 1), assignment: "B" },
      { from: eis(1, 1), to: eis(0, 1), assignment: "B" },
      { from: eis(0, 1), to: eis(0, 0), assignment: "B" },
      { from: eis(1, 0), to: eis(0, 1), assignment },
    ],
  );
}

describe("a single crease folds rigidly to its target angle", () => {
  for (const assignment of ["V", "M"] as const) {
    it.each([0.25, 0.5, 0.9])(`${assignment} crease at fold %d`, (fold) => {
      const cp = creasedRhombus(assignment);
      const model = barHingeModel(cp);
      const crease = cp.edges.findIndex((e) => e.assignment === assignment);
      const result = relax(model, restState(model), fold);
      expect(result.settled).toBe(true);
      const sign = assignment === "V" ? 1 : -1;
      expect(edgeAngle(model, result, crease)).toBeCloseTo(sign * fold * Math.PI, 3);
      expect(maxStrain(model, result.positions)).toBeLessThan(1e-3);
      // The free wing rises toward +z for a valley and sinks for a mountain.
      const z = Array.from({ length: cp.vertices.length }, (_, n) => result.positions[3 * n + 2]!);
      expect(sign > 0 ? Math.max(...z) : -Math.min(...z)).toBeGreaterThan(0.1);
      expect(sign > 0 ? -Math.min(...z) : Math.max(...z)).toBeLessThan(RENDER_TOLERANCE);
    });
  }
});

/** The 3×3 rotation matrices of the spherical-linkage closure condition. */
type Matrix = number[][];
const identity = (): Matrix => [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const multiply = (p: Matrix, q: Matrix): Matrix =>
  p.map((row) => [0, 1, 2].map((c) => row.reduce((sum, v, k) => sum + v * q[k]![c]!, 0)));
const rotateX = (a: number): Matrix => [
  [1, 0, 0],
  [0, Math.cos(a), -Math.sin(a)],
  [0, Math.sin(a), Math.cos(a)],
];
const rotateZ = (a: number): Matrix => [
  [Math.cos(a), -Math.sin(a), 0],
  [Math.sin(a), Math.cos(a), 0],
  [0, 0, 1],
];

/**
 * How far a vertex is from closing: the Frobenius norm of Q − I, where Q = Π Rx(ρᵢ)·Rz(θᵢ).
 *
 * Reference: Huffman 1976 / the spherical-linkage model of a rigid-foldable vertex. Walking round a
 * vertex, each crease turns the next panel about the crease direction by its fold angle ρᵢ (positive
 * for a valley), and each sector turns the frame in the plane by its angle θᵢ to the next crease.
 * The paper closes up exactly when the whole product is the identity. This reference uses only the
 * measured fold angles and the flat sector angles, and shares no code with the simulation.
 */
function closureResidual(sectors: readonly number[], rhos: readonly number[]): number {
  let q = identity();
  rhos.forEach((rho, i) => {
    q = multiply(multiply(q, rotateX(rho)), rotateZ(sectors[i]!));
  });
  let sum = 0;
  q.forEach((row, r) =>
    row.forEach((v, c) => {
      sum += (v - (r === c ? 1 : 0)) ** 2;
    }),
  );
  return Math.sqrt(sum);
}

describe("a flat-foldable degree-4 vertex closes up as it folds", () => {
  // Stiff panels are the case the closure condition describes. With the defaults the residual is
  // 0.12 to 0.23 (the panels flex); at 10 times the default panel stiffness it is about 0.02, and
  // at 100 times about 0.002, so what is left is flex and not a flaw in the reference.
  // Folds stop at 0.4: by 0.6 the vertex has moved to the branch near the flat-folded state, where
  // two angles approach π and a flipped sign is the same rotation, so the check cannot tell right
  // from wrong.
  const stiff = { ...DEFAULT_PARAMS, axial: 2000, facet: 500, angle: 1000 };

  const vertices: { name: string; spokes: number[]; sectors: number[] }[] = [
    { name: "sectors 60, 90, 120, 90", spokes: [0, 2, 5, 9], sectors: [60, 90, 120, 90] },
    { name: "sectors 60, 60, 120, 120", spokes: [0, 2, 4, 8], sectors: [60, 60, 120, 120] },
    { name: "sectors 30, 30, 150, 150", spokes: [0, 1, 2, 7], sectors: [30, 30, 150, 150] },
  ];

  it.each(vertices)("$name", ({ spokes, sectors }) => {
    const free = spokePattern(spokes, "U");
    const solved = solveMv(free);
    if (solved.status !== "sat") throw new Error("vertex has no M/V assignment");
    const cp = withMvAssignment(free, solved.assignment);
    const model = barHingeModel(cp, stiff);
    const origin = cp.vertices.findIndex((p) => p.a === 0 && p.b === 0);
    const radians = sectors.map((d) => (d * Math.PI) / 180);
    const results = foldSweep(model, [0.2, 0.4]);
    for (const result of results) {
      expect(result.settled).toBe(true);
      const rhos = cp.rotation[origin]!.map((e) => edgeAngle(model, result, e));
      const residual = closureResidual(radians, rhos);
      expect(residual).toBeLessThan(0.05);
      // Turning the sharpest crease the wrong way leaves the vertex far from closed. (Some
      // creases stay nearly flat for part of the motion, so a fixed index would prove nothing.)
      const sharpest = rhos.reduce(
        (best, r, i) => (Math.abs(r) > Math.abs(rhos[best]!) ? i : best),
        0,
      );
      const flipped = rhos.map((r, i) => (i === sharpest ? -r : r));
      expect(closureResidual(radians, flipped)).toBeGreaterThan(Math.max(0.3, 2 * residual));
    }
  });
});

/** Solves a 3×3 linear system by Gaussian elimination with partial pivoting. */
function solve3(a: number[][], b: number[]): number[] {
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < 3; c++) {
    let pivot = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[pivot]![c]!)) pivot = r;
    [m[c], m[pivot]] = [m[pivot]!, m[c]!];
    for (let r = c + 1; r < 3; r++) {
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k < 4; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  const x = [0, 0, 0];
  for (let r = 2; r >= 0; r--) {
    let v = m[r]![3]!;
    for (let k = r + 1; k < 3; k++) v -= m[r]![k]! * x[k]!;
    x[r] = v / m[r]![r]!;
  }
  return x;
}

/**
 * The other three fold angles of a degree-4 vertex when crease `index` has angle `value`, on the
 * rigid path.
 *
 * Gauss–Newton on the nine entries of Q − I (see {@link closureResidual}) with a central-difference
 * Jacobian, started from `guess` (all four angles), so it stays on the branch the simulation is on.
 * A flat-foldable degree-4 vertex has a one-degree-of-freedom rigid motion (Huffman 1976; Tachi
 * 2009). The free crease must be one that moves on that branch: on the straight-crease branch of a
 * vertex with two collinear creases the other two stay at 0, so they cannot be the parameter.
 */
function pathAngles(
  sectors: readonly number[],
  index: number,
  value: number,
  guess: readonly number[],
) {
  const others = [0, 1, 2, 3].filter((i) => i !== index);
  const assemble = (x: readonly number[]) => {
    const rhos = [0, 0, 0, 0];
    rhos[index] = value;
    others.forEach((o, k) => (rhos[o] = x[k]!));
    return rhos;
  };
  const entries = (x: readonly number[]) => {
    let q = identity();
    assemble(x).forEach((rho, i) => {
      q = multiply(multiply(q, rotateX(rho)), rotateZ(sectors[i]!));
    });
    return q.flat().map((v, i) => v - (i % 4 === 0 ? 1 : 0));
  };
  let x = others.map((o) => guess[o]!);
  for (let iteration = 0; iteration < 60; iteration++) {
    const f = entries(x);
    const jacobian = [0, 1, 2].map((j) => {
      const hi = [...x];
      const lo = [...x];
      hi[j]! += 1e-6;
      lo[j]! -= 1e-6;
      const [u, w] = [entries(hi), entries(lo)];
      return u.map((v, i) => (v - w[i]!) / 2e-6);
    });
    const jtj = [0, 1, 2].map((r) =>
      [0, 1, 2].map((c) => jacobian[r]!.reduce((sum, v, i) => sum + v * jacobian[c]![i]!, 0)),
    );
    const jtf = [0, 1, 2].map((r) => jacobian[r]!.reduce((sum, v, i) => sum - v * f[i]!, 0));
    const step = solve3(jtj, jtf);
    x = x.map((v, i) => v + step[i]!);
    if (Math.max(...step.map(Math.abs)) < 1e-13) break;
  }
  return { rhos: assemble(x), residual: Math.hypot(...entries(x)) };
}

describe("the simulated vertex sits at the energy minimum of its rigid path (6.3 audit)", () => {
  // 6.2a only checked that the measured angles close the vertex. This checks which closed shape the
  // simulation chose: with stiff panels the model is a rigid-panel vertex whose crease springs pull
  // each ρᵢ toward its target sᵢ·fold·π, so the equilibrium minimises
  //   E = Σ kᵢ (ρᵢ − tᵢ)²
  // along the one-parameter rigid path (kᵢ the crease hinge stiffness). The reference solves
  // the path from the sector angles alone and minimises E by golden-section search; it shares no
  // code with `relax`.
  // 10 times stiffer than the closure test: the energy gap to the rigid path falls in proportion
  // to the panel stiffness (0.4 % here, 3.5 % at the closure test's stiffness), so it is panel flex.
  const stiff = { ...DEFAULT_PARAMS, axial: 20000, facet: 5000, angle: 10000 };
  const vertices: { name: string; spokes: number[]; sectors: number[] }[] = [
    { name: "sectors 60, 90, 120, 90", spokes: [0, 2, 5, 9], sectors: [60, 90, 120, 90] },
    { name: "sectors 60, 60, 120, 120", spokes: [0, 2, 4, 8], sectors: [60, 60, 120, 120] },
    { name: "sectors 30, 30, 150, 150", spokes: [0, 1, 2, 7], sectors: [30, 30, 150, 150] },
  ];

  it.each(vertices)("$name", ({ spokes, sectors }) => {
    const free = spokePattern(spokes, "U");
    const solved = solveMv(free);
    if (solved.status !== "sat") throw new Error("vertex has no M/V assignment");
    const cp = withMvAssignment(free, solved.assignment);
    const model = barHingeModel(cp, stiff);
    const origin = cp.vertices.findIndex((p) => p.a === 0 && p.b === 0);
    const radians = sectors.map((d) => (d * Math.PI) / 180);
    const edges = cp.rotation[origin]!;
    const hinges = edges.map((e) => model.hinges.find((h) => h.edge === e)!);
    const results = foldSweep(model, [0.2, 0.4]);
    [0.2, 0.4].forEach((fold, n) => {
      const result = results[n]!;
      const simulated = edges.map((e) => edgeAngle(model, result, e));
      const energy = (rhos: readonly number[]) =>
        rhos.reduce((sum, rho, i) => {
          // Crease hinge stiffness is `crease` per unit length times the spoke's length, worked
          // out here from the lattice and not read back from the model.
          const end = cp.edges[edges[i]!]!;
          const tip = cp.vertices[end.v0 === origin ? end.v1 : end.v0]!;
          const length = Math.hypot(toCartesian(tip).x, toCartesian(tip).y);
          const sign = hinges[i]!.sign;
          return sum + stiff.crease * length * (rho - sign * fold * Math.PI) ** 2;
        }, 0);
      // The crease that moves most is the path parameter (see `pathAngles`).
      const index = simulated.reduce(
        (best, r, i) => (Math.abs(r) > Math.abs(simulated[best]!) ? i : best),
        0,
      );
      const at = (value: number) => {
        const p = pathAngles(radians, index, value, simulated);
        return p.residual < 1e-9 ? p.rhos : null;
      };
      // Golden-section search for the minimum of E along the path, around the simulated value.
      const phi = (Math.sqrt(5) - 1) / 2;
      let [lo, hi] = [simulated[index]! - 0.3, simulated[index]! + 0.3];
      const value = (r: number) => {
        const rhos = at(r);
        return rhos ? energy(rhos) : Infinity;
      };
      for (let i = 0; i < 80; i++) {
        const [a, b] = [hi - phi * (hi - lo), lo + phi * (hi - lo)];
        if (value(a) < value(b)) hi = b;
        else lo = a;
      }
      const best = at((lo + hi) / 2);
      expect(best).not.toBeNull();
      // The simulation has a little panel flex the rigid path lacks, so its energy can be a little
      // above or below the path minimum; a different branch or a wrong spring weight is far off.
      expect(Math.abs(energy(best!) - energy(simulated))).toBeLessThan(0.01 * energy(simulated));
      best!.forEach((rho, i) => expect(Math.abs(rho - simulated[i]!)).toBeLessThan(0.01));
    });
  });
});

describe("every shipped gadget folds without breaking", () => {
  const FOLDS = [0, 0.25, 0.5, 0.75, 0.9];

  describe.each(GADGET_ENTRIES)("$name", ({ name, build }) => {
    const cp = build();
    const model = barHingeModel(cp);
    const results = foldSweep(model, FOLDS);
    const isStar = name.startsWith("Star");
    const isPartial = name.endsWith("partial");

    it("stays flat at fold 0", () => {
      const flat = results[0]!;
      expect(flat.settled).toBe(true);
      expect(Math.max(...flat.positions.map((v, p) => Math.abs(v - model.rest[p]!)))).toBeLessThan(
        RENDER_TOLERANCE,
      );
    });

    it.each(FOLDS.slice(1))(
      "settles with finite positions and under 5%% strain at fold %d",
      (f) => {
        const result = results[FOLDS.indexOf(f)]!;
        expect(result.settled).toBe(true);
        expect(result.positions.every(Number.isFinite)).toBe(true);
        expect(maxStrain(model, result.positions)).toBeLessThan(0.05);
      },
    );

    it("gives every M crease a negative angle and every V crease a positive one", () => {
      // The star twist forms its pleats late: at low fold a crease or two is still on the wrong
      // side (see the next two tests), so its sign rule is checked from fold 0.75 on.
      FOLDS.forEach((f, i) => {
        if (f < 0.1 || (isStar && f < 0.75)) return;
        expect(offSign(model, results[i]!), `fold ${f}`).toEqual([]);
      });
    });

    if (isStar && !isPartial) {
      it("has at most one crease on the wrong side before fold 0.75, and it is nearly flat", () => {
        // Finding (6.2a): in the full star one M crease (edge 41 at fold 0.1 and 0.25, edge 43 at
        // 0.5) has not yet turned the right way, by at most 0.07 rad. It is a late-forming crease,
        // not a conflict.
        FOLDS.forEach((f, i) => {
          if (f < 0.1 || f >= 0.75) return;
          const wrong = offSign(model, results[i]!);
          expect(wrong.length, `fold ${f}`).toBeLessThanOrEqual(1);
          for (const w of wrong) expect(Math.abs(w.angle), `fold ${f}`).toBeLessThan(0.1);
        });
      });
    }

    if (isPartial) {
      it("has creases on the wrong side at fold 0.5, where the conflict is", () => {
        // Finding (6.2a): the partial star's conflicting folds show up in the simulation too: at
        // fold 0.5 edges 2 and 26 (both V) are still folded the wrong way.
        const wrong = offSign(model, results[FOLDS.indexOf(0.5)]!);
        expect(wrong.map((w) => w.edge)).toEqual(expect.arrayContaining([2, 26]));
      });
    }

    it("is deterministic", () => {
      const again = foldSweep(model, FOLDS);
      expect(again.map((r) => Array.from(r.positions))).toEqual(
        results.map((r) => Array.from(r.positions)),
      );
    });
  });
});

describe("edge cases", () => {
  it("accepts a single triangle, which has no hinges and does not move", () => {
    const cp = fromSegments(
      [],
      [
        { from: ZERO, to: eis(1, 0), assignment: "B" },
        { from: eis(1, 0), to: eis(0, 1), assignment: "B" },
        { from: eis(0, 1), to: ZERO, assignment: "B" },
      ],
    );
    const model = barHingeModel(cp);
    expect(model.hinges).toHaveLength(0);
    const result = relax(model, restState(model), 1);
    expect(Array.from(result.positions)).toEqual(Array.from(model.rest));
  });

  it("treats a pattern of only border edges as flat panels", () => {
    const cp = spokePattern([], "M");
    const model = barHingeModel(cp);
    expect(model.hinges.every((h) => h.sign === 0)).toBe(true);
    const result = relax(model, restState(model), 1);
    expect(result.settled).toBe(true);
    expect(maxStrain(model, result.positions)).toBeLessThan(RENDER_TOLERANCE);
    expect(Math.max(...result.positions.map((v, p) => Math.abs(v - model.rest[p]!)))).toBeLessThan(
      RENDER_TOLERANCE,
    );
  });

  it("rejects a face with a hole, a pattern with no face, and non-positive parameters", () => {
    const outer = [eis(0, 0), eis(9, 0), eis(0, 9)];
    const inner = [eis(2, 2), eis(4, 2), eis(2, 4)];
    const holed = fromSegments(
      [...outer, ...inner],
      [
        ...outer.map((p, i) => ({ from: p, to: outer[(i + 1) % 3]! })),
        ...inner.map((p, i) => ({ from: p, to: inner[(i + 1) % 3]! })),
      ],
    );
    expect(() => barHingeModel(holed)).toThrow(RangeError);
    const tree = fromSegments([], [{ from: ZERO, to: SPOKE_ENDS[0]! }]);
    expect(() => barHingeModel(tree)).toThrow(RangeError);
    expect(() => barHingeModel(creasedRhombus("V"), { ...DEFAULT_PARAMS, axial: 0 })).toThrow(
      RangeError,
    );
  });

  it("rejects a fold outside [0, 1] and bad options, and leaves its input state alone", () => {
    const model = barHingeModel(creasedRhombus("V"));
    const start = restState(model);
    expect(() => relax(model, start, 1.1)).toThrow(RangeError);
    expect(() => relax(model, start, -0.1)).toThrow(RangeError);
    expect(() => relax(model, start, 0.5, { tolerance: 0 })).toThrow(RangeError);
    expect(() => relax(model, start, 0.5, { maxSteps: 1.5 })).toThrow(RangeError);
    relax(model, start, 0.5, { maxSteps: 50 });
    expect(Array.from(start.positions)).toEqual(Array.from(model.rest));
    expect(Array.from(start.velocities).every((v) => v === 0)).toBe(true);
  });

  it("reports an unsettled result when the step cap is reached", () => {
    const model = barHingeModel(creasedRhombus("V"));
    const result = relax(model, restState(model), 0.5, { maxSteps: 3 });
    expect(result.steps).toBe(3);
    expect(result.settled).toBe(false);
  });
});
