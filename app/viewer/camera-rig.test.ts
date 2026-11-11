import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RENDER_TOLERANCE } from "../render/cartesian";
import {
  POLAR_MIN,
  clipPlanes,
  fitRig,
  orbit,
  pan,
  rigPose,
  zoom,
  type Rig,
  type Vec3,
} from "./camera-rig";

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3) => Math.hypot(...a);

const coord = fc.double({ min: -50, max: 50, noNaN: true });
const rigs = fc.record({
  target: fc.tuple(coord, coord, coord),
  radius: fc.double({ min: 1, max: 100, noNaN: true }),
  azimuth: fc.double({ min: -10, max: 10, noNaN: true }),
  polar: fc.double({ min: POLAR_MIN, max: Math.PI - POLAR_MIN, noNaN: true }),
  minRadius: fc.constant(0.5),
  maxRadius: fc.constant(500),
}) as fc.Arbitrary<Rig>;
const angle = fc.double({ min: -20, max: 20, noNaN: true });

describe("rigPose", () => {
  it("has an orthonormal right-handed basis with the screen up pointing up", () => {
    fc.assert(
      fc.property(rigs, (rig) => {
        const { forward, right, up } = rigPose(rig);
        for (const v of [forward, right, up])
          expect(Math.abs(len(v) - 1)).toBeLessThan(RENDER_TOLERANCE);
        expect(Math.abs(dot(forward, right))).toBeLessThan(RENDER_TOLERANCE);
        expect(Math.abs(dot(forward, up))).toBeLessThan(RENDER_TOLERANCE);
        expect(Math.abs(dot(right, up))).toBeLessThan(RENDER_TOLERANCE);
        expect(up[2]).toBeGreaterThan(0);
      }),
    );
  });

  it("looks at the target from the radius away", () => {
    fc.assert(
      fc.property(rigs, (rig) => {
        const { position, forward } = rigPose(rig);
        const d = sub(rig.target, position);
        expect(Math.abs(len(d) - rig.radius)).toBeLessThan(RENDER_TOLERANCE);
        expect(dot(d, forward)).toBeCloseTo(rig.radius, 4);
      }),
    );
  });
});

describe("orbit", () => {
  it("keeps the target and the distance to it", () => {
    fc.assert(
      fc.property(rigs, angle, angle, (rig, da, dp) => {
        const next = orbit(rig, da, dp);
        const { position } = rigPose(next);
        expect(next.target).toEqual(rig.target);
        expect(Math.abs(len(sub(position, next.target)) - rig.radius)).toBeLessThan(
          RENDER_TOLERANCE,
        );
      }),
    );
  });

  it("clamps the polar angle, so the screen never flips", () => {
    fc.assert(
      fc.property(rigs, fc.array(fc.tuple(angle, angle), { maxLength: 5 }), (rig, moves) => {
        let r = rig;
        for (const [da, dp] of moves) r = orbit(r, da, dp);
        expect(r.polar).toBeGreaterThanOrEqual(POLAR_MIN);
        expect(r.polar).toBeLessThanOrEqual(Math.PI - POLAR_MIN);
        expect(rigPose(r).up[2]).toBeGreaterThan(0);
      }),
    );
  });

  it("a full turn in azimuth returns to the same pose", () => {
    fc.assert(
      fc.property(rigs, (rig) => {
        const a = rigPose(rig).position;
        const b = rigPose(orbit(rig, 2 * Math.PI, 0)).position;
        expect(len(sub(a, b))).toBeLessThan(RENDER_TOLERANCE);
      }),
    );
  });

  it("zero deltas change nothing, and non-finite deltas throw", () => {
    const rig = fitRig({ min: [0, 0, 0], max: [4, 4, 0] }, 1, 1);
    expect(orbit(rig, 0, 0)).toEqual(rig);
    expect(() => orbit(rig, NaN, 0)).toThrow(RangeError);
    expect(() => orbit(rig, 0, Infinity)).toThrow(RangeError);
  });
});

