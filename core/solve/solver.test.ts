import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { eis, equals, ZERO } from "../lattice/eisenstein";
import { hexagonTwistCreases } from "../gadgets/hexagon-twist";
import { starTwistCreases } from "../gadgets/star-twist";
import { triangleTwistCreases } from "../gadgets/triangle-twist";
import type { Crease } from "../gadgets/crease";
import { fromSegments, type Assignment, type CreasePattern } from "../pattern/crease-pattern";
import { checkLocalFlatFoldability, interiorVertices } from "../validate/local-flat-foldability";
import { localMvClauses, satisfies, type MvFormula } from "./clauses";
import { mvSolutions, solveFormula, solveMv, withMvAssignment } from "./solver";

/** The gadget's creases with the given edge indices overridden; edge i is creases[i]. */
function build(creases: Crease[], override: ReadonlyMap<number, Assignment>): CreasePattern {
  return fromSegments(
    [],
    creases.map((c, i) => ({ ...c, assignment: override.get(i) ?? c.assignment })),
  );
}

/** Every folding (M or V) crease set to "U". */
function stripped(creases: Crease[]): CreasePattern {
  return fromSegments(
    [],
    creases.map((c) =>
      c.assignment === "M" || c.assignment === "V" ? { ...c, assignment: "U" } : c,
    ),
  );
}

/** Variables that occur in some clause: the only ones the solver decides. */
function constrained(formula: MvFormula): number[] {
  const vars = new Set<number>();
  for (const c of formula.clauses) for (const l of c.literals) vars.add(Math.abs(l) - 1);
  return [...vars].sort((a, b) => a - b);
}

/**
 * All satisfying assignments over the constrained variables (others false), by trying every
 * combination of the variables that no unit clause already fixes.
 */
function bruteForce(formula: MvFormula): boolean[][] {
  const vars = constrained(formula);
  const fixed = new Map<number, boolean>();
  for (const c of formula.clauses) {
    if (c.kind === "fixed") fixed.set(c.edge, c.literals[0]! > 0);
  }
  const free = vars.filter((v) => !fixed.has(v));
  const out: boolean[][] = [];
  for (let bits = 0; bits < 2 ** free.length; bits++) {
    const assignment: boolean[] = new Array<boolean>(formula.variableCount).fill(false);
    for (const [v, value] of fixed) assignment[v] = value;
    free.forEach((v, i) => {
      assignment[v] = ((bits >> i) & 1) === 1;
    });
    if (satisfies(formula, assignment)) out.push(assignment);
  }
  return out;
}

const gadgets: { name: string; creases: Crease[] }[] = [
  { name: "hexagon twist", creases: hexagonTwistCreases(2, 5) },
  { name: "triangle twist", creases: triangleTwistCreases(2, 1) },
  { name: "star twist", creases: starTwistCreases(2) },
];

