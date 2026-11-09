/**
 * Test helpers for the Phase 5 modules (not imported by shipped code).
 *
 * Builds "spoke" patterns: a hexagonal "B" frame of radius 2 with creases from the origin to chosen
 * ring points. Every spoke direction is a multiple of 30°, a mirror axis of the lattice, so the
 * fold maps are exact; the origin is the only interior vertex, so global flat-foldability reduces
 * to the single-vertex conditions and can be checked against the validators.
 */

import { eis, ZERO, type Eisenstein } from "../lattice/eisenstein";
import { hexagonFrame, rotate } from "../gadgets/crease";
import { fromSegments, type Assignment, type CreasePattern } from "../pattern/crease-pattern";

/**
 * The twelve ring points at hexDistance 2, in counter-clockwise order from +x, 30° apart: the six
 * corners 2·uᵏ (even index) and the six edge points uᵏ·(2 + ω) (odd index).
 */
export const SPOKE_ENDS: readonly Eisenstein[] = Array.from({ length: 12 }, (_, i) =>
  i % 2 === 0 ? rotate(eis(2, 0), i / 2) : rotate(eis(2, 1), (i - 1) / 2),
);

/**
 * Builds the frame plus one crease from the origin to each listed ring point.
 *
 * @param spokes - indices into {@link SPOKE_ENDS}, increasing so the creases are in
 *   counter-clockwise order
 * @param assignment - assignment of every spoke
 */
export function spokePattern(spokes: readonly number[], assignment: Assignment): CreasePattern {
  return fromSegments(
    [ZERO],
    [...hexagonFrame(2), ...spokes.map((i) => ({ from: ZERO, to: SPOKE_ENDS[i]!, assignment }))],
  );
}

/** Every subset of {0, …, n − 1} with `size` elements, each in increasing order. */
export function subsetsOf(n: number, size: number): number[][] {
  const out: number[][] = [];
  const pick = (start: number, chosen: number[]) => {
    if (chosen.length === size) {
      out.push(chosen);
      return;
    }
    for (let i = start; i < n; i++) pick(i + 1, [...chosen, i]);
  };
  pick(0, []);
  return out;
}
