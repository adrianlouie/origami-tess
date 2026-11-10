/**
 * SVG renderer for the flat-folded state of a crease pattern.
 *
 * Sits at the render end of the data flow (… → solve → simulate/render), after
 * `core/solve/layered-view.ts`. Each kept face is drawn at its folded position under an SVG mask
 * that cuts out every face the stacking puts above it, so the visible regions are disjoint and the
 * drawing order does not matter. A painter's algorithm would need one linear order, which the
 * hexagon twists do not have (their faces stack in a ring). Faces given up by a partial fold are
 * drawn hatched in red on top, and the creases of a minimal conflict are drawn as red lines.
 * Exact lattice points become floats only here, via `toPixels`.
 */

import { apply } from "../../core/symmetry/affine";
import type { CreasePattern } from "../../core/pattern/crease-pattern";
import { facesAbove, type LayeredView } from "../../core/solve/layered-view";
import { checkOptions, fmt, svgDocument, toPixels, type Px, type SvgOptions } from "./svg";

/** Options for {@link foldedToSvg}. */
export type FoldedSvgOptions = SvgOptions & {
  /** Fill of a face that shows its front (unflipped). Default a warm paper colour. */
  readonly frontFill?: string;
  /** Fill of a face that shows its back (flipped). Default a blue. */
  readonly backFill?: string;
  /** Colour of the dropped faces and conflict creases. Default red. */
  readonly conflictColor?: string;
};

/** A colour we are willing to write into an attribute: no quotes, angle brackets or `&`. */
const COLOR = /^[#\w(),.% -]+$/;

const points = (ps: readonly Px[]) => ps.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" ");

/**
 * Renders a layered view as an SVG document string.
 *
 * Every kept face is a `<polygon data-face="f">`, front or back colour by whether the fold flipped
 * it. A face with faces above it carries `mask="url(#above-f)"`; that mask is a white field with a
 * black `<polygon data-above="g">` per face g above f. Dropped faces are `<polygon data-dropped>`
 * with a red hatch, and each conflict crease is a red `<line data-edge="e">` at its folded place.
 *
 * @param cp - the pattern the view was built from
 * @param view - from `layeredView`
 * @param opts - scale, stroke width, margin and colours
 * @returns a standalone SVG document
 * @throws RangeError for a non-positive size or a colour with unsafe characters
 */
export function foldedToSvg(
  cp: CreasePattern,
  view: LayeredView,
  opts: FoldedSvgOptions = {},
): string {
  const {
    scale = 100,
    strokeWidth = 1,
    margin = 0.5,
    frontFill = "#f6efdc",
    backFill = "#6f8fbf",
    conflictColor = "#d62828",
  } = opts;
  checkOptions({ scale, strokeWidth }, (n) => n > 0, "a positive finite number");
  checkOptions({ margin }, (n) => n >= 0, "a non-negative finite number");
  for (const c of [frontFill, backFill, conflictColor]) {
    if (!COLOR.test(c)) throw new RangeError(`Unsupported colour ${JSON.stringify(c)}`);
  }
  if (view.triangles.length !== cp.faces.length) {
    throw new RangeError(`View has ${view.triangles.length} faces, pattern has ${cp.faces.length}`);
  }

  const shapes = view.outlines.map((ring) => ring.map((v) => toPixels(v, scale)));
  const dropped = new Set(view.dropped);
  const kept = shapes.map((_, f) => f).filter((f) => !dropped.has(f));
  const above = new Map(kept.map((f) => [f, facesAbove(view, f)]));

  const defs = [
    `<defs>`,
    `  <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`,
    `    <line x1="0" y1="0" x2="0" y2="6" stroke="${conflictColor}" stroke-width="2"/>`,
    `  </pattern>`,
    // The white field is far larger than any drawing so it never clips a face or its outline.
    ...kept.flatMap((f) => {
      const over = above.get(f)!;
      if (over.length === 0) return [];
      return [
        `  <mask id="above-${f}">`,
        `    <rect x="-100000" y="-100000" width="200000" height="200000" fill="white"/>`,
        ...over.map(
          (g) => `    <polygon data-above="${g}" points="${points(shapes[g]!)}" fill="black"/>`,
        ),
        `  </mask>`,
      ];
    }),
    `</defs>`,
  ];

  const faces = kept.map((f) => {
    const fill = view.folded.flipped[f]! ? backFill : frontFill;
    const mask = above.get(f)!.length > 0 ? ` mask="url(#above-${f})"` : "";
    return `  <polygon data-face="${f}" points="${points(shapes[f]!)}" fill="${fill}"${mask}/>`;
  });

  const droppedShapes = view.dropped.map(
    (f) =>
      `  <polygon data-dropped="${f}" points="${points(shapes[f]!)}" fill="url(#hatch)" stroke="${conflictColor}"/>`,
  );

  const conflict = view.conflictCreases.map((e) => {
    const { v0, v1 } = cp.edges[e]!;
    // The creases of a fold agree on both sides, so any face that borders the edge places it.
    const f = cp.faces.findIndex((walk) =>
      walk.some((v, i) => {
        const w = walk[(i + 1) % walk.length]!;
        return (v === v0 && w === v1) || (v === v1 && w === v0);
      }),
    );
    const t = view.folded.transforms[f]!;
    const p = toPixels(apply(t, cp.vertices[v0]!), scale);
    const q = toPixels(apply(t, cp.vertices[v1]!), scale);
    return `  <line data-edge="${e}" x1="${fmt(p.x)}" y1="${fmt(p.y)}" x2="${fmt(q.x)}" y2="${fmt(q.y)}"/>`;
  });

  return svgDocument(
    shapes.flat(),
    [
      ...defs,
      `<g stroke="black" stroke-width="${fmt(strokeWidth)}" stroke-linejoin="round">`,
      ...faces,
      `</g>`,
      `<g stroke-width="${fmt(2 * strokeWidth)}">`,
      ...droppedShapes,
      `</g>`,
      `<g stroke="${conflictColor}" stroke-width="${fmt(3 * strokeWidth)}" stroke-linecap="round">`,
      ...conflict,
      `</g>`,
    ],
    margin,
    scale,
  );
}
