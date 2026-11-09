/**
 * Layer-ordering constraints of a flat-folded crease pattern, as Boolean clauses.
 *
 * Sits at the "solve" stage of the data flow (… → pattern → validate → solve → simulate/render),
 * right after `folded-faces.ts` and `overlap.ts`: once every face has a folded position and the
 * overlapping pairs are known, a flat folding exists iff the faces can be stacked so that no sheet
 * of paper passes through another. Each overlapping pair of faces (i < j) gets one variable, true
 * when i lies above j (nearer the viewer, on the side an unflipped face's front looks toward). The
 * formula is CNF in the DIMACS convention of `clauses.ts`, so `solveClauses` in `solver.ts` can
 * search it; step 5.2 does that and turns a model back into an order.
 *
 * The clause families are those of Bern and Hayes, restricted to a crease pattern whose faces are
 * the cells of the subdivision (so a face may be crossed by a crease line of another face):
 *  - crease: the M/V assignment fixes the order of the two faces at a crease;
 *  - taco-taco: two folds on one line, both with paper on the same side, must nest or be disjoint
 *    in the stack, never interleave;
 *  - taco-tortilla: a fold and a flat run on one line: the flat sheet cannot lie between the fold's
 *    two layers;
 *  - tortilla-tortilla: two flat runs on one line keep the order of their continuation across it;
 *  - crossing: a face whose interior contains a crease cannot lie between the crease's two faces;
 *  - transitivity: the pair variables describe a linear order wherever three faces share a point.
 *
 * Reference: Bern & Hayes, "The complexity of flat origami" (SODA 1996); Demaine & O'Rourke,
 * "Geometric Folding Algorithms", ch. 12.
 */

import type { Eisenstein } from "../lattice/eisenstein";
import { faceAdjacency } from "../pattern/faces";
import type { CreasePattern } from "../pattern/crease-pattern";
import { apply, type Affine } from "../symmetry/affine";
import type { Literal } from "./clauses";
import {
  foldedTriangles,
  overlapPairsOf,
  sameDirection,
  segmentCrossesFace,
  segmentsOverlapCollinear,
  trianglesBoxesMeet,
  trianglesShareInterior,
} from "./overlap";

/** Where a clause comes from, so a failure can name the creases and faces behind it. */
export type StackingClauseSource =
  | { readonly kind: "crease"; readonly edge: number }
  | {
      readonly kind: "taco-taco" | "taco-tortilla" | "tortilla-tortilla";
      readonly edges: readonly [number, number];
    }
  | { readonly kind: "crossing"; readonly edge: number; readonly face: number }
  | { readonly kind: "transitivity"; readonly faces: readonly [number, number, number] };

/** A disjunction of literals with its origin. */
export type StackingClause = StackingClauseSource & { readonly literals: readonly Literal[] };

/** The stacking constraints of a folded crease pattern. */
export type StackingFormula = {
  /** One variable per overlapping pair, `pairs.length`. */
  readonly variableCount: number;
  /** Pair k = [i, j] with i < j is variable k + 1; true means face i is above face j. */
  readonly pairs: readonly (readonly [number, number])[];
  readonly clauses: readonly StackingClause[];
};

/** The folded placement of the faces, as returned by `foldFaces` when it succeeds. */
export type Folded = {
  readonly transforms: readonly Affine[];
  readonly flipped: readonly boolean[];
};

/**
 * The literal that says face p lies above face q.
 *
 * @throws RangeError if p and q do not overlap (no variable) or are the same face
 */
export function aboveLiteral(formula: StackingFormula, p: number, q: number): Literal {
  const [i, j] = p < q ? [p, q] : [q, p];
  const k = formula.pairs.findIndex(([a, b]) => a === i && b === j);
  if (p === q || k < 0) throw new RangeError(`Faces ${p} and ${q} have no stacking variable`);
  return p < q ? k + 1 : -(k + 1);
}

/** A crease between two faces, placed in the folded plane. */
type FoldedCrease = {
  readonly edge: number;
  readonly assignment: "M" | "V" | "F";
  /** Left and right face of the directed crease v0 → v1 in the crease pattern. */
  readonly left: number;
  readonly right: number;
  /** The folded segment, from the image of v0 to the image of v1. */
  readonly p: Eisenstein;
  readonly q: Eisenstein;
};

/**
 * Builds the stacking clauses of a folded crease pattern.
 *
 * The side of a face of a crease, as seen along the folded segment, is its CP side (left or right
 * of v0 → v1) turned over if the face lands flipped. A crease with both faces on one side is a
 * taco (every M or V crease), one with faces on opposite sides is a tortilla (every F crease).
 *
 * @param cp - a pattern with every crease assigned M, V, F or B
 * @param folded - the result of `foldFaces`
 * @returns the variables and clauses; satisfiable iff the pattern folds flat in this placement
 * @throws RangeError if a crease is unassigned
 * @throws Error if a clause needs a pair that does not overlap, which would be a geometry bug
 */
