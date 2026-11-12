# Improvements drawn from Lang, *Twists, Tilings, and Tessellations* (CRC Press, 2018)

A running log. After each deep read of a part of the book, the section below it records what in this
project could change, what is missing, and what the book confirms. Nothing here is a plan step yet:
when an item is taken up, give it a `docs/PLAN.md` step and link it back here.

Page numbers are the book's printed pages. Tags: **[exact]** needs only exact-integer math,
**[float]** needs the float stage, **[test]** is a test oracle or cross-check, **[doc]** is a wording fix.
Priority: P1 do soon, P2 useful, P3 later or optional.

## Reading status

| Part | Status |
|---|---|
| Ch. 1 Vertices (§1.1–1.7) | deep-read complete |
| Ch. 2 Periodicity | deep-read complete |
| Ch. 3 Simple Twists | deep-read complete |
| Ch. 4 Twist Tiles | deep-read complete |
| Ch. 5 Tilings | deep-read complete |
| Ch. 6 Primal-Dual | deep-read complete |
| Ch. 7 Rigid Foldability | deep-read complete |
| Ch. 8 Spherical Vertices | deep-read complete |
| Ch. 9 3D Analysis | deep-read complete |
| Ch. 10 Rotational Solids | deep-read complete |

---

## First pass (partial reads of Ch. 1, 3, 4, 5, 6, 7, 9)

### Confirmations (the project already agrees with the book)
- Kawasaki-Justin, Maekawa-Justin and Big-Little-Big are implemented as the book states them (§1.2).
- Justin's hole condition (Thm 14, p. 45) is what Phase 3.7 `holes` added.
- "Cyclic twist" is named for a cycle in the stacking order (§3.4.1, fn 2). The ring found in 5.2 is that cycle.
- Layer ordering has no simple global test (§1.5.2), so a SAT solver is the right tool.

### Changes and additions
1. **P1 [test] Analytic twist limits as an oracle.** Closed forms for regular n-gon twists: αcrit = 90° − 180°/n
   (Eq. 3.13), αsafe (Eq. 3.16, Table 3.2), mm/vv α ≤ 180° − 360°/n, mv/vm α < 360°/n (Eqs. 3.11–3.12),
   Thm 17 (cyclic only when min(α, 180°−α) > 360°/n), Thm 18 (no odd-n assignment when
   180° − 360°/n < min(α, 180°−α)), Thm 19 (maximal twists have opposite-parity pleat creases),
   Thm 20 (all pleats anto or all iso), partially-cyclic cases for n = 3, 4, 5. Use them to cross-check the
   SAT solver on regular twists, and as a pre-filter in Phase 8.1.
2. **P1 [test] Count of assignments.** N(n) = (1/n) Σ_{d|n} 2^d φ(n/d) (Eq. 3.1, Table 3.1:
   4, 6, 8, 14, 20, 36, 60, 108, 188, 352 for n = 3..12). Locally valid, de-duplicated-by-rotation
   assignment counts for a twist should match where the twist angle allows all of them.
3. **P1 [doc] Check the gadgets against the twist taxonomy.** The hexagon twist (sectors 60/60/120/120) looks like
   α = αcrit = 60°, a closed-back twist. The triangle twist looks like α = 60° with the cyclic assignment MMM,
   which is supercritical for infinite paper (αcrit = 30°) and foldable only when the paper ends early (Fig. 3.43).
   That would explain the n ≥ 3m rule as a finite-paper effect. Verify, then say so in the TSDoc and PLAN 5.2b.
4. **P1 [doc] PLAN "Known risks" line "Twist folds are not rigid-foldable" is too coarse.** The book (§7.6.1, Eq. 7.81)
   proves there is no rigidly foldable triangle twist; rectangle, parallelogram, isosceles-trapezoid and rhombus twists
   are rigid for the same assignments as the square twist; all-anto cyclic and alternating twists never are.
5. **P1 [exact] Exact single-vertex test.** Hull's sector-reduction test (§1.2.7, SVFFT) plus Kawasaki and Maekawa is
   exact, whereas `bigLittleBigFlat` is necessary only (exact at degree 4). Sector reduction is
   θ' = θ(i−1) − θ(i) + θ(i+1) on exact directions. It would remove the test-only `foldsFlat` dependence.
6. **P2 [exact] Local flat-foldability (LFF) graph (§1.5.3).** Iso/anto lines between creases, propagated across vertices.
   2^N assignments for N components; a loop with an odd number of anto lines (Thm 16) means no locally valid
   assignment. Polynomial time, no degree cap (the SAT encoding stops at degree 12), and a clearer diagnostic than the
   propagation chain in `unsat`. Higher degree uses repeated sector reduction (Fig. 1.42).
7. **P2 [exact] Justin path conditions (Thm 12, 13, 15).** Cheap necessary checks on any closed path: composition of
   crease reflections is the identity; alternating angle sums agree mod 180°; the non-twist theorem relates
   alternating sums to (M − V)/2 × 180°. Candidates for a fast global "cannot fold" screen before layer SAT.
8. **P2 [exact] Tile layer.** Top-down construction: tiling → twist tile per polygon → M/V from edge orientations.
   Parameters: centered tiles `(w, τ)`, offset tiles `(w, d)`; any two tiles of one species mate (Principle of Mating,
   p. 274). Centered tiles mate with opposite parity; offset tiles mate in mirror image and need an even number of tiles
   at every vertex (two-colourable tilings). Twist angle depends only on `(w, τ)` for centered tiles, but on n for offset.
9. **P2 [exact] Vertex figures and tilings.** 21 vertex figures, 15 tileable, 11 Archimedean tilings (12 patterns, two
   (3.3.3.3.6) handednesses), 20 two-uniform tilings. Only four Archimedean tilings are two-colourable:
   3⁶, 4⁴, 3.4.6.4, 3.6.3.6. Lattice vectors and patches in Table 5.1. Squares and 12-gons are not in Z[ω]: they need
   Z[ζ₁₂] (or Z[i]), so the exact-integer convention needs an extension before tilings beyond 3⁶, 3.6.3.6, 6³.
10. **P2 [float] Shrink-rotate.** Scale ρ, rotate β about each polygon centre; every polygon becomes a twist of the same
    α = cos⁻¹(sin β / √(ρ² − 2ρ cos β + 1)) (Eq. 6.1). Fails on non-regular tilings such as rhombi (§6.3): the twist
    angle varies around a polygon. The Kawasaki validator catches that.
11. **P3 [float] Kinematics.** Degree-4 fold-angle multiplier μ gives exact rigid motion for Miura-ori and Mars.
    The truss model (§9.5.1) enforces planarity with sin θ_AB = (nA × nB)·e/|e| rather than nA·nB = 1 (whose gradient
    vanishes at the solution); a product-of-diagonals isometry lets a quadrilateral bend either way (Eq. 9.74).
12. **P3 [doc] Prefolded grid.** Real tessellators prefold an N×N×N triangular grid, N a power of 2 (§5.4.5).
    Step 7.2 (pre-crease, then collapse) can be modelled on this, and the collapse often has a "tipping point"
    (Intro, p. xix).
13. **P3 Phase 8 inputs.** 8.1 can sweep α and n inside the safe/critical ranges above. 8.2 can replace random motifs with
    edge-oriented tilings (2^(Ne − Nb/2) assignments per lattice patch, Eq. 5.8). 8.3 (cellular automata) has no book
    counterpart.
14. **Out of scope (CLAUDE.md: uncut flat tessellation):** Ch. 10 rotational solids, §9.3 discrete space curve, curved folds.

---

## Deep read: Ch. 1, §1.1–1.2.5 (pp. 1–27: models, crease patterns, KJT, Justin conditions, TFT, BLBA)

**Confirmations**
- Sign and orientation conventions match `core/simulate/dihedral.ts`: fold angle is positive for a valley, negative for a mountain,
  ±π when flat-folded, 0 when unfolded; fold angle = π − dihedral angle (p. 13); sectors and creases are numbered
  counterclockwise from the white side (p. 16). Keep citing this page in the `foldAngle` TSDoc.
- "B" border crease (p. 15) and "U" unfolded crease (p. 14, "compute all possible creases, then assign") are the book's own
  uses; the `U` default and the `B` frame ring are standard, not ad hoc.
- Kawasaki-Justin needs even degree and an interior vertex (p. 20); both are already enforced.

**Changes and additions**
1. **P1 [test] The strip of thirds (Fig. 1.5, pp. 10–11).** A strip with two parallel valley folds has two stacking orders; widen
   facet A slightly past B and one order becomes impossible; widen both A and C past B and the assignment is invalid.
   This is the smallest non-local layer constraint in the book. Add it as a fast-check family to `stacking`/`layer-order` tests
   (widths a, b, c on the lattice; expected: valid orders = those where the outer facet that ends on top does not poke through the
   far crease). It needs no 2D oracle and catches a wrong taco-tortilla clause immediately.
2. **P2 [exact] Face two-colouring without M/V (pp. 14–15).** Every flat-foldable pattern's facets can be two-coloured across folded
   creases (and only the two colourings exist); each colouring says which facets are white-up in the folded form. That needs no
   solver and no M/V. Uses: (a) the white/colour-up map for the 7.1b front/back colour pickers and for `foldedToSvg` flipped faces,
   computed once, exactly, independent of simulation; (b) a quick necessary check that is cheaper than `foldFaces` (an odd cycle of
   folded creases means the pattern cannot fold flat); (c) a cross-check that `foldFaces` flips agree with the colouring.
3. **P2 [doc] Model hierarchy (Table 1.1, p. 4).** The project spans flat-foldable origami (Phases 3–5) and polyhedral origami
   (Phase 6, facets flat, fold angle varies). Say so in `core/simulate/model.ts`'s header; the book's wording for why a fold can be
   "impossible" in one model and fine in another also explains why a flat-foldable gadget can be unreachable by rigid motion.
4. **P3 [doc] Drawing convention (pp. 7–8).** The book argues dash-and-chain lines "dissolve into a visual morass" on dense patterns and
   recommends "CP colouring": mountain dark, less saturated, solid; valley lighter, more saturated, dashed. 7.1 chose the diagram
   convention (M red dash-dot, V blue dashed). Consider a second preset in `crease-style.ts` for dense or A4-printed patterns.
   Cite p. 8 in the choice either way.
5. **P3 [test] Valid vs unique stacking (pp. 9–10).** A crease pattern does not fix the stacking order; two valid orders for one
   assignment is normal (Fig. 1.4). `layerOrder` returns one; an optional `countOrders` or "is the order unique" helper (via
   `mvSolutions` over the pair variables) would let tests assert uniqueness where the book says unique and non-uniqueness where
   it says two.

---

## Deep read: Ch. 1, §1.2.5–1.5 (pp. 27–42: Maekawa, vertex type, degree-2 and degree-4 vertices, half-planes)

**Confirmations**
- Degree-2 vertex (§1.3): flat-foldable only when collinear and both creases the same assignment. `localMvClauses` degree-2
  case and `creaseLines` merging match.
- Degree-4 assignment counts (§1.4): unique smallest sector 4 assignments, symmetric bird's-foot 6, right vertex 8. The Phase 4.1
  exhaustive test already agrees with these; they are the named values behind it.

**Changes and additions**
1. **P2 [test] Cite and assert the 4 / 6 / 8 counts.** In `core/solve/clauses.test.ts`, add explicit expectations by vertex class
   (distinct sectors, two consecutive smallest, all 90°) with Thm 7 and Figs. 1.27–1.29 in the name. It pins the encoder to the book,
   not only to the brute-force helper.
2. **P2 [exact] Closed form for the missing fourth crease (§1.4.4, Figs. 1.30–1.33).** With directions d₁, d₂, d₃ (complex numbers, up to a
   positive scale), KJT fixes the fourth crease at φ₄ = π + φ₁ + φ₃ − φ₂, so d₄ ∝ −d₁·d₃·conj(d₂): one product, no square root, so exact in
   Z[ω]. A helper `completeDegree4(d1, d2, d3)` in `core/lattice/direction.ts` would let gadgets and the Phase 8 generators build
   Kawasaki-valid vertices by construction instead of by search (the star twist crease set was found by exhaustive search in 3.6).
