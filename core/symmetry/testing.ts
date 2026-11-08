/**
 * Shared test helper for `core/symmetry`: group-axiom checking and random p6m elements.
 *
 * Test-only (it imports vitest, so production code must never import it); nothing in the data flow imports it. It lives here so the p6m, orbit and
 * generic-group tests assert the same axioms.
 */

import { expect } from "vitest";
import fc from "fast-check";
import { eis } from "../lattice/eisenstein";
import { IDENTITY, compose, inverse, type Affine } from "./affine";
import type { Group } from "./group";
import type { P6m } from "./p6m";

/** Checks every group axiom exhaustively over a finite set of elements. */
export function expectGroupAxioms<T>(g: Group<T>, elements: readonly T[]): void {
  const has = (x: T) => elements.some((y) => g.equals(x, y));
  expect(has(g.identity)).toBe(true);
  for (const x of elements) {
    expect(g.equals(g.compose(g.identity, x), x)).toBe(true);
    expect(g.equals(g.compose(x, g.identity), x)).toBe(true);
    expect(g.equals(g.compose(x, g.inverse(x)), g.identity)).toBe(true);
    expect(has(g.inverse(x))).toBe(true);
    for (const y of elements) {
      expect(has(g.compose(x, y))).toBe(true);
      for (const z of elements) {
        expect(g.equals(g.compose(g.compose(x, y), z), g.compose(x, g.compose(y, z)))).toBe(true);
      }
    }
  }
}

/** Periods with a mirror-invariant lattice πΛ (conj(π)/π is a unit). */
export const validPeriod = fc.constantFrom(
  eis(1, 0),
  eis(2, 0),
  eis(3, 0),
  eis(1, -1),
  eis(2, 1), // N = 3, ramified: an associate of its own conjugate
  eis(2, -2),
);

/** An element of p6m: a word over the generators (index ≥ count means the inverse). */
export function randomElement(group: P6m, word: readonly number[]): Affine {
  let f = IDENTITY;
  for (const i of word) {
    const g = group.generators[i % group.generators.length]!;
    f = compose(i >= group.generators.length ? inverse(g) : g, f);
  }
  return f;
}

export const wordArb = fc.array(fc.nat({ max: 7 }), { maxLength: 12 });
