// Convert the Axis Cube mechanism state into Kociemba's cubie representation.

import { CubieCube } from './kociemba.js';
import { faceDir, apply } from '../cube.js';

const CORNER_SLOTS = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
const EDGE_SLOTS = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

const sumDirs = (s) => [...s].map(faceDir).reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
const key = (v) => v.join(',');
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export const CORNER_POS = CORNER_SLOTS.map(sumDirs);
export const EDGE_POS = EDGE_SLOTS.map(sumDirs);
const cornerIndex = new Map(CORNER_POS.map((p, i) => [key(p), i]));
const edgeIndex = new Map(EDGE_POS.map((p, i) => [key(p), i]));

export function toCubieCube(state) {
  const cc = new CubieCube();
  for (const q of state.cubies) {
    if (q.type === 'corner') {
      const i = cornerIndex.get(key(q.pos));
      const j = cornerIndex.get(key(q.home));
      const ud = apply(q.rot, faceDir(CORNER_SLOTS[j][0]));
      const k = [...CORNER_SLOTS[i]].findIndex((f) => eq(faceDir(f), ud));
      cc.cp[i] = j;
      cc.co[i] = k;
    } else if (q.type === 'edge') {
      const i = edgeIndex.get(key(q.pos));
      const j = edgeIndex.get(key(q.home));
      const d0 = apply(q.rot, faceDir(EDGE_SLOTS[j][0]));
      cc.ep[i] = j;
      cc.eo[i] = eq(d0, faceDir(EDGE_SLOTS[i][0])) ? 0 : 1;
    }
  }
  return cc;
}
