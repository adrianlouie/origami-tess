import { describe, expect, it } from "vitest";
import { fitRig, orbit, pan, rigPose, zoom } from "./camera-rig";
import { ORBIT_SPEED, pointerToRig, ZOOM_SPEED, type Viewport } from "./input";

const rig = { ...fitRig({ min: [-3, -3, 0], max: [3, 3, 0] }, 0.9, 1.5), polar: 1 };
const viewport: Viewport = { height: 600, fovY: 0.9 };

describe("pointerToRig", () => {
  it("a left drag orbits: right moves the camera left, down moves it toward the top view", () => {
    const next = pointerToRig(
      rig,
      { kind: "drag", button: "left", shift: false, dx: 10, dy: 20 },
      viewport,
    );
    expect(next).toEqual(orbit(rig, -10 * ORBIT_SPEED, -20 * ORBIT_SPEED));
    expect(next.azimuth).toBeLessThan(rig.azimuth);
    expect(next.polar).toBeLessThan(rig.polar);
  });

  it("a right drag and a shift-drag pan the same way", () => {
    const right = pointerToRig(
      rig,
      { kind: "drag", button: "right", shift: false, dx: 30, dy: 0 },
      viewport,
    );
    const shift = pointerToRig(
      rig,
      { kind: "drag", button: "left", shift: true, dx: 30, dy: 0 },
      viewport,
    );
    expect(right).toEqual(shift);
    expect(right.azimuth).toBe(rig.azimuth);
  });

  it("pans so that the pattern follows the pointer, one pixel per pixel at the target", () => {
    const next = pointerToRig(
      rig,
      { kind: "drag", button: "right", shift: false, dx: 30, dy: 0 },
      viewport,
    );
    const { right } = rigPose(rig);
    const move = next.target.map((v, i) => v - rig.target[i]!);
    const along = move[0]! * right[0] + move[1]! * right[1] + move[2]! * right[2];
    expect(along).toBeLessThan(0);
    const worldPerPixel = (2 * Math.tan(viewport.fovY / 2) * rig.radius) / viewport.height;
    expect(Math.abs(along)).toBeCloseTo(30 * worldPerPixel, 6);
    expect(next).toEqual(pan(rig, -30 * ((2 * Math.tan(0.45)) / 600), 0));
  });

  it("the wheel zooms out for a positive delta and in for a negative one", () => {
    const out = pointerToRig(rig, { kind: "wheel", deltaY: 100 }, viewport);
    const inn = pointerToRig(rig, { kind: "wheel", deltaY: -100 }, viewport);
    expect(out.radius).toBeGreaterThan(rig.radius);
    expect(inn.radius).toBeLessThan(rig.radius);
    expect(out).toEqual(zoom(rig, Math.exp(100 * ZOOM_SPEED)));
  });

  it("rejects a viewport with no height", () => {
    expect(() => pointerToRig(rig, { kind: "wheel", deltaY: 1 }, { height: 0, fovY: 1 })).toThrow(
      RangeError,
    );
  });
});
