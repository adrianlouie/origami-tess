/**
 * Damped dynamic relaxation of the bar-and-hinge model toward a fold.
 *
 * Sits at the end of the data flow (… → simulate → render): it moves the nodes of a
 * {@link BarHingeModel} until the spring forces balance, and the viewer draws the result. The
 * method is the explicit scheme of Origami Simulator: Newton's second law with a viscous term,
 * stepped with the semi-implicit (symplectic) Euler rule v ← v + dt·a, x ← x + dt·v, which is
 * stable for dt below 2/ω_max and cheap, with no linear solve. A fold percentage f scales every
 * crease's target angle, ρ* = sign·f·π; a valley is positive (see `dihedral.ts`). The rest state is
 * flat, so a fold of 0 stays flat and a fold of 1 asks every crease for a full π.
 *
 * Reference: Ghassaei, Demaine and Gershenfeld, "Fast, interactive origami simulation using GPU
 * computation" (2018), §3; Schenk and Guest (2011); Liu and Paulino (2017).
 */

import { cornerAngleGradient } from "./angle";
import { foldAngleGradient } from "./dihedral";
import { RENDER_TOLERANCE } from "./embed";
import type { BarHingeModel } from "./model";

/** The dynamic state: positions and velocities (x, y, z per node) and the unwrapped hinge angles. */
export type RelaxState = {
  readonly positions: Float64Array;
  readonly velocities: Float64Array;
  /** ρ per hinge, continued across ±π so a full fold does not jump. */
  readonly angles: Float64Array;
};

/** Options for {@link relax}. */
export type RelaxOptions = {
  /** Most steps to take. Default 100 000 (the largest gadget needs about 45 000 from flat). */
  readonly maxSteps?: number;
  /** Stop when the largest node speed and net force are both below this. Default `RENDER_TOLERANCE`. */
  readonly tolerance?: number;
};

/** The result of {@link relax}. */
export type RelaxResult = RelaxState & {
  /** Steps taken. */
  readonly steps: number;
  /** True when the speed and force criteria were met before `maxSteps`. */
  readonly settled: boolean;
};

/**
 * The flat, motionless state: rest positions, zero velocities, zero hinge angles.
 *
 * @param model - the bar-and-hinge model
 */
export function restState(model: BarHingeModel): RelaxState {
  return {
    positions: Float64Array.from(model.rest),
    velocities: new Float64Array(model.rest.length),
    angles: new Float64Array(model.hinges.length),
  };
}

/** Maps an angle difference into (−π, π]. */
const wrap = (d: number): number => d - 2 * Math.PI * Math.round(d / (2 * Math.PI));

/**
 * Computes the net force on every node and updates the unwrapped hinge angles.
 *
 * Bar: F_a = k(L − L₀)·û and F_b = −F_a, with û the unit vector from a to b. Hinge:
 * F = −stiffness·(ρ − ρ*)·∂ρ/∂x on each of its four nodes, ρ* = sign·fold·π. Corner:
 * F = −stiffness·(θ − θ₀)·∂θ/∂x on each of its three nodes, θ₀ the flat angle.
 *
 * @param model - the model
 * @param state - positions are read; `angles` is overwritten with the continued angles
 * @param fold - fold fraction, 0 (flat) to 1 (every crease at π)
 * @param out - receives the forces (length 3 per node)
 */
export function forces(
  model: BarHingeModel,
  state: RelaxState,
  fold: number,
  out: Float64Array,
): void {
  const x = state.positions;
  out.fill(0);
  for (const bar of model.bars) {
    const dx = x[3 * bar.b]! - x[3 * bar.a]!;
    const dy = x[3 * bar.b + 1]! - x[3 * bar.a + 1]!;
    const dz = x[3 * bar.b + 2]! - x[3 * bar.a + 2]!;
    const length = Math.hypot(dx, dy, dz);
    const f = (bar.k * (length - bar.rest)) / length;
    out[3 * bar.a]! += f * dx;
    out[3 * bar.a + 1]! += f * dy;
    out[3 * bar.a + 2]! += f * dz;
    out[3 * bar.b]! -= f * dx;
    out[3 * bar.b + 1]! -= f * dy;
    out[3 * bar.b + 2]! -= f * dz;
  }
  const gc = new Float64Array(9);
  for (const corner of model.corners) {
    const theta = cornerAngleGradient(x, corner, gc);
    const torque = -corner.stiffness * (theta - corner.rest);
    [corner.a, corner.b, corner.c].forEach((node, slot) => {
      out[3 * node]! += torque * gc[3 * slot]!;
      out[3 * node + 1]! += torque * gc[3 * slot + 1]!;
      out[3 * node + 2]! += torque * gc[3 * slot + 2]!;
    });
  }
  const g = new Float64Array(12);
  model.hinges.forEach((h, n) => {
    const raw = foldAngleGradient(x, h, g);
    const angle = state.angles[n]! + wrap(raw - state.angles[n]!);
    state.angles[n] = angle;
    const torque = -h.stiffness * (angle - h.sign * fold * Math.PI);
    [h.i, h.j, h.k, h.l].forEach((node, slot) => {
      out[3 * node]! += torque * g[3 * slot]!;
      out[3 * node + 1]! += torque * g[3 * slot + 1]!;
      out[3 * node + 2]! += torque * g[3 * slot + 2]!;
    });
  });
}

