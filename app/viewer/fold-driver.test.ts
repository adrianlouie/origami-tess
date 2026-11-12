/**
 * Acceptance tests for step 6.2b: the fold driver ramps the fold fraction toward a target, settles,
 * and costs nothing once it is done. The physics is checked in `core/simulate/`; here the claims are
 * about the driving: the ramp never overshoots or runs faster than `FOLD_RATE`, the settled shape
 * obeys the mountain/valley sign rule, and an idle driver is inert, so the page needs no loop.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../../core/gadgets/hexagon-twist";
import { starTwist } from "../../core/gadgets/star-twist";
import { triangleTwist } from "../../core/gadgets/triangle-twist";
import type { CreasePattern } from "../../core/pattern/crease-pattern";
import { foldSweep, relax } from "../../core/simulate/relax";
import {
  FOLD_RATE,
  MAX_FOLD,
  sliderToFold,
  foldDriver,
  parseFoldParam,
  parseGadgetParam,
  setTarget,
  settle,
  tick,
  type FoldDriver,
} from "./fold-driver";

const BUDGET = 2000;
const MAX_TICKS = 400;

/** Ticks until the driver is done; fails the test if it never is. */
function run(start: FoldDriver, budget = BUDGET): FoldDriver {
  let d = start;
  for (let n = 0; n < MAX_TICKS && !d.done; n++) d = tick(d, budget);
  expect(d.done).toBe(true);
  return d;
}

/** M and V creases whose settled angle has the wrong sign (or is zero). */
function offSign(d: FoldDriver): number[] {
  const bad: number[] = [];
  d.model.hinges.forEach((h, i) => {
    if (h.sign !== 0 && d.state.angles[i]! * h.sign <= 0) bad.push(h.edge);
  });
  return bad;
}

