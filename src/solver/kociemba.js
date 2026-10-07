// Kociemba two-phase solver for the 3x3x3 (corners + edges; centres ignored).
//
// Cubie conventions follow Kociemba:
//   corners URF UFL ULB UBR DFR DLF DBL DRB
//   edges   UR UF UL UB DR DF DL DB FR FL BL BR
// Moves are indexed 0..17 as U U2 U' R R2 R' F F2 F' D D2 D' L L2 L' B B2 B'.

export const MOVE_NAMES = [];
for (const f of 'URFDLB') for (const s of ['', '2', "'"]) MOVE_NAMES.push(f + s);

const N_TWIST = 2187;
const N_FLIP = 2048;
const N_SLICE = 495;
const N_CPERM = 40320;
const N_EPERM = 40320; // UD edges in phase 2
const N_SPERM = 24; // slice edges in phase 2

// Basic face turns as "replaced-by" cubie arrays.
const BASIC = {
  U: { cp: [3, 0, 1, 2, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  R: { cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2], ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  F: { cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0], ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] },
  D: { cp: [0, 1, 2, 3, 5, 6, 7, 4], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  L: { cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0], ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  B: { cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1], ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] },
};

export class CubieCube {
  constructor(cp, co, ep, eo) {
    this.cp = cp ? cp.slice() : [0, 1, 2, 3, 4, 5, 6, 7];
    this.co = co ? co.slice() : [0, 0, 0, 0, 0, 0, 0, 0];
    this.ep = ep ? ep.slice() : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    this.eo = eo ? eo.slice() : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }
  clone() {
    return new CubieCube(this.cp, this.co, this.ep, this.eo);
  }
  // this := this * b
  multiply(b) {
    const cp = [];
    const co = [];
    const ep = [];
    const eo = [];
    for (let i = 0; i < 8; i++) {
      cp[i] = this.cp[b.cp[i]];
      co[i] = (this.co[b.cp[i]] + b.co[i]) % 3;
    }
    for (let i = 0; i < 12; i++) {
      ep[i] = this.ep[b.ep[i]];
      eo[i] = (this.eo[b.ep[i]] + b.eo[i]) % 2;
    }
    this.cp = cp;
    this.co = co;
    this.ep = ep;
    this.eo = eo;
    return this;
  }
  move(m) {
    return this.multiply(MOVE_CUBES[m]);
  }

  // --- coordinates ---
  getTwist() {
    let r = 0;
    for (let i = 0; i < 7; i++) r = r * 3 + this.co[i];
    return r;
  }
  setTwist(t) {
    let s = 0;
    for (let i = 6; i >= 0; i--) {
      this.co[i] = t % 3;
      s += this.co[i];
      t = Math.floor(t / 3);
    }
    this.co[7] = (3 - (s % 3)) % 3;
  }
  getFlip() {
    let r = 0;
    for (let i = 0; i < 11; i++) r = r * 2 + this.eo[i];
    return r;
  }
  setFlip(f) {
    let s = 0;
    for (let i = 10; i >= 0; i--) {
      this.eo[i] = f & 1;
      s += this.eo[i];
      f >>= 1;
    }
    this.eo[11] = s & 1;
  }
  // Which 4 of the 12 positions hold slice edges (FR FL BL BR), order ignored.
  getSlice() {
    let a = 0;
    let x = 0;
    for (let j = 11; j >= 0; j--) {
      if (this.ep[j] >= 8) {
        a += binom(11 - j, x + 1);
        x++;
      }
    }
    return a;
  }
  setSlice(idx) {
    const slice = [8, 9, 10, 11];
    const other = [0, 1, 2, 3, 4, 5, 6, 7];
    this.ep.fill(-1);
    let x = 4;
    for (let j = 0; j < 12; j++) {
      if (idx - binom(11 - j, x) >= 0) {
        this.ep[j] = slice[4 - x];
        idx -= binom(11 - j, x);
        x--;
      }
    }
    let k = 0;
    for (let j = 0; j < 12; j++) if (this.ep[j] === -1) this.ep[j] = other[k++];
  }
  getCPerm() {
    return permIndex(this.cp, 8);
  }
  setCPerm(i) {
    this.cp = permFromIndex(i, 8);
  }
  getEPerm() {
    return permIndex(this.ep.slice(0, 8), 8);
  }
  setEPerm(i) {
    const p = permFromIndex(i, 8);
    for (let j = 0; j < 8; j++) this.ep[j] = p[j];
  }
  getSPerm() {
    return permIndex(
      this.ep.slice(8, 12).map((e) => e - 8),
      4,
    );
  }
  setSPerm(i) {
    const p = permFromIndex(i, 4);
    for (let j = 0; j < 4; j++) this.ep[8 + j] = p[j] + 8;
  }

