/**
 * Maps pointer gestures to camera-rig changes.
 *
 * Sits in the 3D viewer between the browser events in `main.ts` and the pure rig math in
 * `camera-rig.ts`, so the sign and scale conventions can be tested without a DOM.
 */

import { orbit, pan, zoom, type Rig } from "./camera-rig";

/** Radians of orbit per pixel dragged. */
export const ORBIT_SPEED = 0.005;

/** Zoom per wheel unit: the radius is multiplied by exp(deltaY·ZOOM_SPEED). */
export const ZOOM_SPEED = 0.001;

/** A pointer gesture in pixels. `dy` and `deltaY` grow downward, as in the DOM. */
export type Gesture =
  | {
      readonly kind: "drag";
      readonly button: "left" | "right";
      readonly shift: boolean;
      readonly dx: number;
      readonly dy: number;
    }
  | { readonly kind: "wheel"; readonly deltaY: number };

/** The canvas size in pixels and the camera's vertical field of view in radians. */
export type Viewport = { readonly height: number; readonly fovY: number };

/**
 * Applies a gesture to a rig.
 *
 * A left drag orbits (drag right moves the camera left around the pattern, drag down moves it
 * toward the top view). A right drag, or a left drag with shift, pans so the pattern follows the
 * pointer; one pixel is 2·tan(fovY/2)/height of the radius, the size of a pixel at the target. The
 * wheel zooms out for a positive delta.
 *
 * @throws RangeError if the viewport height is not positive, or a delta is not finite
 */
export function pointerToRig(rig: Rig, gesture: Gesture, viewport: Viewport): Rig {
  if (!(viewport.height > 0)) throw new RangeError("viewport height must be positive");
  if (gesture.kind === "wheel") return zoom(rig, Math.exp(gesture.deltaY * ZOOM_SPEED));
  if (gesture.button === "right" || gesture.shift) {
    const perPixel = (2 * Math.tan(viewport.fovY / 2)) / viewport.height;
    return pan(rig, -gesture.dx * perPixel, gesture.dy * perPixel);
  }
  return orbit(rig, -gesture.dx * ORBIT_SPEED, -gesture.dy * ORBIT_SPEED);
}
