import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GADGET_ENTRIES } from "../../app/viewer/gadgets";
import { eis } from "../lattice/eisenstein";
import { fromSegments } from "../pattern/crease-pattern";
import { RENDER_TOLERANCE } from "./embed";
import { barHingeModel } from "./model";
import { forces, relax, restState, type RelaxState } from "./relax";

const gadgets = GADGET_ENTRIES.map((e) => [e.name, barHingeModel(e.build())] as const);

describe.each(gadgets)("forces: %s", (_name, model) => {
  it("vanishes on the flat rest state at fold 0", () => {
    const out = new Float64Array(model.rest.length).fill(1);
    forces(model, restState(model), 0, out);
    expect(Math.max(...out.map(Math.abs))).toBeLessThan(RENDER_TOLERANCE);
  });

  it("has no net force and no net torque in any state (rigid-body invariance)", () => {
    // Bars, hinges and corner springs depend on shape only, so their forces must balance. This ties
    // every analytic gradient to the energy it comes from.
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -0.3, max: 0.3, noNaN: true }), {
          minLength: model.rest.length,
          maxLength: model.rest.length,
        }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (noise, fold) => {
          const state: RelaxState = {
            positions: model.rest.map((v, p) => v + noise[p]!),
            velocities: new Float64Array(model.rest.length),
            angles: new Float64Array(model.hinges.length),
          };
          const out = new Float64Array(model.rest.length);
          forces(model, state, fold, out);
          const total = [0, 0, 0];
          const torque = [0, 0, 0];
          for (let n = 0; n < out.length / 3; n++) {
            const x = state.positions;
            const [px, py, pz] = [x[3 * n]!, x[3 * n + 1]!, x[3 * n + 2]!];
            const [fx, fy, fz] = [out[3 * n]!, out[3 * n + 1]!, out[3 * n + 2]!];
            total[0]! += fx;
            total[1]! += fy;
            total[2]! += fz;
            torque[0]! += py * fz - pz * fy;
            torque[1]! += pz * fx - px * fz;
            torque[2]! += px * fy - py * fx;
          }
          const scale = Math.max(1, ...out.map(Math.abs));
          for (const v of [...total, ...torque]) expect(Math.abs(v) / scale).toBeLessThan(1e-8);
        },
      ),
      { numRuns: 25 },
    );
  });
});

describe("relax", () => {
  const [, hexagon] = gadgets[0]!;

  it("leaves the free nodes in equilibrium when it reports settled", () => {
    const result = relax(hexagon, restState(hexagon), 0.5);
    expect(result.settled).toBe(true);
    const out = new Float64Array(result.positions.length);
    forces(hexagon, result, 0.5, out);
    const pinned = new Set(hexagon.pinned);
    for (let n = 0; n < out.length / 3; n++) {
      if (pinned.has(n)) continue;
      for (let d = 0; d < 3; d++) expect(Math.abs(out[3 * n + d]!)).toBeLessThan(1e-3);
    }
  });

  it("never moves a pinned node", () => {
    const result = relax(hexagon, restState(hexagon), 0.7, { maxSteps: 500 });
    for (const n of hexagon.pinned) {
      for (let d = 0; d < 3; d++) expect(result.positions[3 * n + d]).toBe(hexagon.rest[3 * n + d]);
    }
  });

  it("reaches a full fold without the hinge angle wrapping from π to −π", () => {
    // A valley crease folded to fold = 1 must end at +π. Without continuing the angle across ±π the
    // spring would see −π and pull the crease the other way.
    const cp = fromSegments(
      [],
      [
        { from: eis(0, 0), to: eis(1, 0), assignment: "B" },
        { from: eis(1, 0), to: eis(1, 1), assignment: "B" },
        { from: eis(1, 1), to: eis(0, 1), assignment: "B" },
        { from: eis(0, 1), to: eis(0, 0), assignment: "B" },
        { from: eis(1, 0), to: eis(0, 1), assignment: "V" },
      ],
    );
    const model = barHingeModel(cp);
    const result = relax(model, restState(model), 1);
    const crease = model.hinges.findIndex((h) => h.sign === 1);
    expect(result.angles[crease]).toBeGreaterThan(Math.PI - 0.01);
    expect(result.angles[crease]).toBeLessThan(Math.PI + 0.01);
  });

  it("throws instead of spinning to maxSteps when the integration diverges", () => {
    // dt far above 2/ω_max makes symplectic Euler unstable, so positions blow up to NaN. NaN fails
    // the `< tolerance` test forever, so without a guard `relax` would burn all its steps and a
    // viewer driver would never be done.
    const unstable = { ...hexagon, dt: 10 };
    const start = Date.now();
    expect(() => relax(unstable, restState(unstable), 0.5, { maxSteps: 100_000 })).toThrow(
      /diverged/,
    );
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it("continues a state: relaxing twice at one fold agrees with relaxing once", () => {
    const once = relax(hexagon, restState(hexagon), 0.4);
    const twice = relax(hexagon, once, 0.4);
    expect(twice.steps).toBeLessThan(50);
    expect(
      Math.max(...twice.positions.map((v, p) => Math.abs(v - once.positions[p]!))),
    ).toBeLessThan(1e-3);
  });
});