  // Basic validity checks for a cube assembled from pieces.
  verify() {
    const cs = new Set(this.cp);
    const es = new Set(this.ep);
    if (cs.size !== 8 || es.size !== 12) return 'pieces';
    if (this.co.reduce((a, b) => a + b, 0) % 3) return 'twist';
    if (this.eo.reduce((a, b) => a + b, 0) % 2) return 'flip';
    if (parity(this.cp) !== parity(this.ep)) return 'parity';
    return null;
  }
}

function binom(n, k) {
  if (k > n || k < 0) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
function permIndex(p, n) {
  let idx = 0;
  for (let i = 0; i < n; i++) {
    let smaller = 0;
    for (let j = i + 1; j < n; j++) if (p[j] < p[i]) smaller++;
    idx += smaller * FACT[n - 1 - i];
  }
  return idx;
}
function permFromIndex(idx, n) {
  const avail = [];
  for (let i = 0; i < n; i++) avail.push(i);
  const p = [];
  for (let i = 0; i < n; i++) {
    const f = FACT[n - 1 - i];
    const k = Math.floor(idx / f);
    idx %= f;
    p.push(avail.splice(k, 1)[0]);
  }
  return p;
}
export function parity(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[j] < p[i]) s++;
  return s & 1;
}

export const MOVE_CUBES = [];
for (const f of 'URFDLB') {
  const b = BASIC[f];
  const c1 = new CubieCube(b.cp, b.co, b.ep, b.eo);
  const c2 = c1.clone().multiply(c1);
  const c3 = c2.clone().multiply(c1);
  MOVE_CUBES.push(c1, c2, c3);
}

// Phase-2 moves: U*, D*, R2, F2, L2, B2.
const P2_MOVES = [0, 1, 2, 4, 7, 9, 10, 11, 13, 16];
const P2_SET = new Set(P2_MOVES);

// ---------------------------------------------------------------------------
// Tables

let T = null;

function buildMoveTable(n, get, set, moves) {
  const table = new Int32Array(n * 18).fill(-1);
  const c = new CubieCube();
  for (let i = 0; i < n; i++) {
    for (const m of moves) {
      set(c, i);
      c.move(m);
      table[i * 18 + m] = get(c);
    }
  }
  return table;
}

function buildPrune(n1, n2, mt1, mt2, moves) {
  const total = n1 * n2;
  const table = new Int8Array(total).fill(-1);
  table[0] = 0;
  let done = 1;
  let depth = 0;
  while (done < total) {
    let found = 0;
    for (let i = 0; i < total; i++) {
      if (table[i] !== depth) continue;
      const a = Math.floor(i / n2);
      const b = i % n2;
      for (const m of moves) {
        const j = mt1[a * 18 + m] * n2 + mt2[b * 18 + m];
        if (table[j] === -1) {
          table[j] = depth + 1;
          found++;
        }
      }
    }
    done += found;
    depth++;
    if (!found) break;
  }
  return table;
}

export function initTables() {
  if (T) return T;
  const all = [...Array(18).keys()];
  const twistMove = buildMoveTable(N_TWIST, (c) => c.getTwist(), (c, i) => c.setTwist(i), all);
  const flipMove = buildMoveTable(N_FLIP, (c) => c.getFlip(), (c, i) => c.setFlip(i), all);
  const sliceMove = buildMoveTable(N_SLICE, (c) => c.getSlice(), (c, i) => c.setSlice(i), all);
  const cpermMove = buildMoveTable(N_CPERM, (c) => c.getCPerm(), (c, i) => c.setCPerm(i), P2_MOVES);
  const epermMove = buildMoveTable(
    N_EPERM,
    (c) => c.getEPerm(),
    (c, i) => {
      c.ep = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      c.setEPerm(i);
    },
    P2_MOVES,
  );
  const spermMove = buildMoveTable(
    N_SPERM,
    (c) => c.getSPerm(),
    (c, i) => {
      c.ep = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      c.setSPerm(i);
    },
    P2_MOVES,
  );
  const twistSlicePrune = buildPrune(N_TWIST, N_SLICE, twistMove, sliceMove, all);
  const flipSlicePrune = buildPrune(N_FLIP, N_SLICE, flipMove, sliceMove, all);
  const cpermSpermPrune = buildPrune(N_CPERM, N_SPERM, cpermMove, spermMove, P2_MOVES);
  const epermSpermPrune = buildPrune(N_EPERM, N_SPERM, epermMove, spermMove, P2_MOVES);
  T = {
    twistMove,
    flipMove,
    sliceMove,
    cpermMove,
    epermMove,
    spermMove,
    twistSlicePrune,
    flipSlicePrune,
    cpermSpermPrune,
    epermSpermPrune,
  };
  return T;
}

