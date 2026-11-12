import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { RENDER_TOLERANCE, toCartesian } from "../../app/render/cartesian";
import { conj, eis, mul, neg, rot60, type Eisenstein } from "../lattice/eisenstein";
import { compareAngle, completeDegree4, cross, primitive } from "../lattice/direction";
import { hexDistance, triangularGrid } from "../lattice/grid";
import { creasePattern, fromSegments, type Assignment } from "../pattern/crease-pattern";
import { spokePattern } from "../solve/testing";
import { bigLittleBigFlat, singleVertexFlat } from "./big-little-big";
import { allAssignments, candidates, foldsFlat, POOL, subsets as subsetsOf } from "./testing";
import {
  checkLocalFlatFoldability,
  interiorVertices,
  kawasakiFlat,
  maekawaFlat,
} from "./local-flat-foldability";

/** The six unit lattice directions, counter-clockwise from +x in steps of 60°. */
const UNIT = [eis(1, 0), eis(1, 1), eis(0, 1), eis(-1, 0), eis(-1, -1), eis(0, -1)];

/** Selects lattice directions by multiples of 60°. */
const at60 = (...steps: number[]) => steps.map((k) => UNIT[k]!);

/** Sorts directions counter-clockwise from +x. */
const sortCcw = (ds: readonly Eisenstein[]) => [...ds].sort(compareAngle);

/** A small non-zero direction. */
const arbDirection = fc
  .tuple(fc.integer({ min: -4, max: 4 }), fc.integer({ min: -4, max: 4 }))
  .filter(([a, b]) => a !== 0 || b !== 0)
  .map(([a, b]) => eis(a, b));

/** Distinct small directions (no two on the same ray), counter-clockwise, of a given length. */
const arbRays = (length: number) =>
  fc
    .uniqueArray(arbDirection, {
      minLength: length,
      maxLength: length,
      selector: (d) => {
        const g = gcd(Math.abs(d.a), Math.abs(d.b));
        return `${d.a / g},${d.b / g}`;
      },
    })
    .map(sortCcw);

function gcd(x: number, y: number): number {
  return y === 0 ? x : gcd(y, x % y);
}

/** Float reference: alternating sum of sector angles from atan2, compared with π. */
function kawasakiByAngles(ds: readonly Eisenstein[]): boolean {
  const th = ds.map((d) => {
    const p = toCartesian(d);
    return Math.atan2(p.y, p.x);
  });
  // Shift into [0, 2π) so the list is increasing, as `ds` is sorted counter-clockwise.
  const angles = th.map((t) => (t < 0 ? t + 2 * Math.PI : t));
  let sum = 0;
  for (let i = 0; i < angles.length; i += 2) {
    const next = angles[(i + 1) % angles.length]!;
    sum += next - angles[i]! + (next < angles[i]! ? 2 * Math.PI : 0);
  }
  return Math.abs(sum - Math.PI) < RENDER_TOLERANCE;
}

/**
 * A hexagon of radius 1 around vertex 0: spokes to the rim in directions `spokes` (indices into
 * UNIT) with the given assignments, and a border rim. Vertex 0 is interior; rim vertices are not.
 */
function wheel(spokes: readonly [number, Assignment][]) {
  const vertices = [eis(0, 0), ...UNIT];
  const edges = [
    ...spokes.map(([k, assignment]) => ({ v0: 0, v1: k + 1, assignment })),
    ...UNIT.map((_, k) => ({ v0: k + 1, v1: ((k + 1) % 6) + 1, assignment: "B" as Assignment })),
  ];
  return creasePattern(vertices, edges);
}

