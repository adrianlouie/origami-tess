import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { toCartesian } from "../../app/render/cartesian";
import { compareAngle } from "../lattice/direction";
import { eis, rot60, type Eisenstein } from "../lattice/eisenstein";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { bigLittleBigFlat } from "./big-little-big";
import { checkLocalFlatFoldability, kawasakiFlat, maekawaFlat } from "./local-flat-foldability";

type MV = "M" | "V";

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

/** All k-element index subsets of 0..n-1, in increasing order. */
function subsets(n: number, k: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, chosen: number[]) => {
    if (chosen.length === k) {
      out.push([...chosen]);
      return;
    }
    for (let i = start; i < n; i++) walk(i + 1, [...chosen, i]);
  };
  walk(0, []);
  return out;
}

/** All permutations of 0..n-1; the layer ranks of n sectors. */
function permutations(n: number): number[][] {
  const out: number[][] = [];
  const walk = (rest: number[], chosen: number[]) => {
    if (rest.length === 0) out.push(chosen);
    rest.forEach((x, i) => walk([...rest.slice(0, i), ...rest.slice(i + 1)], [...chosen, x]));
  };
  walk(
    Array.from({ length: n }, (_, i) => i),
    [],
  );
  return out;
}

/** All M/V strings of length n with |#M − #V| = 2 (Maekawa). */
function maekawaAssignments(n: number): MV[][] {
  const out: MV[][] = [];
  for (let bits = 0; bits < 2 ** n; bits++) {
    const a = Array.from({ length: n }, (_, i) => ((bits >> i) & 1 ? "M" : "V") as MV);
    if (maekawaFlat(a)) out.push(a);
  }
  return out;
}

const EPS = 1e-9;
const PERMS = new Map<number, number[][]>();

/**
 * Brute-force reference: does this single vertex fold flat, by trying every layer order?
 *
 * Folded positions: crease 0 sits at 0 and each sector turns the next crease by ±its width
 * (alternating, because every fold reflects). A layer order is valid when each crease's two
 * sectors are stacked on the side M/V demands, no sector passes through a crease between its two
 * sheets, and the folds at one position nest rather than interleave (Hull, "Project Origami",
 * ch. 4; Bern & Hayes 1996 for the single-vertex case). Floats are fine here: it is a test oracle.
 */
function foldsFlat(dirs: readonly Eisenstein[], assigns: readonly MV[]): boolean {
  const n = dirs.length;
  if (!PERMS.has(n)) PERMS.set(n, permutations(n));
  const theta = dirs.map((d) => {
    const p = toCartesian(d);
    const t = Math.atan2(p.y, p.x);
    return t < 0 ? t + 2 * Math.PI : t;
  });
  const width = theta.map((t, i) => {
    const next = theta[(i + 1) % n]!;
    return next - t + (next <= t ? 2 * Math.PI : 0);
  });
  const pos: number[] = [0];
  for (let i = 0; i < n - 1; i++) pos.push(pos[i]! + (i % 2 === 0 ? width[i]! : -width[i]!));
  const lo = width.map((w, i) => Math.min(pos[i]!, pos[i]! + (i % 2 === 0 ? w : -w)));
  const hi = width.map((w, i) => Math.max(pos[i]!, pos[i]! + (i % 2 === 0 ? w : -w)));

  return PERMS.get(n)!.some((rank) => {
    const pairLo: number[] = [];
    const pairHi: number[] = [];
    for (let j = 0; j < n; j++) {
      const a = (j + n - 1) % n;
      const above = a % 2 === 0 ? assigns[j] === "V" : assigns[j] === "M";
      if (rank[j]! > rank[a]! !== above) return false;
      pairLo.push(Math.min(rank[a]!, rank[j]!));
      pairHi.push(Math.max(rank[a]!, rank[j]!));
      for (let c = 0; c < n; c++) {
        if (c === a || c === j) continue;
        if (lo[c]! + EPS < pos[j]! && pos[j]! < hi[c]! - EPS) {
          if (rank[c]! > pairLo[j]! && rank[c]! < pairHi[j]!) return false;
        }
      }
    }
    for (let j = 0; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        if (Math.abs(pos[j]! - pos[k]!) > EPS) continue;
        const [a, b, c, d] = [pairLo[j]!, pairHi[j]!, pairLo[k]!, pairHi[k]!];
        if ((a < c && c < b && b < d) || (c < a && a < d && d < b)) return false;
      }
    }
    return true;
  });
}

