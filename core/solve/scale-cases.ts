/**
 * Inputs of growing size for the solver scale benchmark (test support, not shipped).
 *
 * Sits beside the layer solver and is shared by `solver-scale.bench.ts`, which times the stages,
 * and `solver-scale.test.ts`, which pins the deterministic counts. A Miura-ori needs a square
 * lattice (plan step B.0), so the inputs are strips and the shipped gadgets instead. The gadgets
 * grow in size, not in facets (13, 7 and 30 faces whatever the size), so only the strips show how
 * the cost grows with the facet count.
 */

import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { triangleTwist } from "../gadgets/triangle-twist";
import type { CreasePattern } from "../pattern/crease-pattern";
import { parallelStrip } from "./testing";

/** One benchmark input: a name for the report and a pattern builder. */
export type ScaleCase = { readonly name: string; readonly build: () => CreasePattern };

/** A strip of `k` unit facets with alternating creases (an accordion), which always folds. */
export function accordionStrip(k: number): CreasePattern {
  return parallelStrip(
    Array.from({ length: k }, () => 1),
    Array.from({ length: k - 1 }, (_, i) => (i % 2 === 0 ? "V" : "M")),
  );
}

/** A spiral of `k` facets of widths k, k − 1, … 1 with every crease valley; it folds. */
export function spiralStrip(k: number): CreasePattern {
  return parallelStrip(
    Array.from({ length: k }, (_, i) => k - i),
    Array.from({ length: k - 1 }, () => "V"),
  );
}

/**
 * An accordion of `k ≥ 4` facets with one defect: facets 1 and 3 are three wide round a unit facet
 * 2, and both creases at that facet are valleys. That is the unfoldable strip of thirds
 * (widths 3, 1, 3, Lang Fig. 1.5) inside a long strip, so the stacking has exactly one small
 * conflict for `nearFoldability` to find.
 */
export function defectStrip(k: number): CreasePattern {
  const widths = Array.from({ length: k }, () => 1);
  widths[1] = 3;
  widths[3] = 3;
  const creases = Array.from({ length: k - 1 }, (_, i) => (i % 2 === 0 ? "V" : "M") as "M" | "V");
  creases[1] = "V";
  creases[2] = "V";
  return parallelStrip(widths, creases);
}

/** Folding inputs, smallest first within each family. */
export const SCALE_CASES: readonly ScaleCase[] = [
  ...[10, 20, 40, 80, 160].map((k) => ({
    name: `accordion strip, ${k} facets`,
    build: () => accordionStrip(k),
  })),
  ...[10, 20, 40].map((k) => ({
    name: `spiral strip, ${k} facets`,
    build: () => spiralStrip(k),
  })),
  { name: "hexagon twist (1, 2)", build: () => hexagonTwist(1, 2) },
  { name: "hexagon twist (2, 5)", build: () => hexagonTwist(2, 5) },
  { name: "triangle twist (6, 2)", build: () => triangleTwist(6, 2) },
  { name: "star twist (2)", build: () => starTwist(2) },
];

/** Strips that do not fold, for `nearFoldability`. */
export const DEFECT_CASES: readonly ScaleCase[] = [10, 20, 40].map((k) => ({
  name: `defect strip, ${k} facets`,
  build: () => defectStrip(k),
}));
