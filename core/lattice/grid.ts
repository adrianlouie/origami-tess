/**
 * Finite triangular grid: the hexagon of lattice points within radius R.
 *
 * Second module in the data flow (lattice → symmetry/gadgets → pattern → …).
 * It turns the exact Eisenstein points of step 1.1 into a vertex and edge
 * list that the renderer (1.3) draws and gadgets are later placed on. All
 * coordinates stay integers; floats appear only at the render boundary.
 *
 * Reference: Conway & Sloane, "Sphere Packings, Lattices and Groups", ch. 4
 * (the A2 lattice); Red Blob Games, "Hexagonal Grids" (cube coordinates).
 */

import { add, eis, type Eisenstein } from "./eisenstein";

/** An undirected unit-length lattice edge, stored once as from → to. */
export type Edge = { readonly from: Eisenstein; readonly to: Eisenstein };

/** The hexagonal grid of radius `radius`: all lattice points within that many unit steps of 0. */
export type TriangularGrid = {
  readonly radius: number;
  readonly vertices: readonly Eisenstein[];
  readonly edges: readonly Edge[];
};

/**
 * The three "forward" unit steps 1, 1 + ω and ω.
 *
 * The six unit neighbours are ±these. Generating edges with only one sign of
 * each pair lists every undirected edge exactly once, so no dedupe is needed.
 */
const FORWARD_UNITS: readonly Eisenstein[] = [eis(1, 0), eis(1, 1), eis(0, 1)];

/**
 * Returns the number of unit steps from the origin to z on the triangular lattice.
 *
 * Formula: d(a + bω) = max(|a|, |b|, |a − b|). With ω at 120°, the six unit
 * steps are ±1, ±ω, ±(1 + ω); this is the cube-coordinate (Chebyshev) distance
 * of the A2 lattice, using the cube triple (a, −b, b − a) up to sign.
 * Integer-valued, so distance comparisons are exact.
 *
 * @param z - lattice point
 * @returns the hex distance, a non-negative integer
 */
export function hexDistance(z: Eisenstein): number {
  return Math.max(Math.abs(z.a), Math.abs(z.b), Math.abs(z.a - z.b));
}

/**
 * Builds the triangular grid H_R = { z : hexDistance(z) ≤ R }.
 *
 * Counting: V = 3R² + 3R + 1 vertices (centred hexagonal numbers). The grid
 * has F = 6R² unit triangles and 6R boundary edges; every triangle has 3 sides,
 * interior edges are shared by 2 triangles and boundary edges by 1, so
 * 3F + 6R = 2E, giving E = 9R² + 3R. Euler's V − E + F = 1 agrees.
 *
 * Order is deterministic (row-major in a then b) so renders can be snapshotted.
 *
 * @param radius - non-negative safe integer R
 * @throws RangeError if `radius` is not a non-negative safe integer
 */
export function triangularGrid(radius: number): TriangularGrid {
  if (!Number.isSafeInteger(radius) || radius < 0) {
    throw new RangeError(`Grid radius must be a non-negative safe integer, got ${radius}`);
  }
  const vertices: Eisenstein[] = [];
  for (let a = -radius; a <= radius; a++) {
    for (let b = -radius; b <= radius; b++) {
      const z = eis(a, b);
      if (hexDistance(z) <= radius) vertices.push(z);
    }
  }
  const edges: Edge[] = [];
  for (const from of vertices) {
    for (const u of FORWARD_UNITS) {
      const to = add(from, u);
      if (hexDistance(to) <= radius) edges.push({ from, to });
    }
  }
  return { radius, vertices, edges };
}
