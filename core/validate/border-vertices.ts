/**
 * Wedges of paper at the vertices on the edge of a sheet, and the Big-Little-Big runs inside them.
 *
 * Sits at the "validate" stage of the data flow (lattice → symmetry/gadgets → pattern → validate →
 * solve → simulate/render), beside `local-flat-foldability.ts`, which only looks at interior
 * vertices. A vertex on the edge of the sheet has no Kawasaki or Maekawa condition, because the
 * paper does not close round it, but a strictly small sector between two larger paper sectors still
 * forces its two creases to differ (Lang, *Twists, Tilings, and Tessellations*, p. 52, Fig. 1.45).
 * The clause encoder in `solve/clauses.ts` and the checker in `local-flat-foldability.ts` both read
 * those runs from here, so they cannot disagree about which creases count.
 *
 * Everything is exact: sector sizes are compared in Eisenstein integers, never as angles.
 */

import type { Eisenstein } from "../lattice/eisenstein";
import { sub } from "../lattice/eisenstein";
import type { CreasePattern } from "../pattern/crease-pattern";
import { borderSmallSectorRuns } from "./big-little-big";

/**
 * Returns the indices of the vertices that are fully surrounded by bounded faces.
 *
 * A vertex qualifies when it has at least one crease, none is a border edge ("B"), and every
 * sector around it lies in a bounded face. Each sector at v is one visit of v by one face walk,
 * and `faces` lists only bounded faces, so the condition is: v occurs in the face walks exactly
 * deg(v) times. A component nested inside a face contributes its outer walk as a hole of that face,
 * which is counted too, so its vertices are checked rather than skipped. Vertices on the outer ring
 * of a patch fail it, so they are not wrongly flagged.
 *
 * @returns vertex indices in increasing order
 */
export function interiorVertices(cp: CreasePattern): number[] {
  const visits = cp.vertices.map(() => 0);
  const walks = [...cp.faces, ...cp.holes.flat()];
  for (const walk of walks) for (const v of walk) visits[v] = (visits[v] ?? 0) + 1;
  const result: number[] = [];
  cp.vertices.forEach((_, v) => {
    const around = cp.rotation[v] ?? [];
    const border = around.some((e) => cp.edges[e]?.assignment === "B");
    if (around.length > 0 && !border && visits[v] === around.length) result.push(v);
  });
  return result;
}

/** One stretch of paper at a vertex, bounded by two edges of the sheet. */
export type PaperWedge = {
  readonly vertex: number;
  /** Edge indices of the rays, counter-clockwise from one paper edge to the other. */
  readonly edges: readonly number[];
  /** The matching directions (away from the vertex). */
  readonly directions: readonly Eisenstein[];
};

/**
 * Lists the wedges of paper at every vertex that is not interior and has paper on some side of it.
 *
 * A sector is paper when it is the corner of a bounded face walk or of a hole walk: a face walk
 * keeps its face on the left, so at vertex v, between the previous vertex u and the next vertex w,
 * the face fills the angle from v→w counter-clockwise to v→u. A hole walk (a nested component's
 * outer boundary, clockwise) keeps the surrounding face on its left in the same way. The angle
 * between two consecutive edges is therefore paper exactly when some walk has that corner, and a
 * wedge is a maximal stretch of consecutive paper angles. A vertex where the sheet pinches to a
 * point has one wedge per stretch.
 *
 * Flat ("F") creases inside a wedge are left out of its rays, as `foldingCreases` does, because
 * they divide no sector; the two angles either side of one are merged. A vertex that has paper all
 * round it is not listed: it is an interior vertex, or an interior vertex on a slit, which uncut
 * paper does not have.
 *
 * @returns wedges in increasing vertex order
 */
export function paperWedges(cp: CreasePattern): PaperWedge[] {
  const corners = new Set<string>();
  for (const walk of [...cp.faces, ...cp.holes.flat()]) {
    const length = walk.length;
    walk.forEach((v, k) => {
      corners.add(`${v}:${walk[(k + 1) % length]}:${walk[(k + length - 1) % length]}`);
    });
  }
  const interior = new Set(interiorVertices(cp));
  const wedges: PaperWedge[] = [];
  cp.vertices.forEach((position, v) => {
    const around = cp.rotation[v] ?? [];
    const n = around.length;
    if (interior.has(v) || n < 2) return;
    const neighbour = around.map((e) => {
      const edge = cp.edges[e]!;
      return edge.v0 === v ? edge.v1 : edge.v0;
    });
    // inside[i]: the angle from edge i counter-clockwise to edge i + 1 is paper.
    const inside = neighbour.map((w, i) => corners.has(`${v}:${w}:${neighbour[(i + 1) % n]}`));
    const outside = inside.indexOf(false);
    if (outside === -1) return;
    // Walk the angles starting just after an outside one, so no wedge wraps past the seam.
    let k = 1;
    while (k < n) {
      if (!inside[(outside + k) % n]) {
        k++;
        continue;
      }
      const rays = [(outside + k) % n];
      while (k < n && inside[(outside + k) % n]) {
        rays.push((outside + k + 1) % n);
        k++;
      }
      const kept = rays.filter(
        (r, i) => i === 0 || i === rays.length - 1 || cp.edges[around[r]!]!.assignment !== "F",
      );
      const edges = kept.map((r) => around[r]!);
      wedges.push({
        vertex: v,
        edges,
        directions: edges.map((e) => {
          const edge = cp.edges[e]!;
          return sub(cp.vertices[edge.v0 === v ? edge.v1 : edge.v0]!, position);
        }),
      });
    }
  });
  return wedges;
}

/** A run of small sectors at a border vertex: the creases that bound it. */
export type BorderRun = {
  readonly vertex: number;
  /** Edge indices of the k + 1 creases that bound the run, counter-clockwise. */
  readonly edges: readonly number[];
};

/**
 * Finds every Big-Little-Big run at the edge of the sheet.
 *
 * Reads {@link paperWedges} and applies {@link borderSmallSectorRuns} to each wedge. A run is kept
 * only when every crease that bounds it is a fold: a border edge ("B") inside a wedge is a slit,
 * which constrains nothing about the folds on either side.
 *
 * @throws RangeError as `borderSmallSectorRuns` does
 */
export function borderRuns(cp: CreasePattern): BorderRun[] {
  const runs: BorderRun[] = [];
  for (const wedge of paperWedges(cp)) {
    for (const run of borderSmallSectorRuns(wedge.directions)) {
      const edges = run.map((i) => wedge.edges[i]!);
      if (edges.some((e) => cp.edges[e]!.assignment === "B")) continue;
      runs.push({ vertex: wedge.vertex, edges });
    }
  }
  return runs;
}
