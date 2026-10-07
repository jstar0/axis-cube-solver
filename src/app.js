import { CubeState, FACES, FACE_ORDER, faceDir, parseAlg, moveToString, invertAlg } from './cube.js';
import { buildPieces } from './geometry.js';
import { AxisView, PLASTIC } from './view3d.js';
import { swapPieces, twistPiece, encodeState, decodeState } from './edit.js';
import { validate } from './solver/index.js';

const $ = (id) => document.getElementById(id);
const COLOR_NAME = { white: '白', yellow: '黄', green: '绿', blue: '蓝', red: '红', orange: '橙' };
const COLOR_ORDER = ['white', 'yellow', 'red', 'orange', 'green', 'blue'];
const POS_NAME = { U: '上', D: '下', R: '右', L: '左', F: '前', B: '后' };
const SPEEDS = [
  [760, '很慢'],
  [520, '慢'],
  [340, '正常'],
  [210, '快'],
  [120, '很快'],
];
const SAMPLE_SCRAMBLE = "R U' F2 D L' B U2 R' F D2 L U B' R2 D' F' L2 U R B2";
const STORE_KEY = 'axis-cube-state-v1';

// Colours of each mechanism face's centre piece.
const PIECES = buildPieces();
const CENTER_COLORS = Object.fromEntries(
  FACE_ORDER.map((f) => {
    const d = faceDir(f);
    const p = PIECES.find((q) => q.type === 'center' && q.pos.every((v, i) => v === d[i]));
    return [f, COLOR_ORDER.filter((c) => p.colored[c])];
  }),
);
const centerName = (f) => CENTER_COLORS[f].map((c) => COLOR_NAME[c]).join('');
const chipsHTML = (f) =>
  `<span class="chips">${CENTER_COLORS[f].map((c) => `<span class="chip" style="background:${PLASTIC[c]}"></span>`).join('')}</span>`;
const turnText = (t) => (t === 2 || t === -2 ? '转 180°' : t > 0 ? '顺时针 90°' : '逆时针 90°');
const describe = (m) => `${m.face} 层（中心块${centerName(m.face)}，在${POS_NAME[m.face]}）${turnText(m.turns)}`;
const tokenOf = (m) => moveToString(m);

// ---------------------------------------------------------------------------
// State

let state = loadState();
let tab = 'play';
let view3d = 'mech';
const history = [];
let redo = [];
const editStack = [];
let tool = 'swap';
let selected = null; // slot position of the selected piece (edit mode)
let hoverId = null;
let previewMove = null; // move shown while hovering a turn button
let solution = null; // { start, stages, moves, index, target }
let playing = false;
let speed = 2;
let animating = false;
let focusLayer = true; // fade pieces outside the layer being demonstrated

function loadState() {
  try {
    const code = localStorage.getItem(STORE_KEY);
    if (code) return decodeState(code);
  } catch {
    /* storage unavailable or stale code: fall back to the sample */
  }
  return new CubeState().applyAlg(SAMPLE_SCRAMBLE);
}
function saveState() {
  try {
    localStorage.setItem(STORE_KEY, encodeState(state));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// 3D view

const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3442d6';
const view = new AxisView($('stage'), { onClick, onHover, accent: accent() });
view.sync(state);
view.attachLabels($('labels'), (f) => {
  const el = document.createElement('span');
  el.className = 'flabel';
  el.innerHTML = `${f}${chipsHTML(f)}`;
  return el;
});
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  view.accent.set(accent());
  refreshHighlight();
});

let chain = Promise.resolve();
function runMove(m) {
  animating = true;
  view.hideArrow();
  view.setHighlight(new Map());
  return view.animateMove(state, m.face, m.turns, SPEEDS[speed][0]).then(() => {
    state.move(m.face, m.turns);
    view.sync(state);
    animating = false;
  });
}
const enqueue = (fn) => (chain = chain.then(fn).catch((e) => console.error(e)));

// ---------------------------------------------------------------------------
// UI: turning

function buildFaceTable() {
  $('faces').innerHTML = FACE_ORDER.map(
    (f) => `
    <div class="face-row">
      <span class="face-name"><span class="letter">${f}</span>${chipsHTML(f)}<small>${centerName(f)} · ${POS_NAME[f]}</small></span>
      <button class="btn mono" type="button" data-move="${f}">${f}</button>
      <button class="btn mono" type="button" data-move="${f}'">${f}'</button>
      <button class="btn mono" type="button" data-move="${f}2">${f}2</button>
    </div>`,
  ).join('');
  for (const b of $('faces').querySelectorAll('[data-move]')) {
    const m = parseAlg(b.dataset.move)[0];
    b.addEventListener('click', () => manualMove(m));
    b.addEventListener('pointerenter', () => {
      previewMove = m;
      refreshHighlight();
    });
    b.addEventListener('pointerleave', () => {
      previewMove = null;
      refreshHighlight();
    });
  }
}

