/**
 * Abstract group type and finite-group generation.
 *
 * Part of `core/symmetry`, between the affine maps and the p6m orbit tiling of
 * step 2.2. Kept generic over the element type so wallpaper groups and finite
 * point groups share one interface and one set of axiom tests.
 *
 * Reference: Armstrong, "Groups and Symmetry", ch. 1–3.
 */

import { IDENTITY, compose, equals, inverse, type Affine } from "./affine";

/**
 * A group (G, ·): a set with an associative product, an identity and inverses.
 *
 * The axioms are not checked here; they are what the property tests verify
 * for each instance.
 */
export interface Group<T> {
  /** The neutral element e, with e·x = x·e = x. */
  readonly identity: T;
  /** The product x·y. */
  compose(x: T, y: T): T;
  /** The inverse x⁻¹, with x·x⁻¹ = x⁻¹·x = e. */
  inverse(x: T): T;
  /** Element equality (needed because elements are structural values). */
  equals(x: T, y: T): boolean;
}

/** The group of lattice affine maps under composition. */
export const affineGroup: Group<Affine> = {
  identity: IDENTITY,
  compose,
  inverse,
  equals,
};

/**
 * Generates the subgroup ⟨generators⟩ by breadth-first search.
 *
 * Starting from the identity, it repeatedly multiplies known elements by the
 * generators until nothing new appears. For a finite group the generators'
 * inverses are products of the generators (every element has finite order), so
 * multiplying by generators alone reaches the whole subgroup. The group may be
 * infinite (translations), so the search throws once it exceeds `limit`.
 *
 * @param group - the ambient group
 * @param generators - elements that generate the subgroup
 * @param limit - maximum number of elements before giving up
 * @returns the distinct elements, identity first
 */
export function closure<T>(group: Group<T>, generators: readonly T[], limit: number): T[] {
  const elements: T[] = [group.identity];
  // Array iteration visits elements appended during the loop, which is the BFS queue.
  for (const x of elements) {
    for (const g of generators) {
      const next = group.compose(g, x);
      if (!elements.some((e) => group.equals(e, next))) {
        if (elements.length >= limit) {
          throw new RangeError(`Group has more than ${limit} elements (it may be infinite)`);
        }
        elements.push(next);
      }
    }
  }
  return elements;
}
