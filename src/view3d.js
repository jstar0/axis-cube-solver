// three.js rendering of the Axis Cube.
//
// Scene graph: scene → world (presentation orientation) → mech (mechanism
// frame, turning axes = coordinate axes) → 26 piece meshes. Each piece's mesh
// is built at its home slot; its matrix is just the cubie's rotation, since a
// cubie's position always equals rot · home.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { cubiePolyhedron, CUBIE_POSITIONS, RT } from './geometry.js';
import { FACES, FACE_ORDER, faceDir } from './cube.js';

export const PLASTIC = {
  white: '#f1f1ea',
  yellow: '#f3df2c',
  green: '#4fc93a',
  blue: '#2f9fe0',
  red: '#e6304d',
  orange: '#ff6a24',
};
const COLOR_KEYS = Object.keys(PLASTIC);
const INNER = '#1b1e24';
const GAP = 0.036;

const m3to4 = (m) =>
  new THREE.Matrix4().set(m[0][0], m[0][1], m[0][2], 0, m[1][0], m[1][1], m[1][2], 0, m[2][0], m[2][1], m[2][2], 0, 0, 0, 0, 1);

// Presentation orientations of the mechanism frame.
const VIEW_SHAPE = new THREE.Quaternion().setFromRotationMatrix(m3to4(RT)); // outer cube upright
const VIEW_MECH = new THREE.Quaternion().setFromRotationMatrix(
  m3to4([
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ]),
); // U centre up, F centre to the front

// Material slots: 0-5 outer colours, 6 plain inner, 7-12 inner tinted by colour.
const TINT_BASE = COLOR_KEYS.length + 1;

function sharedEdgeLength(a, b) {
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-5;
  const onSeg = (p, s0, s1) => {
    const d = [s1[0] - s0[0], s1[1] - s0[1], s1[2] - s0[2]];
    const L = Math.hypot(...d);
    const t = ((p[0] - s0[0]) * d[0] + (p[1] - s0[1]) * d[1] + (p[2] - s0[2]) * d[2]) / (L * L);
    if (t < -1e-6 || t > 1 + 1e-6) return false;
    return near(p, [s0[0] + d[0] * t, s0[1] + d[1] * t, s0[2] + d[2] * t]);
  };
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const r = b[j];
      const s = b[(j + 1) % b.length];
      // Overlap of two collinear segments, measured on segment pq.
      if (onSeg(r, p, q) && onSeg(s, p, q)) best = Math.max(best, Math.hypot(r[0] - s[0], r[1] - s[1], r[2] - s[2]));
      else if (onSeg(p, r, s) && onSeg(q, r, s)) best = Math.max(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
    }
  }
  return best;
}

function pieceGeometry(pos) {
  const faces = cubiePolyhedron(pos, GAP);
  const outer = faces.filter((f) => f.kind === 'outer');
  const positions = [];
  const normals = [];
  const groups = [];
  for (const f of faces) {
    let mat;
    if (f.kind === 'outer') mat = COLOR_KEYS.indexOf(f.face);
    else {
      // A stickerless piece shows its plastic colour on exposed cut faces:
      // take the colour of the outer face it shares the longest edge with.
      let best = null;
      let bestLen = 0;
      for (const o of outer) {
        const l = sharedEdgeLength(f.verts, o.verts);
        if (l > bestLen) {
          bestLen = l;
          best = o;
        }
      }
      if (!best) {
        const c = (vs) => vs.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]).map((x) => x / vs.length);
        const fc = c(f.verts);
        best = outer.reduce((a, o) => {
          const oc = c(o.verts);
          const d = Math.hypot(oc[0] - fc[0], oc[1] - fc[1], oc[2] - fc[2]);
          return !a || d < a.d ? { o, d } : a;
        }, null).o;
      }
      mat = TINT_BASE + COLOR_KEYS.indexOf(best.face);
    }
    const start = positions.length / 3;
    const n = f.normal;
    const len = Math.hypot(n[0], n[1], n[2]);
    for (let i = 1; i < f.verts.length - 1; i++) {
      for (const v of [f.verts[0], f.verts[i], f.verts[i + 1]]) {
        positions.push(v[0], v[1], v[2]);
        normals.push(n[0] / len, n[1] / len, n[2] / len);
      }
    }
    groups.push({ start, count: positions.length / 3 - start, mat });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  for (const gr of groups) g.addGroup(gr.start, gr.count, gr.mat);
  return g;
}

