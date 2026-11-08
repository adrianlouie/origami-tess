import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { triangularGrid } from "../../core/lattice/grid";
import { RENDER_TOLERANCE } from "./cartesian";
import { eis, ONE, ZERO } from "../../core/lattice/eisenstein";
import { orbit, tile } from "../../core/symmetry/orbit";
import { p6m } from "../../core/symmetry/p6m";
import { validPeriod } from "../../core/symmetry/testing";
import type { Motif } from "../../core/symmetry/motif";
import { gridToSvg, tilingToSvg } from "./svg";

type Line = { x1: number; y1: number; x2: number; y2: number };

/** Pulls every <line> out of the SVG string; the format is ours, so a regex is enough. */
function parseLines(svg: string): Line[] {
  const re = /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g;
  return [...svg.matchAll(re)].map((m) => ({
    x1: Number(m[1]),
    y1: Number(m[2]),
    x2: Number(m[3]),
    y2: Number(m[4]),
  }));
}

function parseViewBox(svg: string): [number, number, number, number] {
  const m = /viewBox="([^"]+)"/.exec(svg);
  if (!m?.[1]) throw new Error("no viewBox");
  const [x, y, w, h] = m[1].split(" ").map(Number);
  return [x!, y!, w!, h!];
}

describe("gridToSvg snapshot (acceptance test for step 1.3)", () => {
  it("renders the R=3 grid to the committed SVG", async () => {
    await expect(gridToSvg(triangularGrid(3))).toMatchFileSnapshot(
      "./__snapshots__/grid-r3.svg",
    );
  });
});

describe("gridToSvg", () => {
  it("draws one line per edge: 9R² + 3R = 90 for R = 3", () => {
    expect(parseLines(gridToSvg(triangularGrid(3)))).toHaveLength(90);
  });

  it("draws every edge with unit length (scale 1, so Eisenstein units have norm 1)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 8 }), (r) => {
        const svg = gridToSvg(triangularGrid(r), { scale: 1 });
        for (const l of parseLines(svg)) {
          expect(Math.abs(Math.hypot(l.x2 - l.x1, l.y2 - l.y1) - 1)).toBeLessThan(
            RENDER_TOLERANCE,
          );
        }
      }),
    );
  });

  it("keeps every endpoint inside the viewBox", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 8 }), (r) => {
        const svg = gridToSvg(triangularGrid(r));
        const [x, y, w, h] = parseViewBox(svg);
        for (const l of parseLines(svg)) {
          for (const [px, py] of [
            [l.x1, l.y1],
            [l.x2, l.y2],
          ] as const) {
            expect(px).toBeGreaterThanOrEqual(x);
            expect(px).toBeLessThanOrEqual(x + w);
            expect(py).toBeGreaterThanOrEqual(y);
            expect(py).toBeLessThanOrEqual(y + h);
          }
        }
      }),
    );
  });

  it("is deterministic", () => {
    const grid = triangularGrid(4);
    expect(gridToSvg(grid)).toBe(gridToSvg(grid));
  });
});

type Circle = { cx: number; cy: number };

function parseCircles(svg: string): Circle[] {
  const re = /<circle cx="([^"]+)" cy="([^"]+)"/g;
  return [...svg.matchAll(re)].map((m) => ({ cx: Number(m[1]), cy: Number(m[2]) }));
}

/** A generic point (off every mirror of D6) and one edge from the origin to 1. */
const motif: Motif = {
  points: [eis(3, 1)],
  edges: [{ from: ZERO, to: ONE }],
};

describe("tilingToSvg snapshot (acceptance test for step 2.3)", () => {
  it("renders the p6m(2+ω) tiling at R=3 to the committed SVG", async () => {
    await expect(tilingToSvg(tile(p6m(eis(2, 1)), motif, 3))).toMatchFileSnapshot(
      "./__snapshots__/tiling-p6m-r3.svg",
    );
  });
});

describe("tilingToSvg", () => {
  it("draws one circle per orbit point and one line per tiled edge", () => {
    fc.assert(
      fc.property(validPeriod, fc.integer({ min: 0, max: 6 }), (period, r) => {
        const group = p6m(period);
        const tiling = tile(group, motif, r);
        const svg = tilingToSvg(tiling);
        expect(parseCircles(svg)).toHaveLength(orbit(group, motif.points, r).length);
        expect(parseLines(svg)).toHaveLength(tiling.edges.length);
      }),
    );
  });

  it("keeps every line endpoint and circle centre inside the viewBox", () => {
    fc.assert(
      fc.property(validPeriod, fc.integer({ min: 0, max: 6 }), (period, r) => {
        const svg = tilingToSvg(tile(p6m(period), motif, r));
        const [x, y, w, h] = parseViewBox(svg);
        const inside = (px: number, py: number) => {
          expect(px).toBeGreaterThanOrEqual(x);
          expect(px).toBeLessThanOrEqual(x + w);
          expect(py).toBeGreaterThanOrEqual(y);
          expect(py).toBeLessThanOrEqual(y + h);
        };
        for (const l of parseLines(svg)) {
          inside(l.x1, l.y1);
          inside(l.x2, l.y2);
        }
        for (const c of parseCircles(svg)) inside(c.cx, c.cy);
      }),
    );
  });

  it("preserves edge length: every tiled line is as long as the motif edge (D6 and translations are isometries)", () => {
    fc.assert(
      fc.property(validPeriod, fc.integer({ min: 1, max: 6 }), (period, r) => {
        const svg = tilingToSvg(tile(p6m(period), motif, r), { scale: 1 });
        for (const l of parseLines(svg)) {
          expect(Math.abs(Math.hypot(l.x2 - l.x1, l.y2 - l.y1) - 1)).toBeLessThan(
            RENDER_TOLERANCE,
          );
        }
      }),
    );
  });
});