describe("kawasakiFlat (Kawasaki–Justin theorem)", () => {
  it("accepts known flat-foldable vertices", () => {
    expect(kawasakiFlat(at60(0, 1, 2, 3, 4, 5))).toBe(true); // degree 6, all 60°
    expect(kawasakiFlat(at60(0, 1, 3, 5))).toBe(true); // sectors 60, 120, 120, 60
    expect(kawasakiFlat(at60(0, 3))).toBe(true); // a straight line
    // 0°, 90°, 180°, 270° with 90° given by (1, 2): not a lattice direction
    expect(kawasakiFlat([eis(1, 0), eis(1, 2), eis(-1, 0), eis(-1, -2)])).toBe(true);
  });

  it("rejects known non-flat-foldable vertices", () => {
    expect(kawasakiFlat(at60(0, 1, 3, 4))).toBe(false); // sectors 60, 120, 60, 120
    expect(kawasakiFlat(at60(0, 1))).toBe(false); // a bend
    expect(kawasakiFlat(at60(0, 2, 4))).toBe(false); // degree 3
    expect(kawasakiFlat(at60(0, 1, 2, 3, 4))).toBe(false); // degree 5
    expect(kawasakiFlat([])).toBe(false);
  });

  it("is invariant under a cyclic shift of the list", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }).chain((n) => arbRays(2 * n)),
        (ds) => {
          for (let s = 1; s < ds.length; s++) {
            expect(kawasakiFlat([...ds.slice(s), ...ds.slice(0, s)])).toBe(kawasakiFlat(ds));
          }
        },
      ),
    );
  });

  it("is invariant under rotation by 60°, reflection and positive scaling", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }).chain((n) => arbRays(2 * n)),
        fc.integer({ min: 1, max: 5 }),
        (ds, k) => {
          const flat = kawasakiFlat(ds);
          expect(kawasakiFlat(ds.map(rot60))).toBe(flat);
          expect(kawasakiFlat(sortCcw(ds.map(conj)))).toBe(flat);
          expect(kawasakiFlat(ds.map((d) => mul(d, eis(k, 0))))).toBe(flat);
        },
      ),
    );
  });

  it("agrees with the alternating angle sum computed in floating point", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }).chain((n) => arbRays(2 * n)),
        (ds) => {
          expect(kawasakiFlat(ds)).toBe(kawasakiByAngles(ds));
        },
      ),
      { numRuns: 500 },
    );
  });

  it("holds for any odd number of lines through the vertex", () => {
    // The 2k sector angles repeat with period k; for odd k the odd-indexed ones cover each
    // residue once, so they sum to the full turn's half, π.
    fc.assert(
      fc.property(
        fc.constantFrom(1, 3, 5).chain((k) => arbRays(k)),
        (lines) => {
          // Lines must be distinct as lines, not only as rays, or two creases would coincide.
          fc.pre(lines.every((d, i) => lines.every((e, j) => i === j || cross(d, e) !== 0)));
          const all = sortCcw([...lines, ...lines.map((d) => mul(d, eis(-1, 0)))]);
          expect(kawasakiFlat(all)).toBe(true);
        },
      ),
    );
  });

  it("fails for every odd degree", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(1, 3, 5, 7).chain((n) => arbRays(n)),
        (ds) => {
          expect(kawasakiFlat(ds)).toBe(false);
        },
      ),
    );
  });
});

describe("maekawaFlat (Maekawa–Justin theorem)", () => {
  it("accepts |M − V| = 2", () => {
    expect(maekawaFlat([..."MMMV"] as ("M" | "V")[])).toBe(true);
    expect(maekawaFlat([..."VVVM"] as ("M" | "V")[])).toBe(true);
    expect(maekawaFlat([..."MMMMVV"] as ("M" | "V")[])).toBe(true);
  });

  it("rejects other counts", () => {
    expect(maekawaFlat([..."MMVV"] as ("M" | "V")[])).toBe(false);
    expect(maekawaFlat([..."MMMM"] as ("M" | "V")[])).toBe(false);
    expect(maekawaFlat([..."MMV"] as ("M" | "V")[])).toBe(false);
    expect(maekawaFlat([])).toBe(false);
  });

  it("is invariant under swapping every M and V, and implies even degree", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom("M", "V"), { maxLength: 12 }), (as) => {
        const flipped = as.map((x) => (x === "M" ? "V" : "M"));
        expect(maekawaFlat(flipped)).toBe(maekawaFlat(as));
        if (maekawaFlat(as)) expect(as.length % 2).toBe(0);
      }),
    );
  });
});

