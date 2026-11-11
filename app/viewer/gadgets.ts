/**
 * The shipped gadget variants the viewer can show.
 *
 * Sits at the start of the viewer, feeding `core/` patterns to `scene.ts`. Built lazily, because a
 * star twist takes a moment to construct and the page only needs the one selected.
 */

import { hexagonTwist } from "../../core/gadgets/hexagon-twist";
import { starTwist } from "../../core/gadgets/star-twist";
import { triangleTwist } from "../../core/gadgets/triangle-twist";
import type { CreasePattern } from "../../core/pattern/crease-pattern";

/** A named gadget variant and a function that builds its crease pattern. */
export type GadgetEntry = { readonly name: string; readonly build: () => CreasePattern };

/** Every gadget variant that folds flat or partly, with the sizes the tests use. */
export const GADGET_ENTRIES: readonly GadgetEntry[] = [
  { name: "Hexagon twist (1, 2)", build: () => hexagonTwist(1, 2) },
  { name: "Hexagon twist (2, 3)", build: () => hexagonTwist(2, 3) },
  { name: "Triangle twist (3, 1)", build: () => triangleTwist(3, 1) },
  { name: "Triangle twist (4, 1)", build: () => triangleTwist(4, 1) },
  { name: "Triangle twist (6, 2)", build: () => triangleTwist(6, 2) },
  { name: "Star twist, full", build: () => starTwist(1, "full") },
  { name: "Star twist, partial", build: () => starTwist(1, "partial") },
];
