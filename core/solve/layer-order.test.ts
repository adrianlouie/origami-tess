import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { triangleTwist, triangleTwistCreases } from "../gadgets/triangle-twist";
import { fromSegments, type CreasePattern } from "../pattern/crease-pattern";
import { allAssignments, foldsFlat, layerOrderValid, POOL, subsets } from "../validate/testing";
import { kawasakiFlat } from "../validate/local-flat-foldability";
import { localMvClauses } from "./clauses";
import { isAbove, layerOrder, orderFromRelation, stackFaces, type LayerOrder } from "./layer-order";
import { layerOracle, oracleBrokenRules } from "./layer-oracle";
import { mvSolutions, solveClauses, withMvAssignment } from "./solver";
import {
  arrangement,
  foldedOrThrow,
  freed,
  lineSets,
  rawTriangleTwist,
  sectorFaces,
  spokePattern,
} from "./testing";
import { stackingClauses } from "./stacking";

type Ok = Extract<LayerOrder, { status: "ok" }>;

/** The order's own consistency: every overlapping pair is ordered the way `above` says. */
function isLinearExtension(result: Ok): boolean {
  const { order, formula, above } = result;
  if (order === null) return false;
  const position = new Map(order.map((f, i) => [f, i]));
  return (
    new Set(order).size === order.length &&
    formula.pairs.every(([i, j], k) => position.get(i)! < position.get(j)! === above[k])
  );
}

/** Physical rules broken by the order, checked by the float oracle (shares no code with the clauses). */
function broken(cp: CreasePattern, result: Ok): string[] {
  return oracleBrokenRules(cp, result.folded, (p, q) => isAbove(result, p, q)!);
}

describe("layerOrder: acceptance, the hexagon twists fold and the relation is valid", () => {
  it.each([
    ["hexagon twist (1, 2)", hexagonTwist(1, 2)],
    ["hexagon twist (2, 3)", hexagonTwist(2, 3)],
  ])("gives the %s a stacking no sheet crosses a crease in", (_, cp) => {
    const result = layerOrder(cp);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(broken(cp, result)).toEqual([]);
  });

  it.each([
    ["hexagon twist (1, 2)", hexagonTwist(1, 2)],
    ["hexagon twist (2, 3)", hexagonTwist(2, 3)],
  ])("finds that the %s has no global linear order, because its pleats weave", (_, cp) => {
    // Six faces in a ring around the twist each overlap the next and are stacked cyclically. Every
    // clause is necessary and a linear order would satisfy them all with no cycle, so blocking the
    // ring leaves nothing: no stacking of all the faces in one list exists.
    const result = layerOrder(cp);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.order).toBeNull();
    const arcs = result.formula.pairs.map(
      ([i, j], k) => (result.above[k] ? [i, j] : [j, i]) as [number, number],
    );
    const found = orderFromRelation(cp.faces.length, arcs);
    if (!("cycle" in found)) throw new Error("expected a cycle");
    expect([...found.cycle].sort((x, y) => x - y)).toEqual([1, 3, 4, 6, 8, 10]);
  });
});