describe("zoom", () => {
  it("stays inside the radius limits", () => {
    fc.assert(
      fc.property(rigs, fc.double({ min: 1e-3, max: 1e3, noNaN: true }), (rig, f) => {
        const r = zoom(rig, f).radius;
        expect(r).toBeGreaterThanOrEqual(rig.minRadius);
        expect(r).toBeLessThanOrEqual(rig.maxRadius);
      }),
    );
  });

  it("zooming by f and then 1/f is the identity while no limit is hit", () => {
    fc.assert(
      fc.property(rigs, fc.double({ min: 0.8, max: 1.25, noNaN: true }), (rig, f) => {
        const back = zoom(zoom(rig, f), 1 / f);
        expect(Math.abs(back.radius - rig.radius)).toBeLessThan(RENDER_TOLERANCE);
      }),
    );
  });

  it("rejects a factor that is not positive and finite", () => {
    const rig = fitRig({ min: [0, 0, 0], max: [4, 4, 0] }, 1, 1);
    for (const f of [0, -1, NaN, Infinity]) expect(() => zoom(rig, f)).toThrow(RangeError);
  });
});

describe("pan", () => {
  it("moves the target in the screen plane by radius times the delta", () => {
    fc.assert(
      fc.property(
        rigs,
        fc.double({ min: -2, max: 2, noNaN: true }),
        fc.double({ min: -2, max: 2, noNaN: true }),
        (rig, dx, dy) => {
          const next = pan(rig, dx, dy);
          const move = sub(next.target, rig.target);
          expect(Math.abs(dot(move, rigPose(rig).forward))).toBeLessThan(RENDER_TOLERANCE);
          expect(Math.abs(len(move) - rig.radius * Math.hypot(dx, dy))).toBeLessThan(
            RENDER_TOLERANCE,
          );
          const moved = sub(rigPose(next).position, rigPose(rig).position);
          expect(len(sub(moved, move))).toBeLessThan(RENDER_TOLERANCE);
        },
      ),
    );
  });

  it("a positive dx moves the target toward the screen's right", () => {
    const rig = fitRig({ min: [0, 0, 0], max: [4, 4, 0] }, 1, 1);
    const move = sub(pan(rig, 0.1, 0).target, rig.target);
    expect(dot(move, rigPose(rig).right)).toBeGreaterThan(0);
  });
});

describe("fitRig", () => {
  it("rejects bad input", () => {
    const box = { min: [0, 0, 0], max: [1, 1, 0] } as const;
    expect(() => fitRig(box, 0, 1)).toThrow(RangeError);
    expect(() => fitRig(box, Math.PI, 1)).toThrow(RangeError);
    expect(() => fitRig(box, 1, 0)).toThrow(RangeError);
    expect(() => fitRig({ min: [NaN, 0, 0], max: [1, 1, 0] }, 1, 1)).toThrow(RangeError);
  });

  it("frames a single point at a positive distance", () => {
    const rig = fitRig({ min: [2, 3, 0], max: [2, 3, 0] }, 1, 1);
    expect(rig.target).toEqual([2, 3, 0]);
    expect(rig.radius).toBeGreaterThan(0);
  });

  it("is farther for a narrower viewport than for a wider one", () => {
    const box = { min: [-3, -3, 0], max: [3, 3, 0] } as const;
    expect(fitRig(box, 1, 0.5).radius).toBeGreaterThan(fitRig(box, 1, 2).radius);
  });

  it("puts the box's bounding sphere inside both view cones", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 20, noNaN: true }),
        fc.double({ min: 0, max: 20, noNaN: true }),
        fc.double({ min: 0.3, max: 2.5, noNaN: true }),
        fc.double({ min: 0.3, max: 3, noNaN: true }),
        (w, h, fov, aspect) => {
          const rig = fitRig({ min: [0, 0, 0], max: [w, h, 0] }, fov, aspect);
          const sphere = Math.hypot(w, h) / 2;
          const half = Math.min(fov / 2, Math.atan(aspect * Math.tan(fov / 2)));
          expect(rig.radius * Math.sin(half)).toBeGreaterThanOrEqual(sphere);
          const { near, far } = clipPlanes(rig);
          expect(near).toBeLessThan(rig.radius - sphere);
          expect(far).toBeGreaterThan(rig.radius + sphere);
        },
      ),
    );
  });
});
