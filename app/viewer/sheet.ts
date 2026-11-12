/**
 * The flat crease pattern as indexed mesh data for the 3D viewer.
 *
 * Sits between the pattern stage and the render end of the data flow (pattern → … → render). It has
 * no three.js import. Every crease-pattern vertex becomes one position, in the same order, so the
 * fold simulation (`core/simulate/`) can move the positions and leave both index lists valid. Exact lattice
 * points become floats here, through `toCartesian`.
 */

import { toCartesian } from "../../core/simulate/embed";
import type { Assignment, CreasePattern } from "../../core/pattern/crease-pattern";
import { triangulateFaceKeepingVertices } from "../../core/simulate/mesh";
import type { Bounds } from "./camera-rig";

/** Every assignment, in a fixed order. */
export const ASSIGNMENTS: readonly Assignment[] = ["M", "V", "B", "F", "U"];

/** Mesh data for a crease pattern lying flat at z = 0. */
export type SheetGeometry = {
  /** x, y, z per crease-pattern vertex (length 3·V). */
  readonly positions: Float32Array;
  /** Vertex triples of the triangulated faces. */
  readonly triangles: Uint32Array;
  /** Vertex pairs of the creases, per assignment. */
  readonly creases: Readonly<Record<Assignment, Uint32Array>>;
  /** Box around the vertices; the points are at z = 0. */
  readonly bounds: Bounds;
};

/**
 * Builds the flat sheet mesh of a crease pattern.
 *
 * Each bounded face is cut into triangles by ear clipping that keeps every boundary vertex
 * ({@link triangulateFaceKeepingVertices}, Meisters 1975), so the fold simulation can use the same
 * triangles and no frame or crease vertex floats free of the mesh.
 * A face with a hole is rejected, as in `foldFaces`: a nested component needs a triangulation of a
 * polygon with holes, which no shipped pattern has.
 *
 * @param cp - the crease pattern
 * @returns positions, triangle indices, crease indices per assignment, and the bounding box
 * @throws RangeError if a face has a hole
 */
export function sheetGeometry(cp: CreasePattern): SheetGeometry {
  if (cp.holes.some((h) => h.length > 0)) {
    throw new RangeError("faces with holes are not supported by the viewer");
  }
  const positions = new Float32Array(cp.vertices.length * 3);
  const min: [number, number, number] = [0, 0, 0];
  const max: [number, number, number] = [0, 0, 0];
  cp.vertices.forEach((z, i) => {
    const p = toCartesian(z);
    positions.set([p.x, p.y, 0], 3 * i);
    if (i === 0) {
      min[0] = max[0] = p.x;
      min[1] = max[1] = p.y;
    } else {
      min[0] = Math.min(min[0], p.x);
      max[0] = Math.max(max[0], p.x);
      min[1] = Math.min(min[1], p.y);
      max[1] = Math.max(max[1], p.y);
    }
  });

  const tri: number[] = [];
  for (const face of cp.faces) {
    for (const t of triangulateFaceKeepingVertices(cp.vertices, face)) tri.push(...t);
  }

  const pairs: Record<Assignment, number[]> = { M: [], V: [], B: [], F: [], U: [] };
  for (const e of cp.edges) pairs[e.assignment].push(e.v0, e.v1);
  const creases = Object.fromEntries(
    ASSIGNMENTS.map((a) => [a, Uint32Array.from(pairs[a])]),
  ) as Record<Assignment, Uint32Array>;

  return { positions, triangles: Uint32Array.from(tri), creases, bounds: { min, max } };
}