describe("layerOrder on the triangle twists", () => {
  it.each([
    [3, 1],
    [4, 1],
    [6, 2],
    [9, 3],
  ] as const)(
    "folds the (n=%i, m=%i) twist: satisfiable clauses, cyclic order, oracle agrees",
    (n, m) => {
      const cp = triangleTwist(n, m);
      const folded = foldedOrThrow(cp);
      const formula = stackingClauses(cp, folded);
      expect(
        solveClauses(
          formula.variableCount,
          formula.clauses.map((c) => c.literals),
        ),
      ).not.toBeNull();
      const result = layerOrder(cp);
      if (result.status !== "ok") throw new Error("expected ok");
      expect(result.order).toBeNull();
      expect(broken(cp, result)).toEqual([]);
      const verdict = layerOracle(cp, folded, 60);
      expect(verdict === "foldable" || verdict === "too-big").toBe(true);
    },
  );

  it("has the oracle confirm at least one folding size", () => {
    const cp = triangleTwist(3, 1);
    expect(layerOracle(cp, foldedOrThrow(cp), 60)).toBe("foldable");
  });

  it.each([
    [1, 1],
    [2, 1],
    [1, 3],
    [5, 2],
  ] as const)(
    "finds the (n=%i, m=%i) twist below n >= 3m unfoldable, as the oracle does",
    (n, m) => {
      const cp = rawTriangleTwist(n, m);
      expect(layerOrder(cp).status).toBe("unfoldable");
      expect(layerOracle(cp, foldedOrThrow(cp), 60)).toBe("unfoldable");
    },
  );

  it("folds exactly when n >= 3m, for n <= 12 and m <= 4", () => {
    for (let m = 1; m <= 4; m++) {
      for (let n = 1; n <= 12; n++) {
        const status = layerOrder(fromSegments([], triangleTwistCreases(n, m))).status;
        expect(status === "ok", `n=${n}, m=${m}`).toBe(n >= 3 * m);
      }
    }
  });

  it.each([
    ["triangle twist (1, 1)", rawTriangleTwist(1, 1)],
    ["triangle twist (2, 1)", rawTriangleTwist(2, 1)],
  ])("is ok exactly when the oracle says foldable, over every locally valid %s", (_, shipped) => {
    const base = freed(shipped);
    let ok = 0;
    let unfoldable = 0;
    for (const model of mvSolutions(localMvClauses(base))) {
      const cp = withMvAssignment(base, model);
      const expected = layerOracle(cp, foldedOrThrow(cp), 60) === "foldable";
      const result = layerOrder(cp);
      expect(result.status === "ok").toBe(expected);
      if (result.status === "ok") {
        ok++;
        expect(isLinearExtension(result)).toBe(true);
        expect(broken(cp, result)).toEqual([]);
      } else unfoldable++;
    }
    expect(ok).toBeGreaterThan(0);
    expect(unfoldable).toBeGreaterThan(0);
  });
});