/** Every Kawasaki vertex of the given degree drawn from POOL, with every Maekawa assignment. */
function candidates(degree: number): { dirs: Eisenstein[]; assigns: MV[] }[] {
  const out: { dirs: Eisenstein[]; assigns: MV[] }[] = [];
  const assignments = maekawaAssignments(degree);
  for (const idx of subsets(POOL.length, degree)) {
    const dirs = idx.map((i) => POOL[i]!);
    if (!kawasakiFlat(dirs)) continue;
    for (const assigns of assignments) out.push({ dirs, assigns });
  }
  return out;
}

describe("bigLittleBigFlat (Big-Little-Big lemma)", () => {
  // Corner of a four-valent triangle twist: X at 0°, edge at 120°, edge at 180°, R at 240°.
  const corner = [eis(1, 0), eis(0, 1), eis(-1, 0), eis(-1, -1)];

  it("accepts a run of two equal small sectors unless its three creases agree", () => {
    // Sectors 120°, 60°, 60°, 120°. The odd crease may be any of the three that bound the run
    // (directions 120°, 180°, 240°); a brute-force fold confirms each of these.
    for (const a of ["MMMV", "MVMM", "MMVM", "VVMV", "VMVV", "VVVM"]) {
      expect(bigLittleBigFlat(corner, [...a] as MV[])).toBe(true);
      expect(foldsFlat(corner, [...a] as MV[])).toBe(true);
    }
  });

  it("rejects the corner when the odd crease lies outside the run", () => {
    // Kawasaki and Maekawa hold for both, yet neither can fold flat.
    expect(kawasakiFlat(corner)).toBe(true);
    for (const a of ["VMMM", "MVVV"]) {
      expect(maekawaFlat([...a] as MV[])).toBe(true);
      expect(bigLittleBigFlat(corner, [...a] as MV[])).toBe(false);
      expect(foldsFlat(corner, [...a] as MV[])).toBe(false);
    }
  });

  it("is vacuous when no sector is strictly smaller than both neighbours", () => {
    const six = [eis(1, 0), eis(1, 1), eis(0, 1), eis(-1, 0), eis(-1, -1), eis(0, -1)];
    expect(bigLittleBigFlat(six, [..."MMMMVV"] as MV[])).toBe(true);
    expect(bigLittleBigFlat([eis(1, 0), eis(-1, 0)], [..."MV"] as MV[])).toBe(true);
  });

  it("rejects mismatched lengths", () => {
    expect(() => bigLittleBigFlat(corner, [..."MMV"] as MV[])).toThrow(RangeError);
  });

  it("is necessary: every vertex that folds flat passes (degrees 4 and 6, exhaustive)", () => {
    let folding = 0;
    let rejected = 0;
    for (const degree of [4, 6]) {
      for (const { dirs, assigns } of candidates(degree)) {
        const flat = foldsFlat(dirs, assigns);
        const blb = bigLittleBigFlat(dirs, assigns);
        if (flat) {
          folding++;
          expect(blb).toBe(true);
        }
        if (!blb) rejected++;
      }
    }
    // Non-vacuous: some vertices fold, and the check rejects some that satisfy Maekawa.
    expect(folding).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  });

  it("is also sufficient at degree 4 (matches the brute-force fold)", () => {
    for (const { dirs, assigns } of candidates(4)) {
      expect(bigLittleBigFlat(dirs, assigns)).toBe(foldsFlat(dirs, assigns));
    }
  });

  it("is invariant under a cyclic shift and under swapping every M and V", () => {
    const all = [...candidates(4), ...candidates(6)];
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: all.length - 1 }),
        fc.integer({ min: 1, max: 5 }),
        (i, s) => {
          const { dirs, assigns } = all[i]!;
          const k = s % dirs.length;
          const shift = <T>(xs: readonly T[]) => [...xs.slice(k), ...xs.slice(0, k)];
          const flipped = assigns.map((x) => (x === "M" ? "V" : "M")) as MV[];
          const base = bigLittleBigFlat(dirs, assigns);
          expect(bigLittleBigFlat(shift(dirs), shift(assigns))).toBe(base);
          expect(bigLittleBigFlat(dirs, flipped)).toBe(base);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("checkLocalFlatFoldability: Big-Little-Big", () => {
  it("passes every hexagon twist corner", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: 5 })
          .chain((s) => fc.integer({ min: s + 1, max: s + 4 }).map((r) => [s, r] as const)),
        ([s, r]) => {
          expect(checkLocalFlatFoldability(hexagonTwist(s, r)).bigLittleBig).toEqual([]);
        },
      ),
    );
  });
});
