# Credits

Ideas, formulas and conventions this project builds on. Code here is written from scratch unless a file says otherwise. If code is ever copied from a source below, that file must carry the source's licence notice.

## Simulation and viewer

- **Origami Simulator**, Amanda Ghassaei (github.com/amandaghassaei/OrigamiSimulator, MIT licence). The dynamic bar-and-hinge relaxation and its default stiffness and damping values, the Strain view colouring, the Material view, Grab mode, the SVG stroke-colour convention and the import pipeline, and the capture and export features. Paper: Ghassaei, Demaine and Gershenfeld, "Fast, Interactive Origami Simulation using GPU Computation" (7OSME, 2018). Used in `core/simulate/` and, from step V.2a on, the viewer.
- **Schenk and Guest**, "Origami Folding: A Structural Engineering Approach" (5OSME, 2010). The pin-jointed bar framework with dihedral-angle constraints, the fold-angle Jacobian, the rigid-mechanism nullspace and the stiffness eigenmodes. Used in `core/simulate/` and, from step V.10 on, the mechanism analysis.
- **Tachi**, "Freeform Variations of Origami", _Journal for Geometry and Graphics_ 14(2), 2010. Developability and boundary conditions, the one-sided fold-angle limits, the edge-collapse rules, and the Miura-ori, Yoshimura, waterbomb and Resch examples. Used in `core/simulate/` and `core/generate/`.
- **Liu and Paulino** (2017) and **Filipov, Tachi and Paulino** (2015), for the bar-and-hinge idealisation, as cited in `core/simulate/model.ts`.

## Mathematics and patterns

- **Lang**, _Twists, Tilings, and Tessellations_ (CRC Press, 2018). Twist folds, tilings, the layer and flat-foldability theory. See `docs/BOOK_IMPROVEMENTS.md`.
- **Demaine and O'Rourke**, _Geometric Folding Algorithms_, and **Bern and Hayes** (1996), for flat-folded states and the complexity of layer ordering, as cited in `core/solve/`.

## Formats

- **FOLD**, Demaine, Ku and others (github.com/edemaine/fold, MIT licence). The `.fold` crease-pattern format read and written from step V.5 on.

Where each idea is used, and what we chose not to take, is in `docs/SIMULATOR_IMPROVEMENTS.md`.
