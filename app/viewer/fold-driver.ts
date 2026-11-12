/**
 * The fold driver: ramps a fold fraction toward a target and relaxes the bar-and-hinge model.
 *
 * Last stage of the data flow (… → simulate → render), on the viewer side. `core/simulate/` can
 * settle one fold fraction; this file turns the slider into a path of them. It is pure (no DOM, no
 * three) and immutable like `core/`, so Node tests cover it and `main.ts` only has to call
 * {@link tick} once per animation frame while the driver is not {@link FoldDriver.done}.
 *
 * Why a ramp: the settled shape depends on the path from flat (a vertex can switch to another
 * rigid branch if the fold jumps), so the fold fraction moves by at most {@link FOLD_RATE} per tick
 * and every tick warm-starts from the last state, the quasi-static loading of Ghassaei, Demaine and
 * Gershenfeld, "Fast, interactive origami simulation using GPU computation" (2018), §3.
 */

import {
  barHingeModel,
  DEFAULT_PARAMS,
  type BarHingeModel,
  type BarHingeParams,
} from "../../core/simulate/model";
import { relax, restState, type RelaxState } from "../../core/simulate/relax";
import type { CreasePattern } from "../../core/pattern/crease-pattern";

/** The most the fold fraction (0 to 1) moves in one {@link tick}: 2% of a full fold. */
export const FOLD_RATE = 0.02;

/**
 * The fold fraction at a slider reading of 100 %. Below 1 on purpose: at a fold of exactly 1 every
 * crease asks for π, the layers become coplanar and the renderer z-fights between them. At 0.98 the
 * hexagon and full star twists settle with every M and V crease between 0.97π and 0.997π (measured
 * in the 6.3 audit; the facet springs push some past the target), so each stays at least 0.009 rad
 * open and the layers sit a little apart, in the order the folds set.
 */
export const MAX_FOLD = 0.98;

/**
 * Maps a slider percentage to the fold fraction the simulation is asked for.
 *
 * @param percent - slider reading; values outside [0, 100] are clamped
 * @returns a fraction in [0, {@link MAX_FOLD}], linear in the percentage
 */
export function sliderToFold(percent: number): number {
  return (Math.min(100, Math.max(0, percent)) / 100) * MAX_FOLD;
}

/**
 * The slider percentage that shows a fold fraction: the inverse of {@link sliderToFold}.
 *
 * @param fold - fold fraction in [0, {@link MAX_FOLD}]
 */
export function foldToSlider(fold: number): number {
  return (fold / MAX_FOLD) * 100;
}

/** A fold simulation in progress. Never changed in place; {@link setTarget} and {@link tick} return new ones. */
export type FoldDriver = {
  readonly model: BarHingeModel;
  /** Positions, velocities and hinge angles after the last tick. */
  readonly state: RelaxState;
  /** The fold fraction the state was last relaxed at, 0 (flat) to 1. */
  readonly fold: number;
  /** The fold fraction the slider asks for. */
  readonly target: number;
  /** True when `fold` has reached `target` and the last relaxation settled; ticking is then a no-op. */
  readonly done: boolean;
};

/**
 * Starts a driver for a pattern: flat, target 0 and done.
 *
 * @param cp - the crease pattern
 * @param params - bar-and-hinge parameters; defaults to `DEFAULT_PARAMS`
 * @throws RangeError as {@link barHingeModel} does
 */
export function foldDriver(cp: CreasePattern, params: BarHingeParams = DEFAULT_PARAMS): FoldDriver {
  const model = barHingeModel(cp, params);
  return { model, state: restState(model), fold: 0, target: 0, done: true };
}

/**
 * Sets the fold fraction to ramp toward.
 *
 * A target equal to the current one returns the same driver, so an idle driver stays idle.
 *
 * @param driver - the driver
 * @param target - fold fraction in [0, 1]
 * @returns a driver that is not done unless it already was at that target
 * @throws RangeError if `target` is not in [0, 1]
 */
export function setTarget(driver: FoldDriver, target: number): FoldDriver {
  if (!(target >= 0 && target <= 1)) throw new RangeError("target must be in [0, 1]");
  if (target === driver.target) return driver;
  return { ...driver, target, done: false };
}

/**
 * Advances the simulation by one animation frame.
 *
 * Moves the fold fraction toward the target by at most {@link FOLD_RATE}, then runs at most
 * `maxSteps` relaxation steps from the previous state. A done driver is returned as it is, at no
 * cost. The driver becomes done once the fold has arrived and the relaxation has settled.
 *
 * @param driver - the driver
 * @param maxSteps - relaxation step budget for this frame (a non-negative integer)
 * @throws RangeError if `maxSteps` is not a non-negative integer
 */
export function tick(driver: FoldDriver, maxSteps: number): FoldDriver {
  if (!Number.isInteger(maxSteps) || maxSteps < 0) {
    throw new RangeError("maxSteps must be a non-negative integer");
  }
  if (driver.done) return driver;
  const gap = driver.target - driver.fold;
  const fold =
    Math.abs(gap) <= FOLD_RATE ? driver.target : driver.fold + Math.sign(gap) * FOLD_RATE;
  const result = relax(driver.model, driver.state, fold, { maxSteps });
  const { positions, velocities, angles } = result;
  return {
    ...driver,
    state: { positions, velocities, angles },
    fold,
    done: fold === driver.target && result.settled,
  };
}

/**
 * Ticks until the driver is done, without waiting for animation frames.
 *
 * For a deep link such as `?fold=60`, which should open already folded; a dragged slider animates
 * instead. Stops early at `maxTicks`, so a model that never settles cannot hang the page.
 *
 * @param driver - the driver
 * @param maxSteps - relaxation step budget per tick
 * @param maxTicks - most ticks to take
 * @returns the driver after at most `maxTicks` ticks; check `done` to see whether it settled
 * @throws RangeError as {@link tick} does, or if `maxTicks` is not a non-negative integer
 */
export function settle(driver: FoldDriver, maxSteps: number, maxTicks: number): FoldDriver {
  if (!Number.isInteger(maxTicks) || maxTicks < 0) {
    throw new RangeError("maxTicks must be a non-negative integer");
  }
  let d = driver;
  for (let n = 0; n < maxTicks && !d.done; n++) d = tick(d, maxSteps);
  return d;
}

/**
 * Reads the `?fold=` URL parameter, a percentage, as a fraction.
 *
 * @param raw - the parameter's text, or null when absent
 * @returns the fraction clamped to [0, 1]; 0 when absent or not a number
 */
export function parseFoldParam(raw: string | null): number {
  if (raw === null || raw.trim() === "") return 0;
  const percent = Number(raw);
  if (!Number.isFinite(percent)) return 0;
  return Math.min(1, Math.max(0, percent / 100));
}

/**
 * Reads the `?gadget=` URL parameter, an index into the gadget list.
 *
 * @param raw - the parameter's text, or null when absent
 * @param count - how many gadgets there are
 * @returns the index when it is an integer in [0, count); otherwise 0
 */
export function parseGadgetParam(raw: string | null, count: number): number {
  if (raw === null || raw.trim() === "") return 0;
  const index = Number(raw);
  return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}
