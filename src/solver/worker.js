// Runs the solver off the main thread so the 3D view stays responsive.
import { CubeState } from '../cube.js';
import { solveAxis, initTables } from './index.js';

self.onmessage = (e) => {
  const { id, type, state } = e.data;
  try {
    if (type === 'init') {
      initTables();
      self.postMessage({ id, ok: true });
      return;
    }
    const t0 = performance.now();
    const res = solveAxis(CubeState.fromJSON(state));
    self.postMessage({ id, ok: true, stages: res.stages, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message, code: err.code });
  }
};
