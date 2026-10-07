// Editing a state by hand: swap two pieces of the same kind, or re-orient a
// piece in place. Used to copy the arrangement of a physical puzzle.

import { CubeState, ROTATIONS, apply, mul } from './cube.js';
import { CUBIE_POSITIONS } from './geometry.js';

const eqv = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const sameM = (a, b) => a.every((r, i) => r.every((v, j) => v === b[i][j]));

// A rotation taking vector a to vector b (both cubie positions of one kind).
function rotationTaking(a, b) {
  return ROTATIONS.find((m) => eqv(apply(m, a), b));
}

// Rotations fixing slot p, in order, starting with the identity.
function stabilizer(p) {
  const nz = p.filter((v) => v !== 0).length;
  const order = nz === 3 ? 3 : nz === 2 ? 2 : 4;
  const fixing = ROTATIONS.filter((m) => eqv(apply(m, p), p));
  // Pick a generator of the cyclic stabilizer (excluding reflections, which
  // ROTATIONS does not contain).
  const gen = fixing.find((m) => {
    let k = m;
    for (let i = 1; i < order; i++) {
      if (sameM(k, ROTATIONS[0])) return false;
      k = mul(m, k);
    }
    return sameM(k, ROTATIONS[0]);
  });
  return gen;
}

// Move the piece in slot pa to slot pb and vice versa, keeping each piece's
// orientation relative to its new slot the same as the other piece had.
export function swapPieces(state, pa, pb) {
  const a = state.cubieAt(pa);
  const b = state.cubieAt(pb);
  if (!a || !b || a === b || a.type !== b.type || a.type === 'center') return false;
  const hab = rotationTaking(a.home, b.home);
  const hba = rotationTaking(b.home, a.home);
  const ra = mul(b.rot, hab);
  const rb = mul(a.rot, hba);
  a.rot = ra;
  b.rot = rb;
  a.pos = apply(ra, a.home);
  b.pos = apply(rb, b.home);
  return true;
}

// Turn the piece in slot p in place (corner 120°, edge flip, centre 90°).
export function twistPiece(state, p, times = 1) {
  const q = state.cubieAt(p);
  if (!q) return false;
  const g = stabilizer(p);
  const nz = p.filter((v) => v !== 0).length;
  const order = nz === 3 ? 3 : nz === 2 ? 2 : 4;
  for (let i = 0; i < ((times % order) + order) % order; i++) q.rot = mul(g, q.rot);
  return true;
}

// Compact text code for a state: per cubie (in home order), the index of its
// rotation among the 24 cube rotations (its slot follows from rot · home).
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWX';
export function encodeState(state) {
  return state.cubies.map((q) => ALPHA[ROTATIONS.findIndex((m) => sameM(m, q.rot))]).join('');
}

export function decodeState(code) {
  code = code.trim().toUpperCase().replace(/[^A-X]/g, '');
  if (code.length !== CUBIE_POSITIONS.length) throw new Error('状态码长度应为 26 个字母');
  const s = new CubeState();
  const used = new Set();
  s.cubies.forEach((q, i) => {
    q.rot = ROTATIONS[ALPHA.indexOf(code[i])].map((r) => r.slice());
    q.pos = apply(q.rot, q.home);
    const k = q.pos.join(',');
    if (used.has(k)) throw new Error('状态码里有两块落在同一个位置');
    used.add(k);
  });
  return s;
}