describe("foldDriver", () => {
  const hexagon = hexagonTwist(1, 2);

  it("starts flat, at target 0, and already done", () => {
    const d = foldDriver(hexagon);
    expect(d.fold).toBe(0);
    expect(d.target).toBe(0);
    expect(d.done).toBe(true);
    expect(Array.from(d.state.positions)).toEqual(Array.from(d.model.rest));
  });

  it.each<[string, CreasePattern, number]>([
    ["hexagon twist (1, 2)", hexagon, 0.5],
    ["triangle twist (3, 1)", triangleTwist(3, 1), 0.5],
    // The full star keeps one M crease on the wrong side below fold 0.75 (6.2a finding).
    ["star twist, full", starTwist(1, "full"), 0.75],
  ])("%s reaches fold %s, settled, with every M and V on its own side", (_n, cp, target) => {
    const d = run(setTarget(foldDriver(cp), target));
    expect(d.fold).toBe(target);
    expect(relax(d.model, d.state, target, { maxSteps: 1 }).steps).toBeLessThanOrEqual(1);
    expect(offSign(d)).toEqual([]);
  });

  it("folds up in z and shrinks in the plane", () => {
    const d = run(setTarget(foldDriver(hexagon), 0.5));
    let z = 0;
    for (let n = 0; n < d.state.positions.length / 3; n++) {
      z = Math.max(z, Math.abs(d.state.positions[3 * n + 2]!));
    }
    expect(z).toBeGreaterThan(0.1);
  });

  it("returns to flat when the target goes back to 0", () => {
    const folded = run(setTarget(foldDriver(hexagon), 0.5));
    const flat = run(setTarget(folded, 0));
    expect(flat.fold).toBe(0);
    // Settling stops at a force of RENDER_TOLERANCE; the softest spring is 0.2, so a node can still
    // be off by about 5·10⁻⁵. A millimetre per unit edge is far below anything visible.
    flat.model.rest.forEach((r, i) => {
      expect(Math.abs(flat.state.positions[i]! - r)).toBeLessThan(1e-3);
    });
  });

  it("an idle driver does nothing: tick returns it unchanged", () => {
    const d = run(setTarget(foldDriver(hexagon), 0.3));
    expect(tick(d, BUDGET)).toBe(d);
    expect(setTarget(d, d.target)).toBe(d);
  });

  it("a new target wakes a done driver", () => {
    const d = foldDriver(hexagon);
    expect(setTarget(d, 0.4).done).toBe(false);
  });

  it("rejects a target outside [0, 1] and a bad budget", () => {
    const d = foldDriver(hexagon);
    expect(() => setTarget(d, -0.1)).toThrow(RangeError);
    expect(() => setTarget(d, 1.1)).toThrow(RangeError);
    expect(() => setTarget(d, Number.NaN)).toThrow(RangeError);
    expect(() => tick(setTarget(d, 0.5), -1)).toThrow(RangeError);
  });

  it("the fold fraction ramps: at most FOLD_RATE per tick and never past the target", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 1, max: 40 }),
        (targets, ticksEach) => {
          let d = foldDriver(hexagon);
          for (const t of targets) {
            d = setTarget(d, t);
            for (let n = 0; n < ticksEach; n++) {
              const before = d.fold;
              d = tick(d, 1);
              expect(Math.abs(d.fold - before)).toBeLessThanOrEqual(FOLD_RATE + 1e-12);
              const [lo, hi] = [Math.min(before, t), Math.max(before, t)];
              expect(d.fold).toBeGreaterThanOrEqual(lo - 1e-12);
              expect(d.fold).toBeLessThanOrEqual(hi + 1e-12);
            }
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it("is not done while the fold is still short of its target", () => {
    let d = setTarget(foldDriver(hexagon), 1);
    d = tick(d, BUDGET);
    expect(d.fold).toBeLessThan(1);
    expect(d.done).toBe(false);
  });

  it("does not change the driver it is given", () => {
    const d = setTarget(foldDriver(hexagon), 0.5);
    const before = Array.from(d.state.positions);
    tick(d, 50);
    expect(Array.from(d.state.positions)).toEqual(before);
    expect(d.fold).toBe(0);
  });
});

describe("settle", () => {
  const hexagon = hexagonTwist(1, 2);

  it("is the same as ticking until done", () => {
    const start = setTarget(foldDriver(hexagon), 0.4);
    const direct = settle(start, BUDGET, MAX_TICKS);
    expect(direct.done).toBe(true);
    expect(direct.state.positions).toEqual(run(start).state.positions);
  });

  it("stops at maxTicks and reports not done", () => {
    const d = settle(setTarget(foldDriver(hexagon), 1), BUDGET, 3);
    expect(d.done).toBe(false);
    expect(d.fold).toBeCloseTo(3 * FOLD_RATE, 12);
  });

  it("rejects a bad tick count", () => {
    expect(() => settle(foldDriver(hexagon), 10, -1)).toThrow(RangeError);
    expect(() => settle(foldDriver(hexagon), 10, 1.5)).toThrow(RangeError);
  });
});

describe("URL parameters", () => {
  it("?fold is a percentage turned into a fraction", () => {
    expect(parseFoldParam("60")).toBe(0.6);
    expect(parseFoldParam("0")).toBe(0);
    expect(parseFoldParam("100")).toBe(1);
  });

  it("a missing or unreadable ?fold is 0, and a stray value is clamped", () => {
    expect(parseFoldParam(null)).toBe(0);
    expect(parseFoldParam("")).toBe(0);
    expect(parseFoldParam("abc")).toBe(0);
    expect(parseFoldParam("150")).toBe(1);
    expect(parseFoldParam("-5")).toBe(0);
  });

  it("?gadget is an index in range, otherwise the first gadget", () => {
    expect(parseGadgetParam("3", 7)).toBe(3);
    expect(parseGadgetParam("6", 7)).toBe(6);
    expect(parseGadgetParam("7", 7)).toBe(0);
    expect(parseGadgetParam("-1", 7)).toBe(0);
    expect(parseGadgetParam("1.5", 7)).toBe(0);
    expect(parseGadgetParam("x", 7)).toBe(0);
    expect(parseGadgetParam(null, 7)).toBe(0);
  });
});

describe("the driver and foldSweep walk the same fold path", () => {
  // The exact-equality case runs each gadget twice with a 100 000-step budget, so it uses the
  // smaller twist: triangle twist (6, 2) took about 30 s here and timed out on CI.
  /** The fold fractions the driver visits on the way to `target`, with the state at each. */
  function visit(start: FoldDriver, budget: number, maxTicks: number) {
    const folds: number[] = [];
    let d = start;
    for (let n = 0; n < maxTicks && !d.done; n++) {
      d = tick(d, budget);
      folds.push(d.fold);
    }
    expect(d.done).toBe(true);
    return { d, folds };
  }

  it.each([
    ["hexagon twist (1, 2)", hexagonTwist(1, 2)],
    ["triangle twist (4, 1)", triangleTwist(4, 1)],
  ])(
    "%s: with a large budget the driver equals foldSweep over its own ramp",
    (_n, cp) => {
      const { d, folds } = visit(setTarget(foldDriver(cp), 0.5), 100_000, 100);
      const sweep = foldSweep(d.model, folds, { maxSteps: 100_000 });
      // Same algorithm and same inputs, so the arrays are identical, not merely close.
      expect(Array.from(d.state.positions)).toEqual(Array.from(sweep.at(-1)!.positions));
    },
    60_000,
  );

  it("hexagon twist (1, 2): a browser-sized budget of 100 steps a tick settles to the same shape", () => {
    const cp = hexagonTwist(1, 2);
    const { d } = visit(setTarget(foldDriver(cp), 0.5), 100, 20_000);
    const reference = foldSweep(d.model, [0.5], { maxSteps: 200_000 })[0]!;
    const worst = Math.max(
      ...Array.from(d.state.positions).map((v, i) => Math.abs(v - reference.positions[i]!)),
    );
    // The ramp reaches 0.5 in 25 small increments, the reference in one jump, so a different
    // branch would show as a large gap; the equilibrium itself agrees to the relaxation tolerance.
    expect(worst).toBeLessThan(1e-3);
  });
});

describe("sliderToFold: the viewer never asks for a full π", () => {
  // At a fold of exactly 1 every crease is π and coplanar layers coincide, which z-fights. Stopping
  // at MAX_FOLD leaves each crease a small opening, so the layers fan apart in the order the
  // folds set.
  it("maps slider 0 to flat and slider 100 to MAX_FOLD, below 1", () => {
    expect(sliderToFold(0)).toBe(0);
    expect(sliderToFold(100)).toBe(MAX_FOLD);
    expect(MAX_FOLD).toBeLessThan(1);
    expect(MAX_FOLD).toBeGreaterThan(0.9);
  });

  it("is monotone and clamps a stray percentage", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 150, noNaN: true }),
        fc.double({ min: 0, max: 50, noNaN: true }),
        (a, d) => {
          expect(sliderToFold(a + d)).toBeGreaterThanOrEqual(sliderToFold(a));
          expect(sliderToFold(a)).toBeGreaterThanOrEqual(0);
          expect(sliderToFold(a)).toBeLessThanOrEqual(MAX_FOLD);
        },
      ),
    );
  });

  it.each([
    ["hexagon twist (1, 2)", hexagonTwist(1, 2)],
    ["star twist, full", starTwist(1, "full")],
  ])(
    "%s settled at full slider: every M and V crease is nearly closed but still open",
    (_n, cp) => {
      const d = run(setTarget(foldDriver(cp), sliderToFold(100)), 5000);
      expect(d.fold).toBe(MAX_FOLD);
      d.model.hinges.forEach((h, i) => {
        if (h.sign === 0) return;
        const opening = Math.PI - Math.abs(d.state.angles[i]!);
        expect(opening).toBeGreaterThan(0.005);
        expect(opening).toBeLessThan(0.1 * Math.PI);
      });
    },
  );
});
