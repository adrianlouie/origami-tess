import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../../core/gadgets/hexagon-twist";
import { starTwist } from "../../core/gadgets/star-twist";
import { triangleTwist } from "../../core/gadgets/triangle-twist";
import { eis } from "../../core/lattice/eisenstein";
import { fromSegments, type Assignment } from "../../core/pattern/crease-pattern";
import { creaseLines } from "../../core/pattern/lines";
import { GADGET_ENTRIES } from "../viewer/gadgets";
import { CREASE_STYLE, hexColor } from "./crease-style";
import { creasePatternToSvg } from "./crease-svg";
import { toPixels } from "./svg";

type Parsed = {
  assignment: Assignment;
  color: string;
  width: number;
  dash: string | null;
  edges: number[];
  p: [number, number];
  q: [number, number];
};

/** Every <line> with the attributes of its group, parsed back out of the SVG. */
function parse(svg: string): Parsed[] {
  const out: Parsed[] = [];
  for (const g of svg.matchAll(/<g data-assignment="(\w)" ([^>]*)>([\s\S]*?)<\/g>/g)) {
    const attrs = g[2]!;
    const color = /stroke="([^"]+)"/.exec(attrs)![1]!;
    const width = Number(/stroke-width="([^"]+)"/.exec(attrs)![1]);
    const dash = /stroke-dasharray="([^"]+)"/.exec(attrs)?.[1] ?? null;
    for (const l of g[3]!.matchAll(
      /<line data-edges="([^"]*)" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g,
    )) {
      out.push({
        assignment: g[1] as Assignment,
        color,
        width,
        dash,
        edges: l[1]!.split(" ").map(Number),
        p: [Number(l[2]), Number(l[3])],
        q: [Number(l[4]), Number(l[5])],
      });
    }
  }
  return out;
}

describe("creasePatternToSvg", () => {
  it("draws every edge once, in its assignment's colour and dash, on every gadget", () => {
    for (const { name, build } of GADGET_ENTRIES) {
      const cp = build();
      const lines = parse(creasePatternToSvg(cp));
      expect(
        lines.flatMap((l) => l.edges).sort((a, b) => a - b),
        name,
      ).toEqual(cp.edges.map((_, i) => i));
      for (const l of lines) {
        const style = CREASE_STYLE[l.assignment];
        expect(l.color).toBe(hexColor(style.color));
        expect(l.width).toBeCloseTo(style.width, 5);
        expect(l.dash === null).toBe(style.dash.length === 0);
        for (const e of l.edges) expect(cp.edges[e]!.assignment).toBe(l.assignment);
      }
    }
  });

  it("puts each line at the pixel position of its exact end points", () => {
    const cp = triangleTwist(6, 2);
    const svg = parse(creasePatternToSvg(cp, { scale: 50 }));
    const expected = creaseLines(cp).map((l) => {
      const p = toPixels(l.from, 50);
      const q = toPixels(l.to, 50);
      return [p.x, p.y, q.x, q.y];
    });
    expect(svg.map((l) => [...l.p, ...l.q]).sort()).toHaveLength(expected.length);
    for (const l of svg) {
      const found = expected.some(
        (e) => Math.hypot(e[0]! - l.p[0], e[1]! - l.p[1], e[2]! - l.q[0], e[3]! - l.q[1]) < 1e-4,
      );
      expect(found).toBe(true);
    }
  });

  it("tells mountain from valley without colour: both are dashed, with different patterns", () => {
    const m = CREASE_STYLE.M.dash.join(" ");
    const v = CREASE_STYLE.V.dash.join(" ");
    expect(m).not.toBe("");
    expect(v).not.toBe("");
    expect(m).not.toBe(v);
    const svg = creasePatternToSvg(hexagonTwist(1, 2));
    const dashes = new Map(parse(svg).map((l) => [l.assignment, l.dash]));
    expect(dashes.get("M")).not.toBe(dashes.get("V"));
    expect(dashes.get("M")).toBeTruthy();
    expect(dashes.get("V")).toBeTruthy();
    expect(dashes.get("B")).toBeNull();
  });

  it("scales stroke and dashes with the base stroke width", () => {
    const cp = hexagonTwist(1, 2);
    const one = parse(creasePatternToSvg(cp, { strokeWidth: 1 }));
    const three = parse(creasePatternToSvg(cp, { strokeWidth: 3 }));
    const m1 = one.find((l) => l.assignment === "M")!;
    const m3 = three.find((l) => l.assignment === "M")!;
    expect(m3.width).toBeCloseTo(3 * m1.width, 5);
    const d1 = m1.dash!.split(" ").map(Number);
    const d3 = m3.dash!.split(" ").map(Number);
    d1.forEach((d, i) => expect(d3[i]).toBeCloseTo(3 * d, 5));
  });

  it("gives dots round caps and draws faint lines first so folds lie on top", () => {
    const cp = fromSegments(
      [],
      [
        { from: eis(0, 0), to: eis(1, 0), assignment: "U" },
        { from: eis(0, 0), to: eis(0, 1), assignment: "M" },
        { from: eis(0, 0), to: eis(-1, 0), assignment: "F" },
      ],
    );
    const svg = creasePatternToSvg(cp);
    expect(svg).toMatch(/data-assignment="U"[^>]*stroke-linecap="round"/);
    expect(svg.indexOf('data-assignment="F"')).toBeLessThan(svg.indexOf('data-assignment="U"'));
    expect(svg.indexOf('data-assignment="U"')).toBeLessThan(svg.indexOf('data-assignment="M"'));
  });

  it("is deterministic and rejects bad options", () => {
    const cp = starTwist(1, "full");
    expect(creasePatternToSvg(cp)).toBe(creasePatternToSvg(cp));
    expect(() => creasePatternToSvg(cp, { scale: 0 })).toThrow(RangeError);
    expect(() => creasePatternToSvg(cp, { strokeWidth: -1 })).toThrow(RangeError);
    expect(() => creasePatternToSvg(cp, { margin: -1 })).toThrow(RangeError);
  });

  it("matches the snapshot for the hexagon twist (1, 2)", async () => {
    await expect(creasePatternToSvg(hexagonTwist(1, 2))).toMatchFileSnapshot(
      "./__snapshots__/crease-hexagon-1-2.svg",
    );
  });
});
