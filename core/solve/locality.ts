/**
 * Locality of a conflict: how deep in the paper a set of faces lies, and how many pieces it has.
 *
 * Sits after `near-foldability.ts` in the "solve" stage of the data flow (… → validate → solve →
 * simulate/render). `nearFoldability` says how much paper a partial fold gives up; this module says
 * where that paper is. A small conflict at the outline of the sheet can often be absorbed by the
 * last, unfolded margin, while the same area in the middle cannot. The layered render (5.3) uses
 * it to decide how to mark a conflict, and the repair loop (8.2) can use it to prefer edge
 * conflicts.
 *
 * Depth is measured in the face-adjacency (dual) graph, with exact integers throughout. It uses
 * the topology of the sheet (a crease with no bounded face on one side), not the "B" label, so it
 * holds for patterns drawn without a frame.
 */

import { checkedAdd, checkedMul } from "../lattice/eisenstein";
import { faceDoubledArea, type CreasePattern } from "../pattern/crease-pattern";
import { faceAdjacency } from "../pattern/faces";

/** An exact non-negative fraction. */
export type Fraction = { readonly num: number; readonly den: number };

/** Where a set of faces lies in the sheet. */
export type Locality = {
  /** Number of faces in the set (duplicates in the input count once). */
  readonly size: number;
  /** Deepest face of the set, in hops to the outline; 0 for an empty set. */
  readonly maxDepth: number;
  /**
   * Mean depth weighted by face area, as an exact fraction; 0/1 for an empty set, and null when
   * some face cannot reach the outline (depth infinite).
   */
  readonly meanDepth: Fraction | null;
  /** Connected pieces of the set in the face-adjacency graph; 0 for an empty set. */
  readonly clusters: number;
  /** The set's share of the paper's area (doubled areas). */
  readonly area: Fraction;
  /** True when every face of the set touches the outline of the sheet (`maxDepth` is 0). */
  readonly atEdge: boolean;
};

/** Neighbour lists of the face-adjacency graph. */
function dualGraph(cp: CreasePattern): number[][] {
  const next: number[][] = cp.faces.map(() => []);
  for (const { left, right } of faceAdjacency(cp)) {
    next[left]!.push(right);
    next[right]!.push(left);
  }
  return next;
}

/**
 * Hops from each face to the outline of the sheet.
 *
 * A face has depth 0 when one of its creases has no bounded face on the other side, because that
 * crease lies on the paper's edge. Every other face is one more than its shallowest neighbour,
 * which is a multi-source breadth-first search on an unweighted graph (Cormen et al.,
 * "Introduction to Algorithms", §22.2). A face in a component with no outline face keeps depth
 * `Infinity`; a connected sheet never has one.
 *
 * @param cp - a crease pattern
 * @returns one depth per entry of `cp.faces`
 * @throws RangeError as `faceAdjacency` does
 */
export function boundaryDepth(cp: CreasePattern): number[] {
  const adjacency = faceAdjacency(cp);
  const inner = cp.faces.map(() => 0);
  for (const { left, right } of adjacency) {
    inner[left]!++;
    inner[right]!++;
  }
  const next = dualGraph(cp);
  const depth = cp.faces.map(() => Infinity);
  let frontier: number[] = [];
  // faceAdjacency throws on a crease with one face on both sides, so each walk edge is counted at
  // most once, and a face with fewer counted edges than its walk has an outline edge.
  cp.faces.forEach((walk, f) => {
    if (inner[f]! < walk.length) {
      depth[f] = 0;
      frontier.push(f);
    }
  });
  for (let d = 1; frontier.length > 0; d++) {
    const grown: number[] = [];
    for (const f of frontier) {
      for (const g of next[f]!) {
        if (depth[g] === Infinity) {
          depth[g] = d;
          grown.push(g);
        }
      }
    }
    frontier = grown;
  }
  return depth;
}

/**
 * Measures where a set of faces lies: depth from the outline, connected pieces and area share.
 *
 * @param cp - a crease pattern
 * @param faces - face indices, for example the `repair.faces` or `conflict.faces` of a partial
 *   `nearFoldability` result; order and duplicates do not matter
 * @throws RangeError if an index is not a face, or as `boundaryDepth` does
 */
export function conflictLocality(cp: CreasePattern, faces: readonly number[]): Locality {
  for (const f of faces) {
    if (!Number.isInteger(f) || f < 0 || f >= cp.faces.length) {
      throw new RangeError(`Face ${f} is not a face of the pattern`);
    }
  }
  const set = [...new Set(faces)].sort((a, b) => a - b);
  const area = cp.faces.map((face) => faceDoubledArea(cp.vertices, face));
  const total = area.reduce((a, b) => checkedAdd(a, b), 0);
  const inSet = new Set(set);
  const depth = boundaryDepth(cp);
  const next = dualGraph(cp);

  let clusters = 0;
  const seen = new Set<number>();
  for (const start of set) {
    if (seen.has(start)) continue;
    clusters++;
    seen.add(start);
    const stack = [start];
    while (stack.length > 0) {
      for (const g of next[stack.pop()!]!) {
        if (inSet.has(g) && !seen.has(g)) {
          seen.add(g);
          stack.push(g);
        }
      }
    }
  }

  const setArea = set.reduce((sum, f) => checkedAdd(sum, area[f]!), 0);
  const maxDepth = set.reduce((m, f) => Math.max(m, depth[f]!), 0);
  const meanDepth =
    maxDepth === Infinity
      ? null
      : set.length === 0
        ? { num: 0, den: 1 }
        : {
            num: set.reduce((sum, f) => checkedAdd(sum, checkedMul(area[f]!, depth[f]!)), 0),
            den: setArea,
          };
  return Object.freeze({
    size: set.length,
    maxDepth,
    meanDepth,
    clusters,
    area: Object.freeze({ num: setArea, den: total }),
    atEdge: maxDepth === 0,
  });
}