describe("interiorVertices", () => {
  it("selects exactly the grid points whose every sector is a bounded face", () => {
    for (const r of [1, 2, 3]) {
      const grid = triangularGrid(r);
      const cp = fromSegments(grid.vertices, grid.edges);
      const expected = cp.vertices.flatMap((v, i) => (hexDistance(v) < r ? [i] : []));
      expect(interiorVertices(cp)).toEqual(expected);
    }
  });

  it("excludes vertices on a border edge and isolated vertices", () => {
    const cp = wheel(UNIT.map((_, k) => [k, "M"] as [number, Assignment]));
    expect(interiorVertices(cp)).toEqual([0]);
    const isolated = creasePattern([eis(0, 0)], []);
    expect(interiorVertices(isolated)).toEqual([]);
  });
});

describe("checkLocalFlatFoldability", () => {
  it("passes every interior vertex of a triangular grid for Kawasaki", () => {
    const grid = triangularGrid(3);
    const report = checkLocalFlatFoldability(fromSegments(grid.vertices, grid.edges));
    expect(report.kawasaki).toEqual([]);
  });

  it("reports unassigned creases instead of failing Maekawa", () => {
    const grid = triangularGrid(2);
    const cp = fromSegments(grid.vertices, grid.edges);
    const report = checkLocalFlatFoldability(cp);
    expect(report.unassigned).toEqual(interiorVertices(cp));
    expect(report.maekawa).toEqual([]);
  });

  it("accepts a degree-6 vertex assigned MMMMVV", () => {
    const cp = wheel(
      [0, 1, 2, 3, 4, 5].map((k, i) => [k, i < 4 ? "M" : "V"] as [number, Assignment]),
    );
    expect(checkLocalFlatFoldability(cp)).toEqual({
      kawasaki: [],
      maekawa: [],
      unassigned: [],
      bigLittleBig: [],
      borderBigLittleBig: [],
      singleVertex: [],
    });
  });

  it("flags a degree-6 vertex that passes Maekawa and Big-Little-Big but cannot fold (Hull)", () => {
    // Search the 30° spokes for a Kawasaki vertex and an assignment only Hull's reduction rejects.
    let found: { spokes: number[]; assigns: ("M" | "V")[] } | undefined;
    for (const spokes of subsetsOf(12, 6)) {
      const dirs = spokes.map((i) => POOL[i]!);
      if (!kawasakiFlat(dirs)) continue;
      const assigns = allAssignments(6).find(
        (a) => maekawaFlat(a) && bigLittleBigFlat(dirs, a) && !singleVertexFlat(dirs, a),
      );
      if (assigns) {
        found = { spokes, assigns };
        break;
      }
    }
    expect(found).toBeDefined();
    const cp = spokePattern(found!.spokes, found!.assigns);
    const origin = cp.vertices.findIndex((z) => z.a === 0 && z.b === 0);
    expect(checkLocalFlatFoldability(cp)).toEqual({
      kawasaki: [],
      maekawa: [],
      unassigned: [],
      bigLittleBig: [],
      borderBigLittleBig: [],
      singleVertex: [origin],
    });
  });

  it("flags a Maekawa violation: MMMMMV has |M − V| = 4", () => {
    const cp = wheel([0, 1, 2, 3, 4, 5].map((k) => [k, k < 5 ? "M" : "V"] as [number, Assignment]));
    expect(checkLocalFlatFoldability(cp)).toEqual({
      kawasaki: [],
      maekawa: [0],
      unassigned: [],
      bigLittleBig: [],
      borderBigLittleBig: [],
      singleVertex: [],
    });
  });

  it("flags a Kawasaki violation: a missing spoke leaves degree 5", () => {
    const cp = wheel([0, 1, 2, 3, 4].map((k) => [k, k < 3 ? "M" : "V"] as [number, Assignment]));
    expect(checkLocalFlatFoldability(cp).kawasaki).toEqual([0]);
  });

  it("ignores flat (F) creases", () => {
    // Spokes at 0°, 60°, 180°, 300° are flat-foldable; the F spoke at 120° must not count.
    const cp = wheel([
      [0, "M"],
      [1, "M"],
      [2, "F"],
      [3, "M"],
      [5, "V"],
    ]);
    expect(checkLocalFlatFoldability(cp)).toEqual({
      kawasaki: [],
      maekawa: [],
      unassigned: [],
      bigLittleBig: [],
      borderBigLittleBig: [],
      singleVertex: [],
    });
  });

  it("flags a Big-Little-Big violation that passes Kawasaki and Maekawa", () => {
    // Spokes at 0°, 120°, 180°, 240° (sectors 120°, 60°, 60°, 120°) with the lone valley on the
    // 0° spoke, outside the run of two small sectors, so the corner cannot fold flat.
    const cp = wheel([
      [0, "V"],
      [2, "M"],
      [3, "M"],
      [4, "M"],
    ]);
    expect(checkLocalFlatFoldability(cp)).toEqual({
      kawasaki: [],
      maekawa: [],
      unassigned: [],
      bigLittleBig: [0],
      borderBigLittleBig: [],
      singleVertex: [],
    });
  });

  it("works for creases that are not lattice directions", () => {
    const vertices = [eis(0, 0), eis(1, 0), eis(1, 2), eis(-1, 0), eis(-1, -2)];
    const rim: [number, number][] = [
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 1],
    ];
    const edges = [
      { v0: 0, v1: 1, assignment: "M" as Assignment },
      { v0: 0, v1: 2, assignment: "M" as Assignment },
      { v0: 0, v1: 3, assignment: "M" as Assignment },
      { v0: 0, v1: 4, assignment: "V" as Assignment },
      ...rim.map(([v0, v1]) => ({ v0, v1, assignment: "B" as Assignment })),
    ];
    expect(checkLocalFlatFoldability(creasePattern(vertices, edges))).toEqual({
      kawasaki: [],
      maekawa: [],
      unassigned: [],
      bigLittleBig: [],
      borderBigLittleBig: [],
      singleVertex: [],
    });
  });
});