function manualMove(m) {
  dropSolution('状态变了，需要重新计算解法。');
  history.push(m);
  redo = [];
  enqueue(() => runMove(m)).then(afterChange);
  renderHistory();
}

function afterChange() {
  saveState();
  renderStatus();
  renderVerdict();
  refreshHighlight();
  $('code-input').value = encodeState(state);
}

function renderHistory() {
  $('history').textContent = history.length ? history.map(tokenOf).join(' ') : '还没有转动。';
  $('btn-undo').disabled = !history.length;
  $('btn-redo').disabled = !redo.length;
}

function renderStatus() {
  const el = $('status');
  const err = validate(state);
  if (err) {
    el.dataset.kind = 'bad';
    el.textContent = '状态有误';
  } else if (state.isSolved()) {
    el.dataset.kind = 'solved';
    el.textContent = '已复原';
  } else {
    el.dataset.kind = 'scrambled';
    el.textContent = '未复原';
  }
}

$('btn-undo').addEventListener('click', () => {
  const m = history.pop();
  if (!m) return;
  redo.push(m);
  dropSolution();
  enqueue(() => runMove(invertAlg([m])[0])).then(afterChange);
  renderHistory();
});
$('btn-redo').addEventListener('click', () => {
  const m = redo.pop();
  if (!m) return;
  history.push(m);
  dropSolution();
  enqueue(() => runMove(m)).then(afterChange);
  renderHistory();
});
$('btn-scramble').addEventListener('click', () => {
  const moves = [];
  let prev = '';
  while (moves.length < 25) {
    const f = FACE_ORDER[Math.floor(Math.random() * 6)];
    if (f === prev) continue;
    prev = f;
    moves.push({ face: f, turns: [1, 2, -1][Math.floor(Math.random() * 3)] });
  }
  enqueue(() => {
    state = new CubeState();
    for (const m of moves) state.move(m.face, m.turns);
    view.sync(state);
  }).then(() => {
    history.length = 0;
    redo = [];
    dropSolution();
    renderHistory();
    afterChange();
    toast(`已随机打乱：${moves.map(tokenOf).join(' ')}`);
  });
});
$('btn-reset').addEventListener('click', () => {
  enqueue(() => {
    state = new CubeState();
    view.sync(state);
  }).then(() => {
    history.length = 0;
    redo = [];
    dropSolution();
    renderHistory();
    afterChange();
  });
});

$('btn-view').addEventListener('click', () => {
  view3d = view3d === 'mech' ? 'shape' : 'mech';
  view.setView(view3d);
  $('btn-view').textContent = view3d === 'mech' ? '看外形' : '按中心块握';
});
for (const b of $('inner-seg').querySelectorAll('button')) {
  b.addEventListener('click', () => {
    view.setInnerStyle(b.dataset.inner);
    for (const x of $('inner-seg').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
  });
}
$('btn-labels').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  view.setLabelsVisible(on);
});

// ---------------------------------------------------------------------------
// UI: editing

const slotKey = (p) => p.join(',');
const sameSlot = (a, b) => a && b && slotKey(a) === slotKey(b);

function pushEdit() {
  editStack.push(state.toJSON());
  if (editStack.length > 200) editStack.shift();
  dropSolution('模型改动了，需要重新计算解法。');
}

function onClick(id, ev) {
  if (id == null) {
    if (selected) {
      selected = null;
      setEditHint();
      refreshHighlight();
    }
    return;
  }
  const q = state.cubies[id];
  if (tab === 'play') {
    if (q.type === 'center') {
      const f = FACE_ORDER.find((x) => slotKey(faceDir(x)) === slotKey(q.pos));
      manualMove({ face: f, turns: ev.shiftKey ? -1 : 1 });
    }
    return;
  }
  if (tab !== 'edit') return;
  if (tool === 'twist') {
    pushEdit();
    twistPiece(state, q.pos, ev.shiftKey ? -1 : 1);
    view.sync(state);
    afterChange();
    return;
  }
  // swap tool
  if (!selected) {
    if (q.type === 'center') {
      toast('中心块不能换位置，只能用「转方向」原地转。');
      return;
    }
    selected = q.pos.slice();
  } else if (sameSlot(selected, q.pos)) {
    selected = null;
  } else {
    const a = state.cubieAt(selected);
    if (a.type !== q.type) {
      if (q.type === 'center') {
        toast('中心块不能换位置。');
        return;
      }
      selected = q.pos.slice();
      toast(q.type === 'corner' ? '已改选这个角块（角块只能和角块交换）。' : '已改选这个棱块（棱块只能和棱块交换）。');
    } else {
      pushEdit();
      swapPieces(state, selected, q.pos);
      selected = null;
      view.sync(state);
      afterChange();
    }
  }
  setEditHint();
  refreshHighlight();
}