// ---------------------------------------------------------------------------
// Search

const faceOf = (m) => Math.floor(m / 3);
// Disallow same face twice, and order commuting opposite faces (U before D...).
function allowed(prev, m) {
  if (prev < 0) return true;
  const a = faceOf(prev);
  const b = faceOf(m);
  if (a === b) return false;
  if (a === b + 3) return false; // e.g. D then U -> require U then D
  return true;
}

// Without `onSolution`: returns the first solution of length <= targetLength
// (or the best found within the timeout). With `onSolution(moves)`: every
// solution found is reported; the callback returns the new maximum length to
// keep searching for, or false to stop.
export function solve(cube, { targetLength = 21, maxLength = 24, timeoutMs = 2500, onSolution = null } = {}) {
  const err = cube.verify();
  if (err) throw new Error(`Invalid cube: ${err}`);
  const t = initTables();
  const start = Date.now();
  const twist0 = cube.getTwist();
  const flip0 = cube.getFlip();
  const slice0 = cube.getSlice();

  let best = null;
  let bestLen = maxLength + 1;
  const path1 = [];
  const path2 = [];
  let halted = false;
  const stop = () =>
    halted || (best && Date.now() - start > timeoutMs) || (!onSolution && best && bestLen <= targetLength);

  function phase2Search(cp, ep, sp, depth, maxD, prev) {
    if (depth === maxD) return cp === 0 && ep === 0 && sp === 0;
    const h = Math.max(t.cpermSpermPrune[cp * N_SPERM + sp], t.epermSpermPrune[ep * N_SPERM + sp]);
    if (depth + h > maxD) return false;
    for (const m of P2_MOVES) {
      if (!allowed(prev, m)) continue;
      path2[depth] = m;
      if (phase2Search(t.cpermMove[cp * 18 + m], t.epermMove[ep * 18 + m], t.spermMove[sp * 18 + m], depth + 1, maxD, m)) return true;
    }
    return false;
  }

  function onPhase1(d1) {
    // Compute phase-2 coordinates by replaying the phase-1 moves.
    const c = cube.clone();
    for (let i = 0; i < d1; i++) c.move(path1[i]);
    const cp = c.getCPerm();
    const ep = c.getEPerm();
    const sp = c.getSPerm();
    const prev = d1 > 0 ? path1[d1 - 1] : -1;
    const limit = Math.min((onSolution ? maxLength : bestLen - 1) - d1, 18);
    for (let d2 = 0; d2 <= limit; d2++) {
      if (phase2Search(cp, ep, sp, 0, d2, prev)) {
        const moves = [...path1.slice(0, d1), ...path2.slice(0, d2)];
        if (d1 + d2 < bestLen) {
          bestLen = d1 + d2;
          best = moves;
        }
        if (onSolution) {
          const next = onSolution(moves.map((m) => MOVE_NAMES[m]));
          if (next === false) halted = true;
          else if (typeof next === 'number') maxLength = next;
        }
        return;
      }
    }
  }

  function phase1Search(tw, fl, sl, depth, maxD, prev) {
    if (depth === maxD) {
      // A phase-1 ending with a phase-2 move was already covered at a shorter depth.
      if (tw === 0 && fl === 0 && sl === 0 && (prev < 0 || !P2_SET.has(prev))) onPhase1(depth);
      return stop();
    }
    const h = Math.max(t.twistSlicePrune[tw * N_SLICE + sl], t.flipSlicePrune[fl * N_SLICE + sl]);
    if (depth + h > maxD) return false;
    for (let m = 0; m < 18; m++) {
      if (!allowed(prev, m)) continue;
      path1[depth] = m;
      if (phase1Search(t.twistMove[tw * 18 + m], t.flipMove[fl * 18 + m], t.sliceMove[sl * 18 + m], depth + 1, maxD, m)) return true;
    }
    return stop();
  }

  for (let d1 = 0; d1 <= 12 && d1 <= (onSolution ? maxLength : bestLen - 1); d1++) {
    if (phase1Search(twist0, flip0, slice0, 0, d1, -1)) break;
  }
  if (!best) throw new Error('No solution found');
  return best.map((m) => MOVE_NAMES[m]);
}
