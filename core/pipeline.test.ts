/**
 * Interfaces between the phases: every shipped gadget variant goes through the whole data flow
 * (lattice → symmetry → pattern → validate → solve → render) and each stage accepts what the
 * previous one produced. A phase audit (5.4) check, not a unit test of any one module.
 */

import { describe, expect, it } from "vitest";
import { eis, ONE, ZERO } from "./lattice/eisenstein";
import { triangularGrid } from "./lattice/grid";
import { tile } from "./symmetry/orbit";
import { p6m } from "./symmetry/p6m";
import type { Motif } from "./symmetry/motif";
import { hexagonTwist } from "./gadgets/hexagon-twist";
import { starTwist } from "./gadgets/star-twist";
import { triangleTwist } from "./gadgets/triangle-twist";
import type { CreasePattern } from "./pattern/crease-pattern";
import { twoColor } from "./pattern/faces";
import { cross } from "./lattice/direction";
import { sub } from "./lattice/eisenstein";
import { apply } from "./symmetry/affine";
import { foldFaces } from "./solve/folded-faces";
import { isAbove, layerOrder } from "./solve/layer-order";
import { checkLocalFlatFoldability, interiorVertices } from "./validate/local-flat-foldability";
import { conflictLocality } from "./solve/locality";
import { layeredView } from "./solve/layered-view";
import { nearFoldability } from "./solve/near-foldability";
import { solveMv, withMvAssignment } from "./solve/solver";
import { freed } from "./solve/testing";
import { foldedToSvg } from "../app/render/folded-svg";
import { gridToSvg, tilingToSvg } from "../app/render/svg";
import { GADGET_ENTRIES } from "../app/viewer/gadgets";
import { creasePatternToPdf } from "../app/export/pdf";
import { creasePatternToSvg } from "../app/render/crease-svg";
import { buildScene } from "../app/viewer/scene";
import { creaseLines } from "./pattern/lines";
import { foldSteps } from "./pattern/fold-steps";
import { foldStepsToPdf } from "../app/export/steps-pdf";
import { foldStepsToSvg } from "../app/render/steps-svg";
import { parseStepParam, stepView } from "../app/viewer/step-panel";
import { sheetGeometry } from "../app/viewer/sheet";
import { barHingeModel } from "./simulate/model";
import { relax, restState } from "./simulate/relax";
import { grow, growthBoard, grownPattern } from "./generate/growth";
import { orientedPattern, regularTiling, shrinkRotate } from "./generate/shrink-rotate";

type Expected = { status: "ok" } | { status: "partial"; score: { num: number; den: number } };

const GADGETS: [string, CreasePattern, Expected][] = [
  ["hexagon twist (1, 2)", hexagonTwist(1, 2), { status: "ok" }],
  ["hexagon twist (2, 3)", hexagonTwist(2, 3), { status: "ok" }],
  ["triangle twist (3, 1)", triangleTwist(3, 1), { status: "ok" }],
  ["triangle twist (4, 1)", triangleTwist(4, 1), { status: "ok" }],
  ["triangle twist (6, 2)", triangleTwist(6, 2), { status: "ok" }],
  ["star twist, full", starTwist(1, "full"), { status: "ok" }],
  [
    "star twist, partial",
    starTwist(1, "partial"),
    { status: "partial", score: { num: 50, den: 54 } },
  ],
];

describe("lattice → symmetry → render", () => {
  it("a grid and a p6m tiling of a motif render to well-formed SVG", () => {
    const motif: Motif = { points: [eis(3, 1)], edges: [{ from: ZERO, to: ONE }] };
    for (const svg of [gridToSvg(triangularGrid(3)), tilingToSvg(tile(p6m(eis(2, 1)), motif, 3))]) {
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    }
  });
});

