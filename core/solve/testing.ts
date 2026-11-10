/**
 * Test helpers for the Phase 5 modules (not imported by shipped code).
 *
 * Builds "spoke" patterns: a hexagonal "B" frame of radius 2 with creases from the origin to chosen
 * ring points. Every spoke direction is a multiple of 30°, a mirror axis of the lattice, so the
 * fold maps are exact; the origin is the only interior vertex, so global flat-foldability reduces
 * to the single-vertex conditions and can be checked against the validators.
 */

import { add, eis, ZERO, type Eisenstein } from "../lattice/eisenstein";
import { hexDistance } from "../lattice/grid";
import { hexagonFrame, rotate, type Crease } from "../gadgets/crease";
import { triangleTwistCreases } from "../gadgets/triangle-twist";
import { fromSegments, type Assignment, type CreasePattern } from "../pattern/crease-pattern";
import { foldFaces } from "./folded-faces";

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

/**
 * Whole lattice lines in a radius-2 hexagon, as unit edges inside a "B" frame, all unassigned.
 * Every crossing of lattice lines passes Kawasaki, so M/V is the only thing left to get right.
 */
export function arrangement(lines: readonly { dir: number; offset: number }[]): Crease[] {
  const dirs = [eis(1, 0), eis(0, 1), eis(1, 1)];
  const creases: Crease[] = hexagonFrame(2);
  const seen = new Set<string>();
  for (const { dir, offset } of lines) {
    const d = dirs[dir]!;
    const base = dir === 0 ? eis(0, offset) : eis(offset, 0);
    const points: Eisenstein[] = [];
    for (let t = -6; t <= 6; t++) {
      const p = add(base, { a: d.a * t, b: d.b * t });
      if (hexDistance(p) <= 2) points.push(p);
    }
    for (let i = 0; i + 1 < points.length; i++) {
      const from = points[i]!;
      const to = points[i + 1]!;
      if (hexDistance(from) === 2 && hexDistance(to) === 2) continue;
      const key = `${from.a},${from.b}-${to.a},${to.b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      creases.push({ from, to, assignment: "U" });
    }
  }
  return creases;
}

/** The nine lattice lines (three directions, offsets −1, 0, 1) that cross the radius-2 hexagon. */
export const ALL_LINES = [0, 1, 2].flatMap((dir) => [-1, 0, 1].map((offset) => ({ dir, offset })));

/** Every choice of `size` lines from the nine that cross the radius-2 hexagon. */
export function lineSets(size: number): { dir: number; offset: number }[][] {
  const out: { dir: number; offset: number }[][] = [];
  const pick = (start: number, chosen: { dir: number; offset: number }[]) => {
    if (chosen.length === size) {
      out.push(chosen);
      return;
    }
    for (let i = start; i < ALL_LINES.length; i++) pick(i + 1, [...chosen, ALL_LINES[i]!]);
  };
  pick(0, []);
  return out;
}

/** The folded placement of a pattern, or an error if it does not fold consistently. */
export function foldedOrThrow(cp: CreasePattern) {
  const folded = foldFaces(cp);
  if (folded.status !== "ok") throw new Error("pattern does not fold");
  return folded;
}

/** The pattern with every M/V crease reset to "U", ready for the M/V solver. */
export function freed(cp: CreasePattern): CreasePattern {
  return {
    ...cp,
    edges: cp.edges.map((e) =>
      e.assignment === "M" || e.assignment === "V" ? { ...e, assignment: "U" as const } : e,
    ),
  };
}

/**
 * The triangle twist crease pattern for any n, m ≥ 1, including n < 3m where it is locally valid
 * but does not fold flat (`triangleTwist` itself rejects those sizes).
 */
export function rawTriangleTwist(side: number, rayLength: number): CreasePattern {
  return fromSegments([], triangleTwistCreases(side, rayLength));
}
