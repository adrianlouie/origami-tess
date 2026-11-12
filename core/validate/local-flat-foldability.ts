/**
 * Local flat-foldability validators: the Kawasaki, Maekawa and Big-Little-Big conditions at a
 * single vertex.
 *
 * Sits at the "validate" stage of the data flow (lattice → symmetry/gadgets → pattern → validate →
 * solve → simulate/render). It reads the counter-clockwise edge order from a `CreasePattern`
 * (`rotation`) and decides, per interior vertex, the three necessary conditions for a flat fold.
 * All are necessary, not sufficient: global layer ordering (Phase 5) is still needed. Kawasaki is
 * decided with exact integers, never angles; Big-Little-Big lives in `big-little-big.ts`.
 *
 * Reference: Demaine & O'Rourke, "Geometric Folding Algorithms", §12.2 (Kawasaki–Justin and
 * Maekawa–Justin theorems); Hull, "Project Origami", ch. 4.
 */

import { sub, type Eisenstein } from "../lattice/eisenstein";
import type { Assignment, CreasePattern } from "../pattern/crease-pattern";
import { bigLittleBigFlat, singleVertexFlat } from "./big-little-big";
import { borderRuns, interiorVertices } from "./border-vertices";
import { kawasakiFlat } from "./kawasaki";

export { interiorVertices, kawasakiFlat };

/**
 * Tests the Maekawa–Justin condition: mountains and valleys differ by exactly two.
 *
 * Theorem (Maekawa 1980, Justin 1986; Demaine & O'Rourke, Thm 12.2.4): at a flat-foldable
 * vertex, |#M − #V| = 2. The condition forces even degree.
 *
 * The usual argument (Lang, p. 28, Fig. 1.20) assumes the folded paper does not pass through
 * itself, so it needs the fold to be injective: it is not a fact about isometries alone, and it
 * fails for "ghost paper" whose layers are allowed to cross.
 *
 * @param assignments - the M/V assignment of every crease at the vertex
 */
export function maekawaFlat(assignments: readonly ("M" | "V")[]): boolean {
  const m = assignments.filter((a) => a === "M").length;
  return Math.abs(m - (assignments.length - m)) === 2;
}

/**
 * Lists the creases at vertex v that fold, with their direction vectors.
 *
 * Flat ("F") creases are left out: they do not fold, so they divide no sector. The validators and
 * the clause encoder in `solve/clauses.ts` both read a vertex through this function, so they
 * cannot disagree about which creases count.
 *
 * @returns edge indices and the matching directions (away from v), counter-clockwise from +x
 */
export function foldingCreases(
  cp: CreasePattern,
  v: number,
): { edges: number[]; directions: Eisenstein[] } {
  const edges: number[] = [];
  const directions: Eisenstein[] = [];
  for (const e of cp.rotation[v] ?? []) {
    const edge = cp.edges[e]!;
    if (edge.assignment === "F") continue;
    const other = edge.v0 === v ? edge.v1 : edge.v0;
    directions.push(sub(cp.vertices[other]!, cp.vertices[v]!));
    edges.push(e);
  }
  return { edges, directions };
}

/** Which interior vertices violate which local condition. */
export type LocalFlatFoldabilityReport = {
  /** Interior vertices whose creases fail the Kawasaki condition. */
  readonly kawasaki: readonly number[];
  /** Interior vertices, fully assigned, whose M/V counts fail the Maekawa condition. */
  readonly maekawa: readonly number[];
  /** Interior vertices with an unassigned ("U") crease, whose Maekawa check is deferred. */
  readonly unassigned: readonly number[];
  /**
   * Interior vertices that are fully assigned and satisfy Kawasaki but fail Big-Little-Big. The
   * lemma presumes a Kawasaki vertex, so other vertices are not tested.
   */
  readonly bigLittleBig: readonly number[];
  /**
   * Vertices on the edge of the sheet where a run of small sectors is bounded by creases that are
   * all mountains or all valleys. A run with an unassigned crease is left out: nothing is known.
   */
  readonly borderBigLittleBig: readonly number[];
  /**
   * Interior vertices that are fully assigned and pass Kawasaki, Maekawa and Big-Little-Big but
   * still cannot fold flat, which only Hull's single-vertex reduction catches (degree 6 and up).
   */
  readonly singleVertex: readonly number[];
};

/**
 * Checks the Kawasaki, Maekawa and Big-Little-Big conditions at every interior vertex, then Hull's
 * single-vertex test on those that pass all three, and Big-Little-Big alone at every vertex on the
 * edge of the sheet.
 *
 * Flat ("F") creases are ignored: they do not fold, so they divide no sector. Kawasaki is
 * geometric and treats "U" like any other crease. Maekawa needs M/V, so a vertex with a "U"
 * crease is listed under `unassigned` and left out of `maekawa` and `bigLittleBig`. All three
 * conditions are necessary, not sufficient, for flat-foldability.
 *
 * @throws RangeError as {@link kawasakiFlat} does
 */
export function checkLocalFlatFoldability(cp: CreasePattern): LocalFlatFoldabilityReport {
  const kawasaki: number[] = [];
  const maekawa: number[] = [];
  const unassigned: number[] = [];
  const bigLittleBig: number[] = [];
  const singleVertex: number[] = [];
  const borderBigLittleBig = new Set<number>();
  for (const { vertex, edges } of borderRuns(cp)) {
    const marks = edges.map((e) => cp.edges[e]!.assignment);
    if (marks.every((a) => (a === "M" || a === "V") && a === marks[0])) {
      borderBigLittleBig.add(vertex);
    }
  }
  for (const v of interiorVertices(cp)) {
    const { edges, directions } = foldingCreases(cp, v);
    const assignments: Assignment[] = edges.map((e) => cp.edges[e]!.assignment);
    // Only "F" creases: nothing folds here, so the vertex is trivially flat.
    if (directions.length === 0) continue;
    const kawasakiOk = kawasakiFlat(directions);
    if (!kawasakiOk) kawasaki.push(v);
    if (assignments.includes("U")) {
      unassigned.push(v);
      continue;
    }
    const folds = assignments as ("M" | "V")[];
    if (!maekawaFlat(folds)) maekawa.push(v);
    if (kawasakiOk && !bigLittleBigFlat(directions, folds)) bigLittleBig.push(v);
    else if (kawasakiOk && maekawaFlat(folds) && !singleVertexFlat(directions, folds)) {
      singleVertex.push(v);
    }
  }
  return {
    kawasaki,
    maekawa,
    unassigned,
    bigLittleBig,
    borderBigLittleBig: [...borderBigLittleBig].sort((a, b) => a - b),
    singleVertex,
  };
}