3. **P2 [test] Theorems 9–11 (half-planes, p. 41) as cheap post-conditions.**
   - Thm 9: every half-plane at a flat-foldable degree-4 vertex holds at least one majority crease.
   - Thm 10: in the flat-folded form every crease at an interior vertex lies in a common half-plane. Check it on the `foldFaces` output
     at every interior vertex of every gadget; it is the book's own filter for spurious numerical solutions.
   - Thm 11: a vertex that can be at least partly folded cannot have a half-plane with no mountain and another with no valley.
     A necessary condition for the viewer: if the settled simulation violates it, the fold is not a real partial fold.
4. **P2 [test] Vertex colour (p. 29).** A mountain-like vertex (M − V = +2) is white in the folded form; valley-like is coloured. With the
   face colouring from the §1.1 note and `topFaceAt` near each interior vertex, the visible colour should equal the vertex type.
   An independent check on `layeredView` that needs no new solver. Verify on the hexagon twist before making it a rule.
5. **P3 [exact] Vertex type as a word and canonical form (§1.2.6).** A vertex type is the M/V word read counter-clockwise, defined up to rotation.
   Rotation-canonical words (necklaces) would give a compact key for de-duplicating assignments in `mvSolutions` and for the
   symmetric counts N(n) in the Ch. 3 log.
6. **P3 [doc] M − V = ±2 argument assumes non-self-intersection (p. 28, Fig. 1.20).** Maekawa is not a pure isometry fact; it already needs
   injectivity. Worth one line in `maekawaFlat`'s TSDoc so nobody expects it to hold on ghost paper.

---

## Deep read: Ch. 1, §1.5.3 (rest)–1.7 (pp. 46–77: LFF graph, vector formulations, algebraic Kawasaki)

**Confirmations**
- The exact Kawasaki test (`Q = Π d₂ₖ·conj(d₂ₖ₋₁)` is a negative real) is the book's Algebraic Kawasaki-Justin Condition (§1.6.8, Eqs. 1.47–1.52)
  in complex form; it also avoids the book's "spurious cyclic order" trap because directions are sorted exactly by `compareAngle` first.
