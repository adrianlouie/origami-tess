/**
 * Deterministic size counts behind the scale benchmark (plan step 7.3e).
 *
 * Times belong to `npm run bench`; the counts do not depend on the machine, so they are pinned
 * here. The accordion's overlap count and the cubic growth of its clauses are the reason the
 * stacking stage is the one that grows (see `docs/PLAN.md` 7.3e).
 */

import { describe, expect, it } from "vitest";
import { foldFaces } from "./folded-faces";
import { layerOrder } from "./layer-order";
import { accordionStrip, defectStrip, spiralStrip } from "./scale-cases";
import { stackingClauses } from "./stacking";
import { foldedOrThrow } from "./testing";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { triangleTwist } from "../gadgets/triangle-twist";
import type { CreasePattern } from "../pattern/crease-pattern";

function sizes(cp: CreasePattern) {
  const formula = stackingClauses(cp, foldedOrThrow(cp));
  return { faces: cp.faces.length, pairs: formula.pairs.length, clauses: formula.clauses.length };
}

describe("size of the stacking formula", () => {
  it.each([
    { name: "accordion 10", cp: accordionStrip(10), want: { faces: 10, pairs: 45, clauses: 377 } },
    {
      name: "accordion 20",
      cp: accordionStrip(20),
      want: { faces: 20, pairs: 190, clauses: 2947 },
    },
    {
      name: "accordion 40",
      cp: accordionStrip(40),
      want: { faces: 40, pairs: 780, clauses: 22687 },
    },
    { name: "spiral 10", cp: spiralStrip(10), want: { faces: 10, pairs: 45, clauses: 321 } },
    {
      name: "hexagon (1, 2)",
      cp: hexagonTwist(1, 2),
      want: { faces: 13, pairs: 30, clauses: 138 },
    },
    {
      name: "hexagon (2, 5)",
      cp: hexagonTwist(2, 5),
      want: { faces: 13, pairs: 66, clauses: 522 },
    },
    {
      name: "triangle (6, 2)",
      cp: triangleTwist(6, 2),
      want: { faces: 7, pairs: 15, clauses: 69 },
    },
    { name: "star (2)", cp: starTwist(2), want: { faces: 30, pairs: 435, clauses: 9884 } },
  ])(
    "is $want.faces faces, $want.pairs pairs and $want.clauses clauses for $name",
    ({ cp, want }) => {
      expect(sizes(cp)).toEqual(want);
    },
  );

  it("makes every pair of an accordion overlap, so pairs are k(k − 1)/2", () => {
    // All facets are unit wide and fold onto one interval.
    for (const k of [5, 12, 30]) expect(sizes(accordionStrip(k)).pairs).toBe((k * (k - 1)) / 2);
  });

  it("grows the accordion's clauses about eightfold when the facets double (cubic)", () => {
    // Transitivity has one clause pair per triple of overlapping faces, so clauses ~ k³.
    const ratio = sizes(accordionStrip(40)).clauses / sizes(accordionStrip(20)).clauses;
    expect(ratio).toBeGreaterThan(6);
    expect(ratio).toBeLessThan(9);
  });

  it("folds the benchmark strips and rejects the defect strip", () => {
    expect(layerOrder(accordionStrip(20)).status).toBe("ok");
    expect(layerOrder(spiralStrip(20)).status).toBe("ok");
    expect(layerOrder(defectStrip(10)).status).toBe("unfoldable");
    expect(foldFaces(defectStrip(10)).status).toBe("ok");
  });
});