describe.each(GADGETS)("%s through the whole data flow", (_name, cp, expected) => {
  it("passes the local validators with every crease assigned", () => {
    expect(checkLocalFlatFoldability(cp)).toEqual({
      kawasaki: [],
      maekawa: [],
      unassigned: [],
      bigLittleBig: [],
      borderBigLittleBig: [],
      singleVertex: [],
    });
  });

  it("freed of its M/V, the solver finds a locally valid assignment that the validators accept", () => {
    const result = solveMv(freed(cp));
    if (result.status !== "sat") throw new Error(`expected sat, got ${result.status}`);
    const report = checkLocalFlatFoldability(withMvAssignment(freed(cp), result.assignment));
    expect(report).toEqual({
      kawasaki: [],
      maekawa: [],
      unassigned: [],
      bigLittleBig: [],
      borderBigLittleBig: [],
      singleVertex: [],
    });
  });

  it("has the documented foldability, and the layered view renders to match", () => {
    const nf = nearFoldability(cp);
    expect(nf.status).toBe(expected.status);
    if (nf.status === "inconsistent") return;
    if (expected.status === "partial") expect(nf.score).toEqual(expected.score);

    const view = layeredView(cp);
    if (view.status === "inconsistent") throw new Error("view is inconsistent");
    const svg = foldedToSvg(cp, view);
    expect([...svg.matchAll(/<polygon data-face=/g)]).toHaveLength(
      cp.faces.length - view.dropped.length,
    );
    expect([...svg.matchAll(/<polygon data-dropped=/g)]).toHaveLength(view.dropped.length);
    expect([...svg.matchAll(/<line data-edge=/g)]).toHaveLength(view.conflictCreases.length);
  });
});

describe.each(GADGETS)("%s: facts the book proves about a flat fold", (_name, cp, expected) => {
  it("has a face two-colouring that is the folded flips (Lang §1.1, pp. 14–15)", () => {
    const colours = twoColor(cp);
    expect(colours).not.toBeNull();
    const folded = foldFaces(cp);
    if (folded.status !== "ok") throw new Error(`fold is ${folded.status}`);
    // Face 0 is the unflipped base of `foldFaces`, so a face is flipped iff its colour differs.
    cp.faces.forEach((_, f) => expect(colours![f] !== colours![0]).toBe(folded.flipped[f]));
  });

  // The two theorems below hold for a pattern that folds flat, so the partial star is left out.
  it.skipIf(expected.status !== "ok")(
    "folds every interior vertex's creases into one half-plane (Thm 10, p. 41)",
    () => {
      const folded = foldFaces(cp);
      if (folded.status !== "ok") throw new Error(`fold is ${folded.status}`);
      for (const v of interiorVertices(cp)) {
        // Where the crease along edge e lands: the folded image of the segment from v, taken in
        // a face that has the crease on its boundary (any other face folds elsewhere).
        const rays = cp.rotation[v]!.map((e) => {
          const edge = cp.edges[e]!;
          const other = edge.v0 === v ? edge.v1 : edge.v0;
          const f = cp.faces.findIndex((w) =>
            w.some((x, i) => {
              const y = w[(i + 1) % w.length];
              return (x === v && y === other) || (x === other && y === v);
            }),
          );
          const map = folded.transforms[f]!;
          return sub(apply(map, cp.vertices[other]!), apply(map, cp.vertices[v]!));
        });
        // All rays lie in a closed half-plane iff some ray has every other on its left or on it.
        expect(rays.some((r) => rays.every((q) => cross(r, q) >= 0))).toBe(true);
      }
    },
  );

  it.skipIf(expected.status !== "ok")(
    "shows the white side at a vertex exactly when it is mountain-like, M − V = +2 (p. 29)",
    () => {
      const order = layerOrder(cp);
      if (order.status !== "ok") throw new Error(`layer order is ${order.status}`);
      const signs = new Set<number>();
      for (const v of interiorVertices(cp)) {
        const around = cp.faces.map((_, f) => f).filter((f) => cp.faces[f]!.includes(v));
        // The sheet on top where all of them meet: no overlapping face of the vertex is above it.
        const tops = around.filter((f) => around.every((g) => isAbove(order, g, f) !== true));
        expect(tops).toHaveLength(1);
        const marks = cp.rotation[v]!.map((e) => cp.edges[e]!.assignment);
        const sign = marks.filter((a) => a === "M").length - marks.filter((a) => a === "V").length;
        // Face 0 is unflipped: the white side up. Mountain-like shows white, valley-like colour.
        expect(order.folded.flipped[tops[0]!]).toBe(sign < 0);
        signs.add(sign);
      }
      expect(signs.size).toBeGreaterThan(0);
    },
  );
});