describe.each(gadgets)("$name", ({ creases }) => {
  const folding = creases.flatMap((c, i) =>
    c.assignment === "M" || c.assignment === "V" ? [i] : [],
  );

  it("is completed from all-unassigned to a pattern with Maekawa and Big-Little-Big at every vertex", () => {
    // Property: every solution satisfies Maekawa–Justin (D&O Thm 12.2.4) and Big-Little-Big.
    const cp = stripped(creases);
    const result = solveMv(cp);
    expect(result.status).toBe("sat");
    if (result.status !== "sat") return;
    const solved = withMvAssignment(cp, result.assignment);
    const report = checkLocalFlatFoldability(solved);
    expect(report).toEqual({ kawasaki: [], maekawa: [], unassigned: [], bigLittleBig: [] });
    expect(interiorVertices(solved).length).toBeGreaterThan(0);
  });

  it("keeps the creases that are already M or V when others are left free", () => {
    const free = new Map(folding.slice(0, 6).map((i) => [i, "U" as const]));
    const cp = build(creases, free);
    const result = solveMv(cp);
    expect(result.status).toBe("sat");
    if (result.status !== "sat") return;
    cp.edges.forEach((edge, e) => {
      if (edge.assignment === "M") expect(result.assignment[e]).toBe(true);
      if (edge.assignment === "V") expect(result.assignment[e]).toBe(false);
    });
  });

  it("agrees with brute force on satisfiability when some creases are freed and some flipped", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.nat(folding.length - 1), { maxLength: 10 }),
        fc.uniqueArray(fc.nat(folding.length - 1), { maxLength: 2 }),
        (freed, flipped) => {
          const override = new Map<number, Assignment>();
          for (const k of flipped) {
            const i = folding[k]!;
            override.set(i, creases[i]!.assignment === "M" ? "V" : "M");
          }
          for (const k of freed) override.set(folding[k]!, "U");
          const formula = localMvClauses(build(creases, override));
          const result = solveFormula(formula);
          const expected = bruteForce(formula);
          expect(result.status === "sat").toBe(expected.length > 0);
          if (result.status === "sat") expect(satisfies(formula, result.assignment)).toBe(true);
        },
      ),
      { numRuns: 25 },
    );
  });

  it("enumerates exactly the satisfying assignments, each once", () => {
    const free = new Map(folding.slice(0, 5).map((i) => [i, "U" as const]));
    const formula = localMvClauses(build(creases, free));
    const found = [...mvSolutions(formula)];
    const keys = found.map((a) =>
      constrained(formula)
        .map((v) => (a[v] ? 1 : 0))
        .join(""),
    );
    expect(new Set(keys).size).toBe(found.length);
    for (const a of found) expect(satisfies(formula, a)).toBe(true);
    expect(found).toHaveLength(bruteForce(formula).length);
  });
});

describe("star twist centre", () => {
  it("gets two more of one colour than the other when only its spokes are free", () => {
    // Maekawa at the degree-6 centre allows 2 M / 4 V or 4 M / 2 V; both are valid, so the test
    // checks the theorem rather than a particular side.
    const creases = starTwistCreases(2);
    const spokes = new Map(
      creases.flatMap((c, i) => (equals(c.from, ZERO) ? [[i, "U" as const]] : [])),
    );
    expect(spokes.size).toBe(6);
    const cp = build(creases, spokes);
    const result = solveMv(cp);
    expect(result.status).toBe("sat");
    if (result.status !== "sat") return;
    const solved = withMvAssignment(cp, result.assignment);
    const centre = solved.vertices.findIndex((z) => equals(z, ZERO));
    const marks = solved.rotation[centre]!.map((e) => solved.edges[e]!.assignment);
    const m = marks.filter((a) => a === "M").length;
    expect(Math.abs(m - (marks.length - m))).toBe(2);
  });
});

