/**
 * A triangle mesh of the crease pattern that uses every vertex.
 *
 * Sits at the start of the physical stage of the data flow (… → solve → simulate/render). The
 * stacking code cuts faces with `triangulateFace`, which drops vertices where a boundary goes
 * straight on: they do not change the region. A fold simulation cannot drop them, because a vertex
 * held only by bars along one line has no stiffness across it, and a crease that ends at such a
 * vertex has no triangle to hinge on. This module triangulates with those vertices kept, and
 * indexes triangles by vertex number so the simulation and the viewer share one buffer layout.
 * All decisions are exact orientation signs, so the mesh does not depend on a float tolerance.
 */

import { orientation } from "../lattice/direction";
import type { Eisenstein } from "../lattice/eisenstein";
import type { Face } from "../pattern/crease-pattern";

/** Three vertex indices of one triangle, counter-clockwise. */
export type TriangleIndices = readonly [number, number, number];

/**
 * Cuts a face into counter-clockwise triangles that together use every vertex of its walk.
 *
 * Ear clipping (Meisters 1975, "Polygons have ears"), with one change from the textbook form: the
 * ring keeps its straight (180°) vertices. A vertex is an ear tip only when it turns strictly
 * left, and the ear is accepted when no other ring vertex lies in the closed triangle it forms
 * with its two neighbours. The closed test also rejects a diagonal that passes through a straight
 * vertex, so that vertex stays a corner of some triangle. Straight vertices are never tips, so no
 * triangle has zero area. The two-ears theorem still holds for a polygon with straight vertices
 * and positive area, so the loop does not stall on a valid face.
 *
 * @param vertices - vertex positions of the crease pattern
 * @param face - a counter-clockwise boundary walk of a simple polygon
 * @returns triangles by vertex index; the area of the triangles is the area of the face
 * @throws RangeError if the walk is not a simple polygon (no ear exists)
 */
export function triangulateFaceKeepingVertices(
  vertices: readonly Eisenstein[],
  face: Face,
): TriangleIndices[] {
  const pos = (v: number): Eisenstein => {
    const z = vertices[v];
    if (z === undefined) throw new RangeError(`Vertex ${v} out of range`);
    return z;
  };
  let ring = [...face];
  const out: TriangleIndices[] = [];
  while (ring.length > 3) {
    const n = ring.length;
    const ear = ring.findIndex((cur, i) => {
      const a = ring[(i + n - 1) % n]!;
      const c = ring[(i + 1) % n]!;
      if (orientation(pos(a), pos(cur), pos(c)) <= 0) return false;
      return ring.every(
        (q, j) =>
          j === i ||
          j === (i + n - 1) % n ||
          j === (i + 1) % n ||
          !(
            orientation(pos(a), pos(cur), pos(q)) >= 0 &&
            orientation(pos(cur), pos(c), pos(q)) >= 0 &&
            orientation(pos(c), pos(a), pos(q)) >= 0
          ),
      );
    });
    if (ear < 0) throw new RangeError("Face is not a simple polygon: no ear found");
    out.push([ring[(ear + n - 1) % n]!, ring[ear]!, ring[(ear + 1) % n]!]);
    ring = ring.filter((_, j) => j !== ear);
  }
  if (ring.length === 3) {
    const [a, b, c] = [ring[0]!, ring[1]!, ring[2]!];
    if (orientation(pos(a), pos(b), pos(c)) <= 0) {
      throw new RangeError("Face is not a simple polygon: degenerate final triangle");
    }
    out.push([a, b, c]);
  }
  return out;
}
