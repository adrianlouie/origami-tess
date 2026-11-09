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
 * @param assignment - assignment of every spoke, or one per spoke in the same order
 */
export function spokePattern(
  spokes: readonly number[],
  assignment: Assignment | readonly Assignment[],
): CreasePattern {
  return fromSegments(
    [ZERO],
    [
      ...hexagonFrame(2),
      ...spokes.map((i, k) => ({
        from: ZERO,
        to: SPOKE_ENDS[i]!,
        assignment: typeof assignment === "string" ? assignment : assignment[k]!,
      })),
    ],
  );
}

/**
 * The face counter-clockwise of each spoke of a {@link spokePattern}, in spoke order.
 *
 * Sector j of the single-vertex oracle lies between crease j and crease j + 1, so it is the face
 * on the left of the ray from the origin along spoke j. A face walk keeps its face on the left of
 * each directed pair, so that face is the walk containing the pair (origin, end of spoke j).
 *
 * @returns `faces[j]` is the index into `cp.faces` of the face counter-clockwise of spoke j
 */
export function sectorFaces(cp: CreasePattern): number[] {
  const origin = cp.vertices.findIndex((p) => p.a === 0 && p.b === 0);
  return cp.rotation[origin]!.map((e) => {
    const edge = cp.edges[e]!;
    const end = edge.v0 === origin ? edge.v1 : edge.v0;
    return cp.faces.findIndex((walk) =>
      walk.some((v, i) => v === origin && walk[(i + 1) % walk.length] === end),
    );
  });
}

/** Every subset of {0, …, n − 1} with `size` elements, each in increasing order. */
export { subsets as subsetsOf } from "../validate/testing";
