# Glossary

Terms the code and comments use. CLAUDE.md lists the four basic ones (crease pattern, mountain/valley, gadget, motif); these are the rest, with the book's meaning (Lang, *Twists, Tilings, and Tessellations*) and where the project uses it.

**Flat-foldable** — the pattern can end as a flat folded state, with every fold angle ±π and no layer passing through another. Phases 3 to 5 decide this. **Rigid-foldable** — there is a continuous motion from flat to the folded state in which every facet stays rigid and only the creases bend. A stricter property, so a flat-foldable pattern can be unreachable by a rigid motion: no triangle twist is rigid (Lang §7.6.1). Phase 6's bar-and-hinge model lets the facets stretch for that reason. **Developable** — a surface with zero Gaussian curvature; at a vertex the 3D sector angles still sum to 2π (Lang Eq. 1.43).

**Sector** — the angle between two consecutive creases at a vertex, counter-clockwise; sector i opens at crease i. Sizes are compared exactly, never as angles.

**Kawasaki, Maekawa** — at a flat-foldable interior vertex the odd sectors sum to π (Kawasaki–Justin) and |#M − #V| = 2 (Maekawa–Justin; it needs the paper not to pass through itself, Lang p. 28).

**Run** — a maximal block of equal consecutive sectors, each strictly smaller than the sector before and after the block (`smallSectorRuns`). **Big-Little-Big** — the creases that bound a run are not all one assignment. Necessary at any vertex; exact up to degree 4.

**Crimp** — Hull's reduction step: a sector no larger than its neighbours, with creases of opposite assignment, is deleted along with those two creases and its neighbours merge into one sector of size θᵢ₋₁ − θᵢ + θᵢ₊₁. Repeating it decides one vertex exactly (`singleVertexFlat`, Lang §1.2.7).

**Iso, anto** — two creases at a vertex with the same (iso) or opposite (anto) assignment. A strictly small sector forces its two creases anto. An odd loop of anto relations means no assignment exists, even when Kawasaki and Maekawa hold at every vertex (Lang Thm 16; Hull's triangle, `hullTriangle`).

**Border vertex, wedge** — a vertex on the edge of the sheet. The paper there is one or more wedges between two paper edges. There is no Kawasaki or Maekawa condition, only Big-Little-Big on the sectors inside a wedge (`paperWedges`, `borderRuns`; Lang Fig. 1.45).

**Face colouring** — the facets of a flat-foldable pattern can be two-coloured so that facets across a folded crease differ; one colour is face up in the folded form (`twoColor`, Lang pp. 14–15).

**Maxwell condition** — a counting test, 2F − E + E_b − 3 ≥ 0, for a reciprocal figure to exist (`maxwellExcess`, Lang §6.4.1). Sufficient only for generic embeddings.

**Pleat** — two parallel creases, one mountain and one valley, that fold the paper into a step. The arms of a twist are pleats.

**Twist angle α** — the angle between a pleat and a side of the twist's polygon; the polygon's centre turns through 2α when the twist folds (Lang §3.4.3). **Closed-back** twist: α equals the critical angle αcrit = 90° − 180°/n for the regular n-gon (Lang Eq. 3.13), so the back has no hole. **Open-back**: α < αcrit, which leaves a shrunken, rotated copy of the polygon as a hole at the centre of the back. The shipped hexagon twist is closed-back.
