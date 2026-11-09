import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { compareAngle } from "../lattice/direction";
import { eis, equals, rot60, ZERO, type Eisenstein } from "../lattice/eisenstein";
import { starTwist, starTwistCreases } from "../gadgets/star-twist";
import { triangleTwist, triangleTwistCreases } from "../gadgets/triangle-twist";
import { hexagonTwist, hexagonTwistCreases } from "../gadgets/hexagon-twist";
import type { Crease } from "../gadgets/crease";
import { fromSegments, type CreasePattern } from "../pattern/crease-pattern";
import { bigLittleBigFlat } from "../validate/big-little-big";
import {
  checkLocalFlatFoldability,
  kawasakiFlat,
  maekawaFlat,
} from "../validate/local-flat-foldability";
import {
  assignmentFromPattern,
  localMvClauses,
  MAX_ENCODED_DEGREE,
  satisfies,
  vertexClauses,
  violatedClauses,
} from "./clauses";

/** Twelve crease directions at multiples of 30°, counter-clockwise from +x. */
const POOL: Eisenstein[] = (() => {
  const dirs: Eisenstein[] = [];
  for (const base of [eis(1, 0), eis(2, 1)]) {
    let z = base;
    for (let k = 0; k < 6; k++) {
      dirs.push(z);
      z = rot60(z);
    }
  }
  return dirs.sort(compareAngle);
})();

/** All k-element subsets of POOL, still in counter-clockwise order. */
function pools(k: number): Eisenstein[][] {
  const out: Eisenstein[][] = [];
  const walk = (start: number, chosen: Eisenstein[]) => {
    if (chosen.length === k) {
      out.push([...chosen]);
      return;
    }
    for (let i = start; i < POOL.length; i++) walk(i + 1, [...chosen, POOL[i]!]);
  };
  walk(0, []);
  return out;
}

const binomial = (n: number, k: number): number => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};

const bitsToMV = (bits: number, n: number): ("M" | "V")[] =>
  Array.from({ length: n }, (_, i) => ((bits >> i) & 1 ? "M" : "V"));
const bitsToBool = (bits: number, n: number): boolean[] =>
  Array.from({ length: n }, (_, i) => ((bits >> i) & 1) === 1);

describe("vertexClauses", () => {
  // Properties: Maekawa–Justin (D&O Thm 12.2.4) and Big-Little-Big (D&O §12.2) at one vertex.
  for (const n of [4, 6]) {
    it(`accepts exactly the assignments with Maekawa and Big-Little-Big at degree ${n}, for every Kawasaki vertex drawn from the 30° directions`, () => {
      const edges = Array.from({ length: n }, (_, i) => i);
      let vertices = 0;
      for (const dirs of pools(n)) {
        if (!kawasakiFlat(dirs)) continue;
        vertices++;
        const clauses = vertexClauses(0, edges, dirs);
        const formula = { variableCount: n, clauses, kawasaki: [] };
        for (let bits = 0; bits < 2 ** n; bits++) {
          const mv = bitsToMV(bits, n);
          expect(satisfies(formula, bitsToBool(bits, n))).toBe(
            maekawaFlat(mv) && bigLittleBigFlat(dirs, mv),
          );
        }
      }
      expect(vertices).toBeGreaterThan(0);
    });
  }

  it("emits only Maekawa clauses at a vertex that fails Kawasaki", () => {
    const dirs = pools(4).find((d) => !kawasakiFlat(d))!;
    expect(dirs).toBeDefined();
    const clauses = vertexClauses(7, [0, 1, 2, 3], dirs);
    expect(clauses.every((c) => c.kind === "maekawa" && c.vertex === 7)).toBe(true);
  });

  it("has 2ⁿ − 2·C(n, n/2 + 1) Maekawa clauses at even degree n", () => {
    for (const n of [2, 4, 6, 8]) {
      const dirs = POOL.slice(0, n);
      const clauses = vertexClauses(0, [...dirs.keys()], dirs).filter((c) => c.kind === "maekawa");
      expect(clauses).toHaveLength(2 ** n - 2 * binomial(n, n / 2 + 1));
    }
  });

  it("makes degree 0 unsatisfiable and degree 2 allow only MM or VV, with no Big-Little-Big", () => {
    expect(vertexClauses(0, [], [])).toEqual([{ kind: "maekawa", vertex: 0, literals: [] }]);
    const dirs = [eis(1, 0), eis(-1, 0)];
    const clauses = vertexClauses(0, [0, 1], dirs);
    expect(clauses.every((c) => c.kind === "maekawa")).toBe(true);
    const formula = { variableCount: 2, clauses, kawasaki: [] };
    expect([0, 1, 2, 3].map((bits) => satisfies(formula, bitsToBool(bits, 2)))).toEqual([
      true,
      false,
      false,
      true,
    ]);
  });

  it("gives the empty clause at odd degree", () => {
    const dirs = [eis(1, 0), eis(0, 1), eis(-1, -1)];
    const clauses = vertexClauses(0, [0, 1, 2], dirs);
    expect(clauses).toEqual([{ kind: "maekawa", vertex: 0, literals: [] }]);
    expect(satisfies({ variableCount: 3, clauses, kawasaki: [] }, [true, true, false])).toBe(false);
  });

  it("rejects degrees above MAX_ENCODED_DEGREE and mismatched lists", () => {
    const n = MAX_ENCODED_DEGREE + 2;
    const dirs = Array.from({ length: n }, () => eis(1, 0));
    expect(() => vertexClauses(0, [...dirs.keys()], dirs)).toThrow(RangeError);
    expect(() => vertexClauses(0, [0, 1], [eis(1, 0)])).toThrow(RangeError);
  });
});