describe("layerOrder on lattice-line arrangements", () => {
  it("returns an order the oracle accepts whenever it says ok", () => {
    let checked = 0;
    for (const size of [2, 3]) {
      for (const lines of lineSets(size)) {
        const free = fromSegments([], arrangement(lines));
        for (const model of mvSolutions(localMvClauses(free))) {
          const cp = withMvAssignment(free, model);
          const folded = foldFaces2(cp);
          if (folded === undefined) break;
          const verdict = layerOracle(cp, folded);
          if (verdict === "too-big") break;
          const result = layerOrder(cp);
          expect(result.status === "ok", `lines ${JSON.stringify(lines)}`).toBe(
            verdict === "foldable",
          );
          if (result.status === "ok") {
            expect(broken(cp, result)).toEqual([]);
            if (result.order !== null) expect(isLinearExtension(result)).toBe(true);
            checked++;
          }
          break; // one assignment per line set keeps the test fast
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

function foldFaces2(cp: CreasePattern) {
  try {
    return foldedOrThrow(cp);
  } catch {
    return undefined;
  }
}

describe("layerOrder at a single vertex, against the 1D brute force", () => {
  it("is ok exactly when foldsFlat is, and the sector ranks pass layerOrderValid", () => {
    let ok = 0;
    let rejected = 0;
    for (const idx of subsets(POOL.length, 4)) {
      const dirs = idx.map((i) => POOL[i]!);
      if (!kawasakiFlat(dirs)) continue;
      for (const assigns of allAssignments(4)) {
        const cp = spokePattern(idx, assigns);
        const result = layerOrder(cp);
        const expected = foldsFlat(dirs, assigns);
        expect(result.status === "ok").toBe(expected);
        if (result.status !== "ok") {
          rejected++;
          continue;
        }
        ok++;
        // Sector j is the face counter-clockwise of spoke j; the oracle wants its layer rank, where a
        // higher rank is nearer the viewer. The order lists the top face first.
        const faces = sectorFaces(cp);
        // If sector 0's face lands upside down its front looks the other way, so "above" reverses.
        const turned = result.folded.flipped[faces[0]!]!;
        const rank = faces.map((f) =>
          turned ? result.order!.indexOf(f) : cp.faces.length - result.order!.indexOf(f),
        );
        // Ranks need only agree in order, so compress them to a permutation.
        const sorted = [...rank].sort((a, b) => a - b);
        expect(
          layerOrderValid(
            dirs,
            assigns,
            rank.map((r) => sorted.indexOf(r)),
          ),
        ).toBe(true);
      }
    }
    expect(ok).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  });
});

describe("the order checker has teeth", () => {
  it("reports a broken crease rule when a pair's order is flipped", () => {
    const cp = hexagonTwist(2, 3);
    const result = layerOrder(cp);
    if (result.status !== "ok") throw new Error("expected ok");
    const [i, j] = result.formula.pairs[0]!;
    const flipped = (p: number, q: number) => {
      const truth = isAbove(result, p, q)!;
      return (p === i && q === j) || (p === j && q === i) ? !truth : truth;
    };
    expect(oracleBrokenRules(cp, result.folded, flipped).length).toBeGreaterThan(0);
  });
});

describe("orderFromRelation", () => {
  it("sorts an acyclic relation top first, smallest face index first among ties", () => {
    // 0 above 2, 1 above 2, 3 free.
    expect(
      orderFromRelation(4, [
        [0, 2],
        [1, 2],
      ]),
    ).toEqual({ order: [0, 1, 2, 3] });
  });

  it("returns a cycle instead of an order when the relation has one", () => {
    const result = orderFromRelation(4, [
      [0, 1],
      [1, 2],
      [2, 0],
      [3, 0],
    ]);
    expect("order" in result).toBe(false);
    if ("cycle" in result) {
      expect([...result.cycle].sort()).toEqual([0, 1, 2]);
    } else throw new Error("expected a cycle");
  });
});

describe("stackFaces", () => {
  const pairs = [
    [0, 1],
    [0, 2],
    [1, 2],
  ] as const;
  const clause = (...literals: number[]) => ({ kind: "crease" as const, edge: 0, literals });

  it("blocks a cyclic first model and finds the acyclic one", () => {
    // Variables: 1 = 0 above 1, 2 = 0 above 2, 3 = 1 above 2. Units force 0 > 1 > 2; the solver
    // tries "false" first for variable 2, which would put 2 above 0 and close the ring.
    const formula = { variableCount: 3, pairs, clauses: [clause(1), clause(3)] };
    expect(stackFaces(3, formula)).toEqual({ above: [true, true, true], order: [0, 1, 2] });
  });

  it("keeps the first model with no order when every model is cyclic", () => {
    // 0 > 1 > 2 > 0 is forced.
    const formula = { variableCount: 3, pairs, clauses: [clause(1), clause(3), clause(-2)] };
    expect(stackFaces(3, formula)).toEqual({ above: [true, false, true], order: null });
  });

  it("returns null when the clauses are unsatisfiable", () => {
    expect(stackFaces(3, { variableCount: 3, pairs, clauses: [clause(1), clause(-1)] })).toBeNull();
  });
});

describe("layerOrder basics", () => {
  it("is deterministic and deeply frozen", () => {
    const cp = hexagonTwist(1, 2);
    const a = layerOrder(cp);
    const b = layerOrder(cp);
    expect(a).toEqual(b);
    if (a.status !== "ok") throw new Error("expected ok");
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.order)).toBe(true);
    expect(Object.isFrozen(a.above)).toBe(true);
  });

  it("isAbove answers undefined for faces that do not overlap, and is antisymmetric otherwise", () => {
    const cp = hexagonTwist(2, 3);
    const result = layerOrder(cp);
    if (result.status !== "ok") throw new Error("expected ok");
    const [i, j] = result.formula.pairs[0]!;
    expect(isAbove(result, i, j)).toBe(!isAbove(result, j, i));
    const overlapping = new Set(result.formula.pairs.map(([a, b]) => `${a},${b}`));
    outer: for (let p = 0; p < cp.faces.length; p++) {
      for (let q = p + 1; q < cp.faces.length; q++) {
        if (!overlapping.has(`${p},${q}`)) {
          expect(isAbove(result, p, q)).toBeUndefined();
          break outer;
        }
      }
    }
  });

  it("throws on an unassigned crease", () => {
    expect(() => layerOrder(freed(hexagonTwist(1, 2)))).toThrow(RangeError);
  });
});

/** Does the arc set contain a directed cycle? Plain DFS with colours, independent of Kahn's sort. */
function hasCycle(n: number, arcs: readonly (readonly [number, number])[]): boolean {
  const colour = new Array<number>(n).fill(0); // 0 new, 1 on the stack, 2 done
  const visit = (u: number): boolean => {
    colour[u] = 1;
    for (const [hi, lo] of arcs) {
      if (hi !== u) continue;
      if (colour[lo] === 1 || (colour[lo] === 0 && visit(lo))) return true;
    }
    colour[u] = 2;
    return false;
  };
  return colour.some((c, u) => c === 0 && visit(u));
}

describe("orderFromRelation: properties", () => {
  const relation = fc.integer({ min: 2, max: 7 }).chain((n) =>
    fc.record({
      n: fc.constant(n),
      arcs: fc.array(
        fc
          .tuple(fc.integer({ min: 0, max: n - 1 }), fc.integer({ min: 0, max: n - 1 }))
          .filter(([a, b]) => a !== b),
        { maxLength: 14 },
      ) as fc.Arbitrary<[number, number][]>,
    }),
  );

  it("returns a linear extension exactly when there is no cycle, else a real cycle of arcs", () => {
    fc.assert(
      fc.property(relation, ({ n, arcs }) => {
        const result = orderFromRelation(n, arcs);
        const has = (a: number, b: number) => arcs.some(([x, y]) => x === a && y === b);
        expect("order" in result).toBe(!hasCycle(n, arcs));
        if ("order" in result) {
          expect([...result.order].sort((x, y) => x - y)).toEqual([...Array(n).keys()]);
          const at = new Map(result.order.map((f, i) => [f, i]));
          for (const [hi, lo] of arcs) expect(at.get(hi)!).toBeLessThan(at.get(lo)!);
        } else {
          const c = result.cycle;
          expect(c.length).toBeGreaterThanOrEqual(2);
          expect(new Set(c).size).toBe(c.length);
          c.forEach((f, k) => expect(has(f, c[(k + 1) % c.length]!)).toBe(true));
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe("stackFaces: against a brute-force search over every model", () => {
  const PAIRS: [number, number][] = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) PAIRS.push([i, j]);
  const clauses = fc.array(
    fc.array(
      fc.tuple(fc.integer({ min: 1, max: 6 }), fc.boolean()).map(([v, neg]) => (neg ? -v : v)),
      { minLength: 1, maxLength: 3 },
    ),
    { maxLength: 8 },
  );

  it("reports null, an acyclic model, or a cyclic one exactly as enumeration says", () => {
    fc.assert(
      fc.property(clauses, (cnf) => {
        const formula = {
          variableCount: 6,
          pairs: PAIRS,
          clauses: cnf.map((literals) => ({ kind: "crease" as const, edge: 0, literals })),
        };
        const models: boolean[][] = [];
        for (let bits = 0; bits < 64; bits++) {
          const m = PAIRS.map((_, k) => ((bits >> k) & 1) === 1);
          if (cnf.every((c) => c.some((l) => m[Math.abs(l) - 1]! === l > 0))) models.push(m);
        }
        const acyclic = (m: boolean[]) =>
          !hasCycle(
            4,
            PAIRS.map(([i, j], k) => (m[k] ? [i, j] : [j, i]) as [number, number]),
          );
        const result = stackFaces(4, formula);
        if (models.length === 0) {
          expect(result).toBeNull();
          return;
        }
        expect(result).not.toBeNull();
        expect(models).toContainEqual(result!.above);
        expect(result!.order !== null).toBe(models.some(acyclic));
        if (result!.order !== null) {
          const at = new Map(result!.order.map((f, i) => [f, i]));
          PAIRS.forEach(([i, j], k) => {
            const [hi, lo] = result!.above[k]! ? [i, j] : [j, i];
            expect(at.get(hi)!).toBeLessThan(at.get(lo)!);
          });
        }
      }),
      { numRuns: 300 },
    );
  });
});