export function stackingClauses(cp: CreasePattern, folded: Folded): StackingFormula {
  const triangles = foldedTriangles(cp, folded.transforms);
  const pairs = overlapPairsOf(triangles);
  const variable = new Map<string, number>();
  pairs.forEach(([i, j], k) => variable.set(`${i},${j}`, k + 1));
  const above = (p: number, q: number): Literal => {
    const v = variable.get(p < q ? `${p},${q}` : `${q},${p}`);
    if (v === undefined) throw new Error(`Faces ${p} and ${q} should overlap but do not`);
    return p < q ? v : -v;
  };

  const clauses: StackingClause[] = [];
  const seen = new Set<string>();
  const add = (source: StackingClauseSource, literals: Literal[]): void => {
    const key = `${source.kind}:${[...literals].sort((x, y) => x - y).join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);
    clauses.push({ ...source, literals });
  };
  /** a above x ⇔ b above x, as two clauses. */
  const together = (source: StackingClauseSource, x: number, a: number, b: number): void => {
    add(source, [-above(x, a), above(x, b)]);
    add(source, [above(x, a), -above(x, b)]);
  };

  const creases: FoldedCrease[] = [];
  for (const { edge, left, right } of faceAdjacency(cp)) {
    const e = cp.edges[edge]!;
    if (e.assignment === "B") continue;
    if (e.assignment === "U") throw new RangeError(`Crease ${edge} is unassigned`);
    const v0 = cp.vertices[e.v0]!;
    const v1 = cp.vertices[e.v1]!;
    creases.push({
      edge,
      assignment: e.assignment,
      left,
      right,
      p: apply(folded.transforms[left]!, v0),
      q: apply(folded.transforms[left]!, v1),
    });
  }

  /** +1 when face f of crease c lies left of its folded segment, −1 when right. */
  const side = (c: FoldedCrease, f: number): 1 | -1 =>
    (f === c.left) !== folded.flipped[f]! ? 1 : -1;
  const isTaco = (c: FoldedCrease) => c.assignment !== "F";

  // Crease: valley seen from the front brings the far face toward the viewer, and a face that
  // lands upside down sees it the other way round.
  for (const c of creases) {
    if (!isTaco(c)) continue;
    const rightAbove = (c.assignment === "V") !== folded.flipped[c.left]!;
    add({ kind: "crease", edge: c.edge }, [
      rightAbove ? above(c.right, c.left) : above(c.left, c.right),
    ]);
  }

  // Crossing: a face through whose interior the crease runs is one continuous sheet there, so it
  // is above both of the crease's faces or below both.
  for (const c of creases) {
    triangles.forEach((tris, f) => {
      if (f === c.left || f === c.right) return;
      if (!segmentCrossesFace(c.p, c.q, tris)) return;
      together({ kind: "crossing", edge: c.edge, face: f }, f, c.left, c.right);
    });
  }

  // Pairs of creases on one line.
  for (let i = 0; i < creases.length; i++) {
    for (let j = i + 1; j < creases.length; j++) {
      const c = creases[i]!;
      const d = creases[j]!;
      if (!segmentsOverlapCollinear(c.p, c.q, d.p, d.q)) continue;
      const turn = sameDirection(c.p, c.q, d.p, d.q);
      /** Side of a face of d, measured against the direction of c. */
      const sideD = (f: number) => (side(d, f) * turn) as 1 | -1;
      const edges = [c.edge, d.edge] as const;

      if (isTaco(c) && isTaco(d)) {
        if (side(c, c.left) !== sideD(d.left)) continue; // opposite sides: separate half-planes
        const first: readonly [number, number] = [c.left, c.right];
        const second: readonly [number, number] = [d.left, d.right];
        // Interleaving chains p1 < p2 < p3 < p4, bottom to top, with one fold at p1, p3 and the
        // other at p2, p4. Transitivity makes the three consecutive comparisons exact.
        for (const [x, y] of [
          [first, second],
          [second, first],
        ] as const) {
          for (const [p1, p3] of [x, [x[1], x[0]] as const]) {
            for (const [p2, p4] of [y, [y[1], y[0]] as const]) {
              add({ kind: "taco-taco", edges }, [-above(p2, p1), -above(p3, p2), -above(p4, p3)]);
            }
          }
        }
      } else if (isTaco(c) !== isTaco(d)) {
        const [taco, flat] = isTaco(c) ? [c, d] : [d, c];
        const sideRef = (x: FoldedCrease, f: number) => (x === c ? side(c, f) : sideD(f));
        // The tortilla face on the taco's side must not sit between the taco's two layers.
        const tacoSide = sideRef(taco, taco.left);
        const onTacoSide = [flat.left, flat.right].find((f) => sideRef(flat, f) === tacoSide);
        if (onTacoSide === undefined) throw new Error("Tortilla with both faces on one side");
        together({ kind: "taco-tortilla", edges }, onTacoSide, taco.left, taco.right);
      } else {
        // Two tortillas: pair the faces on the same side; the sheets keep their order across.
        const a = c.left;
        const b = c.right;
        const aSide = side(c, a);
        const [ca, cb] = sideD(d.left) === aSide ? [d.left, d.right] : [d.right, d.left];
        add({ kind: "tortilla-tortilla", edges }, [-above(a, ca), above(b, cb)]);
        add({ kind: "tortilla-tortilla", edges }, [above(a, ca), -above(b, cb)]);
      }
    }
  }

  // Transitivity, where three faces really share a point; three pairwise overlaps in a ring may
  // legally be stacked cyclically.
  const adjacent = new Set(variable.keys());
  const has = (p: number, q: number) => adjacent.has(`${p},${q}`);
  for (const [i, j] of pairs) {
    for (let k = j + 1; k < triangles.length; k++) {
      if (!has(i, k) || !has(j, k)) continue;
      if (!trianglesBoxesMeet(triangles[i]!, triangles[k]!)) continue;
      const common = triangles[i]!.some((s) =>
        triangles[j]!.some((t) => triangles[k]!.some((u) => trianglesShareInterior([s, t, u]))),
      );
      if (!common) continue;
      const source = { kind: "transitivity", faces: [i, j, k] } as const;
      add(source, [-above(i, j), -above(j, k), above(i, k)]);
      add(source, [above(i, j), above(j, k), -above(i, k)]);
    }
  }

  return Object.freeze({
    variableCount: pairs.length,
    pairs: Object.freeze(pairs),
    clauses: Object.freeze(clauses),
  });
}