/** The pattern with every M/V crease relabelled "U", keeping "B" and "F" and the edge order. */
function stripped(creases: Crease[]): CreasePattern {
  return fromSegments(
    [],
    creases.map((c) =>
      c.assignment === "M" || c.assignment === "V" ? { ...c, assignment: "U" as const } : c,
    ),
  );
}

/** The pattern relabelled from a Boolean assignment (true = M), "B"/"F" kept. */
function relabelled(creases: Crease[], assignment: boolean[]): CreasePattern {
  return fromSegments(
    [],
    creases.map((c, i) =>
      c.assignment === "M" || c.assignment === "V"
        ? { ...c, assignment: assignment[i] ? ("M" as const) : ("V" as const) }
        : c,
    ),
  );
}

const gadgets: { name: string; creases: Crease[]; cp: CreasePattern }[] = [
  { name: "hexagon twist", creases: hexagonTwistCreases(2, 5), cp: hexagonTwist(2, 5) },
  { name: "triangle twist", creases: triangleTwistCreases(3, 1), cp: triangleTwist(3, 1) },
  { name: "star twist", creases: starTwistCreases(2), cp: starTwist(2) },
];

describe.each(gadgets)("$name", ({ creases, cp }) => {
  const own = assignmentFromPattern(cp);

  it("satisfies its own formula, with the same Kawasaki list as the validator", () => {
    const formula = localMvClauses(cp);
    expect(formula.variableCount).toBe(cp.edges.length);
    expect(violatedClauses(formula, own)).toEqual([]);
    expect(formula.kawasaki).toEqual(checkLocalFlatFoldability(cp).kawasaki);
  });

  it("agrees with checkLocalFlatFoldability on perturbed assignments", () => {
    const formula = localMvClauses(stripped(creases));
    expect(formula.clauses.some((c) => c.kind === "fixed")).toBe(false);
    let accepted = 0;
    let rejected = 0;
    fc.assert(
      fc.property(fc.array(fc.nat(own.length - 1), { maxLength: 4 }), (flips) => {
        const assignment = own.map((x, i) => (flips.includes(i) ? !x : x));
        const report = checkLocalFlatFoldability(relabelled(creases, assignment));
        const valid = report.maekawa.length === 0 && report.bigLittleBig.length === 0;
        expect(satisfies(formula, assignment)).toBe(valid);
        if (valid) accepted++;
        else rejected++;
      }),
    );
    // The check is not vacuous: both outcomes occur.
    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  });

  it("gives one unit clause per M/V crease and none for B, F or U creases", () => {
    const formula = localMvClauses(cp);
    const fixed = formula.clauses.filter((c) => c.kind === "fixed");
    const folding = cp.edges.filter((e) => e.assignment === "M" || e.assignment === "V");
    expect(fixed).toHaveLength(folding.length);
    for (const c of fixed) {
      expect(c.literals).toHaveLength(1);
      const e = (c as { edge: number }).edge;
      expect(c.literals[0]).toBe(cp.edges[e]!.assignment === "M" ? e + 1 : -(e + 1));
    }
    const skipped = new Set(
      cp.edges.flatMap((edge, e) =>
        edge.assignment === "B" || edge.assignment === "F" ? [e] : [],
      ),
    );
    for (const c of formula.clauses) {
      for (const l of c.literals) expect(skipped.has(Math.abs(l) - 1)).toBe(false);
    }
  });
});

