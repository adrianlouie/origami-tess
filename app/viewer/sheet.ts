/**
 * The flat crease pattern as indexed mesh data for the 3D viewer.
 *
 * Sits between the pattern stage and the render end of the data flow (pattern → … → render). It has
 * no three.js import. Every crease-pattern vertex becomes one position, in the same order, so a
 * later fold simulation (6.2) can move the positions and leave both index lists valid. Exact lattice
 * points become floats here, through `toCartesian`.
 */

import { toCartesian } from "../render/cartesian";
import type { Assignment, CreasePattern } from "../../core/pattern/crease-pattern";
import { triangulateFace } from "../../core/solve/overlap";
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
 * Each bounded face is cut into triangles by ear clipping ({@link triangulateFace}, Meisters 1975).
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
  const index = new Map<string, number>();
  const min: [number, number, number] = [0, 0, 0];
  const max: [number, number, number] = [0, 0, 0];
  cp.vertices.forEach((z, i) => {
    const p = toCartesian(z);
    positions.set([p.x, p.y, 0], 3 * i);
    index.set(`${z.a},${z.b}`, i);
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
    for (const t of triangulateFace(cp.vertices, face)) {
      for (const z of t) {
        const i = index.get(`${z.a},${z.b}`);
        if (i === undefined) throw new RangeError("triangle vertex is not a pattern vertex");
        tri.push(i);
      }
    }
  }

  const pairs: Record<Assignment, number[]> = { M: [], V: [], B: [], F: [], U: [] };
  for (const e of cp.edges) pairs[e.assignment].push(e.v0, e.v1);
  const creases = Object.fromEntries(
    ASSIGNMENTS.map((a) => [a, Uint32Array.from(pairs[a])]),
  ) as Record<Assignment, Uint32Array>;

  return { positions, triangles: Uint32Array.from(tri), creases, bounds: { min, max } };
}
