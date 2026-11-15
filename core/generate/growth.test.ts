import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { toCartesian } from "../simulate/embed";
import { eis, type Eisenstein } from "../lattice/eisenstein";
import { apply, rotation60 } from "../symmetry/affine";
import type { CreasePattern } from "../pattern/crease-pattern";
import { mulberry32 } from "./symmetric-motif";
import { checkLocalFlatFoldability } from "../validate/local-flat-foldability";
import { nearFoldability } from "../solve/near-foldability";
import {
  grow,
  growthBoard,
  growthStep,
  grownPattern,
  isDisk,
  seedBirth,
  type GrowthBoard,
  type GrowthRule,
  type PleatRule,
} from "./growth";
import type { TilingKind } from "./shrink-rotate";

/**
 * Step 8.3 acceptance: every generation of a grown sheet is a topological disk, builds a
 * shrink-rotate pattern, is locally flat-foldable, and the layer solver judges it (docs/PLAN.md
 * 8.3 for the decisions and the sizes).
 */
const CASES: readonly (readonly [TilingKind, number, GrowthRule])[] = [
  ["3^6", 4, { birth: [1] }],
  ["3^6", 4, { birth: [1, 2] }],
  ["6^3", 4, { birth: [1, 2] }],
  ["3.6.3.6", 3, { birth: [1, 2] }],
];
const PLEATS: readonly PleatRule[] = ["outward", "inward", "alternate"];

