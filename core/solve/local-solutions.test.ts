import { describe, expect, it } from "vitest";
import { hexagonFrame } from "../gadgets/crease";
import { starTwist } from "../gadgets/star-twist";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { fromSegments } from "../pattern/crease-pattern";
import { localMvClauses, satisfies } from "./clauses";
import { locallyValidAssignments, MAX_BRUTE_FREE } from "./local-solutions";
import { mvSolutions } from "./solver";
import { freed, rawTriangleTwist } from "./testing";

describe("locallyValidAssignments", () => {
  it("finds the same 26 assignments as the DPLL enumeration for the triangle twist (6, 2)", () => {
    const cp = rawTriangleTwist(6, 2);
    const brute = locallyValidAssignments(cp);
    const lazy = [...mvSolutions(localMvClauses(freed(cp)))];
    const key = (a: readonly boolean[]) => a.map((x) => (x ? 1 : 0)).join("");
    expect(brute).toHaveLength(26);
    // The DPLL answers leave a crease it never needs at false, so compare on the free creases.
    const free = cp.edges.flatMap((e, i) => (e.assignment === "B" ? [] : [i]));
    const onFree = (a: readonly boolean[]) => key(free.map((i) => a[i]!));
    expect(new Set(brute.map(onFree))).toEqual(new Set(lazy.map(onFree)));
  });

  it("ignores any M/V already on the creases, so a solved pattern gives the same set", () => {
    expect(locallyValidAssignments(hexagonTwist(1, 2))).toHaveLength(730);
  });

  it("returns every returned assignment satisfying the formula, with non-free creases false", () => {
    const cp = rawTriangleTwist(3, 1);
    const formula = localMvClauses(freed(cp));
    for (const a of locallyValidAssignments(cp)) {
      expect(satisfies(formula, a)).toBe(true);
      cp.edges.forEach((e, i) => {
        if (e.assignment === "B") expect(a[i]).toBe(false);
      });
    }
  });

  it("returns the one empty assignment when no crease is free", () => {
    const cp = fromSegments([], hexagonFrame(1));
    expect(locallyValidAssignments(cp)).toEqual([Array(6).fill(false)]);
  });

  it("throws for more free creases than the brute-force limit", () => {
    expect(MAX_BRUTE_FREE).toBe(20);
    expect(() => locallyValidAssignments(starTwist(1))).toThrow(RangeError);
  });
});
