/**
 * Face adjacency of a crease pattern.
 *
 * Sits at the "pattern" stage of the data flow (lattice → symmetry/gadgets → pattern → validate →
 * solve → …), right after the crease graph: the fold maps and the layer constraints of Phase 5 both
 * work on pairs of faces that share a crease, so that relation is computed once here from the
 * half-edge structure that `creasePattern` already built.
 *
 * Reference: de Berg et al., "Computational Geometry", §2.2 (each half-edge has exactly one
 * incident face, on its left); Demaine & O'Rourke, "Geometric Folding Algorithms", ch. 12.
 */

import type { CreasePattern } from "./crease-pattern";

/**
 * Two bounded faces on either side of one crease.
 *
 * `left` is the face on the left of the edge directed v0 → v1 and `right` the one on its right.
 */
export type FaceAdjacency = {
  readonly edge: number;
  readonly left: number;
  readonly right: number;
};

/**
 * Lists every crease that has a bounded face on both sides.
 *
 * A directed edge u → v belongs to exactly one face walk, the one that keeps it on its left, so the
 * face on each side is a lookup of the two directed pairs. A side lying in the unbounded face (or
 * in the outer walk of a nested component) has no entry in `cp.faces` and the crease is skipped:
 * it is on the boundary of the paper, not between two faces.
 *
 * @returns one entry per such crease, in increasing edge order
 * @throws RangeError if some crease has the same face on both sides. That is a dangling or bridge
 *   crease, which ends inside a face; no uncut sheet folds along it, and the vertex at its free
 *   end already fails Kawasaki
 */
export function faceAdjacency(cp: CreasePattern): FaceAdjacency[] {
  const faceOf = new Map<string, number>();
  cp.faces.forEach((walk, f) => {
    for (let i = 0; i < walk.length; i++) {
      faceOf.set(`${walk[i]},${walk[(i + 1) % walk.length]}`, f);
    }
  });
  const out: FaceAdjacency[] = [];
  cp.edges.forEach((e, edge) => {
    const left = faceOf.get(`${e.v0},${e.v1}`);
    const right = faceOf.get(`${e.v1},${e.v0}`);
    if (left === undefined || right === undefined) return;
    if (left === right) {
      throw new RangeError(`Crease ${edge} has face ${left} on both sides (a dangling crease)`);
    }
    out.push({ edge, left, right });
  });
  return out;
}