describe("the partial star twist's conflict locality", () => {
  it("matches the values documented in step 5.2e", () => {
    const cp = starTwist(1, "partial");
    const nf = nearFoldability(cp);
    if (nf.status !== "partial") throw new Error("expected partial");
    expect(conflictLocality(cp, nf.repair.faces)).toMatchObject({
      size: 4,
      maxDepth: 1,
      clusters: 4,
      area: { num: 4, den: 54 },
      atEdge: false,
    });
  });
});

describe("pattern → 3D scene", () => {
  it.each(GADGET_ENTRIES.map((e) => [e.name, e] as const))(
    "%s builds a scene with its sheet",
    (_name, entry) => {
      const scene = buildScene(entry.build());
      expect(scene.getObjectByName("sheet")).toBeDefined();
      expect(scene.getObjectByName("sheet-back")).toBeDefined();
    },
  );
});

describe("pattern → export", () => {
  it.each(GADGET_ENTRIES.map((e) => [e.name, e] as const))(
    "%s exports to SVG and PDF with one line per maximal crease",
    (_name, entry) => {
      const cp = entry.build();
      const lines = creaseLines(cp);
      expect(creasePatternToSvg(cp).match(/<line /g)).toHaveLength(lines.length);
      const pdf = new TextDecoder("latin1").decode(creasePatternToPdf(cp));
      expect(pdf.match(/ l S\n/g)).toHaveLength(lines.length);
    },
  );
});

describe("pattern → fold steps", () => {
  it.each(GADGET_ENTRIES.map((e) => [e.name, e] as const))(
    "%s has a step list that covers every mountain and valley edge once",
    (_name, entry) => {
      const cp = entry.build();
      const steps = foldSteps(cp);
      expect(steps.at(-1)!.kind).toBe("collapse");
      const covered = steps.flatMap((s) =>
        s.kind === "crease" ? s.lines.flatMap((l) => l.edges) : [],
      );
      const mv = cp.edges.filter((e) => e.assignment === "M" || e.assignment === "V");
      expect(covered).toHaveLength(mv.length);
      expect(new Set(covered).size).toBe(mv.length);
    },
  );
});