function onHover(id) {
  if (id === hoverId) return;
  hoverId = id;
  refreshHighlight();
}

function setEditHint() {
  const el = $('edit-hint');
  if (tool === 'twist') el.textContent = '点一块让它原地转一下；按住 Shift 点击则反向转。';
  else if (selected) {
    const t = state.cubieAt(selected).type === 'corner' ? '角块' : '棱块';
    el.textContent = `已选中一个${t}。再点另一个${t}与它交换；点它自己取消。`;
  } else el.textContent = '先点一块要移动的块。';
}

for (const b of $('tool-seg').querySelectorAll('button')) {
  b.addEventListener('click', () => {
    tool = b.dataset.tool;
    selected = null;
    for (const x of $('tool-seg').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    setEditHint();
    refreshHighlight();
  });
}

$('centers').innerHTML = FACE_ORDER.map(
  (f) => `<div class="center-item"><span class="letter">${f}</span>${chipsHTML(f)}<span>${centerName(f)}</span><small>${POS_NAME[f]}</small></div>`,
).join('');

const VERDICTS = {
  twist: ['角块方向不对', '至少有一个角块需要再转一下：所有角块的扭转加起来必须刚好转满。'],
  flip: ['棱块方向不对', '有一个棱块需要翻面。'],
  parity: ['有两块位置放反了', '真实的魔方不可能只差一次交换，检查一下是不是两个棱块或两个角块互换了。'],
  'center-parity': ['中心块方向不对', '有一个中心块需要再转 90°（实物上不可能出现这种情况）。'],
  'center-axis': ['中心块位置错误', '中心块必须留在原位。'],
  pieces: ['块的数量不对', '请把模型全部复原后重新录入。'],
};
function renderVerdict() {
  const el = $('verdict');
  const err = validate(state);
  if (!err) {
    el.dataset.ok = 'true';
    el.innerHTML = state.isSolved()
      ? '<b>当前是复原状态</b><span>按实物调整模型，或直接在「转动」里练习。</span>'
      : '<b>可以求解</b><span>这是一个实物能转出来的状态。去「求解演示」计算步骤。</span>';
  } else {
    const [t, d] = VERDICTS[err] || ['状态有误', err];
    el.dataset.ok = 'false';
    el.innerHTML = `<b>${t}</b><span>${d}</span>`;
  }
}

$('btn-edit-undo').addEventListener('click', () => {
  const s = editStack.pop();
  if (!s) return toast('没有可以撤销的录入步骤。');
  state = CubeState.fromJSON(s);
  selected = null;
  view.sync(state);
  dropSolution();
  afterChange();
});
$('btn-edit-reset').addEventListener('click', () => {
  pushEdit();
  state = new CubeState();
  selected = null;
  view.sync(state);
  afterChange();
});
$('btn-apply-scramble').addEventListener('click', () => {
  const text = $('scramble-input').value.replace(/[’‘`]/g, "'");
  let moves;
  try {
    moves = parseAlg(text);
  } catch {
    return toast('公式里有认不出的记号。只能用 U R F D L B，后面可跟 \' 或 2。');
  }
  if (!moves.length) return toast('请先输入打乱公式。');
  pushEdit();
  state = new CubeState();
  for (const m of moves) state.move(m.face, m.turns);
  view.sync(state);
  afterChange();
  toast(`已按 ${moves.length} 步公式打乱。`);
});
$('btn-copy-code').addEventListener('click', async () => {
  const input = $('code-input');
  try {
    await navigator.clipboard.writeText(input.value);
    toast('状态码已复制。');
  } catch {
    input.select();
    toast('已选中状态码，请手动复制。');
  }
});
$('btn-load-code').addEventListener('click', () => {
  try {
    const s = decodeState($('code-input').value);
    pushEdit();
    state = s;
    view.sync(state);
    afterChange();
    toast('已载入状态码。');
  } catch (e) {
    toast(e.message);
  }
});

// ---------------------------------------------------------------------------
// UI: solving

const worker = new Worker(new URL('./solver/worker.js', import.meta.url), { type: 'module' });
let reqId = 0;
const pending = new Map();
worker.onmessage = (e) => {
  const cb = pending.get(e.data.id);
  pending.delete(e.data.id);
  cb?.(e.data);
};
const ask = (msg) =>
  new Promise((resolve) => {
    const id = ++reqId;
    pending.set(id, resolve);
    worker.postMessage({ ...msg, id });
  });
ask({ type: 'init' });

$('btn-solve').addEventListener('click', async () => {
  const err = validate(state);
  if (err) {
    const [t, d] = VERDICTS[err] || ['状态有误', ''];
    $('solve-note').textContent = `${t}：${d} 请先在「录入状态」里修正。`;
    return;
  }
  if (state.isSolved()) {
    $('solve-note').textContent = '模型已经是复原状态，不需要求解。';
    return;
  }
  const btn = $('btn-solve');
  btn.disabled = true;
  $('solve-note').textContent = '正在计算……（通常 1–3 秒）';
  await chain;
  const snapshot = state.clone();
  const res = await ask({ type: 'solve', state: snapshot.toJSON() });
  btn.disabled = false;
  if (!res.ok) {
    $('solve-note').textContent = `没算出来：${res.error}`;
    return;
  }
  const moves = [];
  res.stages.forEach((s, si) => s.moves.forEach((m) => moves.push({ ...m, stage: si })));
  solution = { start: snapshot, stages: res.stages, moves, index: 0, target: 0 };
  const main = res.stages.filter((s) => s.name === 'blocks').reduce((a, s) => a + s.moves.length, 0);
  const fix = moves.length - main;
  $('solve-note').textContent =
    `共 ${moves.length} 步：角块和棱块归位 ${main} 步` + (fix ? `，中心块转正 ${fix} 步` : '') + `。用时 ${(res.ms / 1000).toFixed(1)} 秒。`;
  renderSolution();
});

function dropSolution(note) {
  if (!solution) return;
  playing = false;
  solution = null;
  $('solution').hidden = true;
  $('hud').hidden = true;
  if (note) $('solve-note').textContent = note;
  refreshHighlight();
}

function renderSolution() {
  const s = solution;
  $('solution').hidden = !s;
  $('hud').hidden = !s || tab === 'edit';
  if (!s) return;
  let html = '';
  let fixNo = 0;
  let offset = 0;
  s.stages.forEach((st) => {
    const title = st.name === 'blocks' ? '第一段 · 角块和棱块归位' : `第二段 · 中心块转正（公式 ${++fixNo}）`;
    html += `<div class="stage-block"><h3><span>${title}</span><span>${st.moves.length} 步</span></h3><div class="tokens">`;
    st.moves.forEach((m, k) => {
      const i = offset + k;
      html += `<button type="button" class="tok" data-i="${i}" title="${describe(m)}">${tokenOf(m)}</button>`;
    });
    html += '</div></div>';
    offset += st.moves.length;
  });
  $('stage-list').innerHTML = html;
  for (const b of $('stage-list').querySelectorAll('.tok')) b.addEventListener('click', () => goTo(+b.dataset.i));
  renderStep();
  refreshHighlight();
}

function renderStep() {
  const s = solution;
  if (!s) return;
  const n = s.moves.length;
  const done = s.index >= n;
  const m = s.moves[s.index];
  $('now-move').textContent = done ? '✓' : tokenOf(m);
  $('now-count').textContent = done ? `全部 ${n} 步完成` : `第 ${s.index + 1} / ${n} 步`;
  $('now-desc').textContent = done ? '复原了。实物也应该回到立方体。' : describe(m);
  $('hud-move').textContent = done ? '✓' : tokenOf(m);
  $('hud-title').textContent = done ? '完成' : `第 ${s.index + 1} / ${n} 步`;
  $('hud-desc').textContent = done ? '已复原' : `${centerName(m.face)}层 ${turnText(m.turns)}`;
  $('btn-prev').disabled = $('hud-prev').disabled = s.index === 0;
  $('btn-next').disabled = $('hud-next').disabled = done;
  $('btn-first').disabled = s.index === 0;
  $('btn-play').textContent = playing ? '暂停' : done ? '重播' : '播放';
  for (const b of $('stage-list').querySelectorAll('.tok')) {
    const i = +b.dataset.i;
    b.classList.toggle('done', i < s.index);
    b.classList.toggle('current', i === s.index);
  }
  $('stage-list').querySelector('.tok.current')?.scrollIntoView({ block: 'nearest' });
}

let driving = false;
async function drive() {
  if (driving) return;
  driving = true;
  while (solution && solution.index !== solution.target) {
    const s = solution;
    if (Math.abs(s.target - s.index) > 2) {
      await chain;
      state = s.start.clone();
      for (const m of s.moves.slice(0, s.target)) state.move(m.face, m.turns);
      view.sync(state);
      s.index = s.target;
    } else if (s.target > s.index) {
      await enqueue(() => runMove(s.moves[s.index]));
      s.index++;
    } else {
      await enqueue(() => runMove(invertAlg([s.moves[s.index - 1]])[0]));
      s.index--;
    }
    renderStep();
  }
  driving = false;
  saveState();
  renderStatus();
  $('code-input').value = encodeState(state);
  refreshHighlight();
}
function goTo(i) {
  if (!solution) return;
  playing = false;
  solution.target = Math.max(0, Math.min(solution.moves.length, i));
  renderStep();
  drive();
}
const step = (d) => solution && goTo(solution.target + d);

async function play() {
  if (!solution) return;
  if (solution.index >= solution.moves.length) {
    goTo(0);
    await new Promise((r) => setTimeout(r, 400));
  }
  playing = true;
  renderStep();
  while (playing && solution && solution.index < solution.moves.length) {
    solution.target = solution.index + 1;
    await drive();
    await new Promise((r) => setTimeout(r, SPEEDS[speed][0] * 0.6));
  }
  playing = false;
  renderStep();
}

$('btn-next').addEventListener('click', () => step(1));
$('btn-prev').addEventListener('click', () => step(-1));
$('hud-next').addEventListener('click', () => step(1));
$('hud-prev').addEventListener('click', () => step(-1));
$('btn-first').addEventListener('click', () => goTo(0));
$('btn-play').addEventListener('click', () => {
  if (playing) {
    playing = false;
    renderStep();
  } else play();
});
$('focus-layer').addEventListener('change', (e) => {
  focusLayer = e.target.checked;
  refreshHighlight();
});
$('speed').addEventListener('input', (e) => {
  speed = +e.target.value;
  $('speed-label').textContent = SPEEDS[speed][1];
});

// ---------------------------------------------------------------------------
// Highlight + arrow

function refreshHighlight() {
  if (animating) return;
  const map = new Map();
  let arrow = null;
  const layerOf = (f) => state.layer(f).map((q) => q.id);
  if (tab === 'edit') {
    if (selected) map.set(state.cubieAt(selected).id, 'select');
    if (hoverId != null && !map.has(hoverId)) map.set(hoverId, 'hover');
  } else if (tab === 'play') {
    let f = previewMove?.face;
    if (!f && hoverId != null && state.cubies[hoverId].type === 'center') {
      f = FACE_ORDER.find((x) => slotKey(faceDir(x)) === slotKey(state.cubies[hoverId].pos));
    }
    if (f) for (const id of layerOf(f)) map.set(id, 'layer');
    if (previewMove) arrow = previewMove;
  }
  if (tab !== 'edit' && solution && solution.index === solution.target && solution.index < solution.moves.length && !previewMove) {
    const m = solution.moves[solution.index];
    for (const id of layerOf(m.face)) map.set(id, 'layer');
    arrow = m;
  }
  // While a turn is being shown, fade everything outside that layer.
  if (arrow && focusLayer) for (const q of state.cubies) if (!map.has(q.id)) map.set(q.id, 'dim');
  view.setHighlight(map);
  if (arrow) view.showArrow(arrow.face, arrow.turns);
  else view.hideArrow();
}

// ---------------------------------------------------------------------------
// Tabs, keyboard, toast

for (const t of document.querySelectorAll('.tab')) {
  t.addEventListener('click', () => {
    tab = t.id.replace('tab-', '');
    for (const x of document.querySelectorAll('.tab')) {
      x.setAttribute('aria-selected', String(x === t));
      $(x.dataset.pane).hidden = x !== t;
    }
    selected = null;
    $('hud').hidden = !solution || tab === 'edit';
    setEditHint();
    refreshHighlight();
  });
}

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toUpperCase();
  if (tab === 'play' && FACES[k]) {
    e.preventDefault();
    manualMove({ face: k, turns: e.shiftKey ? -1 : 1 });
  } else if (solution && tab === 'solve' && (e.key === 'ArrowRight' || e.key === ' ')) {
    e.preventDefault();
    step(1);
  } else if (solution && tab === 'solve' && e.key === 'ArrowLeft') {
    e.preventDefault();
    step(-1);
  } else if (e.key === 'Escape' && selected) {
    selected = null;
    setEditHint();
    refreshHighlight();
  }
});

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

// ---------------------------------------------------------------------------

buildFaceTable();
renderHistory();
renderStatus();
renderVerdict();
setEditHint();
$('code-input').value = encodeState(state);
refreshHighlight();