describe("grown sheets (step 8.3 acceptance)", () => {
  for (const [kind, radius, rule] of CASES) {
    it(`every generation of ${kind} radius ${radius}, birth {${rule.birth.join(",")}} is a disk that folds`, () => {
      const board = growthBoard(kind, radius);
      const result = grow(board, rule, 6);
      expect(result.history.length).toBeGreaterThan(1);
      for (let g = 0; g < result.history.length; g++) {
        const birth = result.birth.map((b) => (b <= g ? b : -1));
        const live = birth.map((b) => b >= 0);
        expect(isDisk(board, live)).toBe(true);
        for (const mirror of [false, true]) {
          for (const pleat of PLEATS) {
            const { cp } = grownPattern(board, birth, pleat, { mirror });
            expect(cp).not.toBeNull();
            expect(checkLocalFlatFoldability(cp!).kawasaki).toEqual([]);
            expect(nearFoldability(cp!).status).toBe("ok");
          }
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Supporting tests.
// ---------------------------------------------------------------------------------------------

const key = (z: { a: number; b: number }) => `${z.a},${z.b}`;

/** Each crease as sorted end points and its assignment, for comparing a pattern with its image. */
function creaseTable(cp: CreasePattern, f: (z: Eisenstein) => Eisenstein): Map<string, string> {
  return new Map(
    cp.edges.map((e) => {
      const ends = [key(f(cp.vertices[e.v0]!)), key(f(cp.vertices[e.v1]!))].sort().join("|");
      return [ends, e.assignment] as const;
    }),
  );
}

/**
 * An independent disk test: the live tiles are connected, the complement (dead tiles and the
 * outside of the window) is connected through shared sides, and no vertex is a pinch, counted by
 * sorting the tiles around the vertex by the float angle of their centroids.
 */
function referenceIsDisk(board: GrowthBoard, live: readonly boolean[]): boolean {
  const n = board.tiles.length;
  const flood = (start: number, ok: (t: number) => boolean): Set<number> => {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length > 0) {
      const t = stack.pop()!;
      for (const u of board.neighbours[t]!) {
        if (ok(u) && !seen.has(u)) {
          seen.add(u);
          stack.push(u);
        }
      }
    }
    return seen;
  };
  const liveIds = live.flatMap((on, t) => (on ? [t] : []));
  if (liveIds.length === 0) return false;
  if (flood(liveIds[0]!, (t) => live[t]!).size !== liveIds.length) return false;

  const sideCount = new Map<string, number>();
  for (const sides of board.tileSides)
    for (const s of sides) sideCount.set(s, (sideCount.get(s) ?? 0) + 1);
  const dead = Array.from({ length: n }, (_, t) => t).filter((t) => !live[t]);
  const touchesOutside = (t: number) => board.tileSides[t]!.some((s) => sideCount.get(s) === 1);
  // The outside is reached by any dead tile with an unshared side; seed the flood from those.
  const reached = new Set<number>();
  for (const t of dead.filter(touchesOutside)) {
    for (const u of flood(t, (x) => !live[x]!)) reached.add(u);
  }
  if (dead.some((t) => !reached.has(t))) return false;

  const centre = (t: number) => {
    const c = board.tiles[t]!;
    const sum = c.reduce((s, z) => ({ x: s.x + toCartesian(z).x, y: s.y + toCartesian(z).y }), {
      x: 0,
      y: 0,
    });
    return { x: sum.x / c.length, y: sum.y / c.length };
  };
  const at = new Map<string, number[]>();
  board.tileVertices.forEach((vs, t) => {
    for (const v of vs) at.set(v, [...(at.get(v) ?? []), t]);
  });
  for (const [v, tiles] of at) {
    const [a, b] = v.split(",").map(Number) as [number, number];
    const p = toCartesian(eis(a, b));
    const ring = tiles
      .map((t) => ({ t, angle: Math.atan2(centre(t).y - p.y, centre(t).x - p.x) }))
      .sort((x, y) => x.angle - y.angle);
    // An arc starts at a live tile whose counter-clockwise predecessor is not a live tile sharing a side.
    const sharesSide = (s: number, t: number) =>
      board.tileSides[s]!.some((x) => board.tileSides[t]!.includes(x) && x.split("|").includes(v));
    let arcs = 0;
    ring.forEach(({ t }, i) => {
      if (!live[t]) return;
      const prev = ring[(i + ring.length - 1) % ring.length]!.t;
      if (ring.length === 1 || prev === t || !live[prev] || !sharesSide(prev, t)) arcs++;
    });
    if (arcs > 1) return false;
  }
  return true;
}

/** Grows a random disk by simple additions (each keeps the region a disk). */
function randomDisk(board: GrowthBoard, rng: () => number, size: number): number[] {
  const birth = board.tiles.map(() => -1);
  birth[Math.floor(rng() * board.tiles.length)] = 0;
  for (let k = 1; k < size; k++) {
    const options = birth.flatMap((b, t) =>
      b < 0 &&
      board.neighbours[t]!.some((u) => birth[u]! >= 0) &&
      isDisk(
        board,
        birth.map((x, u) => x >= 0 || u === t),
      )
        ? [t]
        : [],
    );
    if (options.length === 0) break;
    birth[options[Math.floor(rng() * options.length)]!] = 0;
  }
  return birth;
}

describe("isDisk", () => {
  for (const [kind, radius] of [
    ["3^6", 2],
    ["3.6.3.6", 3],
  ] as const) {
    it(`agrees with an independent connectivity and angle check on random ${kind} subsets`, () => {
      const board = growthBoard(kind, radius);
      fc.assert(
        fc.property(
          fc.double({ min: 0.2, max: 0.9, noNaN: true }),
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
            minLength: board.tiles.length,
            maxLength: board.tiles.length,
          }),
          (density, draws) => {
            const live = draws.map((d) => d < density);
            expect(isDisk(board, live)).toBe(referenceIsDisk(board, live));
          },
        ),
        { numRuns: 400 },
      );
    });
  }

  it("agrees with the independent check on disks with a few arbitrary tiles added (pinches and holes)", () => {
    const board = growthBoard("3^6", 3);
    let rejected = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 3, max: 30 }),
        fc.array(fc.nat({ max: board.tiles.length - 1 }), { minLength: 1, maxLength: 3 }),
        (seed, size, extra) => {
          const live = randomDisk(board, mulberry32(seed), size).map((b) => b >= 0);
          for (const t of extra) live[t] = true;
          const verdict = isDisk(board, live);
          if (!verdict) rejected++;
          expect(verdict).toBe(referenceIsDisk(board, live));
        },
      ),
      { numRuns: 500 },
    );
    expect(rejected).toBeGreaterThan(20);
  });

  it("is true for a random simple growth and finds both kinds of failure", () => {
    const board = growthBoard("3^6", 3);
    const rng = mulberry32(5);
    for (let i = 0; i < 20; i++) {
      const birth = randomDisk(board, rng, 5 + i);
      expect(
        isDisk(
          board,
          birth.map((b) => b >= 0),
        ),
      ).toBe(true);
    }
    // A ring of 12 triangles round the origin hexagon's neighbours leaves a hole when the
    // hexagon is removed: live = every tile within the ring except the six at the origin.
    const seed = seedBirth(board);
    const hex = seed.map((b) => b >= 0);
    const ring = board.tiles.map((_, t) => hex[t] || board.neighbours[t]!.some((u) => hex[u]));
    expect(isDisk(board, ring)).toBe(true);
    expect(
      isDisk(
        board,
        ring.map((on, t) => on && !hex[t]),
      ),
    ).toBe(false);
    // Two tiles that meet only at a vertex are a pinch.
    const t0 = hex.indexOf(true);
    const far = board.tiles.findIndex(
      (_, t) =>
        t !== t0 &&
        !board.neighbours[t0]!.includes(t) &&
        board.tileVertices[t]!.some((v) => board.tileVertices[t0]!.includes(v)),
    );
    expect(far).toBeGreaterThanOrEqual(0);
    expect(
      isDisk(
        board,
        board.tiles.map((_, t) => t === t0 || t === far),
      ),
    ).toBe(false);
    expect(() => isDisk(board, [true])).toThrow(RangeError);
    expect(
      isDisk(
        board,
        board.tiles.map(() => false),
      ),
    ).toBe(false);
  });
});