const tintOf = (hex) => new THREE.Color(hex).multiplyScalar(0.62);

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class AxisView {
  constructor(container, { onClick, onHover, accent = '#3442d6' } = {}) {
    this.container = container;
    this.onClick = onClick;
    this.onHover = onHover;
    this.accent = new THREE.Color(accent);

    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = (this.scene = new THREE.Scene());
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = (this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100));
    camera.position.set(8.2, 6.4, 11.0);
    const controls = (this.controls = new OrbitControls(camera, renderer.domElement));
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 8;
    controls.maxDistance = 22;
    controls.rotateSpeed = 0.8;

    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(5, 9, 7);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-7, -3, -5);
    scene.add(key, fill, new THREE.HemisphereLight(0xffffff, 0x445066, 0.25));

    this.world = new THREE.Group();
    this.world.quaternion.copy(VIEW_MECH);
    this.targetQuat = VIEW_MECH.clone();
    this.mech = new THREE.Group();
    this.world.add(this.mech);
    scene.add(this.world);

    this.pieces = CUBIE_POSITIONS.map(({ pos, type }, id) => {
      const geom = pieceGeometry(pos);
      const mats = [...COLOR_KEYS.map((k) => PLASTIC[k]), INNER, ...COLOR_KEYS.map((k) => tintOf(PLASTIC[k]))].map(
        (c, i) =>
          new THREE.MeshStandardMaterial({
            color: c,
            roughness: i < COLOR_KEYS.length ? 0.36 : 0.6,
            metalness: 0,
            envMapIntensity: 0.22,
          }),
      );
      const mesh = new THREE.Mesh(geom, mats);
      mesh.matrixAutoUpdate = false;
      mesh.userData.id = id;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom, 25),
        new THREE.LineBasicMaterial({ color: 0x0b0d10, transparent: true, opacity: 0.22 }),
      );
      mesh.add(edges);
      this.mech.add(mesh);
      return { id, type, home: pos, mesh, mats };
    });

    this.arrow = new THREE.Group();
    this.arrow.visible = false;
    this.mech.add(this.arrow);

    this.anim = null;
    this.highlight = new Map();
    this.labels = null;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.#bindPointer();

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.resize();
    renderer.setAnimationLoop(() => this.#frame());
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    // Keep the whole puzzle in frame on tall, narrow screens.
    this.camera.fov = w / h < 0.8 ? 30 / Math.max(w / h, 0.45) * 0.8 : 30;
    this.camera.updateProjectionMatrix();
  }

  // 'tint': cut faces in a darker shade of the piece colour (stickerless look);
  // 'dark': cut faces black.
  setInnerStyle(kind) {
    for (const p of this.pieces)
      COLOR_KEYS.forEach((k, i) => p.mats[TINT_BASE + i].color.copy(kind === 'dark' ? new THREE.Color(INNER) : tintOf(PLASTIC[k])));
  }

  setView(kind) {
    this.targetQuat = (kind === 'shape' ? VIEW_SHAPE : VIEW_MECH).clone();
  }

  resetCamera() {
    this.camera.position.set(8.2, 6.4, 11.0);
    this.controls.target.set(0, 0, 0);
  }

  // Place every piece according to the state.
  sync(state) {
    for (const q of state.cubies) {
      const p = this.pieces[q.id];
      p.mesh.matrix.copy(m3to4(q.rot));
      p.mesh.matrixWorldNeedsUpdate = true;
    }
  }

  // Animate one face turn from `state` (state itself is not modified).
  animateMove(state, face, turns, ms = 320) {
    if (this.anim) this.#finishAnim();
    const { axis, sign } = FACES[face];
    const ids = state.layer(face).map((q) => q.id);
    const axisVec = new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
    const angle = (-sign * turns * Math.PI) / 2;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return new Promise((resolve) => {
      this.anim = {
        ids,
        axisVec,
        angle,
        start: performance.now(),
        ms: reduce ? 1 : ms * (Math.abs(turns) === 2 ? 1.35 : 1),
        base: ids.map((id) => this.pieces[id].mesh.matrix.clone()),
        resolve,
      };
    });
  }

  #finishAnim() {
    const a = this.anim;
    this.anim = null;
    const r = new THREE.Matrix4().makeRotationAxis(a.axisVec, a.angle);
    a.ids.forEach((id, i) => {
      const m = this.pieces[id].mesh;
      m.matrix.multiplyMatrices(r, a.base[i]);
      m.matrixWorldNeedsUpdate = true;
    });
    a.resolve();
  }

  // Curved arrow around the layer of `face`, showing the turn direction. It is
  // built centred on the local u axis and swung towards the camera every frame.
  showArrow(face, turns) {
    this.hideArrow();
    if (!face) return;
    const { axis } = FACES[face];
    const d = new THREE.Vector3(...faceDir(face));
    const e = [0, 0, 0];
    e[(axis + 1) % 3] = 1;
    const u = new THREE.Vector3(...e);
    const v = new THREE.Vector3().crossVectors(d, u);
    const radius = 2.9;
    const offset = 1.0;
    const sweep = (Math.abs(turns) === 2 ? Math.PI * 0.95 : Math.PI / 2) * 0.9;
    const dirSign = turns < 0 ? 1 : -1; // clockwise seen from outside = negative about d
    const theta0 = (-dirSign * sweep) / 2;
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const th = theta0 + (dirSign * sweep * i) / 48;
      pts.push(
        d
          .clone()
          .multiplyScalar(offset)
          .addScaledVector(u, Math.cos(th) * radius)
          .addScaledVector(v, Math.sin(th) * radius),
      );
    }
    const mat = new THREE.MeshBasicMaterial({ color: this.accent, toneMapped: false, depthTest: false, transparent: true });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.06, 10), mat);
    const end = pts[pts.length - 1];
    const tangent = end.clone().sub(pts[pts.length - 2]).normalize();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.46, 20), mat);
    cone.position.copy(end).addScaledVector(tangent, 0.14);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    tube.renderOrder = cone.renderOrder = 10;
    this.arrow.add(tube, cone);
    this.arrowFrame = { d, u, v };
    this.arrow.visible = true;
    this.#aimArrow();
  }

  #aimArrow() {
    const { d, u, v } = this.arrowFrame;
    const cam = this.mech.worldToLocal(this.camera.position.clone());
    const phi = Math.atan2(cam.dot(v), cam.dot(u));
    this.arrow.quaternion.setFromAxisAngle(d, phi);
  }

  hideArrow() {
    for (const c of [...this.arrow.children]) {
      c.geometry.dispose();
      this.arrow.remove(c);
    }
    this.arrow.visible = false;
  }

  // kinds: Map<id, 'select' | 'hover' | 'layer' | 'dim'>
  setHighlight(kinds) {
    this.highlight = kinds;
    for (const p of this.pieces) {
      const k = kinds.get(p.id);
      const intensity = k === 'select' ? 0.55 : k === 'hover' ? 0.28 : k === 'layer' ? 0.22 : 0;
      const dim = k === 'dim';
      for (const m of p.mats) {
        m.emissive.copy(this.accent);
        m.emissiveIntensity = intensity;
        m.transparent = dim;
        m.opacity = dim ? 0.2 : 1;
        m.depthWrite = !dim;
      }
      p.mesh.children[0].material.opacity = dim ? 0.06 : 0.22;
      p.mesh.renderOrder = dim ? 1 : 0;
    }
  }

  // HTML labels pinned just outside each mechanism face.
  attachLabels(layer, makeLabel) {
    this.labels = FACE_ORDER.map((f) => {
      const el = makeLabel(f);
      layer.appendChild(el);
      return { f, el, local: new THREE.Vector3(...faceDir(f)).multiplyScalar(2.95) };
    });
  }
  setLabelsVisible(v) {
    this.labelsVisible = v;
    for (const l of this.labels || []) l.el.hidden = !v;
  }

  #bindPointer() {
    const el = this.renderer.domElement;
    let down = null;
    const pick = (ev) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(
        this.pieces.map((p) => p.mesh),
        false,
      )[0];
      return hit ? hit.object.userData.id : null;
    };
    el.addEventListener('pointerdown', (ev) => {
      down = { x: ev.clientX, y: ev.clientY };
    });
    el.addEventListener('pointerup', (ev) => {
      if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 6) this.onClick?.(pick(ev), ev);
      down = null;
    });
    el.addEventListener('pointermove', (ev) => {
      if (ev.pointerType === 'mouse' && !down) this.onHover?.(pick(ev), ev);
    });
    el.addEventListener('pointerleave', () => this.onHover?.(null));
  }

  #frame() {
    if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (performance.now() - a.start) / a.ms);
      if (t >= 1) this.#finishAnim();
      else {
        const r = new THREE.Matrix4().makeRotationAxis(a.axisVec, a.angle * easeInOut(t));
        a.ids.forEach((id, i) => {
          const m = this.pieces[id].mesh;
          m.matrix.multiplyMatrices(r, a.base[i]);
          m.matrixWorldNeedsUpdate = true;
        });
      }
    }
    if (!this.world.quaternion.equals(this.targetQuat)) {
      this.world.quaternion.slerp(this.targetQuat, 0.12);
      if (this.world.quaternion.angleTo(this.targetQuat) < 1e-3) this.world.quaternion.copy(this.targetQuat);
    }
    this.controls.update();
    if (this.arrow.visible) this.#aimArrow();
    this.renderer.render(this.scene, this.camera);
    if (this.labels && this.labelsVisible !== false) this.#placeLabels();
  }

  #placeLabels() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    for (const l of this.labels) {
      const p = this.mech.localToWorld(l.local.clone());
      const away = p.clone().normalize().dot(camDir); // > 0 on the far side of the puzzle
      const s = p.clone().project(this.camera);
      l.el.style.transform = `translate(${((s.x + 1) / 2) * w}px, ${((1 - s.y) / 2) * h}px) translate(-50%, -50%)`;
      l.el.classList.toggle('is-back', away > 0.3);
    }
  }
}
