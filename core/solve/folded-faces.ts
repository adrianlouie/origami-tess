/**
 * Flat-folded positions of the faces of a fully assigned crease pattern.
 *
 * Sits at the "solve" stage of the data flow (… → pattern → validate → solve → simulate/render), as
 * the first half of layer ordering: before faces can be stacked, each must be placed in the plane.
 * Every face keeps its shape, so its folded position is an isometry of the lattice, computed here
 * exactly as an `Affine` by walking the face adjacency graph and reflecting across each M/V crease.
 *
 * Reference: Demaine & O'Rourke, "Geometric Folding Algorithms", ch. 12 (a flat folded state is
 * one isometry per face, agreeing on shared creases); Bern & Hayes, "The complexity of flat
 * origami" (SODA 1996).
 */

import { conj, eis, mul, norm, sub, ZERO, type Eisenstein } from "../lattice/eisenstein";
import { primitive } from "../lattice/direction";
import { faceAdjacency } from "../pattern/faces";
import type { CreasePattern } from "../pattern/crease-pattern";
import { affine, apply, compose, equals, IDENTITY, type Affine } from "../symmetry/affine";

/**
 * Returns the reflection across the line through `p` with direction `d`.
 *
 * Formula: reflecting across the line {p + t·d} is z ↦ p + (d/d̄)·conj(z − p), because conj(z − p)
 * mirrors across the real axis and multiplying by the unit d/d̄ = d²/N(d) rotates that axis onto
 * the direction of d (N = norm). The map is a lattice map exactly when d²/N(d) is an Eisenstein
 * integer, which for a unit-modulus quotient means d lies on a mirror axis of the lattice
 * (multiples of 30°). Its linear part is the matrix of z ↦ c·z̄ with c = d²/N(d): the images of 1
 * and ω are c and c·ω̄.
 *
 * @param p - a point on the line
 * @param d - the line direction, non-zero
 * @throws RangeError if d is zero or the reflection does not map the lattice to itself
 */
export function creaseReflection(p: Eisenstein, d: Eisenstein): Affine {
  const dir = primitive(d);
  const n = norm(dir);
  if (n === 0) throw new RangeError("A crease needs a non-zero direction");
  const w = mul(dir, dir);
  if (w.a % n !== 0 || w.b % n !== 0) {
    throw new RangeError(
      `Crease direction (${d.a}, ${d.b}) is not a mirror axis of the lattice, so its reflection ` +
        "is not an integer map",
    );
  }
  const c = eis(w.a / n, w.b / n);
  const cOmega = mul(c, conj(eis(0, 1)));
  const linear = affine([c.a, cOmega.a, c.b, cOmega.b], ZERO);
  const fixedShift = apply(linear, p);
  return affine(linear.m, sub(p, fixedShift));
}

/** The outcome of {@link foldFaces}. */
export type FoldedFaces =
  | {
      readonly status: "ok";
      /** `transforms[f]` maps face f from the crease pattern to its flat-folded position. */
      readonly transforms: readonly Affine[];
      /** `flipped[f]` is true when face f lands upside down (its map reverses orientation). */
      readonly flipped: readonly boolean[];
    }
  | {
      readonly status: "inconsistent";
      /** Creases whose two faces are placed differently by two different routes, increasing. */
      readonly edges: readonly number[];
    };

/**
 * Places every face in the flat-folded plane.
 *
 * Within each connected piece of the face adjacency graph the first face stays put (identity) and a
 * breadth-first walk places the rest: across an "M" or "V" crease the neighbour is the face's own
 * map composed with the reflection across the crease, F_b = F_a ∘ ρ_e, since both maps agree on
 * the crease line and b is the mirror image of its folded position; across an "F" crease the paper
 * stays flat, F_b = F_a. A non-tree crease must reproduce the map already assigned; if it does
 * not, the folds around the cycle do not close up, so no flat folding exists (for a single vertex
 * this is exactly the Kawasaki condition: the product of the reflections about it is the identity
 * iff the alternating sector sum is zero).
 *
 * Border ("B") creases separate pieces of paper and are not crossed.
 *
 * @param cp - a pattern with every crease assigned (no "U")
 * @returns the placement, or the creases at which the folds disagree
 * @throws RangeError for a "U" crease between two faces, a face with a hole (a nested component),
 *   a dangling crease, or a crease whose direction is not a lattice mirror axis
 */
export function foldFaces(cp: CreasePattern): FoldedFaces {
  if (cp.holes.some((hs) => hs.length > 0)) {
    throw new RangeError("Faces with holes (nested components) are not supported");
  }
  const adjacent = faceAdjacency(cp);
  const neighbours: { edge: number; other: number }[][] = cp.faces.map(() => []);
  for (const a of adjacent) {
    neighbours[a.left]!.push({ edge: a.edge, other: a.right });
    neighbours[a.right]!.push({ edge: a.edge, other: a.left });
  }

  const placed: (Affine | undefined)[] = cp.faces.map(() => undefined);
  const bad = new Set<number>();
  for (let root = 0; root < cp.faces.length; root++) {
    if (placed[root] !== undefined) continue;
    placed[root] = IDENTITY;
    const queue = [root];
    for (let head = 0; head < queue.length; head++) {
      const a = queue[head]!;
      const fa = placed[a]!;
      for (const { edge, other } of neighbours[a]!) {
        const crease = cp.edges[edge]!;
        if (crease.assignment === "B") continue;
        if (crease.assignment === "U") {
          throw new RangeError(`Crease ${edge} is unassigned; solve M/V before folding`);
        }
        const predicted =
          crease.assignment === "F"
            ? fa
            : compose(
                fa,
                creaseReflection(
                  cp.vertices[crease.v0]!,
                  sub(cp.vertices[crease.v1]!, cp.vertices[crease.v0]!),
                ),
              );
        const known = placed[other];
        if (known === undefined) {
          placed[other] = predicted;
          queue.push(other);
        } else if (!equals(known, predicted)) {
          bad.add(edge);
        }
      }
    }
  }
  if (bad.size > 0) return { status: "inconsistent", edges: [...bad].sort((x, y) => x - y) };
  const transforms = placed as Affine[];
  const flipped = transforms.map((f) => f.m[0] * f.m[3] - f.m[1] * f.m[2] === -1);
  return { status: "ok", transforms: Object.freeze(transforms), flipped: Object.freeze(flipped) };
}
