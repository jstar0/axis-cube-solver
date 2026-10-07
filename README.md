# axis-cube-solver

An interactive 3D model and step-by-step solver for the **Axis Cube**, the 3x3x3
shape mod whose cutting planes are rotated 60° about a body diagonal (sold for
example as the QiYi Axis Cube). It runs in the browser with no build step. The
interface is in Chinese.

Copy your scrambled puzzle onto the model, press solve, and follow the moves one
at a time: the layer to turn is highlighted and an arrow shows the direction.

## Features

- **Exact geometry.** Every piece is computed by intersecting the outer cube with
  the rotated 3x3 cut planes, so the model takes the same shapes as the real puzzle
  in any state. Exposed cut faces can be tinted like stickerless plastic or drawn
  black.
- **Turning.** Buttons, keyboard (`U R F D L B`, Shift for counter-clockwise) or a
  click on a centre piece; undo, redo, scramble, reset.
- **State input.** Swap two pieces or twist one in place until the model matches
  your puzzle, apply a known scramble, or paste a 26-letter state code. Invalid
  states are explained (corner twist, edge flip, swap parity, centre orientation).
- **Solving.** Corners and edges are solved with Kociemba's two-phase algorithm and
  the centres are then turned upright, because on this puzzle their orientation is
  visible. Solutions are typically 30–38 face turns and take about two seconds.
- **Playback.** Step forwards and backwards, autoplay at five speeds, jump to any
  move, optionally fade every piece outside the layer being turned.

## Run

Requires Node 20 or newer for the local server and tests. three.js is loaded from
jsDelivr, so the page needs network access when it first loads.

```sh
git clone git@github.com:jstar0/axis-cube-solver.git
cd axis-cube-solver
pnpm dev        # or: node scripts/serve.mjs
```

Open <http://localhost:5180>. Any static file server works as well; the page only
needs `index.html` and `src/` served from the same origin (the solver runs in a
module Web Worker).

## Using it

The three tabs are **转动** (turn), **录入状态** (enter a state) and **求解演示**
(solve and play back).

Layers are named after their centre pieces, as on a 3x3 held by its centres:

| Face | Centre colours | Default position |
| --- | --- | --- |
| `U` | white + green | up |
| `R` | red + green | right |
| `F` | orange + yellow | front |
| `D` | yellow + blue | down |
| `L` | orange + blue | left |
| `B` | red + white | back |

A clockwise turn is clockwise when you look straight at that layer's centre from
outside. The default view holds the mechanism upright (`U` up, `F` in front);
**看外形** switches to the outer cube standing upright as in the solved state.

To enter a physical state, hold the puzzle so its six centres sit where the
model's centres are (centres never change position, they only spin). Then pick
**换位置** and click two pieces of the same kind to swap them, or **转方向** and
click a piece to turn it in place, until shape and colours match everywhere.

The colour scheme assumed is the standard one (white opposite yellow, green
opposite blue, red opposite orange) with the two pieces on the turning diagonal
being the white-green-red and yellow-blue-orange pyramids. A puzzle coloured
differently will not match the model.

### State code

26 letters `A`–`X`, one per piece in home order (positions `x, y, z ∈ {-1, 0, 1}`
in lexicographic order, skipping the hidden core). Each letter is the index of the
piece's rotation among the 24 rotations of a cube; its position follows from that
rotation applied to its home position. The solved state is
`AAAAAAAAAAAAAAAAAAAAAAAAAA`.

## How it works

**Geometry.** Everything is computed in the frame of the inner 3x3 mechanism,
where the turning axes are the coordinate axes and the cuts are the planes
`x, y, z = ±0.5`. The outer cube of edge 3 is the standard cube rotated by
`Rot((1, 1, 1), 60°)`, whose matrix is rational (columns `(2, 2, -1)/3`,
`(-1, 2, 2)/3`, `(2, -1, 2)/3`). Clipping that cube by the slab of each of the 26
cubie cells gives the piece polyhedra: two three-colour pyramids on the turning
diagonal, six single-colour corner triangles, six single-colour and six two-colour
edges, and six two-colour centres.

**State.** Each piece stores one of the 24 cube rotations; its position is that
rotation applied to its home position. Face turns rotate one layer, so centres
stay in place and only their orientation changes, which makes the puzzle a
"supercube".

**Solver.** `src/solver/kociemba.js` is a two-phase solver with move and pruning
tables built in a Web Worker in about a second. After the corners and edges are
solved, the leftover centre twists are fixed with algorithms that leave every
other piece alone. The base algorithms were found by computer search, for example

- `U R L U2 R' L' U R L U2 R' L'` turns the `U` centre 180°
- `U R L F2 B2 R' L' D' R L F2 B2 R' L'` turns `U` +90° and `D` −90°
- `F B R' L U' D' F D U L' R B' F' U'` turns `F` +90° and `U` −90°

They are expanded to every face by whole-cube rotation and checked by simulation
before first use. A Dijkstra search over the 4⁶ centre states then picks the
cheapest combination. Because the leftover twists depend on which two-phase
solution was used, 600 candidate solutions are scored on their total length
including the centre fix and the shortest overall wins.

## Tests

```sh
pnpm test
```

The suite checks the geometric move model against a reference cubie
implementation, solves random scrambles end to end (centre orientation included),
and confirms that a centre fix exists for all 2048 legal centre-twist patterns.
It takes about a minute.

## Layout

| Path | Contents |
| --- | --- |
| `index.html` | page, styles, import map for three.js |
| `src/geometry.js` | outer cube, cut planes, piece polyhedra |
| `src/cube.js` | state, face turns, notation |
| `src/edit.js` | swapping and twisting pieces, state codes |
| `src/view3d.js` | three.js scene, turn animation, arrow, picking |
| `src/app.js` | user interface |
| `src/solver/` | two-phase solver, centre fixes, Web Worker |
| `scripts/serve.mjs` | dependency-free static server |
| `tests/` | `node:test` suite |

## License

[MIT](LICENSE)
