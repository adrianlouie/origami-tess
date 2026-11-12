/**
 * Render boundary: exact Eisenstein integers to floating-point plane coordinates.
 *
 * Last stop of the lattice stage in the data flow (lattice → … → render). The embedding and the
 * shared tolerance moved to `core/simulate/embed.ts` so the fold simulation, which `app/` depends
 * on and not the reverse, can use them; they are re-exported here so renderers keep one import.
 */

export { RENDER_TOLERANCE, toCartesian, type Point } from "../../core/simulate/embed";

/** Decimal places written to SVG output; keeps snapshots stable across platforms. */
export const RENDER_PRECISION = 6;
