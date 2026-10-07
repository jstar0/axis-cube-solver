// Axis Cube geometry.
//
// The Axis Cube is a 3x3x3 whose cutting planes are rotated 60° about a body
// diagonal relative to the outer cube. Everything here is computed in the
// *mechanism frame*: the turning axes are the coordinate axes, the cut planes
// are x = ±0.5, y = ±0.5, z = ±0.5, and the outer cube (edge length 3) is the
// standard cube rotated by R = Rot((1,1,1), 60°).
//
// World (display) frame = outer-cube frame, so world = R^T · mech.

const EPS = 1e-9;

// Columns are R·e1, R·e2, R·e3. R fixes the axis (1,1,1).
export const R = [
  [2 / 3, -1 / 3, 2 / 3],
  [2 / 3, 2 / 3, -1 / 3],
  [-1 / 3, 2 / 3, 2 / 3],
];

export const HALF = 1.5; // half edge of the outer cube
export const CUT = 0.5; // cut plane offset

// Outer faces, named by their solved colour, with their direction in the
// world (outer-cube) frame. The two corners on the turning diagonal are
// white-green-red and yellow-blue-orange.
export const OUTER_FACES = [
  { id: 'red', world: [1, 0, 0] },
  { id: 'orange', world: [-1, 0, 0] },
  { id: 'white', world: [0, 1, 0] },
  { id: 'yellow', world: [0, -1, 0] },
  { id: 'green', world: [0, 0, 1] },
  { id: 'blue', world: [0, 0, -1] },
];

export const mulMV = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
export const transpose = (m) => m[0].map((_, i) => m.map((r) => r[i]));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

export const RT = transpose(R);
export const mechToWorld = (v) => mulMV(RT, v);
export const worldToMech = (v) => mulMV(R, v);

function newellNormal(verts) {
  let n = [0, 0, 0];
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}

export function polygonArea(verts) {
  return norm(newellNormal(verts)) / 2;
}

function centroid(pts) {
  return scale(pts.reduce(add, [0, 0, 0]), 1 / pts.length);
}

// Outer cube as a polyhedron in the mechanism frame.
function outerCube(half = HALF) {
  const faces = [];
  for (const f of OUTER_FACES) {
    const n = f.world;
    // Two in-plane axes for this world face.
    const a = Math.abs(n[0]) ? [0, 1, 0] : [1, 0, 0];
    const b = cross(n, a);
    const c = scale(n, half);
    const quad = [
      add(c, add(scale(a, -half), scale(b, -half))),
      add(c, add(scale(a, half), scale(b, -half))),
      add(c, add(scale(a, half), scale(b, half))),
      add(c, add(scale(a, -half), scale(b, half))),
    ];
    let verts = quad.map(worldToMech);
    const normal = worldToMech(n);
    if (dot(newellNormal(verts), normal) < 0) verts.reverse();
    faces.push({ verts, normal, kind: 'outer', face: f.id });
  }
  return faces;
}

// Keep the half-space n·x <= d.
function clip(faces, n, d, tag) {
  const out = [];
  const capPts = [];
  for (const face of faces) {
    const vs = face.verts;
    const res = [];
    for (let i = 0; i < vs.length; i++) {
      const p = vs[i];
      const q = vs[(i + 1) % vs.length];
      const dp = dot(n, p) - d;
      const dq = dot(n, q) - d;
      if (dp <= EPS) res.push(p);
      if ((dp < -EPS && dq > EPS) || (dp > EPS && dq < -EPS)) {
        const t = dp / (dp - dq);
        res.push(add(p, scale(sub(q, p), t)));
      }
    }
    // Drop near-duplicate consecutive points.
    const clean = [];
    for (const p of res) {
      if (!clean.length || norm(sub(p, clean[clean.length - 1])) > 1e-7) clean.push(p);
    }
    if (clean.length > 1 && norm(sub(clean[0], clean[clean.length - 1])) < 1e-7) clean.pop();
    if (clean.length >= 3 && polygonArea(clean) > 1e-9) {
      out.push({ ...face, verts: clean });
    }
    for (const p of clean) if (Math.abs(dot(n, p) - d) < 1e-7) capPts.push(p);
  }
  // Build the cap polygon on the cutting plane.
  const uniq = [];
  for (const p of capPts) if (!uniq.some((u) => norm(sub(u, p)) < 1e-7)) uniq.push(p);
  if (uniq.length >= 3) {
    const c = centroid(uniq);
    const u = (() => {
      const t = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const v = cross(n, t);
      return scale(v, 1 / norm(v));
    })();
    const w = cross(n, u);
    uniq.sort(
      (p, q) =>
        Math.atan2(dot(sub(p, c), w), dot(sub(p, c), u)) -
        Math.atan2(dot(sub(q, c), w), dot(sub(q, c), u)),
    );
    let verts = uniq;
    if (dot(newellNormal(verts), n) < 0) verts = verts.reverse();
    if (polygonArea(verts) > 1e-9) out.push({ verts, normal: n, kind: 'inner', face: tag });
  }
  return out;
}

export const CUBIE_POSITIONS = [];
for (let x = -1; x <= 1; x++)
  for (let y = -1; y <= 1; y++)
    for (let z = -1; z <= 1; z++) {
      const nz = (x !== 0) + (y !== 0) + (z !== 0);
      if (nz === 0) continue;
      CUBIE_POSITIONS.push({ pos: [x, y, z], type: nz === 1 ? 'center' : nz === 2 ? 'edge' : 'corner' });
    }

// Build the polyhedron of the cubie at mechanism position `pos`. `gap` pulls
// every cut plane back by gap/2 so neighbouring pieces show a seam.
export function cubiePolyhedron(pos, gap = 0) {
  let faces = outerCube(HALF - gap / 4);
  const c = CUT + gap / 2;
  for (let a = 0; a < 3; a++) {
    const e = [0, 0, 0];
    e[a] = 1;
    if (pos[a] === 1) faces = clip(faces, scale(e, -1), -c, `cut${a}`);
    else if (pos[a] === -1) faces = clip(faces, e, -c, `cut${a}`);
    else {
      faces = clip(faces, e, CUT - gap / 2, `cut${a}`);
      faces = clip(faces, scale(e, -1), CUT - gap / 2, `cut${a}`);
    }
  }
  return faces;
}

export function buildPieces() {
  return CUBIE_POSITIONS.map(({ pos, type }) => {
    const faces = cubiePolyhedron(pos);
    const colored = {};
    for (const f of faces) {
      if (f.kind !== 'outer') continue;
      colored[f.face] = (colored[f.face] || 0) + polygonArea(f.verts);
    }
    const allPts = faces.flatMap((f) => f.verts);
    return { pos, type, faces, colored, center: centroid(allPts) };
  });
}