describe("growthStep", () => {
  it("keeps a disk and only adds tiles, each born with a count in the birth set", () => {
    const board = growthBoard("3^6", 3);
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 2, max: 40 }),
        fc.subarray([1, 2, 3], { minLength: 1 }),
        (seed, size, birthSet) => {
          const birth = randomDisk(board, mulberry32(seed), size);
          const live = birth.map((b) => b >= 0);
          const step = growthStep(board, birth, { birth: birthSet }, 1);
          const next = step.birth.map((b) => b >= 0);
          expect(isDisk(board, next)).toBe(true);
          live.forEach((on, t) => on && expect(next[t]).toBe(true));
          for (const t of step.born) {
            const count = board.neighbours[t]!.filter((u) => live[u]).length;
            expect(birthSet).toContain(count);
            expect(step.birth[t]).toBe(1);
          }
          expect(next.filter(Boolean).length).toBe(live.filter(Boolean).length + step.born.length);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("falls back to safe births when a synchronous step would not be a disk", () => {
    const board = growthBoard("3^6", 3);
    const rule = { birth: [1, 2, 3] };
    let found = 0;
    for (let seed = 1; seed <= 300 && found < 3; seed++) {
      const birth = randomDisk(board, mulberry32(seed), 6 + (seed % 25));
      const live = birth.map((b) => b >= 0);
      const all = live.map(
        (on, t) =>
          on || (!on && rule.birth.includes(board.neighbours[t]!.filter((u) => live[u]).length)),
      );
      if (isDisk(board, all)) continue;
      found++;
      const step = growthStep(board, birth, rule, 1);
      expect(
        isDisk(
          board,
          step.birth.map((b) => b >= 0),
        ),
      ).toBe(true);
      expect(step.born.length).toBeLessThan(
        all.filter(Boolean).length - live.filter(Boolean).length,
      );
    }
    expect(found).toBeGreaterThan(0);
  });

  it("rejects a bad rule or a birth array of the wrong length", () => {
    const board = growthBoard("3^6", 2);
    const birth = seedBirth(board);
    expect(() => growthStep(board, birth, { birth: [] }, 1)).toThrow(RangeError);
    expect(() => growthStep(board, birth, { birth: [0] }, 1)).toThrow(RangeError);
    expect(() => growthStep(board, birth, { birth: [7] }, 1)).toThrow(RangeError);
    expect(() => growthStep(board, birth, { birth: [1.5] }, 1)).toThrow(RangeError);
    expect(() => growthStep(board, [0], { birth: [1] }, 1)).toThrow(RangeError);
  });

  it("rejects a generation number that would record a born tile as dead or as the seed", () => {
    const board = growthBoard("3^6", 2);
    const birth = seedBirth(board);
    for (const g of [0, -1, 1.5, Number.NaN, 2 ** 53]) {
      expect(() => growthStep(board, birth, { birth: [1] }, g)).toThrow(RangeError);
    }
  });
});

describe("grow", () => {
  it("is deterministic, monotone, and records each tile's generation", () => {
    const board = growthBoard("3^6", 4);
    const a = grow(board, { birth: [1, 2] }, 6);
    const b = grow(board, { birth: [1, 2] }, 6);
    expect(a).toEqual(b);
    expect(a.history.reduce((s, n) => s + n, 0)).toBe(a.birth.filter((x) => x >= 0).length);
    a.history.forEach((n, g) => expect(a.birth.filter((x) => x === g).length).toBe(n));
    const shorter = grow(board, { birth: [1, 2] }, 3);
    shorter.birth.forEach((x, t) => x >= 0 && expect(a.birth[t]).toBe(x));
  });

  it("reports why it stopped", () => {
    expect(grow(growthBoard("3^6", 4), { birth: [2] }, 5).status).toBe("stable");
    expect(grow(growthBoard("3^6", 4), { birth: [1] }, 12).status).toBe("stalled");
    expect(grow(growthBoard("3^6", 4), { birth: [1, 2] }, 2).status).toBe("limit");
    const single = grow(growthBoard("6^3", 4), { birth: [1] }, 0);
    expect(single.history).toEqual([1]);
    expect(single.status).toBe("limit");
  });

  it("rejects a bad generation count, a bad rule and a seed that is not a disk", () => {
    const board = growthBoard("3^6", 3);
    expect(() => grow(board, { birth: [1] }, -1)).toThrow(RangeError);
    expect(() => grow(board, { birth: [1] }, 1.5)).toThrow(RangeError);
    expect(() => grow(board, { birth: [] }, 1)).toThrow(RangeError);
    const two = board.tiles.map((_, t) => (t === 0 || t === board.tiles.length - 1 ? 0 : -1));
    expect(() => grow(board, { birth: [1] }, 1, two)).toThrow(RangeError);
    const one = board.tiles.map((_, t) => (t === 0 ? 5 : -1));
    expect(grow(board, { birth: [1] }, 0, one).birth[0]).toBe(0);
  });
});

describe("grown patterns", () => {
  const rotate = (z: Eisenstein) => apply(rotation60(1), z);

  it.each(PLEATS)(
    "3^6 grown under %s: every generation is invariant under a 60 degree turn (both hands)",
    (pleat) => {
      const board = growthBoard("3^6", 4);
      const result = grow(board, { birth: [1, 2] }, 5);
      for (let g = 0; g < result.history.length; g += 2) {
        const birth = result.birth.map((b) => (b <= g ? b : -1));
        for (const mirror of [false, true]) {
          const { cp } = grownPattern(board, birth, pleat, { mirror });
          const here = creaseTable(cp!, (z) => z);
          const turned = creaseTable(cp!, rotate);
          expect(turned).toEqual(here);
        }
      }
    },
  );

  it("inward is outward with every mountain and valley swapped", () => {
    const board = growthBoard("3.6.3.6", 3);
    const result = grow(board, { birth: [1, 2] }, 4);
    const out = grownPattern(board, result.birth, "outward", { mirror: false }).cp!;
    const inn = grownPattern(board, result.birth, "inward", { mirror: false }).cp!;
    out.edges.forEach((e, i) => {
      const other = inn.edges[i]!.assignment;
      if (e.assignment === "M") expect(other).toBe("V");
      else if (e.assignment === "V") expect(other).toBe("M");
      else expect(other).toBe(e.assignment);
    });
  });

  it("the three pleat rules differ once there are several generations", () => {
    const board = growthBoard("3^6", 4);
    const result = grow(board, { birth: [1, 2] }, 6);
    const patterns = PLEATS.map((p) =>
      grownPattern(board, result.birth, p, { mirror: false })
        .cp!.edges.map((e) => e.assignment)
        .join(""),
    );
    expect(new Set(patterns).size).toBe(3);
  });

  it("rejects a birth array of the wrong length", () => {
    expect(() => grownPattern(growthBoard("3^6", 2), [0], "outward", { mirror: false })).toThrow(
      RangeError,
    );
  });
});
