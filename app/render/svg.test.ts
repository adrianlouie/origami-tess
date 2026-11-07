import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { triangularGrid } from "../../core/lattice/grid";
import { RENDER_TOLERANCE } from "./cartesian";
import { gridToSvg } from "./svg";

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
