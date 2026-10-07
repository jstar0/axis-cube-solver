import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CubeState, FACE_ORDER, centerTwist } from '../src/cube.js';
import { CubieCube, MOVE_NAMES, solve, initTables } from '../src/solver/kociemba.js';
import { toCubieCube } from '../src/solver/bridge.js';

const sameCubie = (a, b) =>
  JSON.stringify([a.cp, a.co, a.ep, a.eo]) === JSON.stringify([b.cp, b.co, b.ep, b.eo]);

function randomAlg(n, rnd = Math.random) {
  const out = [];
  let prev = -1;
  while (out.length < n) {
    const m = Math.floor(rnd() * 18);
    if (Math.floor(m / 3) === prev) continue;
    prev = Math.floor(m / 3);
    out.push(MOVE_NAMES[m]);
  }
  return out.join(' ');
}

test('mechanism moves match Kociemba cubie moves', () => {
  for (let t = 0; t < 200; t++) {
    const alg = randomAlg(25);
    const s = new CubeState().applyAlg(alg);
    const k = new CubieCube();
    for (const tok of alg.split(' ')) k.move(MOVE_NAMES.indexOf(tok));
    assert.ok(sameCubie(toCubieCube(s), k), alg);
  }
});

test('every face move has order 4 and solved state is solved', () => {
  for (const f of 'URFDLB') {
    const s = new CubeState();
    s.move(f);
    assert.ok(!s.isSolved());
    s.move(f).move(f).move(f);
    assert.ok(s.isSolved());
  }
});

test('two-phase solver solves random cubes (corners and edges)', () => {
  initTables();
  for (let t = 0; t < 30; t++) {
    const alg = randomAlg(30);
    const s = new CubeState().applyAlg(alg);
    const sol = solve(toCubieCube(s));
    assert.ok(sol.length <= 24, `length ${sol.length}`);
    s.applyAlg(sol.join(' '));
    const cc = toCubieCube(s);
    assert.ok(sameCubie(cc, new CubieCube()), `${alg} -> ${sol.join(' ')}`);
  }
});

import { solveAxis, validate } from '../src/solver/index.js';
import { centerFix } from '../src/solver/centers.js';

test('full axis solver restores corners, edges and centre orientation', () => {
  const lens = [];
  for (let t = 0; t < 40; t++) {
    const alg = randomAlg(35);
    const s = new CubeState().applyAlg(alg);
    assert.equal(validate(s), null);
    const { moves } = solveAxis(s);
    lens.push(moves.length);
    for (const m of moves) s.move(m.face, m.turns);
    assert.ok(s.isSolved(), alg);
  }
  console.log('avg length', (lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(1), 'max', Math.max(...lens));
});

test('centre fixes exist for every even twist pattern', () => {
  for (let code = 0; code < 4096; code++) {
    const tw = [];
    let c = code;
    for (let i = 5; i >= 0; i--) { tw[i] = c & 3; c >>= 2; }
    if (tw.reduce((a, b) => a + b, 0) % 2) continue;
    // Applied to a solved cube, the fix must leave cubies solved and twist
    // each centre by exactly -tw.
    const after = new CubeState();
    for (const m of centerFix(tw).flat()) after.move(m.face, m.turns);
    assert.ok(sameCubie(toCubieCube(after), new CubieCube()));
    assert.deepEqual(FACE_ORDER.map((f) => centerTwist(after, f)), tw.map((t) => (4 - t) % 4));
  }
});