describe("audit regressions (step 3.7)", () => {
  const ring3 = triangularGrid(3).edges.filter(
    (e) => hexDistance(e.from) === 3 && hexDistance(e.to) === 3,
  );
  const m = (from: Eisenstein, to: Eisenstein) => ({ from, to, assignment: "M" as Assignment });

  it("checks the vertices of a component nested inside a face instead of skipping them", () => {
    const triangle = [m(eis(0, 0), eis(1, 0)), m(eis(1, 0), eis(1, 1)), m(eis(1, 1), eis(0, 0))];
    const cp = fromSegments(
      [],
      [...ring3.map((e) => ({ ...e, assignment: "B" as Assignment })), ...triangle],
    );
    // Each corner has degree 2: it is interior, and it cannot fold flat.
    const corners = cp.vertices.flatMap((v, i) => (hexDistance(v) <= 1 ? [i] : []));
    expect(interiorVertices(cp)).toEqual(corners);
    expect(checkLocalFlatFoldability(cp).kawasaki).toEqual(corners);
  });

  it("treats a vertex whose creases are all flat (F) as trivially flat", () => {
    const grid = triangularGrid(2);
    const cp = fromSegments(
      grid.vertices,
      grid.edges.map((e) => ({ ...e, assignment: "F" as Assignment })),
    );
    expect(checkLocalFlatFoldability(cp)).toEqual({
      kawasaki: [],
      maekawa: [],
      unassigned: [],
      bigLittleBig: [],
      borderBigLittleBig: [],
      singleVertex: [],
    });
  });

  it("keeps the Big-Little-Big verdict when directions are scaled by 2²⁶", () => {
    const big = 2 ** 26;
    const ds = [eis(1, 0), eis(1, 1), eis(-1, 0), eis(-1, -1)].map((d) =>
      eis(d.a * big, d.b * big),
    );
    const base = [eis(1, 0), eis(1, 1), eis(-1, 0), eis(-1, -1)];
    for (const a of [
      ["M", "M", "M", "V"],
      ["M", "M", "M", "M"],
      ["V", "M", "V", "V"],
    ] as const) {
      expect(bigLittleBigFlat(ds, a)).toBe(bigLittleBigFlat(base, a));
    }
    expect(kawasakiFlat(ds)).toBe(kawasakiFlat(base));
  });
});

