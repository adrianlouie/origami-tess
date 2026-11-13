import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { primitive } from "../lattice/direction";
import { add, eis, equals, mul, OMEGA, rot60, sub, type Eisenstein } from "../lattice/eisenstein";
import type { CreasePattern } from "../pattern/crease-pattern";
import { localMvClauses } from "./clauses";
import { layerOrder } from "./layer-order";
import { locallyValidAssignments } from "./local-solutions";
import { canonicalRotation, necklaceCount } from "./necklace";
import { mvSolutions, solveMv, withMvAssignment } from "./solver";
import { freed, rawTriangleTwist } from "./testing";

/**
 * A pleat of a twist is the pair of parallel creases that run between two neighbouring polygon
 * corners; in the book's twists the two creases of a pleat have opposite assignments, so a pleat
 * has two orientations and n pleats give 2ⁿ words, which Lang Eq. 3.1 counts up to rotation.
 * A pleat is named by its two creases: the corner each leaves and its direction.
 */
type Pleat = { first: [Eisenstein, Eisenstein]; second: [Eisenstein, Eisenstein] };

const unit = (k: number, step: (z: Eisenstein) => Eisenstein): Eisenstein => {
  let z = eis(1, 0);
  for (let i = 0; i < k; i++) z = step(z);
  return z;
};

/** The index of the unframed crease that leaves corner `p` along direction `d`. */
function creaseAt(cp: CreasePattern, p: Eisenstein, d: Eisenstein): number {
  const v = cp.vertices.findIndex((q) => equals(q, p));
  const e = cp.edges.findIndex((edge) => {
    if (edge.assignment === "B") return false;
    const other = edge.v0 === v ? edge.v1 : edge.v1 === v ? edge.v0 : -1;
    return other >= 0 && equals(primitive(sub(cp.vertices[other]!, p)), primitive(d));
  });
  if (e < 0) throw new Error(`no crease leaves (${p.a}, ${p.b}) along (${d.a}, ${d.b})`);
  return e;
}

/** Hexagon pleat k: Rₖ₊₁ at corner k + 1 and Xₖ at corner k, both along uᵏ⁺¹ (see the gadget). */
function hexagonPleats(side: number): Pleat[] {
  const u = (k: number) => unit(k, rot60);
  const corner = (k: number) => mul(eis(side, 0), u(k));
  return Array.from({ length: 6 }, (_, k) => ({
    first: [corner(k + 1), u(k + 1)],
    second: [corner(k), u(k + 1)],
  }));
}

/** Triangle pleat k: the ray along ωᵏ at corner k meets the ray along ωʲ·ω̄ that is parallel to it. */
function trianglePleats(side: number): Pleat[] {
  const rho = (z: Eisenstein) => add(mul(OMEGA, z), eis(side, 0));
  const corners = [eis(side, 0)];
  corners.push(rho(corners[0]!));
  corners.push(rho(corners[1]!));
  const w = (k: number) => unit(k, (z) => mul(OMEGA, z));
  const down = eis(-1, -1);
  const pleats: Pleat[] = [];
  for (let k = 0; k < 3; k++) {
    for (let j = 0; j < 3; j++) {
      const back = mul(w(j), down);
      if (equals(primitive(w(k)), primitive(back))) {
        pleats.push({ first: [corners[k]!, w(k)], second: [corners[j]!, back] });
      }
    }
  }
  return pleats;
}

type Tally = {
  /** locally valid assignments of every M/V crease */
  valid: number;
  /** the anto-pleat assignments as words of first-crease bits (2ⁿ distinct words expected) */
  antoWords: Set<string>;
  /** number of anto-pleat assignments */
  anto: number;
  /** rotation class of the anto-pleat word → whether one representative folds flat */
  classes: Map<string, boolean>;
};

/**
 * Sorts the locally valid assignments into pleat words and rotation classes, and runs the layer
 * solver on one assignment of each class. The gadget is symmetric under the rotation that
 * permutes its pleats, so a class folds or fails as a whole.
 */
