import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../../core/gadgets/hexagon-twist";
import { starTwist } from "../../core/gadgets/star-twist";
import { triangleTwist } from "../../core/gadgets/triangle-twist";
import type { CreasePattern } from "../../core/pattern/crease-pattern";
import { layeredView, topFaceAt, type LayeredView } from "../../core/solve/layered-view";
import { RENDER_TOLERANCE } from "./cartesian";
import { foldedToSvg } from "./folded-svg";
import { toPixels } from "./svg";

const SCALE = 100;

type Pt = { x: number; y: number };

function viewOf(cp: CreasePattern): LayeredView {
  const v = layeredView(cp);
  if (v.status === "inconsistent") throw new Error("pattern does not fold consistently");
  return v;
}

function parsePoints(attr: string): Pt[] {
  return attr.split(" ").map((s) => {
    const [x, y] = s.split(",").map(Number);
    return { x: x!, y: y! };
  });
}

/** Face polygons, and for each face the polygons that mask it, parsed back out of the SVG. */
function parse(svg: string) {
  const faces = new Map<number, Pt[]>();
  for (const m of svg.matchAll(/<polygon data-face="(\d+)" points="([^"]+)"/g)) {
    faces.set(Number(m[1]), parsePoints(m[2]!));
  }
  const masks = new Map<number, Pt[][]>();
  for (const m of svg.matchAll(/<mask id="above-(\d+)">([\s\S]*?)<\/mask>/g)) {
    const polys = [...m[2]!.matchAll(/<polygon data-above="\d+" points="([^"]+)"/g)].map((p) =>
      parsePoints(p[1]!),
    );
    masks.set(Number(m[1]), polys);
  }
  return { faces, masks };
}

/** Even-odd ray cast: a float point-in-polygon test, independent of the exact one in core. */
function inside(poly: readonly Pt[], p: Pt): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Distance from p to the nearest edge of the polygon. */
function edgeDistance(poly: readonly Pt[], p: Pt): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/** Sample points as in the core test: centroid of each triangle and of its three corner pieces. */
function samples(view: LayeredView) {
  const out: { a: number; b: number; d: number }[] = [];
  for (const tris of view.triangles) {
    for (const [p, q, r] of tris) {
      const g = { a: p.a + q.a + r.a, b: p.b + q.b + r.b };
      out.push({ a: 3 * g.a, b: 3 * g.b, d: 9 });
      for (const [u, w] of [
        [p, q],
        [q, r],
        [r, p],
      ] as const) {
        out.push({ a: g.a + 3 * u.a + 3 * w.a, b: g.b + 3 * u.b + 3 * w.b, d: 9 });
      }
    }
  }
  return out;
}

/**
 * Counts sample points where the face left visible by the SVG masks differs from `topFaceAt` of
 * `view`. Points within a pixel-thousandth of any outline are skipped: a float test cannot say
 * which side of an edge they are on. Returns [checked, mismatches].
 */
function agreement(svg: string, view: LayeredView): [number, number] {
  const { faces, masks } = parse(svg);
  let checked = 0;
  let bad = 0;
  for (const s of samples(view)) {
    const p = toPixels({ a: s.a / s.d, b: s.b / s.d }, SCALE);
    const everyPoly = [...faces.values(), ...[...masks.values()].flat()];
    if (everyPoly.some((poly) => edgeDistance(poly, p) < 1e-3)) continue;
    const visible = [...faces]
      .filter(([f, poly]) => inside(poly, p) && !(masks.get(f) ?? []).some((m) => inside(m, p)))
      .map(([f]) => f);
    let top: number | null;
    try {
      top = topFaceAt(view, s);
    } catch {
      bad++;
      checked++;
      continue;
    }
    checked++;
    if (visible.length !== (top === null ? 0 : 1) || (top !== null && visible[0] !== top)) bad++;
  }
  return [checked, bad];
}

const cases: [string, CreasePattern][] = [
  ["hexagonTwist(1, 2)", hexagonTwist(1, 2)],
  ["hexagonTwist(2, 3)", hexagonTwist(2, 3)],
  ["triangleTwist(3, 1)", triangleTwist(3, 1)],
  ["starTwist full", starTwist(1, "full")],
  ["starTwist partial", starTwist(1, "partial")],
];