describe("failures", () => {
  /** A triangle border with a one-crease tree inside: the tree's leaf is an interior vertex. */
  const oddVertex = () =>
    fromSegments(
      [],
      [
        { from: eis(-3, -3), to: eis(3, 0), assignment: "B" },
        { from: eis(3, 0), to: eis(0, 3), assignment: "B" },
        { from: eis(0, 3), to: eis(-3, -3), assignment: "B" },
        { from: eis(0, 0), to: eis(1, 0), assignment: "U" },
      ],
    );

  it("refuses an odd-degree vertex as a Kawasaki failure, since odd degree never satisfies it", () => {
    const cp = oddVertex();
    const result = solveMv(cp);
    expect(result.status).toBe("kawasaki");
    if (result.status === "sat") return;
    const leaf = cp.vertices.findIndex((_, v) => cp.rotation[v]!.length === 1);
    expect(result.vertices).toContain(leaf);
  });

  it("names the vertex of an empty Maekawa clause when the formula has no Kawasaki failure", () => {
    const formula: MvFormula = {
      variableCount: 1,
      kawasaki: [],
      clauses: [
        { kind: "fixed", edge: 0, literals: [1] },
        { kind: "maekawa", vertex: 7, literals: [] },
      ],
    };
    expect(solveFormula(formula)).toEqual({ status: "unsat", vertices: [7] });
  });

  it("follows propagation to the vertex whose fixed creases break Maekawa", () => {
    // Unit x forces y through vertex 2, and vertex 3 (¬x ∨ ¬y) is then falsified.
    const formula: MvFormula = {
      variableCount: 2,
      kawasaki: [],
      clauses: [
        { kind: "fixed", edge: 0, literals: [1] },
        { kind: "maekawa", vertex: 2, literals: [-1, 2] },
        { kind: "maekawa", vertex: 3, literals: [-1, -2] },
      ],
    };
    expect(solveFormula(formula)).toEqual({ status: "unsat", vertices: [2, 3] });
  });

  it("reports no vertices when the contradiction only appears after branching", () => {
    // All four sign combinations of two variables are excluded; no unit clause exists.
    const formula: MvFormula = {
      variableCount: 2,
      kawasaki: [],
      clauses: [
        { kind: "maekawa", vertex: 0, literals: [1, 2] },
        { kind: "maekawa", vertex: 0, literals: [1, -2] },
        { kind: "maekawa", vertex: 0, literals: [-1, 2] },
        { kind: "maekawa", vertex: 0, literals: [-1, -2] },
      ],
    };
    expect(solveFormula(formula)).toEqual({ status: "unsat", vertices: [] });
  });

  it("refuses a vertex that fails Kawasaki before searching", () => {
    // Three creases at one interior vertex, of degree 3 and not Kawasaki.
    const cp = fromSegments(
      [],
      [
        { from: eis(-3, -3), to: eis(3, 0), assignment: "B" },
        { from: eis(3, 0), to: eis(0, 3), assignment: "B" },
        { from: eis(0, 3), to: eis(-3, -3), assignment: "B" },
        { from: eis(0, 0), to: eis(1, 0), assignment: "U" },
        { from: eis(0, 0), to: eis(0, 1), assignment: "U" },
        { from: eis(0, 0), to: eis(-1, -1), assignment: "U" },
      ],
    );
    const result = solveMv(cp);
    expect(result.status).toBe("kawasaki");
  });

  it("is unsatisfiable when every star-twist spoke is fixed to mountain", () => {
    // Six mountains at the centre give #M − #V = 6, violating Maekawa–Justin.
    const creases = starTwistCreases(2);
    const allM = new Map(
      creases.flatMap((c, i) => (equals(c.from, ZERO) ? [[i, "M" as const]] : [])),
    );
    const result = solveMv(build(creases, allM));
    expect(result.status).toBe("unsat");
  });
});

describe("edge cases", () => {
  it("solves a pattern with no interior vertices with every variable false", () => {
    const cp = fromSegments([], [{ from: ZERO, to: eis(1, 0), assignment: "U" }]);
    const result = solveMv(cp);
    expect(result).toEqual({ status: "sat", assignment: [false] });
  });

  it("solves the empty pattern", () => {
    expect(solveMv(fromSegments([], []))).toEqual({ status: "sat", assignment: [] });
  });

  it("withMvAssignment rejects short or contradicting input and leaves its input unchanged", () => {
    const creases = starTwistCreases(2);
    const cp = stripped(creases);
    const before = JSON.stringify(cp.edges);
    expect(() => withMvAssignment(cp, [])).toThrow(RangeError);
    const fixed = fromSegments([], creases);
    const wrong = fixed.edges.map((e) => e.assignment !== "M");
    expect(() => withMvAssignment(fixed, wrong)).toThrow(RangeError);
    expect(JSON.stringify(cp.edges)).toBe(before);
  });

  it("withMvAssignment turns an unconstrained U crease into the assigned side", () => {
    const cp = fromSegments([], [{ from: ZERO, to: eis(1, 0), assignment: "U" }]);
    expect(withMvAssignment(cp, [true]).edges[0]!.assignment).toBe("M");
    expect(withMvAssignment(cp, [false]).edges[0]!.assignment).toBe("V");
  });
});
