/**
 * Orbit camera as pure math: a target point, a distance and two angles.
 *
 * Sits at the render end of the data flow (… → simulate/render), in the 3D viewer. It has no
 * three.js import, so orbit, zoom, pan and framing are testable in Node without WebGL; `scene.ts`
 * copies a {@link Rig} onto a `PerspectiveCamera`. World axes are right-handed with +z up, so the
 * flat crease pattern (z = 0) is seen from above.
 */

/** A point or direction in world space (x, y, z). */
export type Vec3 = readonly [number, number, number];

/** An axis-aligned box. */
export type Bounds = { readonly min: Vec3; readonly max: Vec3 };

/**
 * The state of an orbit camera.
 *
 * `azimuth` is the angle of the camera around +z measured from +x, and `polar` is the angle from
 * +z down to the camera, both in radians. `minRadius` and `maxRadius` bound zoom.
 */
export type Rig = {
  readonly target: Vec3;
  readonly radius: number;
  readonly azimuth: number;
  readonly polar: number;
  readonly minRadius: number;
  readonly maxRadius: number;
};

/** Camera position and the orthonormal view basis; `up` is the screen's up direction. */
export type Pose = {
  readonly position: Vec3;
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
};

/**
 * Smallest polar angle in radians. At polar 0 the camera is on the +z axis and the screen-right
 * direction is undefined, so orbit stops a little short of both poles; that also keeps the view from
 * flipping over.
 */
export const POLAR_MIN = 0.05;

/** Start view: from the −y side, tilted 0.6 rad off straight down, so x runs left to right. */
export const INITIAL_AZIMUTH = -Math.PI / 2;
export const INITIAL_POLAR = 0.6;

/** Extra room around the pattern when framing it, as a distance factor. */
const FIT_MARGIN = 1.05;

/** A framed box is treated as at least this half-diagonal (lattice units), so a point still frames. */
const MIN_HALF_EXTENT = 0.5;

const finite = (n: number) => Number.isFinite(n);

/**
 * Returns the camera pose for a rig.
 *
 * Formula: spherical coordinates about the target. The camera sits at
 * target + r·(sin φ cos θ, sin φ sin θ, cos φ) for polar φ and azimuth θ, and looks back at the
 * target, so forward f = −(sin φ cos θ, sin φ sin θ, cos φ). The screen basis is right = f × ẑ
 * normalised = (−sin θ, cos θ, 0) and up = right × f = (−cos θ cos φ, −sin θ cos φ, sin φ), whose z
 * component sin φ is positive for φ in (0, π), so up never points down.
 *
 * @param rig - the camera state
 * @returns position, forward, right and up, each a unit vector except `position`
 */
export function rigPose(rig: Rig): Pose {
  const { target, radius, azimuth: t, polar: p } = rig;
  const [sp, cp, st, ct] = [Math.sin(p), Math.cos(p), Math.sin(t), Math.cos(t)];
  return {
    position: [target[0] + radius * sp * ct, target[1] + radius * sp * st, target[2] + radius * cp],
    forward: [-sp * ct, -sp * st, -cp],
    right: [-st, ct, 0],
    up: [-ct * cp, -st * cp, sp],
  };
}

/**
 * Orbits around the target by changing the angles.
 *
 * The polar angle is clamped to [{@link POLAR_MIN}, π − {@link POLAR_MIN}]. The azimuth is not
 * wrapped, so a full turn returns the same pose.
 *
 * @param dAzimuth - change in azimuth, radians
 * @param dPolar - change in polar angle, radians (positive moves the camera away from +z)
 * @throws RangeError if a delta is not finite
 */
export function orbit(rig: Rig, dAzimuth: number, dPolar: number): Rig {
  if (!finite(dAzimuth) || !finite(dPolar)) throw new RangeError("orbit deltas must be finite");
  const polar = Math.min(Math.max(rig.polar + dPolar, POLAR_MIN), Math.PI - POLAR_MIN);
  return { ...rig, azimuth: rig.azimuth + dAzimuth, polar };
}

/**
 * Dollies the camera toward or away from the target.
 *
 * @param factor - the new radius is radius·factor, clamped to [minRadius, maxRadius]; below 1 zooms in
 * @throws RangeError if factor is not a positive finite number
 */
export function zoom(rig: Rig, factor: number): Rig {
  if (!finite(factor) || factor <= 0) throw new RangeError("zoom factor must be positive");
  const radius = Math.min(Math.max(rig.radius * factor, rig.minRadius), rig.maxRadius);
  return { ...rig, radius };
}

/**
 * Slides the target in the screen plane, so the scene appears to follow the pointer.
 *
 * The target moves by radius·(dx·right + dy·up). Scaling by the radius keeps a pan the same size on
 * screen at every zoom level, because the visible width at the target grows in proportion to it.
 *
 * @param dx - screen-right movement, in units of the radius
 * @param dy - screen-up movement, in units of the radius
 * @throws RangeError if a delta is not finite
 */
export function pan(rig: Rig, dx: number, dy: number): Rig {
  if (!finite(dx) || !finite(dy)) throw new RangeError("pan deltas must be finite");
  const { right, up } = rigPose(rig);
  const k = rig.radius;
  const target: Vec3 = [
    rig.target[0] + k * (dx * right[0] + dy * up[0]),
    rig.target[1] + k * (dx * right[1] + dy * up[1]),
    rig.target[2] + k * (dx * right[2] + dy * up[2]),
  ];
  return { ...rig, target };
}

/**
 * Frames a box so every point of it is visible from any orbit angle.
 *
 * Formula: a sphere of radius R about the centre lies inside a symmetric view cone of half-angle α
 * when the distance d satisfies d·sin α ≥ R (tangent from the camera). The cone must fit the narrower
 * of the vertical half-angle α_v = fovY/2 and the horizontal α_h = atan(aspect·tan α_v). The sphere
 * contains the box and does not depend on the angles, so orbiting keeps it in view.
 *
 * @param bounds - box to frame (world space)
 * @param fovY - vertical field of view, radians, in (0, π)
 * @param aspect - viewport width over height, positive
 * @returns a rig looking at the box centre from the initial angles, with zoom limits around the fit
 * @throws RangeError for a bad fovY or aspect, or a non-finite box
 */
export function fitRig(bounds: Bounds, fovY: number, aspect: number): Rig {
  if (!(fovY > 0 && fovY < Math.PI)) throw new RangeError("fovY must be in (0, π)");
  if (!(aspect > 0) || !finite(aspect)) throw new RangeError("aspect must be positive");
  const all = [...bounds.min, ...bounds.max];
  if (!all.every(finite)) throw new RangeError("bounds must be finite");
  const target: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const half = Math.hypot(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
  const sphere = Math.max(half / 2, MIN_HALF_EXTENT);
  const alphaV = fovY / 2;
  const alphaH = Math.atan(aspect * Math.tan(alphaV));
  const radius = (FIT_MARGIN * sphere) / Math.sin(Math.min(alphaV, alphaH));
  return {
    target,
    radius,
    azimuth: INITIAL_AZIMUTH,
    polar: INITIAL_POLAR,
    minRadius: radius / 50,
    maxRadius: radius * 20,
  };
}

/**
 * Near and far clip distances for a rig, in proportion to its radius.
 *
 * @returns near = radius/100 and far = radius·100, so a fitted pattern is never clipped
 */
export function clipPlanes(rig: Rig): { readonly near: number; readonly far: number } {
  return { near: rig.radius / 100, far: rig.radius * 100 };
}