describe("foldedToSvg: the masked drawing shows the face that topFaceAt names", () => {
  for (const [name, cp] of cases) {
    it(`${name}: exactly the top face is unmasked at every sample point`, () => {
      const view = viewOf(cp);
      const [checked, bad] = agreement(foldedToSvg(cp, view, { scale: SCALE }), view);
      expect(checked).toBeGreaterThan(samples(view).length / 2);
      expect(bad).toBe(0);
    });
  }

  it("is sensitive: flipping one above bit is caught", () => {
    const cp = hexagonTwist(1, 2);
    const view = viewOf(cp);
    const svg = foldedToSvg(cp, view, { scale: SCALE });
    let caught = 0;
    for (let k = 0; k < view.above.length; k++) {
      const above = view.above.map((x, i) => (i === k ? !x : x));
      if (agreement(svg, { ...view, above })[1] > 0) caught++;
    }
    expect(caught).toBeGreaterThan(0);
  });
});

describe("foldedToSvg: conflict marking", () => {
  const cp = starTwist(1, "partial");
  const view = viewOf(cp);
  const svg = foldedToSvg(cp, view);

  it("hatches the four dropped faces and draws no face for them", () => {
    const hatched = [...svg.matchAll(/data-dropped="(\d+)"/g)].map((m) => Number(m[1]));
    expect(hatched).toEqual([3, 4, 10, 20]);
    const { faces } = parse(svg);
    for (const f of hatched) expect(faces.has(f)).toBe(false);
    expect(faces.size).toBe(cp.faces.length - 4);
  });

  it("draws one red line per conflict crease", () => {
    const edges = [...svg.matchAll(/data-edge="(\d+)"/g)].map((m) => Number(m[1]));
    expect(edges).toEqual([...view.conflictCreases]);
    expect(edges.length).toBeGreaterThan(0);
  });

  it("a foldable pattern has no hatch or conflict lines", () => {
    const ok = foldedToSvg(hexagonTwist(1, 2), viewOf(hexagonTwist(1, 2)));
    expect(ok).not.toMatch(/data-dropped|data-edge/);
  });
});

describe("foldedToSvg: colours, validation and format", () => {
  const cp = hexagonTwist(1, 2);
  const view = viewOf(cp);

  it("fills flipped faces with the back colour and the rest with the front colour", () => {
    const svg = foldedToSvg(cp, view, { frontFill: "#111111", backFill: "#222222" });
    for (const m of svg.matchAll(/data-face="(\d+)"[^>]*fill="([^"]+)"/g)) {
      expect(m[2]).toBe(view.folded.flipped[Number(m[1])] ? "#222222" : "#111111");
    }
    expect(svg).toContain("#111111");
    expect(svg).toContain("#222222");
  });

  it("keeps every polygon inside the viewBox", () => {
    const svg = foldedToSvg(cp, view);
    const [x, y, w, h] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [
      number,
      number,
      number,
      number,
    ];
    for (const poly of parse(svg).faces.values()) {
      for (const p of poly) {
        expect(p.x).toBeGreaterThanOrEqual(x - RENDER_TOLERANCE);
        expect(p.x).toBeLessThanOrEqual(x + w + RENDER_TOLERANCE);
        expect(p.y).toBeGreaterThanOrEqual(y - RENDER_TOLERANCE);
        expect(p.y).toBeLessThanOrEqual(y + h + RENDER_TOLERANCE);
      }
    }
  });

  it("rejects bad sizes, unsafe colours and a view of another pattern", () => {
    expect(() => foldedToSvg(cp, view, { scale: 0 })).toThrow(RangeError);
    expect(() => foldedToSvg(cp, view, { margin: -1 })).toThrow(RangeError);
    expect(() => foldedToSvg(cp, view, { frontFill: 'red" onload="x' })).toThrow(RangeError);
    expect(() => foldedToSvg(triangleTwist(3, 1), view)).toThrow(RangeError);
  });

  it("rejects a conflict crease that does not lie between two faces, with a clear error", () => {
    const border = cp.edges.findIndex((e) => e.assignment === "B");
    expect(border).toBeGreaterThanOrEqual(0);
    expect(() => foldedToSvg(cp, { ...view, conflictCreases: [border] })).toThrow(RangeError);
  });

  it("matches the snapshot for the hexagon twist", () => {
    expect(foldedToSvg(cp, view)).toMatchSnapshot();
  });

  it("matches the snapshot for the partial star twist", () => {
    const star = starTwist(1, "partial");
    expect(foldedToSvg(star, viewOf(star))).toMatchSnapshot();
  });
});