- `creaseReflection` z ↦ p + (d/d̄)·conj(z − p) is Eq. 1.33 (p' = p − 2u(p−q)·u/(u·u)) in complex form.
- Line crossing in `fromSegments` is Eq. 1.35/1.37 (det form); parallel lines are exactly "det = 0".

**Changes and additions**
1. **P1 [exact] Big-Little-Big at border vertices (p. 52, Fig. 1.45).** A border vertex has no KJT or MJT, but a strict small sector between two
   paper sectors still forces its two creases to be anto, and that edge joins the LFF graph. Fig. 1.45 passes KJT and MJT at both interior
   vertices and still has no locally valid assignment because of one border vertex. `vertexClauses` and `smallSectorRuns` look at interior
   vertices only, and the gadgets end every ray on a "B" frame vertex, so Phase 4's `solveMv` can return assignments the layer stage later rejects.
   Encode BLB (and only BLB) at border vertices for sectors that lie inside the paper and are bounded by two M/V/U creases. Test: a
   Fig. 1.45-style pattern (two interior vertices valid, one border vertex with a strict small sector) must be `unsat` at 4.2, not only at 5.x.
2. **P1 [test] The impossible triangles (Figs. 1.40, 1.41, 1.44).** Three patterns where KJT and MJT hold at every interior vertex but an
   odd-anto loop in the LFF graph kills every assignment (Hull's triangle, Kawasaki's pattern with 11 anto lines, and the two-degree-8 version
   with 17 creases, 2¹⁷ naive assignments). They are concrete, published `unsat` fixtures for `solveMv` and `mvConflict`, with expected
   conflict vertices. The book gives sector angles in the figures; reconstruct them on the 30° lattice where possible, otherwise as exact
   rational-direction patterns.
3. **P2 [exact] LFF graph as a second solver (p. 47).** For all-distinct sectors the assignment space is exactly 2^(components), with parity
   propagated by union-find (blue/iso = 0, red/anto = 1). Use it as (a) a fast independent oracle for the DPLL result and its count, and
   (b) a better `mvConflict` explanation: the odd loop itself. It cannot replace the SAT encoding when sectors tie, because ties add options
   (p. 52: degree 4 goes 2 → 4 → 8).
4. **P2 [exact] Rational affine maps.** The book's reflection formula (Eq. 1.33) is rational for any rational line; `creaseReflection` is an
   integer `Affine` only for the 12 lattice mirror directions and throws otherwise (5.1a). A reflection in a line with direction d over Q(ω)
   has coefficients d/d̄ ∈ Q(ω), so it is an exact map with a common denominator. Generalising `Affine` (BigInt numerator + denominator) would let
   `foldFaces`, `stackingClauses` and every later stage handle gadgets with non-30° creases, which Ch. 3–4 twists (any rational tan α) need.
5. **P3 [doc] Numerical stability if the float stage ever solves for geometry (§1.6.9).** Diagonal entries of the rotation-product matrix
   have a vanishing gradient at the root (double root) and may never reach 1 in floating point; the robust form is "off-diagonal = 0 plus
   a sign inequality on a diagonal entry". Not needed for the exact validators; it matters if Phase 8 ever searches over float coordinates
   (see also §9.5.1 planarity constraints).
6. **P3 [doc] Spurious solutions of developability (Eq. 1.43).** The rotation-product form accepts Σα = 2πn; degree-6 with all α = 2π/3 sums to
   4π. Irrelevant for planar patterns, relevant only for 3D vertex work.

---

## Deep read: Ch. 2, §2.1–2.3.3 (pp. 79–111: periodicity, tiles, Huffman grid, Yoshimura, Miura-ori)

**Confirmations**
- A finite pattern is "periodic" only as a piece of an infinite one, and shows two or more repetitions (p. 80); `tile(group, motif, R)` already
  works on this assumption (a window of the orbit).
- Layer order is not periodic just because the crease pattern is (p. 82, Figs. 2.4–2.6): double pleats can be ordered independently.
  `layerOrder` returning one of many models, and `order: null` for rings, are consistent with this.
- Vertices in a network cannot be designed independently; loops must agree (p. 79). That is the LFF odd-loop condition again.

**Changes and additions**
1. **P2 [exact] Miura-ori fits the lattice (§2.3.3, Fig. 2.32).** A Miura-ori is three numbers: minor-fold length d₁, major-fold length d₂, and
   angle α (acute, 0 < α < 90°). The book's baseline (d₁ = 1, d₂ = 1, α = 60°) is rhombi on the triangular lattice, and α = 30° is also on the
   lattice's 30° directions. So the PLAN's "Miura-ori closed-form generator" side module can be exact-integer for α ∈ {30°, 60°}, with
   zigzag (major) folds equal parity along the line and alternating between neighbouring zigzags, and straight (minor) folds collinear and
   alternating along the line (p. 108). Acceptance test: Kawasaki, Maekawa and BLB hold; `layerOrder` is `ok` with a linear order; M/V solver
   returns exactly the two global flips (all vertices degree 4 with a unique smallest sector, so parity is forced).
2. **P2 [float] Larger α trades compactness for coupling (Figs. 2.33–2.35).** As α → 90° the stowed form shortens and there are more layers, but
   folding becomes two-stage (major folds first, minor folds last), which shows up as a stall in the `relax` sweep. Use this as an
   expected-behaviour test for `foldSweep` on a Miura patch (monotone major-before-minor ordering) once the generator exists.
3. **P3 [exact] Huffman grid generator (§2.3.1, pp. 92–99).** Any degree-4 vertex with three creases of one type and one of the other, not all
   sectors 90°, and the three like creases not in one half-plane, tiles into a doubly periodic pattern with one degree of freedom (rigidly
   foldable) but not flat-foldable. The generating vertex fixes two crease lengths; the other two come from the intersection of rotated
   copies; all four lengths must be > 0 (a length of 0 merges two degree-4 vertices into a degree-6 vertex, p. 100). The symmetric
   (mirror) vertex gives the chicken-wire pattern (pure translation and rotation). Side-module candidate; needs the float stage and
   `simulate`'s rigid-motion checks.
4. **P3 [exact] Yoshimura pattern (§2.3.2).** Degree-6 vertices with sector constraints α₁+α₂+α₃ = 180° and α₄+α₅+α₆ = 180° (Eq. 2.1), one valley length
   plus four sector angles define the whole pattern, and a degree-n vertex has n − 3 degrees of freedom. Closed-form, exact on the
   lattice for 60°/60°/60° and 30°/… splits. Pairs with the PLAN's "Yoshimura, waterbomb, Resch" item.
5. **P3 [exact] Reverse-and-offset splice (Figs. 2.29–2.30).** Miura-ori is built from a Yoshimura patch by splitting it, inverting crease parity
   in one half, shifting that half by half the vertical period, and rejoining; degree-6 vertices on the seam become degree 4. A reusable
   `pattern/` operation ("splice with parity flip and offset") for Phase 8 variation, and a reminder that parity flip alone is not enough.
6. **P3 [test] Tile lines on creases (pp. 87–88).** When tiles are joined along a line that is also a crease, exactly one tile may own it or the
   crease is duplicated. `fromSegments` throws on conflicting duplicates; add a test that identical-assignment duplicates from two joined
   lattice patches are accepted as one edge (the book's rule) and conflicting ones throw.
7. **P3 [doc] Minimal doubly periodic tile (p. 91).** One degree-4 vertex per tile is impossible (M/V parity plus collinearity forces at least degree 6).
   Useful framing for why the smallest lattice motifs in 2.3 have degree-6 vertices.

---

## Deep read: Ch. 2, §2.3.3 (rest)–2.4.3 (start) (pp. 111–138: Miura variations, Mars, hybrids, semigeneralized Miura-ori)

**Confirmations**
- A flat-foldable degree-4 vertex does not need to be a symmetric bird's-foot (§2.3.5): any (α₁, α₂, 180°−α₁, 180°−α₂) works. The exact
  Kawasaki test accepts these without special cases, and `localMvClauses` already covers the 4/6/8 assignment classes.
- The book repeats that the single-degree-of-freedom claims are "a mathematical approximation" and real paper is looser (p. 127). This is the
  same caveat as PLAN's "3D animation is approximate".

**Changes and additions**
1. **P3 [exact] Mars as two generating lines (§2.3.5, Figs. 2.44–2.47).** The generating vertex has two opposite 90° sectors and two opposite
   sectors α, 180° − α. The whole pattern follows from two zigzag "generating lines" (bottom row and left column): copy one chain at each
   vertex of the other, alternating M/V, then fix any iso acute angle by swapping the copied chain's assignment (step 4). That is a
   Minkowski-sum-like construction and exact whenever the chains are lattice paths. On the 30° lattice α ∈ {30°, 60°} works (sectors 90/30/90/150), so
   an exact "Mars" side module is feasible alongside the Miura-ori one. Parallelogram cells make every cross-column crease equal in length, so
   no crossing can occur.
2. **P3 [exact] Generalized Mars needs mirror copies (§2.3.6, Fig. 2.50).** For a non-mirror-symmetric generating vertex the mountain-like copies must be
   mirror images, and cell opposite sides are no longer equal, so lengths come from intersecting rays vertex by vertex; patterns can eventually
   cross themselves (p. 123). `symmetry/` has p6m reflections, so mirrors are available; the crossing failure maps onto `fromSegments`' planarity
   `RangeError` and is a natural negative test.
3. **P3 [exact] Yoshimura-Miura hybrids as a tile grammar (§2.4.1, Fig. 2.53).** Four vertical tile types, each mating with exactly two others (one gives a
   Yoshimura-like, one a Miura-like section). Tiles of different α mate too (p. 127). A small finite-state generator of strip sequences is an
   obvious Phase 8.1 sweep (choose a path through the grammar, number of rows, α), and each result is checkable by `nearFoldability`.
4. **P3 [exact] Semigeneralized Miura-ori from a generating line (§2.4.2, Figs. 2.57–2.58).** Path → parallel pairs offset on both sides → alternate left/right
   guide lines → polygons rearranged into a strip, with minor (centre) folds alternating and major (diagonal) folds assigned so every vertex is a
   bird's-foot. Validity limit: two consecutive bends in the same direction impose a minimum strip width, at which the two bird's-foot
   vertices merge into a Yoshimura vertex (Fig. 2.63, p. 135); wider strips cross. Use as a test of `fromSegments` (at the minimum width the
   merged degree-6 vertex is accepted and Kawasaki holds; just wider, it throws a crossing `RangeError`).
5. **P3 [exact] Shallow-angle divot (p. 136).** A shallow bend β is replaced by three bends (−90° + β/2, 180°, −90° + β/2) to keep every bend sharp enough
   for a legal strip width; angled collinear with one side it becomes a crimp (Fig. 2.66). A reusable gadget idea for any future path or
   strip generator.
6. **P2 [test] Equal-magnitude fold angles on Miura-like patterns (p. 128).** In a Yoshimura-Miura hybrid (and Miura-ori) all major folds have one fold-angle magnitude and
   all minor folds another, with M/V signs; the two differ at every non-flat state. When a Miura generator exists, assert it on the settled
   `relax` state (to within `RENDER_TOLERANCE`-scaled strain): major/minor equality plus sign rule is a much stronger 3D check than the
   existing sign rule alone.
7. **P3 [doc] Design workflow (p. 129).** The book designs by folding a strip along the target path and unfolding it. The same idea, "design the folded form, then unfold,"
   appears on p. 84 (Fig. 2.8) and §6.6.4. Relevant for Phase 8: a folded-form tile can be a more natural generator input than a
   crease pattern.

---

## Deep read: Ch. 2, §2.4.3–2.4.6 (pp. 138–164: predistortion, Tachi-Miura, triangulated cylinders)

**Confirmations**
- Joining the free edges of a Yoshimura strip into a tube removes its two degrees of freedom (pp. 152, 163); a free sheet remains "bendy even if every
  triangle is rigid." That is why the viewer's flat gadget sheets (free edges) can settle into several shapes and why `relax` needs a warm-started,
  path-following driver rather than a global minimiser (6.2b).
- Bistable patterns exist (two stable folded states, p. 154): a settled `relax` state is not unique in general. The driver's quasi-static warm start is
  the right choice; `foldSweep` determinism should be documented as "path-following", not "the" folded state.

**Changes and additions**
1. **P1 [test] Closed-form bird's-foot relations as an analytic oracle (Eqs. 2.2–2.8, p. 139).** For a symmetric bird's-foot vertex with sectors (α, α, π−α, π−α),
   major/minor fold angles γ₊, γ₋, bend angle β and ruling angle ζ = π − β satisfy
   tan(γ₊/2) / tan(γ₋/2) = sec α, sin(θ/2) = sin α cos(γ₋/2), cos(ζ/2) = sin α sin(γ₊/2), sin(β/2) = sin α sin(γ₊/2), tan(β/2) = tan α sin(γ₋/2).
   6.2a checks degree-4 closure with an independent spherical linkage, which is a residual test; this gives an exact target. For stiff panels the settled
   hinge angles at a bird's-foot vertex should satisfy tan(γ₊/2) = sec α · tan(γ₋/2) within a bound that shrinks as panel stiffness grows. Cheap to add to `simulate.test.ts`.
2. **P2 [float] Predistortion design formulas (Eqs. 2.9–2.11).** From a target path with bend angles βᵢ and minor-fold angle γ₋: αᵢ = tan⁻¹(tan(βᵢ/2) / sin(γ₋/2))
   (add π to negatives), vertex spacing d′ᵢ = (w/2)(cot αᵢ₋₁ + cot αᵢ) + dᵢ, total width W = 2 m w cos(γ₋/2). Useful if a later `app/` tool lets a user draw a
   cross-section and get a pattern; the flat-folded cross-section is deliberately sharper than the target (hence "predistortion"), which the flat-folded render
   will show and users will need to be told.
3. **P3 [float] Tachi-Miura property (§2.4.4, Figs. 2.74–2.78).** Replacing α by π − α flips the sign of the bend angle over the whole range, so two consecutive vertices with equal α
   keep the segments on either side parallel across all folds; mirroring a strip makes a tube that keeps its flanges parallel. A rigid-motion test target for
   `relax` (parallelism maintained to tolerance) once a strip generator exists.
4. **P3 [doc] Out of scope: triangulated cylinders / Kresling (§2.4.5–2.4.6, Eqs. 2.12–2.19).** The crease pattern lives on a cylinder (edges identified); `CreasePattern` is planar
   and `foldFaces` rejects faces with holes. Record the closed-form limits (|h₁² − h₂²| ≤ cot²φ, δφ < π − 2φ) in case an "identified edges" pattern type is ever added; no action
   for the current uncut-flat-sheet scope.
5. **P3 [doc] Degrees of freedom of a vertex (p. 102).** A degree-n vertex has n − 3 degrees of freedom; a Huffman grid (degree 4) has one, Yoshimura (degree 6) up to three per vertex
   and two globally when periodic. The bar-and-hinge solver's settle-time and the "which branch" ambiguity at the symmetric right-angle vertex (6.3 limit note) are consequences.

---

## Deep read: Ch. 2, §2.4.7–2.5 (pp. 164–192: waterbomb, Troublewit, stretched pleats, corrugations)

**Confirmations**
- A pattern with a single degree-4 vertex type has one degree of freedom; degree-6 grids gain a second motion (§2.4.7). Fine as background to the 6.3 note that the symmetric
  right-angle vertex is a branch point.
- The book again warns that thickness and springiness make "flat" patterns bulge (p. 187). Consistent with PLAN's "flat-folded render is the accurate one."

**Changes and additions**
1. **P2 [test] 1D strip fixtures for the layer solver (pp. 178–179, Fig. 2.107).** A strip folded along parallel creases has a canonical crease assignment: the cross-creases are assigned so that,
   on one side, edge A is never covered by a facet interior, and on the other side edge B is not (edge-on-edge coverage is allowed). This is a pure Justin non-crossing rule and gives
   an independent, constructive answer. Add strip fixtures to `stacking`/`layer-order` tests: given crease positions on a lattice strip, (a) the book's assignment is satisfiable, (b) the alternating
   M/V assignment is `unsat` exactly in the cases where the amber circles in Fig. 2.107 show a covered edge, (c) `nearFoldability`'s conflict faces lie around those circles.
2. **P2 [test] Scalability benchmark (pp. 87, 175).** Long strips and n×n Miura-oris are the natural large inputs; the PLAN risk line says the TypeScript solver may be too slow past the
   hexagon/star sizes (435 pairs, 66 ms). Record pair counts, clause counts and times for strips and Miura patches of increasing size, so the "port to Rust→WASM" decision is made on data.
3. **P3 [exact] Waterbomb tessellation (§2.4.7).** Square-grid pattern of degree-6 vertices obtained from a semigeneralised Miura-ori by shrinking the shortest segments to zero, with a second
   (cylindrical) motion and synclastic bending. The square waterbomb base lives on Z[i], not Z[ω]; it joins the "second lattice" item in the Ch. 5 log. Needs ≥ 5 rows to close into a tube, and
   collides with itself for five or more rows when kept periodic.
4. **P3 [doc] Out of scope: Troublewit, rotationally stretched pleats, Fujimoto pillars, corrugations (§2.4.8–2.4.9).** They rely on bending facets into curved forms and (for circles) on patterns that
   cannot be flat-folded with the proper assignment (p. 183). Nothing to change; noted so the scope boundary in CLAUDE.md ("uncut flat tessellation, flat-foldable target") stays explicit.
5. **P3 [doc] Glossary terms worth using consistently in TSDoc (§2.5):** *tile*, *tile line*, *generating vertex*, *generating line*, *Huffman grid*, *major/minor fold*, *crimp*, *pleat*,
   *predistortion*, *rigid foldability*, *crossing embedding*. "Crossing embedding" is exactly what `fromSegments` rejects; use the book's term in its docs.

---

## Deep read: Ch. 3, §3.1–3.2 and §3.6.1–3.6.5 (pp. 193–208, 243–264: folding twists, triangle twists, irregular and Brocard-polygon twists)

**Confirmations**
- Collapse: tessellations usually have no step-by-step folding sequence; every crease is made first and all fold at once (pp. 205–206). That is the model behind `relax`'s all-creases-at-once drive (6.2) and
  behind 7.2's "pre-crease, then collapse".
- Rotation of the central polygon is 2α (§3.4.3): the square twist turns the centre 90°, the hexagon twist 120° (Figs. 3.4, 3.7). A hexagon twist rotating the centre by 120° means α = 60°, matching the
  reading of `hexagonTwist` from the first pass (sectors 60/60/120/120).
- Only 2- and 3-cycles of overlapping pleats matter (pp. 251–253): a cycle needs a common overlap point, and a longer cycle with directions not in one half-plane contains a 2- or 3-cycle. That agrees with
  restricting `transitivity` clauses to triples that share an interior point (5.1b) and with the "pairwise-overlapping ring may be stacked cyclically" rule.

**Changes and additions**
1. **P1 [exact] 30° twists on the lattice (Eqs. 3.16, 3.17; Table 3.2).** α = 30° is αsafe for every regular n ≤ 12 and equals αcrit of the equilateral triangle (tan⁻¹(sin³60°/(1+cos³60°)) = 30°). Pleat creases at 30° to an edge
   are lattice directions, so on the triangular lattice there are exact **triangle twists at α = 30° (closed-back, all four anto assignments plus the cyclic ones valid at any paper size)** and **hexagon twists at
   α = 30° (open-back, every one of the N(6) = 14 assignments valid at any paper size)**. The shipped gadgets sit at α = 60°, the largest angle: the hexagon is exactly closed-back (α = αcrit), and the triangle is
   supercritical (αcrit = 30°), foldable cyclic only because the paper ends (n ≥ 3m). Add an `alpha` (or `twist: "safe" | "critical"`) parameter and ship the α = 30° versions; they remove the finite-paper
   restriction and give valid-for-all-assignments fixtures for `mvSolutions` and `nearFoldability`.
2. **P1 [doc/design] Reconsider the "rejected" triangle-twist assignment (PLAN 5.2b).** The asymmetric `VVM MMM VVV` assignment that folds with a linear order at every size is exactly the book's supercritical twist
   (Fig. 3.42, left; Thm 21 and the summary on p. 245: for αcrit < α ≤ max(A,B,C) only not-all-equal assignments are possible, two or four of them). It is the version that is valid at any paper size for α = 60°.
   It is not 3-fold symmetric, but it is a real twist in the book's taxonomy; ship it as a named variant (like star `full`/`partial`) instead of only as a rejected alternative.
3. **P1 [test] Triangle-twist assignment counts (§3.6.1, Figs. 3.49–3.51).** For corner angles A, B, C and twist angle α: α ≤ αcrit → every assignment valid; αcrit < α ≤ max → exactly the not-all-equal ones (4 if α < min-corner
   conditions allow, 2 if α exceeds two corners); α > max(A,B,C) → none (Thm 21). A table-driven test over the equilateral triangle on the lattice (α = 30° vs 60°) checks `mvSolutions` counts against the book.
4. **P2 [float] General (irregular) twist conditions (Eqs. 3.20–3.28).** For interior angle θᵢ at each central-polygon vertex: mm/vv needs α ≥ π − θᵢ and θᵢ ≥ π/2; mv/vm needs α ≥ θᵢ and θᵢ ≤ π/2; MM/VV needs α ≤ θᵢ; MV/VM needs α ≤ π − θᵢ; every anto
   assignment is valid for α ≤ min over i of {θᵢ, π − θᵢ}; and αsafe also includes the 2- and 3-cycle critical angles (Eq. 3.28). Needed as soon as non-regular tiles (Ch. 4 triangle tiles, Ch. 6 shrink-rotate on irregular tilings) are
   generated, because they replace 360°/n by each exterior angle.
5. **P2 [float] Brocard (closed-back) polygons (§3.6.4–3.6.5, Eqs. 3.33–3.47).** A closed-back twist exists for corner angles {θᵢ} only at the solution of sinⁿα = Π sin(θᵢ − α) (transcendental; the clockwise angle is π − α_ccw).
   Side lengths follow from rᵢ₊₁ = rᵢ sin(θᵢ − α)/sin α and sᵢ = rᵢ sin θᵢ / sin α. Analytic cases: equilateral triangle 30°, square 45°, hexagon 60°, parallelogram/symmetric trapezoid αcrit = sin⁻¹(sin θ/√2) (37.76° at θ = 60°).
   For open-back twists of a Brocard polygon the hole is a shrunken, rotated copy of the polygon with ρ = sin(αcrit − α)/sin αcrit (Eq. 3.47). Use as an exact (regular) and numeric (irregular) oracle for the folded-form tile of a twist.
6. **P2 [test] Central polygon rotates by 2α.** Add to `hexagon-twist.test.ts` (and the new 30° variants): the `foldFaces` transform of the central face relative to an outer wedge is a rotation by 2α (120° at α = 60°, 60° at α = 30°), exactly
   (a product of two reflections in parallel pleat creases, then the edge reflection).
7. **P3 [exact] Cycle bounds for irregular twists (Eqs. 3.26–3.27).** 2-cycle critical angle αcrit,i,j = max(αᵢⱼ, αⱼᵢ) over non-adjacent pairs; 3-cycle only counts when the three pleat directions are not in one half-plane (else π/2).
   Cheap to compute exactly for lattice tiles and a far faster necessary check than building `stackingClauses`, useful inside the Phase 8 search loop.
8. **P3 [doc] Momotani's Wall (Figs. 3.9–3.10, pp. 201–206).** An array of square twists that is simultaneously flagstone, iso-area (crease pattern invariant under M/V swap plus reflection) and rigidly foldable. A good named target for the
   Z[i]/square-lattice extension in Ch. 5 and for the future rigid-fold generator; not reachable on the triangular lattice.

---

## Deep read: Ch. 4, §4.1–4.5 (pp. 271–318: tile mating, vertex figures, tile math, folded-form tiles, triangle tiles)

**Confirmations**
- A tile is "a crease pattern that can be joined with others to make one crease pattern with no holes that folds together" (p. 277); the Principle of Mating needs a single unbroken join line (p. 274). The planar,
  hole-aware `CreasePattern` and the Phase 3.7 `holes` check are the right guard for a future tile joiner.
- Triangle tile: the centre of shrinkage and rotation is the circumcentre for every (w, τ) (§4.5.1); for the equilateral triangle that is the centroid, consistent with `triangleTwist`'s 120° rotation ρ(z) = ωz + n.

**Changes and additions**
1. **P1 [exact] Vertex-figure enumeration as a pure function (§4.2, Eq. 4.4, Figs. 4.27, 4.31).** k polygons n₁…n_k fit around a point iff k − 2 = 2·Σ1/nᵢ (a Diophantine equation): 17 solution sets, 21 cyclic-and-reflection-distinct arrangements
   (canonical form: lexicographically smaller of the sequence and its reversal, up to rotation), 15 tileable, 11 Archimedean; only 8 have even degree (the offset-twist set: 3⁶, 3.3.4.12, 3.4.3.12, 3.3.6.6, 3.6.3.6, 3.4.4.6, 3.4.6.4, 4⁴).
   A small `core/tiling/vertex-figure.ts` with property tests (angle sum = 2π in exact rational multiples of π, count = 21, 8 even) is a natural first step of the tile layer and needs no geometry.
2. **P1 [exact] Which tilings the triangular lattice supports.** Only vertex figures made of triangles and hexagons have all vertices in Z[ω]: 3⁶, 6³ (hexagon-centred), 3.6.3.6 and the 3.3.3.3.6/3.3.6.6 variants only if their polygon vertices land on lattice points; squares and 12-gons need Z[i] or
   Z[ζ₁₂] (the latter is Z[ω, i]). Document the lattice support per tiling in the vertex-figure module and decide on a general cyclotomic exact type (a ring Z[ζ₁₂] with the same checked-integer arithmetic as `Eisenstein`) before 4.4.6-style tilings.
3. **P2 [float] Centered tile closed forms (Eqs. 4.14–4.20).** tan α = w tan τ (independent of n); τ = cot⁻¹(w cot α); shrinkage ρ = √(cos²τ + w² sin²τ); rotation β = tan⁻¹[(1−w) sin 2τ / ((1+w) + (1−w) cos 2τ)]; centred tile is self-contained iff τ ≤ π/n.
   Tests for any tile generator: α recovered from the constructed `q` points equals tan⁻¹(w tan τ); α is the same for n = 3…8; ρ and β match the vector formula (Eqs. 4.9–4.13). A test oracle that needs no folding.
4. **P2 [float] Offset tile closed forms (Eqs. 4.21–4.28).** α = tan⁻¹[(w/2d) cot(π/n)] (depends on n); w = 2d gives α = π/2 − π/n = αcrit (closed-back); ρ = √(w² + 4d²(sec²(π/n) − 1)) = √(w² + 4d² tan²(π/n)) and β = π/2 − α; self-contained iff n > 3 or w ≤ (1 − 6d)/3.
5. **P2 [exact] Non-self-contained tiles and negative creases (§4.3.2, Figs. 4.35–4.37).** With large w and small τ the central polygon spills out of its tile and some tile creases have negative length. The fix: between two tiles replace each pair (qᵢ,rⱼ),(rⱼ,qⱼ) with the single edge (qᵢ,qⱼ); on the pattern border extend all creases to a new frame
   enclosing all central-polygon corners. This is the same "B frame ring" idea as `hexagonFrame`, and the rule to implement if tiles are ever assembled from (w, τ) rather than placed by hand. Small twist angles are the versatile ones (many valid assignments), so these tiles matter.
6. **P2 [test] Folded-form tiles (§4.4, Eqs. 4.29–4.32).** The folded form of a centred tile equals a crease-pattern tile of the same species with parameters w′ = −w/(1 − 2w), τ′ = tan⁻¹[(1 − 2w) tan τ] (negative w reverses the order in which creases meet); for offset tiles w′ = −w/(1−2w), d′ = d/(1−2w).
   That is an exact, analytic prediction of the flat-folded outlines. `foldedToSvg`/`layeredView` computes the folded form by BFS reflections; for any tile built from (w, τ) the visible polygon vertices should match the (w′, τ′) tile after a similarity. A strong end-to-end check that needs no layer solver.
7. **P2 [doc] Design workflow (p. 309, Figs. 4.42, 4.44).** Design with folded-form tiles to preview the result, then swap in crease-pattern tiles to get the pattern; the true folded form matches the preview except at the paper edge. Natural Phase 7/8 UI: the exact flat-folded outline is shown first and the crease pattern derived from it.
8. **P2 [float] Triangle tiles (§4.5, Eqs. 4.33–4.37).** Any triangle with corner angles θ₁, θ₂, θ₃ takes a centred twist tile with the same α as regular tiles; critical angle αcrit = tan⁻¹[sin θ₁ sin θ₂ sin θ₃ / (1 + cos θ₁ cos θ₂ cos θ₃)] (Eq. 4.33).
   Offset triangle: α = tan⁻¹[(w/2d)·tan αcrit] = tan⁻¹[(w/2d)(sin θ₁ sin θ₂ sin θ₃)/(1 + cos θ₁ cos θ₂ cos θ₃)] (Eqs. 4.34–4.35), ρ = w csc α, β = π/2 − α, closed-back when d = w/2; for offset tiles the centre of shrinkage/rotation depends on (w, d) (unlike the circumcentre for centred tiles). Gap-fillers for tilings that include non-equilateral triangles (heptagon + squares + isosceles triangles, Figs. 4.48/4.51).
9. **P3 [doc] Species and genus vocabulary.** *Species* = one (w, τ)/(w, α) or (w, d) value; *genus* = centred vs offset; tiles mate only within a species. Use these words in module headers so the Phase 8 "random motif" generator is described as sampling species, not "random geometry".

---

## Deep read: Ch. 4, §4.6–4.7 (pp. 319–343: cyclic polygon tiles, offset higher-order, pathological and split-twist tiles)

**Confirmations**
- Even-n cyclic polygons satisfy a Kawasaki-like condition on their corner angles (θ₁ − θ₂ + θ₃ − … = 0, Eq. 4.53); the perpendicular bisectors meet at the circumcentre in a flat-foldable vertex (p. 325). Same alternating-sum
  structure as `kawasakiFlat`; the exact test applies unchanged.
- Whether a tile is flat-foldable can fail on a large class of "nice" polygons (kites, rectangles for offset twists, parallelograms): the twist angle varies around the central polygon (p. 333). Phase 8's "random motif + repair"
  must expect most random tiles to fail local checks; the validators already report which vertices fail.

**Changes and additions**
1. **P2 [exact] Kawasaki excess κ and the split-twist repair (§4.6.6, Eqs. 4.62–4.64).** For a vertex with alternating angle sum κ = β₁ − β₂ + β₃ − β₄ (generally ≠ 0), a degree-6 split with an inserted sub-triangle can make it flat-foldable only when κ > 0
   (κ = 2β₁ᵦ, so β₁ᵦ > 0); only the positive-κ corners of a non-foldable twist qualify, giving exactly two constructions (Figs. 4.66–4.67). This is a local, constructive repair that adds creases, the opposite of Phase 5's repair by dropping faces (`nearFoldability`).
   Candidate operator for Phase 8.2: compute κ at every failing interior vertex (exact: the sign of arg Q relative to π from `orientation`), report it from `checkLocalFlatFoldability` as the Kawasaki excess, and offer the split as a repair. Maekawa then fixes two of the three new creases once the third is chosen (p. 338); self-intersection must still be checked with `stackingClauses`.
2. **P2 [float] Cyclic polygon construction (§4.6.2, Eqs. 4.38–4.50).** Given interior angles θᵢ, the central angles ψ solve θ = π − Mₙψ with circulant Mₙ; nonsingular for odd n (unique polygon), singular for even n with one free parameter ζ along the alternating null vector (Moore-Penrose pseudoinverse entries in Eq. 4.49).
   Needed only if centred tiles are generated for polygons other than regular, triangles and symmetric trapezoids; every rectangle and mirror-symmetric trapezoid is cyclic, rhombi/kites/parallelograms are not in general.
3. **P2 [float] Generic offset polygons (§4.6.3–4.6.4).** Only regular polygons, triangles and symmetric trapezoids (closed-back condition; ρ, β, α, αcrit in Eqs. 4.56–4.60) work for every (w, d); a polygon is generic for offset twists iff it is cyclic and a Brocard polygon, and only two corner angles can be chosen freely (Fig. 4.62).
   For a trapezoid with base angle θ: αcrit = sin⁻¹(sin θ/√2), diagonal side √(2 − sin²θ) − cos θ. As θ → 60° the permissible (w, d) range shrinks because the central polygon sinks toward the base.
4. **P2 [test] Pathological-tile detector (§4.6.5, Figs. 4.63–4.65).** Check a built tile for: (a) twist angle varying around the central polygon, (b) retrograde central polygon (orientation reversed, `faceDoubledArea` < 0), (c) reflex or self-crossing central polygon. `creasePattern`'s planarity `RangeError` already catches crossings,
   but a generator needs a soft report (which vertices, which angle) rather than an exception. Add as `tileDiagnostics` when the tile layer exists; test with the book's coordinates: parallelogram ((0,0),(1,0),(1.5,1),(0.5,1)) and ((0,0),(1,0),(1.2,0.5),(0.7,0.95)) with the listed (w, d).
5. **P3 [test] Cross-tile compatibility check.** Tiles of one species mate edge to edge; assert for any pair of generated tiles that creases hit a shared edge at the same position and angle (same (w, τ)/(w, d)) before joining, and fail loudly otherwise. This is the Principle of Mating as a precondition.
6. **P3 [doc] Glossary (§4.7):** *self-contained*, *species*, *genus*, *tilt angle*, *vertex figure*, *split twist*, *generic polygon*. Use in headers when the tile layer is added.

---

## Deep read: Ch. 5, §5.1–5.6 (pp. 345–403: Archimedean, edge-oriented, k-uniform, other shapes, grid, non-periodic tilings)

**Confirmations**
- Tilings are described by a lattice (two lattice vectors) plus a lattice patch (polygons with offset and rotation), Table 5.1 (p. 356). `tile(group, motif, R)` is the same idea with a symmetry group in place of two vectors; `Motif = {points, edges}` is a "patch".
- The "scaffold" view (p. 302): tile vertices {rᵢ, sᵢ} are not creases; they are scaffolding removed after construction. Matches how a lattice window is scaffolding and only chosen edges become creases.
- Grid tessellations (§5.4.5): real tessellators start from a prefolded N×N or N×N×N triangular grid, usually N = 16, 32, 64, and add folds that connect grid vertices. That is the lattice-first approach this project already takes.

**Changes and additions**
1. **P1 [exact] Two-colourability as bipartiteness of the tile adjacency graph (§5.3.2, p. 366).** A tiling (or a crease pattern, §1.1.1) is two-colourable iff the tile/face adjacency graph is bipartite; offset-twist tilings need it (even degree at every interior vertex), centred ones do not.
   `faceAdjacency` already gives the graph for a crease pattern; add one shared BFS `twoColor(adjacency)` returning the colouring or an odd-cycle witness, and use it for (a) CP facet colouring, (b) "can this tiling take offset twists", (c) the sign of d for each tile.
   Counts to test against: 4 of the 11 Archimedean tilings are two-colourable (3⁶, 4⁴, 3.4.6.4, 3.6.3.6), 7 of the 20 two-uniform tilings.
2. **P2 [exact] Subdivision to make a tiling two-colourable (§5.4.4, Figs. 5.44–5.46).** Dividing a polygon into triangles by a fan from a new centre vertex adds a vertex of degree n; subdividing half the octagons of 4.8.8 into eight triangles makes it two-colourable. Useful as a tiling operator and a repair for
   "offset twists need even degree". Also: a square → four cyclic quadrilaterals (one free angle); a hexagon → six cyclic quadrilaterals (Fig. 5.45, gives unexpected squares and rectangles in the folded form).
3. **P2 [exact] Grid-exact species on the triangular lattice (§5.4.5, pp. 390–391).** "Only particular combinations of tilt angles, pleat widths and offsets put folds on tractably small grids." On the lattice τ ∈ {30°, 60°, 90°, …} and rational w give crease lines from lattice directions with rational endpoints, so the tile is exact in Q(ω).
   Example: τ = 60° and w = 1/3 gives tan α = w tan τ = 1/√3, α = 30° exactly, with the pleat edge-division 1/3 : 1/3 : 1/3 on a grid of edge 3. That is the one-line statement of which (w, τ) the exact-integer convention can represent. Enumerate all (w = p/q ≤ 1/2, τ ∈ lattice angles, q ≤ 12) and record which have a lattice-direction central polygon (α multiple of 30°) so `core/gadgets` can generate them without floats.
   Note the central-polygon edges are not lattice directions unless α is a multiple of 30°, so general species also need the rational-affine extension noted in Ch. 1.
4. **P2 [exact] Archimedean lattice patches as data (§5.2.2–5.2.3, Table 5.1).** Each tiling = two lattice vectors given as sums of unit vectors u(kπ/6) (a list of fractions of π) + polygons given by (n, offset list, rotation fraction). These are Z[ζ₁₂] elements (all angles multiples of π/6 or π/12 for the 12-gons); for the triangular lattice they are in Z[ω] when all angles are multiples of π/3. Encode Table 5.1 verbatim as test data once a `Tiling` type exists; property: patch area × lattice-cell count = cell area, every vertex figure matches the tiling's name.
5. **P2 [exact] Edge orientation determines M/V (§5.3.1, Eq. 5.8, Figs. 5.10–5.12).** Orient every tile edge with an arrow; the arrow fixes the pleat assignment of the two tiles meeting there (centred: opposite parity; offset: matching and mirror). A fully oriented tiling has 2^Nₑ choices, 2^(Nₑ − N_b/2) per periodic lattice patch (N_b = patch border edges). Phase 8.1/8.2 can sample orientations instead of raw M/V, which keeps matching by construction. Each sample is then checked with `nearFoldability`.
6. **P3 [exact] k-uniform and isohedral tilings (§5.4.1–5.4.4).** 20 two-uniform tilings, 107 isohedral tile types, 17 edge-to-edge quadrilateral and 9 edge-to-edge pentagon isohedral tilings (Cairo among them: all sides equal, two non-consecutive angles sum to 180°). Pentagon tilings always contain degree-3 vertices, so offset twists are impossible on them. A larger catalogue is a data task, not an algorithm.
7. **P3 [exact] Goldberg and self-similar tilings (§5.5).** Goldberg tilings are isosceles triangles with apex 2π/m, n rings, with offset (spiral) variants; offset-twist versions need m = 2(2k + 1) (the smallest non-trivial is m = 10) because only those are two-colourable. The m = 6 case is exactly the triangular lattice, the only one exact in Z[ω]. Self-similar double-spiral tilings: vertices pᵢ,ⱼ from Eq. 5.11, symmetric winding angle ω = log(sec(π/m) + tan(π/m)) for cyclic kites (Eq. 5.13), with an infinite number of ever-smaller tiles toward the centre, cut off at a circle and capped with an m-gon plus triangles (Fig. 5.66). Rotation groups other than 6-fold need Z[ζ_m] and floats.
8. **P3 [doc] Scope reminder.** The tile catalogue (squares, 12-gons, pentagons…) is only partly reachable on the triangular lattice; everything else is the float/render side. A "which tilings are exact in Z[ω]" table in `docs/` would save a decision later.

---

## Deep read: Ch. 6, §6.1–6.4 (pp. 405–442: shrink-rotate, properties, nonregular polygons, Maxwell reciprocal figures)

**Confirmations**
- Shrink-rotate guarantees Kawasaki-Justin at every interior vertex (not local or global foldability); the validators and `stackingClauses` are the next two steps the book names (pp. 412–413: Kawasaki → local → global). `docs/PLAN.md` "Known risks" already says the same.
- Planarity enforcement matches the book's "crossing embedding is not a crease pattern" rule (§2.3.1, §6.4.2): a dual graph with crossing edges poisons the whole tessellation.

**Changes and additions**
1. **P1 [exact] Shrink-rotate is exact in Q(ω) (§6.1–6.2, Eqs. 6.1–6.5).** The map z ↦ c + λ(z − c) with λ = ρe^{iβ} is a complex multiplication. If the polygon centre c is rational (the centroid of a lattice polygon is) and λ ∈ Q(ω), every new vertex stays in Q(ω), so the construction is exact in this project's arithmetic and Kawasaki can be checked by the existing exact test; ρ and β never need to be computed.
   Algorithm: for every (tile f, tile vertex v) place v′ = c_f + λ(v − c_f); crease v′ₓ to v′_y when the two tiles share v; each interior tiling vertex of degree d then becomes a d-gon twist. Property test (fast-check): for the regular-polygon tilings available in Z[ω] (3⁶, 6³, 3.6.3.6 and sub-tilings) and any λ with |λ| < 1, every interior vertex of the result passes `kawasakiFlat`.
   Negative control (Fig. 6.4–6.5): the rhombus tiling shrunk and rotated about polygon centres fails Kawasaki, because the twist angle alternates 60°/120° around a rhombus.
2. **P1 [exact] Maxwell condition as an instant feasibility test (§6.4.1, Eqs. 6.22–6.29).** For a facial plane graph with F faces, E edges, E_b border edges, V vertices: excess DOF = 2F − E + E_b − 3; a reciprocal figure exists for every embedding only if F + E_b − V ≥ 2 (equivalently F − V_i ≥ 2, E + E_b − 2V ≥ 1). For large patterns it forces average face degree ≤ 4 + (E_b − 6)/F. All inputs come from `faceCount`, edge counts and the Euler relation already tested in Phase 3.1; add `maxwellExcess(cp)` and report it for every generated tiling before any dual is built. It is sufficient only for generic embeddings; symmetric ones (Fig. 6.13) can solve despite a negative excess.
3. **P2 [exact] Orthogonal interior dual graph by linear algebra (§6.3.2–6.3.3, Thm 23).** Unknowns: one dual position p_f per tile; constraints: (p_f − p_g)·e = 0 for each interior edge e. This is a homogeneous linear system with rational coefficients, solvable exactly with BigInt fractions; the solution space has dimension DOF + 3 (translation and one scale, §6.4.1). Then test planarity of the dual with the exact segment-crossing predicate already in `fromSegments` (every dual edge must have positive "signed length": no crossings, i.e. a spiderweb, p. 431).
   Kawasaki-validity of the resulting shrink-rotate tessellation is then guaranteed (Thm 23, "if and only if"). Translating, scaling or rotating the whole dual graph keeps validity (pp. 419–421); only orthogonality (δ = 0) minimises the parallelogram side m (Eq. 6.17).
4. **P1 [exact] Phase 8.2 recipe from the book: Voronoi–Delaunay + shrink-rotate (§6.4.5, p. 440).** Instead of random motifs plus repair: choose lattice points; compute the Delaunay triangulation with an exact BigInt in-circle determinant; circumcentres are rational, so the Voronoi dual is exact; orient the Delaunay edges; apply shrink-rotate with a rational λ. The result satisfies Kawasaki by construction (Thm 23), the crease assignment is fully determined by the edge orientation, and Delaunay maximises the minimum angle, which maximises the safe twist angle.
   That makes the SAT/layer stages verifiers instead of searchers for this family. The book warns random points give small twist angles (15° in Fig. 6.25); lattice-perturbed or phyllotactic point sets are the aesthetic ones.
5. **P2 [exact] Crease assignment from an oriented dual graph (§6.4.3, Fig. 6.17).** Each twist parallelogram has only two valid assignments (parallel edges opposite parity; the acute-angle creases anto), chosen by which of its two tiles lies on top; orienting the dual edge encodes it. So a shrink-rotate pattern has exactly one Boolean per interior primal edge, versus one per crease. `solveMv` and `mvSolutions` should return exactly 2^(interior edges) before global checks; a sharp test of the Phase 4 solver on this family.
6. **P2 [float] (γ, α) parametrisation and CP-FF duality (Eqs. 6.5–6.12, Thm 22).** γ = ρ/√(ρ² − 2ρcos β + 1) is the parallelogram aspect parameter; ρ = γ/√(γ² + 2γ sin α + 1), β = ±cos⁻¹((γ + sin α)/√(γ² + 2γ sin α + 1)). Bateman's CP-FF Duality: the folded form of the (γ, α) tessellation is, up to scale, the same construction with (γ, −α); scale factor √((γ² + 2γ sin α + 1)/(γ² − 2γ sin α + 1)).
   Works as a float cross-check on `foldFaces`/`layeredView` outlines for any generated shrink-rotate pattern, with no layer solver involved. It shows only where folded edges lie, not which are visible.
7. **P2 [test] Equal-and-opposite twist test for the duality.** The parallelogram between two shrunken polygons has angles α, 180° − α, and the same α on every edge; assert it at every interior edge of a generated pattern using exact arithmetic: with λ ∈ Q(ω), cos²α = (Im λ)² / (|λ|²·|1 − λ|²) is rational, so "same α on every edge" is an exact equality of rationals.
8. **P2 [exact] Triangle graphs (§6.4.4, Figs. 6.20–6.23).** For a tiling of triangles the circumcentres give a reciprocal figure directly; strictly acute triangles guarantee it is non-crossing; obtuse ones can cross (then perturb). The equilateral lattice triangles are acute. Cyclic polygons behave the same way, which is why shrink-rotate on cyclic tilings equals centred-twist tiling (p. 436).
9. **P3 [doc] Dual rotation and scale (Eqs. 6.16–6.19).** Primal and dual are interchangeable: shrink/rotate the dual polygons about primal vertices with ρ′ = √(ρ² + 1 − 2ρ cos β), β′ = −sign(β) cos⁻¹((1 − ρ cos β)/ρ′). A symmetric formulation for tests.

---

## Deep read: Ch. 6, §6.5–6.7 (pp. 442–473: flagstone and woven tessellations, flat unfoldability)

**Confirmations**
- Both flagstone and woven constructions work by designing a **folded form first** and unfolding it, and both need a "flat-unfoldability" condition that is the mirror of Kawasaki (§6.6.4, Eqs. 6.31–6.40). The project's pipeline runs the other way (CP → folded); the book's own warning, "the question just posed is an inverse problem" (p. 461), is the reason `foldFaces`
  has an `inconsistent` status: a folded form is only valid if it unfolds to 360° at every vertex.
- Woven patterns "fight back" when folded (p. 470): creases try to unfold others and the paper rumples until it relaxes into place. That is the behaviour `relax` shows on the star twist and the 6.3 note about wrong-side creases at low fold fractions; it is physics, not a bug.

**Changes and additions**
1. **P2 [test] Flagstone predicate (§6.5, p. 442).** A flagstone tessellation is a flat-foldable CP with a facet set F whose folded closure is simply connected and which no other facet overlaps and covers. In `layeredView` terms: `facesAbove(view, f)` is empty for every f in F, and the union of F's folded outlines has no holes. Add `isFlagstone(view, faces)` as a test helper (and a user-facing diagnostic: "these faces are never covered");
   then assert it on any future flagstone generator and on the hexagon-twist observation that the central face is above all others (5.3).
2. **P3 [exact] Flagstone generator (§6.5.2–6.5.3, Figs. 6.32–6.34).** Shrink each tile about its reciprocal-figure vertex with **no rotation**, insert double pleats (two opposite-polarity pleats) in the parallel strips, and construct the vertices using only reflection and translation (Fig. 6.34), which is exact. Requires the spiderweb condition and each dual vertex inside its tile (circumcentres for regular polygons and acute triangles).
   Failure modes: pleats colliding around a vertex (fix by extra folds) and a self-crossing central polygon (fix by moving the meeting point). The folded form is a reduced copy of the tiling (p. 450), a handy property test.
3. **P3 [float] Woven tessellations (§6.6.2–6.6.5, Eqs. 6.30–6.41).** Lines with at most two crossing at any point → thicken → 2-colour the background polygons → over/under by head/tail rule → trapezoids at every crossing, with unknown overlap lengths dᵢ; each interior degree-4 vertex gives one flat-unfoldability equation (Σαᵢ = 360°) on the dᵢ; solve min Σdᵢ² subject to dᵢ ≥ d_min.
   Fewer equations than unknowns (8 vs 20 in the example), so it is a constrained optimisation, which needs a numeric solver (float stage). Open exercises the book lists: periodic boundaries, vertices on a grid, herringbone and twill.
4. **P2 [exact] Flat-unfoldability angle conditions (Eqs. 6.31–6.39).** For a flat-folded degree-4 vertex with visible angles βᵢ: all-distinct sectors: β₁ + 2β₂ + β₃ = 180°; two equal pairs: β₁ + 2β₂ = 180°; all 90°: β₁ = 90°. The folded-form analogue of Kawasaki. If a user ever supplies (or the pipeline derives) a folded form, this is the exact validity test; as an independent check on `foldFaces`' folded outlines, the sum of face angles at each interior vertex (counted per layer) must be 2π.
5. **P3 [doc] Penrose tilings and Ammann bars (Figs. 6.37–6.38).** The reciprocal figure of a Penrose rhomb tiling is a set of Ammann bar lines; the flagstone construction still works although some dual vertices sit outside their tiles. Mentioned only as a stress test for a general dual-graph solver; not exact in Z[ω] (needs the golden ratio).
6. **P3 [doc] Glossary (§6.7):** *spiderweb*, *interior dual graph*, *orthogonal embedding*, *Maxwell condition*, *plain weave*, *facial subgraph*, *pleat vector*, *wedge vector*. Use "spiderweb" for a dual graph with positive signed lengths.

---

## Deep read: Ch. 7, §7.2–7.6 (pp. 477–515: half-open vertices, spherical geometry, degree-4 vertex, fold-angle graph, rigidly foldable twists)

**Confirmations**
- Maekawa from Girard's theorem (Eqs. 7.5–7.8): Ω = 2π + Σγᵢ, and a flat-folded vertex has Ω = 0 or 4π, so V − M = ±2; the book calls it "a derivation, not quite a proof" because it needs non-self-intersection (p. 482 fn. 3). Same caveat as in the Ch. 1 log.
- Degree-4 vertices at partial fold: opposite fold angles are equal in magnitude (Thm 24), the two minor ones have opposite sign (Eqs. 7.36–7.40), and adjacent half-angle tangents are proportional with fixed ratio μ (Eq. 7.64). The project's note that the symmetric right-angle vertex is a branch point is the μ → ∞ case (α₁ = α₂, §7.6.2).
- The M⁴ and (MV)² square twists fold flat but cannot be partly folded with flat facets (pp. 493–494); PLAN's "twist folds are not rigid-foldable" is true for the cyclic and alternating assignments, and the 6.2a finding that the hexagon twist needed corner-angle springs is the same fact in 3D (cyclic loop of strict inequalities).

**Changes and additions**
1. **P1 [exact/float] Rigid-foldability decision for degree-4 patterns (§7.5, Eqs. 7.59–7.69).** For a flat-foldable degree-4 vertex the major pair (opposite creases with the same assignment) has strictly larger fold-angle magnitude than the minor pair at every non-flat state (the flat-foldable vertex inequality). Build the **fold-angle digraph** (arrow from major to minor crease at each vertex).
   (a) A directed cycle ⇒ not rigidly foldable; this is combinatorial and exact (the M⁴ twist: γ_a > γ_b > γ_c > γ_d > γ_a; the (MV)² twist: the reverse). (b) Otherwise the necessary-and-sufficient test for degree-4 patterns is loop consistency of the **weighted** graph: the product of μ's around every loop equals 1,
   where μ = sin[(α₁+α₂)/2] / sin[(α₁−α₂)/2] with |μ| > 1 (Eq. 7.63), sign from major/minor, and tan(γ_i/2) ratios μ, −1, μ around the vertex (Eq. 7.64). M²V² and M³V square twists pass for any twist angle (Eqs. 7.67–7.69); M⁴ and (MV)² never do.
   Add `foldAngleGraph(cp)` and `rigidlyFoldable(cp)` in `core/simulate/` (float for μ; exact digraph), with these four fixtures as acceptance tests. Predicts which gadgets can settle with stiff facets, and it explains the viewer's "wrong-side crease" readout.
2. **P1 [test] Analytic fold angles as ground truth for `relax`.** For a rigid-foldable degree-4 pattern one parameter fixes every fold angle: pick one crease's γ, propagate with Eq. 7.64 (tan(γ/2) ratios μ, −1 across a vertex; equal along a chain of opposite creases, Thm 24). Compare the settled `relax` hinge angles to this closed form for M²V² and M³V twists and Miura-ori at several fold fractions; error should fall as panel stiffness rises. Stronger than the existing closure test because it checks every hinge. Also assert "lines of constant fold angle" (Fig. 7.7): fold-angle magnitude is constant along any line that continues straight through each vertex.
3. **P1 [doc] Re-word the PLAN known-risk (again, now with the proof).** Twist folds are rigid-foldable only for particular assignments (M²V², M³V and rotations/inversions for squares; no triangle twist at all, Eq. 7.81; M⁴, (MV)² never), and the criterion is the loop-consistency test above. The rigid motion, when it exists, has the fold angle fractions given by Eq. 7.64, which could replace relaxation in the viewer for those patterns.
4. **P2 [float] Exact rigid-fold kinematics for the viewer (§7.4).** For rigidly foldable degree-4 patterns build the folded 3D state by composing rotations with the analytic fold angles (rotation about each crease line by γ, along a spanning tree of the face adjacency graph), with no relaxation, instead of the bar-and-hinge solver. Deterministic, instant, and exact at any fold fraction; keep `relax` for non-rigid patterns. The plate-model procedure is Ch. 9.4 (still to log).
5. **P2 [test] Fold-angle matching for tiling joins (§7.5.3, Figs. 7.15–7.21).** Rigidly foldable twist tiles join only if crease position, angle, assignment **and relative fold-angle magnitude** match (the book's colouring of chains P, Q, R, S). Fold-angle magnitudes are defined only relatively inside a tile, so mismatched neighbours need a new colour (a new magnitude level) with the same ordering; with M³V tiles there are three distinct magnitudes (gP > gR = gS > gQ, Eq. 7.75).
   When the tile layer exists, add this to the mating precondition for the rigid subfamily.
6. **P3 [float] Mechanical advantage and singular vertices (§7.6.2, Eqs. 7.82–7.84).** The ratio dγ₋/dγ₊ varies monotonically from μ⁻¹ to μ; near a singular vertex (α₁ ≈ α₂, μ → 0 or ∞) the motion becomes two-stage and actuating all folds from one fold needs unbounded force. Use |μ| as a conditioning number for `relax` and as a warning on generated patterns (and as the explanation if the settle-time spikes near a right-angle vertex).
7. **P3 [doc] Spherical geometry toolbox (§7.3).** Law of sines/cosines, Girard's theorem Ω = Σβᵢ − (n−2)π, L'Huilier, haversine and Napier's analogies, and the Weierstrass substitution x = tan(ξ/2) that turns half-angle relations algebraic. For `core/simulate/`, prefer the Weierstrass form: tan(γ/2) ratios are rational functions of the lattice-derived sector sines, so fold-angle propagation is a few multiplications and avoids inverse trigonometry.

---

## Deep read: Ch. 7, §7.7–7.9 (pp. 515–534: non-twist folds, quadrilateral meshes, forced rigid foldability)

**Confirmations**
- Self-intersection limits rigid motion even when a rigid path exists (Fig. 7.45, Blockfaltung, p. 526); the discontinuous-configuration example of Abel et al. (p. 527) needs a "pop". The viewer's quasi-static driver can stall for the same reasons, and the 6.3 finding that the sheet shows no seam at 98 % is why `MAX_FOLD` keeps coplanar layers apart.
- Fully triangulated patterns are floppy (DOF grows with border length); quadrilateral meshes get stiffer as they grow unless special geometry holds (Eq. 7.85: DOF = B − 3H + S − 3 − Σ_{k≥4} P_k(k − 3)). The bar-and-hinge triangulation of every facet (6.2a) is exactly the floppy case, which is why `relax` needs corner springs and a global damping coefficient.

**Changes and additions**
1. **P2 [float] Degrees-of-freedom count as a pre-check for `relax` (Eq. 7.85).** From `faceCount` and edge/face data: DOF = B − 3H + S − 3 − Σ P_k (k − 3), where B = border edges, H = holes, P_k = number of k-gon facets (before triangulation) and S = redundant constraints. Report it per gadget; compare with the number of near-zero modes of the bar-and-hinge Hessian (a finite-difference check) to validate the 6.2 model.
2. **P2 [float] Vertex-tile construction of rigidly foldable quadrilateral meshes (§7.7.2, Eqs. 7.86–7.93, Figs. 7.35–7.44).** Choose two adjacent fold angles γ₁, γ₂ (never equal: that would make a sector zero) and two fold directions φ₁, φ₂; then α₁ = φ₂ − φ₁, α₂ = 2cos⁻¹[(1 + μcos(α₁/2)) / √(1 + μ² + 2μ cos α₁)], α₃ = π − α₁, α₄ = π − α₂, φ₃ = φ₁ + (α₁ + α₂ − π), φ₄ = φ₂ + (α₂ + α₃ − π), and the major pair is fixed by |γ₁| < |γ₂|.
   Tiles join where fold direction, magnitude and sign match; chains of fold angle are constant in magnitude across the mesh (Fig. 7.35). A generator in the float stage that is rigid by construction and an exact-oracle partner of item 1 above. Collapsing a short edge merges two degree-4 vertices into a degree-6 vertex without breaking compatibility (Fig. 7.43).
3. **P3 [exact] Forced rigid foldability (§7.8.1).** Take a non-rigid pattern, force it to fold, find the facets that bend, and add a fold along the bend: the (MV)² square twist becomes one-degree-of-freedom rigid by adding a diagonal across the centre (either direction, assignment matching the collinear creases; it creates a second singular motion in the flat state). `relax` already exposes bending facets (corner-angle strain); the facet with the largest bend energy at mid-fold points to where a diagonal would go. A repair operator for Phase 8.2 whose goal is *rigid* foldability, complementary to the flat-foldability repair in Ch. 4.
4. **P3 [exact] Split-and-graft (Figs. 7.49–7.51).** Split a pattern along a chain of collinear folds that are coplanar in the folded form (the minor-fold rows of a Miura-ori), insert a strip, and reconnect by continuing the major folds. The split vertices stop being flat-foldable and acquire a hard stop (Blockfaltung); the motion stays rigid. A grafting operation on `CreasePattern` (graph surgery with a new strip of faces) for 3D-relief variants; needs the non-flat vertex theory of Ch. 8 to compute fold angles.
5. **P3 [doc] Generic-vs-special geometry (p. 517).** "Generic" crease patterns with enough quadrilaterals are rigid; flexibility needs special geometry (repeated blocks with consistent fold angles, like Miura-ori). If the viewer reports "stuck" for a pattern, the DOF count plus S = 0 explains it.
6. **P3 [doc] Glossary (§7.9):** *Blockfaltung*, *fold angle graph*, *fold angle multiplier*, *major/minor fold*, *singular vertex*, *general bird's-foot pattern* (three creases of one assignment separated by angles in (0, π), plus one of the opposite: a necessary condition for a single vertex to fold rigidly, Abel et al.).

---

## Deep read: Ch. 8, §8.1–8.6 (pp. 535–604: Gaussian sphere, general degree-4 vertices, sector elevation, networks and Gauss maps)

**Confirmations**
- A developable vertex has a trace of zero net signed area on the Gaussian sphere, so a non-trivial folded developable vertex needs degree ≥ 4 (a degree-3 trace would be a single signed triangle, p. 542). The lattice patterns have no interior vertex below degree 4, so nothing breaks; it is a one-line justification for the "interior vertices have even degree ≥ 4" lemmas.
- Every 2D-periodic pattern with periodic fold angles grows either **planarly** (Miura-ori, Mars: all vertex traces superimpose on the Gauss map) or **cylindrically** (Huffman grid: traces lie on the great circle of the midfold plane); no periodic pattern grows spherically (p. 602). The waterbomb "ball" needs spatially varying distortion. Matches the viewer observation that gadget sheets curl as they fold.
- The Gauss map is an embedding of the **interior dual graph** of the crease pattern (facets → points, folds → arcs of length = fold angle, vertices → spherical polygons), the spherical sibling of the Ch. 6 reciprocal figure (p. 593).

**Changes and additions**
1. **P2 [test] Developability residual as a strain metric for `relax`.** At every interior vertex of a partially folded state the sum of 3D sector angles must be 2π (Eq. 1.43 / 9.75); the deviation |Σαᵢ − 2π| is a direct, bar-independent measure of in-plane strain at a vertex. Report its maximum with each settled state next to the bar strain (4.5 % at triangle twist (6, 2)); assert it shrinks with panel stiffness.
2. **P2 [test] Gauss-map checks on settled states (§8.5).** Compute facet normals of the settled mesh. For a Miura-ori the normals take only the four values of one vertex's trace (all bow-ties superimposed, p. 597); for a Huffman-type grid they lie in a narrow band around one great circle; for a chain of major-connected creases with zero edge torsion the chain stays planar for every fold angle (Thm 27, "once planar, always planar").
   These are exact predictions that the bar-and-hinge model should satisfy to within panel flex, and cheap to compute (a cross product per face). A small `gaussMap(positions, faces)` utility in `core/simulate/` also lets the viewer show "this face is never covered/curls about this axis".
3. **P2 [float] Non-flat-foldable degree-4 vertex relations (§8.3, Eqs. 8.32, 8.44, 8.71–8.89).** Huffman's identities: sin²(γ₂/2)/sin²(γ₄/2) = sin α₃ sin α₄ / (sin α₁ sin α₂) (major) and sin²(γ₁/2)/sin²(γ₃/2) = sin α₂ sin α₃ / (sin α₁ sin α₄) (minor); equal major angles iff flat-foldable or straight-major (Thm 25), equal minor angles iff flat-foldable or straight-minor (Thm 26).
   Given the four sector angles and any one fold angle (and which pair is major) all other three follow in closed form, with special-case formulas for flat-foldable, straight-minor and straight-major vertices. Use as analytic oracle for `relax` at degree-4 vertices that fail Kawasaki (the generators in Phase 8 will produce them; the validators already report them).
4. **P2 [float] Binding limits for vertices that fail Kawasaki (§8.3.2, §8.3.9, Eqs. 8.5–8.6, 8.90–8.93).** Kawasaki excess α_K = α₁ − α₂ + α₃ − α₄: α_K > 0 ⇒ γ₂ reaches π first, α_K < 0 ⇒ γ₄ first, α_K = 0 flat-foldable. Reachable fold angles are bounded: γ₁,max = 2 sin⁻¹√(sin α₂ sin α₃ / (sin α₁ sin α₄)), γ₄,max = 2 sin⁻¹√(sin α₁ sin α₂ / (sin α₃ sin α₄)) (and mirrors).
   For a generated pattern that fails Kawasaki, these give the largest fold fraction its vertex allows before self-intersection even with ghost paper; a better slider range than a uniform `MAX_FOLD`. Also the same α_K as the Kawasaki-excess repair in the Ch. 4 log.
5. **P2 [float] Bend angle and sector elevation (§8.4.1–8.4.3, Eqs. 8.94–8.123).** Sector elevation angles σᵢ (angle between each sector plane and the osculating plane) obey tan(σ₁/2)tan(σ₄/2) = tan(σ₂/2)tan(σ₃/2) (8.96), with fold-angle expansion ρ = tan(σ₁/2)/tan(σ₃/2) = tan(σ₂/2)/tan(σ₄/2) (8.97); ρ = 1 iff the vertex is flat-foldable. The crease-pattern bend angle κ is related to the folded bend κ′ by
   tan(κ/2) = tan(κ′/2)·cos((σ₁+σ₄)/2)/cos((σ₁−σ₄)/2), which is tan(κ/2) = tan(κ′/2)·cos(γ/2) in the symmetric case (8.122). The CP bend is always smaller than the folded bend, so folding along a bent segment increases the bend. The same relation as the predistortion note in Ch. 2.
6. **P3 [float] Cylinder axis from the crease pattern (§8.4.6, Eq. 8.143).** Near flat, the midfold-plane direction of a flat-foldable vertex is rotated from crease γ₁ by µ̃ = ½(π + α₁ − α₄) (general: tan µ̃ = (ρ̃ sin α₁ + sin α₄)/(ρ̃ cos α₁ − cos α₄)); for a Huffman-type grid that direction is the normal of the cylinder axis. Lets the viewer predict which way a periodic sheet will curl before simulating it.
7. **P3 [float] Inverse design of a single vertex (§8.4, Eqs. 8.108–8.111).** A folded-form-centric specification (major/minor designation, four sector elevation angles σᵢ, folded bend κ′) determines γ₁…γ₄ and then α₁…α₄ in closed form (law of cosines for γ₁, γ₃, law of sines then cosines for the αᵢ). Basis for a future "draw a 3D path, get a crease pattern" tool; Ch. 9.3 gives the full space-curve algorithm.
8. **P3 [doc] Out of scope: Lexell/Euler midfold geometry, edge torsion beyond the planarity theorem, infinitesimal trace asymptotics (§8.4.5–8.4.6).** Recorded so the "why do cylinders curl" explanation (midpoints of all trace arcs of all vertices lie on one great circle, p. 596) can be cited in the viewer docs.

---

## Deep read: Ch. 9, §9.1–9.7 (pp. 605–648: 3D vectors, 3D vertices, discrete space curve, plate model, truss model)

**Confirmations**
- The project's `core/simulate/` is a truss model with strain energy (§9.5.2): vertex coordinates are the variables, bars carry isometry, facets are triangulated and planarity/bending is a (soft) energy term. The 6.2a finding that quads/larger facets need diagonals and extra stiffness (the corner-angle springs) is the book's p. 637 point: edge-length isometry alone leaves a k-gon floppy.
- Numerical robustness advice (diagonal entries of a rotation product have vanishing gradient at the root; prefer off-diagonal entries with a sign inequality; planarity via sin θ_AB not n_A·n_B = 1, Eqs. 9.66–9.70) matches the instabilities hit in 6.2a, and the book suggests the same cure: a signed, smoothly varying constraint.
- Layer ordering is NP-complete even for flat folds, and 3D adds the numerical difficulty of telling stacked layers apart, so "most models focus just on the geometric relationships and rely on the desired configurations of interest being well removed from regions of self-intersection" (p. 635). That is the PLAN's decision to keep `relax` collision-free by construction (`MAX_FOLD` = 0.98) and to put layer logic in the flat stage.

**Changes and additions**
1. **P2 [test] Consistency matrix as a per-vertex residual (§9.4.2, Eqs. 9.57–9.62).** At an interior vertex with 3D sector angles αᵢ and fold angles γᵢ, C = Π Rₓ(γᵢ) R_z(αᵢ) must equal I (closure of the trace on the Gaussian sphere; Kawasaki's loop-consistency). Add `consistencyResidual(vertex)` = ‖C − I‖ in `core/simulate/` and report max over interior vertices for each settled state. It is the 3D analogue of `kawasakiFlat`, independent of bar strain and of the 6.2a spherical-linkage test, and works at any degree.
   Spurious roots: two diagonal entries −1 also gives zero off-diagonal terms (Fig. 9.17); guard with trace C ≥ 2.
2. **P2 [float] Plate-model fold: rigid fold by rotations along a spanning tree (§9.4.1, Eq. 9.56, Figs. 9.14–9.15).** Choose a stationary root facet, a spanning tree of the facet adjacency graph (`faceAdjacency`), and rotate each facet about its parent crease by that crease's fold angle (Rodrigues, Eqs. 9.7–9.9). If the fold angles are consistent (item 1), all facet edges re-align at every non-tree crease; the **non-tree misalignment is the check**.
   Variables: E − B fold angles (plate) vs 3V coordinates (truss); the DOF count of Eq. 7.85 gives how many fold angles are free (E_interior folds minus 3 per interior vertex). Combined with the Ch. 7 analytic fold angles this gives an exact, instant fold for rigid patterns, and the unfolding direction (apply −γ) extracts a crease pattern from a folded form (the inverse problem of Ch. 6.6, §9.4.1 last paragraph).
3. **P2 [test] 3D vertex vectors and the tetrahedron fold angle (§9.1–9.2, Eqs. 9.14–9.27).** Directed angle ∠(a,b,c) = atan2(a·b·|c|, [a,b,c]); fold angle between facets pqr and pqs about pq via Eqs. 9.20–9.21; fold vectors gᵢ, sector vectors aᵢ = gᵢ×gᵢ₊₁/‖…‖, fold angle γᵢ = ∠(aᵢ₋₁, aᵢ, gᵢ), sector angle αᵢ = cos⁻¹(gᵢ·gᵢ₊₁). Add an independent `vertexFromFolds` helper and cross-check `foldAngle` (6.2a: valley positive, wings rising toward +z) and the settled hinge angles against it at every interior vertex, including the sign convention for M/V.
4. **P3 [float] Major/minor identification for degree-4 vertices (§9.2.2).** Every non-degenerate degree-4 vertex is V³M or M³V; the opposite same-parity pair are the majors, the other crease of that parity is the matching minor, the remaining one the mismatched minor; sector elevation angles lie in (−π/2, π/2) (negative for M³V, Fig. 9.7); osculating normal q = ±(g₄×g₂)/‖…‖ with the sign from α₄ + α₁ vs π. Needed for the rigid-foldability graph (Ch. 7 log) to classify creases; `localMvClauses` already classifies vertex types, extend with a `majorMinor(cp, v)` result.
5. **P3 [float] Discrete space-curve strip (§9.3, Eqs. 9.32–9.53; knots in Figs. 9.12–9.13).** Given 3D points, a white-side vector and initial sector elevations, march along the chain computing osculating vectors, edge torsion τ⁽ⁱ⁾ = ∠(q⁽ⁱ⁻¹⁾, q⁽ⁱ⁾, r⁽ⁱ⁾), σ₃⁽ⁱ⁾ = σ₂⁽ⁱ⁻¹⁾ − τ, σ₄⁽ⁱ⁾ = σ₁⁽ⁱ⁻¹⁾ + τ, and the sector angles for the flat crease pattern; widths follow a geometric-mean compromise (Eq. 9.49) with maximum width w_max = l/(cot α₂⁽ⁱ⁻¹⁾ + cot α₃⁽ⁱ⁾) on the inside of a curve (Eq. 9.52).
   A sculptural generator, not a tessellation tool; outside the scope in CLAUDE.md, but its width limit is another instance of the "crossing embedding" check and the algorithm is a reference for any future "fold a ribbon along a path" demo in the viewer.
6. **P3 [doc] Spurious roots and degrees of freedom (§9.4.3).** DOF = (interior folds) − 3 per interior vertex = B − 3H + S − 3 − Σ P_k(k − 3) (Eq. 7.85 again); plate and truss models are equivalent formulations of the same constrained optimisation (a "bucket of variables, a set of equations, optional figure of merit").

---

## Deep read: Ch. 10, §10.1–10.7 and Afterword (pp. 649–706: rotational solids)

**Confirmations**
- "Any surface that can be folded from a flat sheet must be a developable surface" (ruled with zero Gaussian curvature, p. 654); a perfect sphere cannot be folded, only approximated by gores or facets. Same content as the Ch. 8 developability lemma and the reason the viewer shows faceted folds.
- The recurring design recipe of Ch. 10 (and of Ch. 6.6, 8.4, 9.3): parameterise the crease pattern and the folded form, force isometry, solve for the unknowns (Eqs. 10.21, 10.30, 10.41–10.42, 10.50). It is exactly the truss model of Ch. 9 used as a design tool rather than as a simulator.
- Bistable mechanisms with no rigidly foldable path between their stable states exist (Chapman-Bell's "Triple Frangipani Box", p. 701); in the viewer, a settled `relax` state can therefore sit on a different branch from the one the driver started on.

**Changes and additions**
1. **P3 [doc] Scope decision: rotational solids are out.** Thin-flange (Eqs. 10.1–10.7), thick-flange (Eqs. 10.8–10.10, flange offsets sᵢ = ½(rᵢ tan φ − wᵢ)), generalised flange (asymmetry ρ ∈ [−1, 1], gap half-angle δ, Eqs. 10.16–10.23), axial unfolding (Eqs. 10.24–10.31), twisted tube joints (Eqs. 10.32–10.45) and triangulated gores (Eqs. 10.46–10.51) all use curved or non-lattice geometry (arc lengths, tan(π/m), sin δ) and
   produce patterns that are not flat-foldable; `validate/`, `solve/` and the exact lattice do not apply to them, only the float stage. They stay outside the CLAUDE.md scope. Recorded with their key formulas so a later "3D pots" side project can start from them.
2. **P3 [doc] Constraint to remember if a 3D pattern type is ever added.** Planarity of the quadrilateral facets between two levels requires parallel corresponding edges, which forces the flange split ρ to be constant over the whole wedge (p. 677); regular-polygon twist surfaces come out exactly planar, elliptic ones do not (p. 692). A good example of "checks that only hold for symmetric input", relevant to deciding which invariants to assert in `simulate` tests (assert on regular patterns, not on random ones).
3. **P3 [float] Puffy twists as a viewer demo (§10.1.1).** An open-back cyclic twist (e.g. 45° hexagon) can be pushed in from the sides to a 3D form with six-fold symmetry; the open-back α = 30° hexagon twist proposed in the Ch. 3 log is the lattice-native version. Only a rendering idea: the settled 3D state is a different branch from the flat-folded one.

**Afterword (p. 705):** the book frames the field as "mathematics as a tool" and "mathematics for its own interest"; no actionable item.

---

## Cross-cutting summary

### P1 items, in a suggested order
1. **Cross-checks of what exists (no new modules):** hexagon/triangle twist α vs αcrit/αsafe (Ch. 3); PLAN rigid-foldability wording (Ch. 3, 7); strip-of-thirds and impossible-triangle fixtures (Ch. 1); bird's-foot analytic fold-angle test (Ch. 2); twist assignment counts (Ch. 3).
2. **Small exact additions in `core/validate`/`core/solve`:** Hull's exact single-vertex test (Ch. 1); Big-Little-Big at border vertices (Ch. 1); `maxwellExcess(cp)` (Ch. 6); shared `twoColor(adjacency)` (Ch. 1, 5).
3. **New exact content on the existing lattice:** 30° triangle and hexagon twists, the supercritical triangle variant (Ch. 3); vertex-figure enumeration and lattice-support table (Ch. 4, 5).
4. **Simulation quality:** rigid-foldability graph and analytic fold angles as ground truth for `relax` (Ch. 7), consistency matrix and developability residual (Ch. 8, 9).
5. **Phase 8 generator:** exact shrink-rotate in Q(ω) (Ch. 6) feeding a lattice Delaunay/Voronoi pair (Ch. 6), with M/V from the oriented dual graph; the SAT stages then verify instead of search.

### Decisions the book forces
- **Exact arithmetic beyond Z[ω].** Squares need Z[i]; 12-gons and everything in Table 5.1 need Z[ζ₁₂]; general twist angles need rational affine maps (Ch. 1 log). Decide once: extend the exact type, or keep the lattice to 3⁶, 6³, 3.6.3.6 and their subdivisions.
- **Where floats start.** Closed forms for (w, τ), α, ρ, β, μ, the Brocard angle and every Ch. 8–9 formula are transcendental in general; they belong after the exact stages, with their results checked back against exact predicates (e.g. exact Kawasaki on the float-computed pattern after rounding to the lattice).
- **What "foldable" means per feature:** flat-foldable (Phases 3–5), rigidly foldable (Ch. 7, a stricter property with its own graph test), developable (Ch. 8–9, needed for any 3D state). The pipeline names should keep these three apart.

### Out of scope by design
Ch. 10 (rotational solids), §9.3 (discrete space curves), §2.4.5–2.4.6 (triangulated cylinders), §2.4.8–2.4.9 (Troublewit, corrugations), Ch. 8 beyond the degree-4 identities, curved folds in general.

---

## When to work on each item (schedule)

Slots follow `docs/PLAN.md`. "Ch." numbers refer to the sections above. A slot is a suggestion; each chunk should still get its own plan (plan mode) before code, per CLAUDE.md.

### Slot A: Phase 7 audit (`audit/phase-7`, after 7.2 merges)
Checks on code that already exists; no new modules.
- Ch. 1: strip-of-thirds fixture; the 4 / 6 / 8 degree-4 counts as named tests; the impossible-triangle fixtures (Figs. 1.40, 1.41, 1.44); Maekawa and BLB docs note (needs injectivity).
- Ch. 1: **Big-Little-Big at border vertices**; Hull's exact single-vertex test; `completeDegree4` helper (optional).
- Ch. 1/5: face two-colouring helper, shared with `faceAdjacency`; use it for the front/back colours (7.1b).
- Ch. 2: bird's-foot analytic fold-angle test for `relax`; the 1D strip fixtures and the solver scale benchmark.
- Ch. 3: hexagon and triangle twist α vs αcrit/αsafe; central polygon rotates by 2α; twist assignment counts; the N(n) necklace counts.
- Ch. 3/7: reword the PLAN risk line on rigid foldability.
- Ch. 6: `maxwellExcess(cp)`.
- Ch. 7/8/9 (test-only parts): analytic fold angles as ground truth for `relax`; developability residual and consistency residual reported with each settled state; face-normal (Gauss map) checks on settled meshes; Theorems 9-11 half-plane post-conditions; vertex-colour check on `layeredView`.
- Docs: model-hierarchy wording, drawing-convention preset note, glossary terms.

**Status after 7.3b (2026-11-12).** Done: strip of thirds; the 4 / 6 / 8 counts; Maekawa and BLB injectivity note; Hull's single-vertex test; BLB at border vertices; the face two-colouring helper (the 7.1b colour pickers colour by mesh side, and `foldedToSvg` already reads `foldFaces().flipped`, so the helper's use is the agreement test, not a replacement); `maxwellExcess`; Thms 9 and 10 and the vertex-colour check; `completeDegree4`; model-hierarchy and drawing-convention notes; glossary file. Not reconstructed: the impossible triangles of Figs. 1.41 and 1.44 (Fig. 1.40 and the border variant of Fig. 1.45 are done). Left for 7.3c: the bird's-foot analytic fold-angle test, the 1D strip fixtures and solver scale benchmark, twist α against αcrit/αsafe, the 2α rotation, twist assignment and N(n) counts, the analytic fold angles and residual checks for `relax`, face-normal checks on settled meshes, Thm 11.

### Slot B: between Phase 7 and Phase 8 (decisions, then a small tile layer)
- **Decisions first:** extend the exact type beyond Z[ω] or not (Ch. 4-5); where floats start (Ch. 5, 6); rational affine maps so `foldFaces` is not limited to 30° mirror lines (Ch. 1).
- `core/tiling/`: vertex-figure enumeration, the lattice-support table, Table 5.1 lattice patches, edge orientation, subdivision (Ch. 4, 5).
- Twist taxonomy in the gadgets: α parameter, the **30° triangle and hexagon twists**, the supercritical triangle variant, grid-exact species list (Ch. 3, 5).
- LFF graph as a second M/V solver and conflict explainer (Ch. 1).
- Justin path conditions as a fast screen (Ch. 1).
- Pathological-tile diagnostics and the cross-tile mating precondition (Ch. 4).

### Slot C: Phase 8 (generative)
- 8.1 sweeps: twist-angle and n sweeps filtered by the Ch. 3 limits; Yoshimura-Miura tile grammar (Ch. 2); cycle bounds for irregular twists (Ch. 3).
- 8.2 generator: exact shrink-rotate in Q(ω), orthogonal dual by linear algebra, Delaunay/Voronoi on lattice points, M/V from dual orientation, orientation sampling (Ch. 5, 6).
- 8.2 repair: Kawasaki-excess split-twist repair; forced rigid foldability (Ch. 4, 7).
- 8.3 growth: no book counterpart; subdivision and splice operations as moves (Ch. 2, 5).
- The tile layer proper: centred and offset species formulas, folded-form tiles, non-self-contained tiles, triangle tiles, cyclic and Brocard polygons, split twists (Ch. 3, 4).

### Slot D: viewer and simulation quality (after Slot C, or interleaved)
- Rigid-foldability graph and `rigidlyFoldable(cp)` (Ch. 7).
- Exact rigid kinematics by rotations along a spanning tree for rigid patterns (Ch. 7, 9).
- Binding limits for vertices that fail Kawasaki; mechanical-advantage warnings; DOF count (Ch. 7, 8).
- Predistortion and bend-angle relations if a cross-section tool is added (Ch. 2, 8).
- Tiling picker, edge-arrow editor, species control, flat-folded-outline preview, foldability overlay (all chapters; `app/`).

### Slot E: optional side modules (any time after B)
- Miura-ori and Mars on the lattice; Huffman grid; Yoshimura; reverse-and-offset splice; semigeneralized Miura-ori and shallow-angle divots (Ch. 2).
- Flagstone generator and the flagstone predicate (Ch. 6).
- Waterbomb (needs a square lattice; Ch. 2).
- Split-and-graft with Blockfaltung (Ch. 7).
- k-uniform, isohedral, Goldberg and self-similar tilings as data (Ch. 5).

### Slot F: later or only if scope grows
- Woven tessellations (needs a numeric constrained optimiser; Ch. 6).
- Penrose and Ammann-bar tilings (golden ratio; Ch. 6).
- Pentagon and Cairo twist tilings (float-only; Ch. 5).
- Inverse single-vertex design and space-curve ribbons (Ch. 8, 9).

### Out of scope
Rotational solids (Ch. 10), triangulated cylinders and Kresling (Ch. 2), Troublewit and corrugations (Ch. 2), curved folds.