describe("negative controls from the gadget tests", () => {
  const swap = (c: Crease): Crease => ({ ...c, assignment: c.assignment === "M" ? "V" : "M" });
  const kinds = (cp: CreasePattern) => {
    const formula = localMvClauses(stripped(cp.edges.map(toCrease(cp))));
    return new Set(violatedClauses(formula, assignmentFromPattern(cp)).map((c) => c.kind));
  };
  const toCrease =
    (cp: CreasePattern) =>
    (e: { v0: number; v1: number; assignment: Crease["assignment"] }): Crease => ({
      from: cp.vertices[e.v0]!,
      to: cp.vertices[e.v1]!,
      assignment: e.assignment,
    });

  it("violates only Big-Little-Big when each triangle-twist ray is swapped", () => {
    const n = 2;
    const p = [ZERO, eis(n, 0), rot60(eis(n, 0))];
    const isCorner = (z: Eisenstein) => p.some((q) => equals(q, z));
    const swapped = triangleTwistCreases(n, 1).map((c) =>
      c.assignment !== "B" && isCorner(c.from) !== isCorner(c.to) ? swap(c) : c,
    );
    expect(kinds(fromSegments([], swapped))).toEqual(new Set(["big-little-big"]));
  });

  it("violates only Big-Little-Big when the star twist's b, e and h creases are swapped", () => {
    const swapped = starTwistCreases(2).map((c, i) =>
      i < 48 && [1, 2, 4].includes(i % 8) ? swap(c) : c,
    );
    expect(kinds(fromSegments([], swapped))).toEqual(new Set(["big-little-big"]));
  });

  it("violates Maekawa when every star-twist spoke is swapped", () => {
    const swapped = starTwistCreases(2).map((c) => (equals(c.from, ZERO) ? swap(c) : c));
    expect(kinds(fromSegments([], swapped))).toContain("maekawa");
  });
});

describe("localMvClauses", () => {
  it("is unsatisfiable by the empty clause at an odd-degree interior vertex", () => {
    // A tree inside a triangle: its leaf is an interior vertex of odd degree.
    const a = eis(0, 0);
    const outer = [eis(-3, -3), eis(3, 0), eis(0, 3)];
    const cp = fromSegments(
      [],
      [
        { from: outer[0]!, to: outer[1]!, assignment: "B" },
        { from: outer[1]!, to: outer[2]!, assignment: "B" },
        { from: outer[2]!, to: outer[0]!, assignment: "B" },
        { from: a, to: eis(1, 0) },
      ],
    );
    const formula = localMvClauses(cp);
    expect(formula.clauses.some((c) => c.literals.length === 0 && c.kind === "maekawa")).toBe(true);
    expect(satisfies(formula, [true, true, true, true])).toBe(false);
  });

  it("rejects an assignment shorter than the variable count and unassigned patterns", () => {
    const cp = stripped(triangleTwistCreases(1, 1));
    expect(() => violatedClauses(localMvClauses(cp), [])).toThrow(RangeError);
    expect(() => assignmentFromPattern(cp)).toThrow(RangeError);
  });
});
