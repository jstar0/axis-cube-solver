// Full Axis Cube solver: corners/edges via Kociemba two-phase, then centre
// orientation via verified centre-only algorithms.

import { FACE_ORDER, centerTwist, parseAlg } from '../cube.js';
import { solve as solve3x3, initTables } from './kociemba.js';
import { toCubieCube } from './bridge.js';
import { centerFix, centerFixCost } from './centers.js';

export { initTables };

// Merge consecutive turns of the same face (e.g. R R2 -> R').
export function simplify(moves) {
  const out = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last.face === m.face) {
      const t = (((last.turns + m.turns) % 4) + 4) % 4;
      out.pop();
      if (t) out.push({ face: m.face, turns: t === 3 ? -1 : t });
    } else out.push({ face: m.face, turns: ((m.turns % 4) + 4) % 4 === 3 ? -1 : m.turns });
  }
  return out;
}

export function validate(state) {
  const cc = toCubieCube(state);
  const err = cc.verify();
  if (err) return err;
  const twists = FACE_ORDER.map((f) => centerTwist(state, f));
  if (twists.some((t) => t < 0)) return 'center-axis';
  // Each quarter turn flips corner permutation parity and twists one centre by
  // 90°, so the total centre twist must have the same parity as the corners.
  const total = twists.reduce((a, b) => a + b, 0);
  const perm = cc.cp;
  let p = 0;
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (perm[j] < perm[i]) p ^= 1;
  if ((total & 1) !== p) return 'center-parity';
  return null;
}

// Returns { stages: [{ name, moves }], moves } for the given CubeState.
// Many two-phase solutions are tried; the one with the fewest total moves
// (including the centre-orientation fix it leaves behind) wins.
export function solveAxis(state, { candidates = 600, timeoutMs = 8000 } = {}) {
  const err = validate(state);
  if (err) throw Object.assign(new Error(`Invalid state: ${err}`), { code: err });
  let best = null;
  let seen = 0;
  const evaluate = (names) => {
    seen++;
    const main = parseAlg(names.join(' '));
    const after = state.clone();
    for (const m of main) after.move(m.face, m.turns);
    const twists = FACE_ORDER.map((f) => centerTwist(after, f));
    const cost = main.length + centerFixCost(twists);
    if (!best || cost < best.cost) best = { cost, main, twists };
    if (seen >= candidates) return false;
    return Math.min(24, best.cost - 1); // longer main solutions may still win overall
  };
  solve3x3(toCubieCube(state), { maxLength: 24, timeoutMs, onSolution: evaluate });
  const fixes = centerFix(best.twists);
  const stages = [];
  if (best.main.length) stages.push({ name: 'blocks', moves: best.main });
  fixes.forEach((moves, i) => stages.push({ name: 'centers', index: i, moves }));
  return { stages, moves: stages.flatMap((s) => s.moves) };
}
