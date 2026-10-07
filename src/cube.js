// Puzzle state for the Axis Cube mechanism (a 3x3x3 with oriented centres).
//
// Each of the 26 visible cubies is identified by its home position in the
// mechanism frame. State = current position + current orientation (a 3x3
// integer rotation matrix) for every cubie. Face turns rotate one outer layer
// about a mechanism axis; centres therefore never move, they only spin.

import { CUBIE_POSITIONS } from './geometry.js';

// Mechanism faces. Names follow a standard 3x3 held "mechanism upright":
// U = +z, R = +x, F = -y (right-handed: R × U = F).
export const FACES = {
  U: { axis: 2, sign: 1 },
  D: { axis: 2, sign: -1 },
  R: { axis: 0, sign: 1 },
  L: { axis: 0, sign: -1 },
  F: { axis: 1, sign: -1 },
  B: { axis: 1, sign: 1 },
};
export const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];

export const faceDir = (f) => {
  const d = [0, 0, 0];
  d[FACES[f].axis] = FACES[f].sign;
  return d;
};

const I3 = () => [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

// Rotation by q quarter turns counter-clockwise about +axis (right-hand rule).
export function axisRot(axis, q) {
  q = ((q % 4) + 4) % 4;
  let m = I3();
  const b = (axis + 1) % 3;
  const c = (axis + 2) % 3;
  for (let i = 0; i < q; i++) {
    const n = I3();
    n[b][b] = 0;
    n[c][c] = 0;
    n[c][b] = 1;
    n[b][c] = -1;
    m = mul(n, m);
  }
  return m;
}

export function mul(a, b) {
  const r = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return r;
}
export const apply = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const eqv = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

// The rotation matrix applied to a layer for a clockwise (seen from outside)
// quarter turn of face f, repeated `turns` times (turns may be 1, 2, -1).
export function faceRot(f, turns) {
  const { axis, sign } = FACES[f];
  return axisRot(axis, -sign * turns);
}

// Move notation helpers -------------------------------------------------------

export function parseMove(tok) {
  const m = /^([URFDLB])(2|'|2')?$/.exec(tok.trim());
  if (!m) throw new Error(`Bad move: ${tok}`);
  const turns = m[2] === "'" ? -1 : m[2] === '2' || m[2] === "2'" ? 2 : 1;
  return { face: m[1], turns };
}
export const parseAlg = (s) =>
  s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseMove);
export const moveToString = ({ face, turns }) =>
  face + (turns === 2 || turns === -2 ? '2' : turns === -1 || turns === 3 ? "'" : '');
export const algToString = (moves) => moves.map(moveToString).join(' ');
export const invertAlg = (moves) =>
  moves
    .slice()
    .reverse()
    .map(({ face, turns }) => ({ face, turns: turns === 2 ? 2 : -turns }));

// State -----------------------------------------------------------------------

export class CubeState {
  constructor() {
    this.cubies = CUBIE_POSITIONS.map(({ pos, type }, id) => ({
      id,
      type,
      home: pos.slice(),
      pos: pos.slice(),
      rot: I3(),
    }));
  }

  clone() {
    const c = new CubeState();
    c.cubies = this.cubies.map((q) => ({ ...q, home: q.home.slice(), pos: q.pos.slice(), rot: q.rot.map((r) => r.slice()) }));
    return c;
  }

  // Cubies currently in the layer of face f.
  layer(f) {
    const { axis, sign } = FACES[f];
    return this.cubies.filter((q) => q.pos[axis] === sign);
  }

  move(f, turns = 1) {
    const m = faceRot(f, turns);
    for (const q of this.layer(f)) {
      q.pos = apply(m, q.pos);
      q.rot = mul(m, q.rot);
    }
    return this;
  }

  applyAlg(moves) {
    for (const mv of typeof moves === 'string' ? parseAlg(moves) : moves) this.move(mv.face, mv.turns);
    return this;
  }

  isSolved() {
    return this.cubies.every((q) => eqv(q.pos, q.home) && isIdentity(q.rot));
  }

  cubieAt(pos) {
    return this.cubies.find((q) => eqv(q.pos, pos));
  }

  // Serialize as compact JSON (positions + rotations) for saving/sharing.
  toJSON() {
    return this.cubies.map((q) => [q.pos, q.rot]);
  }
  static fromJSON(data) {
    const s = new CubeState();
    data.forEach(([pos, rot], i) => {
      s.cubies[i].pos = pos.slice();
      s.cubies[i].rot = rot.map((r) => r.slice());
    });
    return s;
  }
}

export function isIdentity(m) {
  return m[0][0] === 1 && m[1][1] === 1 && m[2][2] === 1;
}

// Clockwise quarter turns (seen from outside) of the centre on face f.
export function centerTwist(state, f) {
  const d = faceDir(f);
  const q = state.cubies.find((c) => c.type === 'center' && eqv(c.home, d));
  for (let k = 0; k < 4; k++) {
    const m = faceRot(f, k);
    if (q.rot.every((row, i) => row.every((v, j) => v === m[i][j]))) return k;
  }
  return -1; // centre not on its axis (should not happen with face turns only)
}

// All 24 proper rotations of the cube (used for orientations in edit mode).
export const ROTATIONS = (() => {
  const out = [];
  const seen = new Set();
  const gens = [axisRot(0, 1), axisRot(1, 1), axisRot(2, 1)];
  const queue = [I3()];
  while (queue.length) {
    const m = queue.shift();
    const k = JSON.stringify(m);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
    for (const g of gens) queue.push(mul(g, m));
  }
  return out;
})();