describe("Theorem 9 (Lang, p. 41): half-planes at a flat-foldable degree-4 vertex", () => {
  it("holds a majority crease in every closed half-plane bounded by a lattice line through it", () => {
    let vertices = 0;
    let openFailures = 0;
    for (const { dirs, assigns } of candidates(4)) {
      if (!foldsFlat(dirs, assigns)) continue;
      vertices++;
      // Three of one assignment and one of the other: the majority is the three.
      const majority = assigns.filter((a) => a === "M").length === 3 ? "M" : "V";
      for (const line of POOL) {
        for (const side of [line, neg(line)]) {
          // The creases on the left of the directed line, or on it, are the closed half-plane.
          const closed = dirs.some((r, i) => assigns[i] === majority && cross(side, r) >= 0);
          expect(closed).toBe(true);
          if (!dirs.some((r, i) => assigns[i] === majority && cross(side, r) > 0)) openFailures++;
        }
      }
    }
    expect(vertices).toBeGreaterThan(0);
    // The half-plane must be closed: with the boundary left out a crease on it can be the only
    // majority one (the right vertex M, M, M, V has none in the open lower half-plane).
    expect(openFailures).toBeGreaterThan(0);
  });
});

describe("completeDegree4 builds Kawasaki vertices by construction (Lang §1.4.4)", () => {
  const triples = subsetsOf(POOL.length, 3).map((idx) => idx.map((i) => POOL[i]!));

  it("gives a fourth crease that satisfies Kawasaki for every counter-clockwise triple", () => {
    let completed = 0;
    for (const [d1, d2, d3] of triples) {
      const d4 = completeDegree4(d1!, d2!, d3!);
      if (d4 === null) continue;
      completed++;
      expect(kawasakiFlat([d1!, d2!, d3!, d4])).toBe(true);
    }
    expect(completed).toBeGreaterThan(0);
  });

  it("finds every Kawasaki vertex of degree 4 from the 30° directions, from any three of its rays", () => {
    const vertices = subsetsOf(POOL.length, 4)
      .map((idx) => idx.map((i) => POOL[i]!))
      .filter((dirs) => kawasakiFlat(dirs));
    expect(vertices.length).toBeGreaterThan(0);
    for (const dirs of vertices) {
      for (let omit = 0; omit < 4; omit++) {
        // Rotate so the omitted ray is last, keeping the counter-clockwise order.
        const rotated = [...dirs.slice(omit + 1), ...dirs.slice(0, omit + 1)];
        const [a, b, c, d] = rotated as [Eisenstein, Eisenstein, Eisenstein, Eisenstein];
        expect(completeDegree4(a, b, c)).toEqual(primitive(d));
      }
    }
    // The triples above are sorted by angle, not rotated, so a vertex is reached only from the two
    // triples that omit its first or its last ray (the fourth must lie between the third and the
    // first, going round through 360°), and no other triple completes.
    const completed = triples.filter(([d1, d2, d3]) => completeDegree4(d1!, d2!, d3!) !== null);
    expect(completed).toHaveLength(2 * vertices.length);
  });
});
