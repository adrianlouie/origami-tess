import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { foldSteps } from "../../core/pattern/fold-steps";
import { creaseLines } from "../../core/pattern/lines";
import { GADGET_ENTRIES } from "../viewer/gadgets";
import { wrapText } from "../export/pdf-writer";
import { CREASE_STYLE, FAINT_STYLE, hexColor } from "./crease-style";
import { stepCaption, HIGHLIGHT_GRID_COLOR } from "./step-text";
import { foldStepsToSvg } from "./steps-svg";
import { toPixels } from "./svg";

type Line = { x1: number; y1: number; x2: number; y2: number };
type Layer = { layer: string; stroke: string; dash: string | null; lines: Line[] };
type Panel = {
  step: number;
  tx: number;
  ty: number;
  layers: Layer[];
  number: string;
  text: string[];
};

const attr = (s: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(s)?.[1] ?? null;
const unxml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

function panels(svg: string): Panel[] {
  return [
    ...svg.matchAll(
      /<g data-step="(\d+)" transform="translate\(([-\d.]+) ([-\d.]+)\)">([\s\S]*?)\n<\/g>/g,
    ),
  ].map((m) => {
    const body = m[4]!;
    const layers = [...body.matchAll(/<g data-layer="([^"]+)"([^>]*)>([\s\S]*?)<\/g>/g)].map(
      (g) => ({
        layer: g[1]!,
        stroke: attr(g[2]!, "stroke")!,
        dash: attr(g[2]!, "stroke-dasharray"),
        lines: [...g[3]!.matchAll(/<line ([^>]*)\/>/g)].map((l) => ({
          x1: Number(attr(l[1]!, "x1")),
          y1: Number(attr(l[1]!, "y1")),
          x2: Number(attr(l[1]!, "x2")),
          y2: Number(attr(l[1]!, "y2")),
        })),
      }),
    );
    const number = unxml(/<text data-role="number"[^>]*>([^<]*)<\/text>/.exec(body)![1]!);
    const text = [...body.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((t) => unxml(t[1]!));
    return { step: Number(m[1]), tx: Number(m[2]), ty: Number(m[3]), layers, number, text };
  });
}

describe.each(GADGET_ENTRIES)("foldStepsToSvg: $name", ({ name, build }) => {
  const cp = build();
  const steps = foldSteps(cp);
  const svg = foldStepsToSvg(cp, name);
  const all = panels(svg);
  const scale = 40;

  it("has one numbered panel per step, in order, with its caption", () => {
    expect(all.map((p) => p.step)).toEqual(steps.map((_, i) => i));
    all.forEach((p, i) => {
      expect(p.number).toBe(String(i + 1));
      const body = stepCaption(steps, i, "print").replace(/^Step \d+ of \d+: /, "");
      expect(p.text.join(" ")).toBe(body);
    });
  });

  it("draws each step's own lines in full colour over the faint pattern", () => {
    steps.forEach((step, i) => {
      const p = all[i]!;
      const top = p.layers.at(-1)!;
      const color =
        step.kind === "grid"
          ? HIGHLIGHT_GRID_COLOR
          : step.kind === "crease"
            ? CREASE_STYLE[step.assignment].color
            : null;
      if (step.kind === "collapse") {
        expect(p.layers.some((l) => l.stroke === hexColor(FAINT_STYLE.color))).toBe(false);
        const n = p.layers.reduce((a, l) => a + l.lines.length, 0);
        expect(n).toBe(creaseLines(cp).length);
        return;
      }
      expect(top.stroke).toBe(hexColor(color!));
      const faint = p.layers.find((l) => l.stroke === hexColor(FAINT_STYLE.color))!;
      expect(faint.lines).toHaveLength(creaseLines(cp).filter((l) => l.assignment !== "B").length);
      const wanted = step.kind === "grid" ? step.segments : step.lines;
      expect(top.lines).toHaveLength(wanted.length);
      // Placement: offsets between points match the lattice's, up to one shared panel offset.
      const at = faint.lines[0]!;
      const first = creaseLines(cp).filter((l) => l.assignment !== "B")[0]!;
      const f0 = toPixels(first.from, scale);
      const ox = at.x1 - f0.x;
      const oy = at.y1 - f0.y;
      wanted.forEach((l, k) => {
        const a = toPixels(l.from, scale);
        const b = toPixels(l.to, scale);
        const got = top.lines[k]!;
        expect(got.x1).toBeCloseTo(a.x + ox, 1);
        expect(got.y1).toBeCloseTo(a.y + oy, 1);
        expect(got.x2).toBeCloseTo(b.x + ox, 1);
        expect(got.y2).toBeCloseTo(b.y + oy, 1);
      });
    });
  });

  it("keeps crease dashes on crease steps", () => {
    steps.forEach((step, i) => {
      if (step.kind !== "crease") return;
      const top = all[i]!.layers.at(-1)!;
      expect(top.dash).not.toBeNull();
    });
  });

  it("is deterministic", () => {
    expect(foldStepsToSvg(cp, name)).toBe(svg);
  });
});

describe("foldStepsToSvg layout and options", () => {
  const entry = GADGET_ENTRIES[0]!;
  const cp = entry.build();

  it("lays panels out in rows of `columns`", () => {
    for (const columns of [1, 2, 3, 5]) {
      const ps = panels(foldStepsToSvg(cp, "x", { columns }));
      ps.forEach((p, i) => {
        expect(p.tx).toBeCloseTo(ps[i % columns]!.tx, 6);
        expect(p.ty).toBeCloseTo(ps[Math.floor(i / columns) * columns]!.ty, 6);
        if (i % columns > 0) expect(p.tx).toBeGreaterThan(ps[i - 1]!.tx);
        if (i >= columns) expect(p.ty).toBeGreaterThan(ps[i - columns]!.ty);
      });
    }
  });

  it("wraps captions to the panel width with the shared Helvetica table", () => {
    const ps = panels(foldStepsToSvg(cp, "x"));
    expect(Math.max(...ps.map((p) => p.text.length))).toBeGreaterThan(1);
    const body = ps[0]!.text.join(" ");
    expect(wrapText(body, 12, 1e9)).toEqual([body]);
  });

  it("escapes the name and the text", () => {
    const svg = foldStepsToSvg(cp, "A & <B>");
    expect(svg).toContain("A &amp; &lt;B&gt;");
    expect(svg).not.toContain("A & ");
    expect(svg).not.toContain("<B>");
  });

  it("refuses control characters XML 1.0 cannot hold, even escaped", () => {
    expect(() => foldStepsToSvg(cp, "bad\u0001name")).toThrow(RangeError);
    expect(() => foldStepsToSvg(cp, "tab\tis fine")).not.toThrow();
  });

  it("rejects bad options", () => {
    expect(() => foldStepsToSvg(cp, "x", { columns: 0 })).toThrow(RangeError);
    expect(() => foldStepsToSvg(cp, "x", { columns: 1.5 })).toThrow(RangeError);
    expect(() => foldStepsToSvg(cp, "x", { scale: -1 })).toThrow(RangeError);
  });
});

describe("foldStepsToSvg over random options (property)", () => {
  const cp = GADGET_ENTRIES[0]!.build();
  const steps = foldSteps(cp);

  it("draws every panel and every line inside the sheet, whatever the columns and scale", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.double({ min: 10, max: 120, noNaN: true }),
        (columns, scale) => {
          const svg = foldStepsToSvg(cp, "x", { columns, scale });
          const box = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/
            .exec(svg)!
            .slice(1)
            .map(Number);
          const [x0, y0, w, h] = box as [number, number, number, number];
          const ps = panels(svg);
          expect(ps).toHaveLength(steps.length);
          for (const p of ps) {
            for (const l of p.layers.flatMap((layer) => layer.lines)) {
              for (const [x, y] of [
                [l.x1, l.y1],
                [l.x2, l.y2],
              ] as const) {
                expect(x + p.tx).toBeGreaterThanOrEqual(x0 - 1e-6);
                expect(x + p.tx).toBeLessThanOrEqual(x0 + w + 1e-6);
                expect(y + p.ty).toBeGreaterThanOrEqual(y0 - 1e-6);
                expect(y + p.ty).toBeLessThanOrEqual(y0 + h + 1e-6);
              }
            }
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
