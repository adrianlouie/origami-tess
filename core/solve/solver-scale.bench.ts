/**
 * Scale benchmark for the exact folding stages: the data behind the Rust→WASM decision (plan step
 * 7.3e). Run with `npm run bench`. It is not part of `npm test`.
 *
 * Each stage is timed on its own so the table shows which one grows: `foldFaces` (placement),
 * `stackingClauses` (pairs and clauses), `layerOrder` (clauses plus DPLL), `solveMv` (local M/V),
 * and `nearFoldability` on the strips with a defect.
 */

import { bench, describe } from "vitest";
import { nearFoldability } from "./near-foldability";
import { foldFaces } from "./folded-faces";
import { layerOrder } from "./layer-order";
import { DEFECT_CASES, SCALE_CASES } from "./scale-cases";
import { solveMv } from "./solver";
import { stackingClauses } from "./stacking";
import { freed } from "./testing";

// Few iterations: the largest inputs take seconds, and the trend matters, not the third digit.
const options = { iterations: 3, warmupIterations: 1, time: 0 } as const;

for (const { name, build } of SCALE_CASES) {
  describe(name, () => {
    const cp = build();
    const folded = foldFaces(cp);
    if (folded.status !== "ok") throw new Error(`${name} does not fold`);
    bench("foldFaces", () => void foldFaces(cp), options);
    bench("stackingClauses", () => void stackingClauses(cp, folded), options);
    bench("layerOrder", () => void layerOrder(cp), options);
    const unassigned = freed(cp);
    bench("solveMv", () => void solveMv(unassigned), options);
  });
}

for (const { name, build } of DEFECT_CASES) {
  describe(name, () => {
    const cp = build();
    bench("layerOrder", () => void layerOrder(cp), options);
    bench("nearFoldability", () => void nearFoldability(cp), options);
  });
}