describe("fold steps → step exports", () => {
  it.each(GADGET_ENTRIES.map((e) => [e.name, e] as const))(
    "%s exports a PDF page and an SVG panel per step",
    (_name, entry) => {
      const cp = entry.build();
      const n = foldSteps(cp).length;
      const pdf = new TextDecoder("latin1").decode(foldStepsToPdf(cp, entry.name));
      expect(pdf).toContain(`/Count ${n + 1}`);
      expect(foldStepsToSvg(cp, entry.name).match(/<g data-step="/g)).toHaveLength(n);
    },
  );
});

describe("fold steps → step panel", () => {
  it.each(GADGET_ENTRIES.map((e) => [e.name, e] as const))(
    "%s walks from no step to the collapse, and the viewer's ?step= reaches each step",
    (_name, entry) => {
      const steps = foldSteps(entry.build());
      expect(stepView(steps, -1).prevDisabled).toBe(true);
      steps.forEach((_, i) => {
        expect(parseStepParam(String(i + 1), steps.length)).toBe(i);
        expect(stepView(steps, i).highlight !== null || i === steps.length - 1).toBe(true);
      });
      const last = stepView(steps, steps.length - 1);
      expect(last.nextDisabled).toBe(true);
      expect(last.foldPercent).toBe(100);
    },
  );
});

describe("pattern → fold simulation", () => {
  it.each(GADGET_ENTRIES.map((e) => [e.name, e] as const))(
    "%s settles at fold 0.5 and shares its mesh and node layout with the viewer sheet",
    (_name, entry) => {
      const cp = entry.build();
      const model = barHingeModel(cp);
      const sheet = sheetGeometry(cp);
      // 6.2b writes the simulated positions straight into the viewer's position buffer.
      expect(model.rest).toHaveLength(sheet.positions.length);
      expect(Array.from(model.triangles.flat())).toEqual(Array.from(sheet.triangles));
      const result = relax(model, restState(model), 0.5);
      expect(result.settled).toBe(true);
      expect(result.positions.every(Number.isFinite)).toBe(true);
    },
  );
});

/** Phase 8 generators: their output must take the same road as the shipped gadgets (audit 8.4). */
const GENERATED: [string, () => CreasePattern][] = [
  [
    "shrink-rotate 3^6 radius 1",
    () => {
      const sr = shrinkRotate(regularTiling("3^6", 1), { mirror: false });
      return orientedPattern(
        sr,
        sr.interior.map((_, j) => j % 2 === 0),
      )!;
    },
  ],
  [
    "grown 3^6 radius 2, birth {1,2}",
    () => {
      const board = growthBoard("3^6", 2);
      return grownPattern(board, grow(board, { birth: [1, 2] }, 3).birth, "outward", {
        mirror: false,
      }).cp!;
    },
  ],
];

describe.each(GENERATED)("generated pattern: %s", (_name, build) => {
  it("passes the local validators and the layer solver", () => {
    const cp = build();
    expect(checkLocalFlatFoldability(cp)).toEqual({
      kawasaki: [],
      maekawa: [],
      unassigned: [],
      bigLittleBig: [],
      borderBigLittleBig: [],
      singleVertex: [],
    });
    expect(nearFoldability(cp).status).toBe("ok");
  });

  it("exports to SVG and PDF with one line per maximal crease", () => {
    const cp = build();
    const lines = creaseLines(cp);
    expect(creasePatternToSvg(cp).match(/<line /g)).toHaveLength(lines.length);
    const pdf = new TextDecoder("latin1").decode(creasePatternToPdf(cp));
    expect(pdf.match(/ l S\n/g)).toHaveLength(lines.length);
  });

  it("builds a 3D scene and a bar-and-hinge model that settles at fold 0.25", () => {
    const cp = build();
    expect(buildScene(cp).getObjectByName("sheet")).toBeDefined();
    const model = barHingeModel(cp);
    expect(model.rest).toHaveLength(sheetGeometry(cp).positions.length);
    const result = relax(model, restState(model), 0.25);
    expect(result.settled).toBe(true);
    expect(result.positions.every(Number.isFinite)).toBe(true);
  });

  it("has a step list that covers every mountain and valley edge once", () => {
    const cp = build();
    const steps = foldSteps(cp);
    expect(steps.at(-1)!.kind).toBe("collapse");
    const covered = steps.flatMap((s) =>
      s.kind === "crease" ? s.lines.flatMap((l) => l.edges) : [],
    );
    const mv = cp.edges.filter((e) => e.assignment === "M" || e.assignment === "V");
    expect(covered).toHaveLength(mv.length);
    expect(new Set(covered).size).toBe(mv.length);
    const pdf = new TextDecoder("latin1").decode(foldStepsToPdf(cp, "generated"));
    expect(pdf).toContain(`/Count ${steps.length + 1}`);
    expect(foldStepsToSvg(cp, "generated").match(/<g data-step="/g)).toHaveLength(steps.length);
  });
});