/**
 * Steps the model toward equilibrium at a fold fraction.
 *
 * Each step computes {@link forces}, adds the damping force −c·v, then advances v and x. Pinned
 * nodes never move. It stops when the largest node speed and the largest net force on a free node
 * are both below the tolerance, or after `maxSteps`. The input state is not modified, and the
 * result is deterministic: the same inputs give the same arrays.
 *
 * @param model - the model
 * @param state - where to start; warm-start from the previous result when the fold changes
 * @param fold - fold fraction, 0 to 1
 * @param options - step cap and tolerance
 * @returns the new state, the number of steps and whether it settled
 * @throws RangeError if `fold` is outside [0, 1], an option is not positive, or the integration
 *   diverges (a non-finite speed or force, which means `dt` is above the stability limit)
 */
export function relax(
  model: BarHingeModel,
  state: RelaxState,
  fold: number,
  options: RelaxOptions = {},
): RelaxResult {
  const { maxSteps = 100_000, tolerance = RENDER_TOLERANCE } = options;
  if (!(fold >= 0 && fold <= 1)) throw new RangeError("fold must be in [0, 1]");
  if (!(tolerance > 0) || !Number.isInteger(maxSteps) || maxSteps < 0) {
    throw new RangeError("tolerance must be positive and maxSteps a non-negative integer");
  }
  const s: RelaxState = {
    positions: Float64Array.from(state.positions),
    velocities: Float64Array.from(state.velocities),
    angles: Float64Array.from(state.angles),
  };
  const pinned = new Set(model.pinned);
  const force = new Float64Array(s.positions.length);
  const nodes = s.positions.length / 3;
  const { dt } = model;

  let steps = 0;
  let settled = false;
  while (steps < maxSteps) {
    try {
      forces(model, s, fold, force);
    } catch (error) {
      // A hinge whose axis or wing has collapsed means the state has left the folding regime, which
      // is what an unstable time step looks like before the numbers reach NaN.
      if (!(error instanceof RangeError)) throw error;
      throw new RangeError(`relaxation diverged at step ${steps}: ${error.message}`, {
        cause: error,
      });
    }
    let fastest = 0;
    let strongest = 0;
    for (let n = 0; n < nodes; n++) {
      if (pinned.has(n)) continue;
      for (let d = 0; d < 3; d++) {
        const p = 3 * n + d;
        const net = force[p]!;
        strongest = Math.max(strongest, Math.abs(net));
        const v = s.velocities[p]! + dt * (net - model.damping * s.velocities[p]!);
        s.velocities[p] = v;
        s.positions[p] = s.positions[p]! + dt * v;
        fastest = Math.max(fastest, Math.abs(v));
      }
    }
    steps++;
    // Max of a NaN is NaN and NaN < tolerance is false, so a blown-up state would otherwise run to
    // maxSteps (or fail later with an unrelated geometry error from `foldAngle`).
    if (!Number.isFinite(fastest) || !Number.isFinite(strongest)) {
      throw new RangeError(`relaxation diverged after ${steps} steps: the time step is too large`);
    }
    if (fastest < tolerance && strongest < tolerance) {
      settled = true;
      break;
    }
  }
  return { ...s, steps, settled };
}

/**
 * Relaxes the model at each fold fraction in turn, warm-starting every one from the last.
 *
 * Folding a little at a time follows the physical path from flat, which the viewer's slider does
 * too; jumping straight to a large fold can land in a different equilibrium.
 *
 * @param model - the model
 * @param fractions - fold fractions in [0, 1], in the order to visit them
 * @param options - passed to every {@link relax} call
 * @returns one result per fraction, in the same order
 */
export function foldSweep(
  model: BarHingeModel,
  fractions: readonly number[],
  options: RelaxOptions = {},
): RelaxResult[] {
  const results: RelaxResult[] = [];
  let state = restState(model);
  for (const fold of fractions) {
    const result = relax(model, state, fold, options);
    results.push(result);
    state = result;
  }
  return results;
}