function tally(cp: CreasePattern, pleats: Pleat[]): Tally {
  const base = freed(cp);
  const result: Tally = { valid: 0, antoWords: new Set(), anto: 0, classes: new Map() };
  const edges = pleats.map((p) => [creaseAt(cp, ...p.first), creaseAt(cp, ...p.second)]) as [
    number,
    number,
  ][];
  for (const a of locallyValidAssignments(cp)) {
    result.valid++;
    if (!edges.every(([x, y]) => a[x] !== a[y])) continue;
    result.anto++;
    const word = edges.map(([x]) => (a[x] ? 1 : 0));
    result.antoWords.add(word.join(""));
    const key = canonicalRotation(word).join("");
    if (!result.classes.has(key)) {
      result.classes.set(key, layerOrder(withMvAssignment(base, a)).status === "ok");
    }
  }
  return result;
}

describe("hexagon twist assignments (α = 60° = αcrit, Lang Eq. 3.1)", () => {
  it.each([
    [1, 2],
    [2, 4],
    [3, 5],
  ])(
    "has all N(6) = 14 pleat-orientation necklaces locally valid, and every one folds (s=%i, R=%i)",
    (s, r) => {
      const t = tally(hexagonTwist(s, r), hexagonPleats(s));
      expect(t.antoWords.size).toBe(2 ** 6);
      expect(t.classes.size).toBe(necklaceCount(6));
      for (const folds of t.classes.values()) expect(folds).toBe(true);
      expect(t.anto).toBe(66);
      expect(t.valid).toBe(730);
    },
  );

  it("gives a solver answer inside the brute-force set (s=1, R=2)", () => {
    const cp = hexagonTwist(1, 2);
    const result = solveMv(freed(cp));
    expect(result.status).toBe("sat");
    if (result.status !== "sat") return;
    const key = (a: readonly boolean[]) => a.map((x) => (x ? 1 : 0)).join("");
    const unframed = (a: readonly boolean[]) =>
      a.map((x, e) => (cp.edges[e]!.assignment === "B" ? false : x));
    expect(
      new Set(locallyValidAssignments(cp).map(key)).has(key(unframed(result.assignment))),
    ).toBe(true);
  });
});

describe("triangle twist assignments (α = 60° > αcrit = 30°, Lang §3.6.1)", () => {
  const sizes = [1, 2, 3].flatMap((m) =>
    [3, 4, 5, 6, 7, 9].map((n) => ({ n, m, folds: n >= 3 * m })),
  );

  it.each(sizes)(
    "has all N(3) = 4 pleat necklaces locally valid, the cyclic two folding only for n ≥ 3m (n=$n, m=$m)",
    ({ n, m, folds }) => {
      const t = tally(rawTriangleTwist(n, m), trianglePleats(n));
      expect(t.antoWords.size).toBe(2 ** 3);
      expect([...t.classes.keys()].sort()).toEqual(["000", "001", "011", "111"]);
      expect(t.classes.size).toBe(necklaceCount(3));
      expect(t.anto).toBe(8);
      expect(t.valid).toBe(26);
      // The not-all-equal words fold at every size: for α > αcrit these are the twists the book
      // allows on paper of any size. The two cyclic words (all pleats alike) need the paper to
      // end early (Lang Fig. 3.43), which is the n ≥ 3m rule.
      for (const key of ["001", "011"]) expect(t.classes.get(key)).toBe(true);
      for (const key of ["000", "111"]) expect(t.classes.get(key)).toBe(folds);
    },
  );

  it("has as many solutions from mvSolutions as the brute-force count over all 2^9 (n=6, m=2)", () => {
    const cp = rawTriangleTwist(6, 2);
    expect(locallyValidAssignments(cp)).toHaveLength(26);
    expect([...mvSolutions(localMvClauses(freed(cp)))]).toHaveLength(26);
  });
});
