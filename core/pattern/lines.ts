/**
 * Maximal straight creases: unit edges merged into the lines a person would draw.
 *
 * Sits in the pattern stage of the data flow (lattice → … → pattern → … → render/export). Gadgets
 * list a ray as many unit edges. A dash pattern restarts on every separate segment, so an exporter
 * that drew each edge alone would break every dashed or dash-dot crease at each lattice point.
 * Merging is exact (integer directions, no floats), so it lives in `core/`, not in a renderer.
 */

import { primitive } from "../lattice/direction";
import { equals, neg, sub, type Eisenstein } from "../lattice/eisenstein";
import type { Assignment, CreasePattern } from "./crease-pattern";

/** A maximal straight run of creases that share one assignment. */
export type CreaseLine = {
  /** One end of the run. */
  readonly from: Eisenstein;
  /** The other end of the run. */
  readonly to: Eisenstein;
  readonly assignment: Assignment;
  /** Indices into `cp.edges`, ascending. */
  readonly edges: readonly number[];
};

/**
 * Merges the edges of a crease pattern into maximal straight lines.
 *
 * Two edges join at a vertex v when, among the edges at v with their assignment, there are exactly
 * two and they leave v in opposite directions. Directions are compared as primitive integer
 * vectors: two non-zero lattice vectors point opposite ways exactly when their primitive forms are
 * negatives of each other. Requiring "exactly two" keeps a T or a star of one assignment as
 * separate lines, so no edge is drawn twice and every line is straight. Each edge is in exactly
 * one line, and lines are ordered by their smallest edge index, so the output is deterministic.
 *
 * @param cp - the crease pattern
 * @returns the lines, covering every edge once
 */
export function creaseLines(cp: CreasePattern): readonly CreaseLine[] {
  /** The other edge to continue through vertex `v` from edge `e`, or undefined at the end of a run. */
  const through = (v: number, e: number): number | undefined => {
    const a = cp.edges[e]!.assignment;
    const same = cp.rotation[v]!.filter((f) => cp.edges[f]!.assignment === a);
    if (same.length !== 2) return undefined;
    const f = same[0] === e ? same[1]! : same[0]!;
    // `primitive` needs a non-zero vector: an edge never has zero length, because `crease-pattern`
    // rejects self-loops and two vertices at one position.
    const away = (g: number) => {
      const { v0, v1 } = cp.edges[g]!;
      return primitive(sub(cp.vertices[v0 === v ? v1 : v0]!, cp.vertices[v]!));
    };
    return equals(away(e), neg(away(f))) ? f : undefined;
  };
  const other = (e: number, v: number) => {
    const { v0, v1 } = cp.edges[e]!;
    return v0 === v ? v1 : v0;
  };

  const used = new Array<boolean>(cp.edges.length).fill(false);
  const lines: CreaseLine[] = [];
  cp.edges.forEach((edge, start) => {
    if (used[start]) return;
    // Walk outward from both ends of `start`; the walk cannot loop, since a straight run never
    // returns to a vertex.
    const run = [start];
    used[start] = true;
    const ends: number[] = [];
    for (const first of [edge.v0, edge.v1]) {
      let v = first;
      let e = start;
      for (;;) {
        const next = through(v, e);
        if (next === undefined || used[next]) break;
        used[next] = true;
        run.push(next);
        v = other(next, v);
        e = next;
      }
      ends.push(v);
    }
    lines.push({
      from: cp.vertices[ends[0]!]!,
      to: cp.vertices[ends[1]!]!,
      assignment: edge.assignment,
      edges: run.sort((x, y) => x - y),
    });
  });
  return lines;
}
