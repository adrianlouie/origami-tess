/**
 * Exact lattice points to floating-point plane coordinates.
 *
 * Sits at the boundary between the exact stages (lattice → pattern → validate → solve) and the
 * physical stage (simulate, render) of the data flow. This is the only place lattice points become
 * floats, so the one shared tolerance lives here too: the SVG renderer, the 3D viewer and the fold
 * relaxation all compare floats against `RENDER_TOLERANCE`.
 */

import type { Eisenstein } from "../lattice/eisenstein";

/** A point in the Euclidean plane, in lattice units (unit edge length). */
export type Point = { readonly x: number; readonly y: number };

/**
 * The single tolerance for comparing rendered or simulated floats.
 *
 * Rounding to six decimal places perturbs a coordinate by up to 5·10⁻⁷, so a length computed from
 * two rounded endpoints is off by about 1.4·10⁻⁶; this bound sits safely above that.
 */
export const RENDER_TOLERANCE = 1e-5;

/**
 * Embeds an Eisenstein integer in the plane: a + bω ↦ (a − b/2, b·√3/2).
 *
 * Formula: ω = e^{2πi/3} = −1/2 + i·√3/2, so a + bω has real part a − b/2 and
 * imaginary part b·√3/2 (Conway & Sloane, "Sphere Packings, Lattices and Groups",
 * ch. 4, the A2 lattice). The map is ℝ-linear, sends the six unit neighbours to
 * unit vectors, and so preserves edge length 1.
 *
 * @param z - exact lattice point
 * @returns the Cartesian point, in lattice units with the math y-axis pointing up
 */
export function toCartesian(z: Eisenstein): Point {
  return { x: z.a - z.b / 2, y: (z.b * Math.sqrt(3)) / 2 };
}
