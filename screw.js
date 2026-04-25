/* ===========================================================
 * ネジマッチパズル ― HARD（明るいテーマ・即時反応版）
 * - LV1〜5 をクリア後は HARD_POOL からランダムに無限ループ
 * =========================================================== */
'use strict';

// ----------- 色（記号と組合せて識別性UP） -----------
const PALETTE = [
  { id: 0, hex: '#dc2626', name: 'red'    }, // +
  { id: 1, hex: '#facc15', name: 'yellow' }, // ▲
  { id: 2, hex: '#2563eb', name: 'blue'   }, // ●
  { id: 3, hex: '#16a34a', name: 'green'  }, // ■
  { id: 4, hex: '#f97316', name: 'orange' }, // −
  { id: 5, hex: '#9333ea', name: 'purple' }, // ◆
  { id: 6, hex: '#06b6d4', name: 'cyan'   }, // ★
  { id: 7, hex: '#ec4899', name: 'pink'   }, // ✕
];

// 各色固有のシンボル描画関数 (head中心 [0,0] に対する SVG 子要素を追加)
function svgChild(parent, name, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
  parent.appendChild(el);
  return el;
}
const SYMBOLS_SVG = [
  // 0: + 縦横プラス（赤）
  (g, scale=1) => {
    const s = 5.2 * scale;
    svgChild(g, 'line', { class:'sym', x1:-s, y1:0, x2:s, y2:0 });
    svgChild(g, 'line', { class:'sym', x1:0, y1:-s, x2:0, y2:s });
  },
  // 1: ▲ 三角（黄）
  (g, scale=1) => {
    const s = 5.4 * scale;
    svgChild(g, 'polygon', { class:'sym-fill', points: `0,${-s} ${s*0.95},${s*0.7} ${-s*0.95},${s*0.7}` });
  },
  // 2: ● 丸（青）
  (g, scale=1) => {
    svgChild(g, 'circle', { class:'sym-fill', cx:0, cy:0, r: 4 * scale });
  },
  // 3: ■ 四角（緑）
  (g, scale=1) => {
    const s = 4.2 * scale;
    svgChild(g, 'rect', { class:'sym-fill', x:-s, y:-s, width: s*2, height: s*2, rx: 0.6 });
  },
  // 4: − 横棒（橙）
  (g, scale=1) => {
    const s = 5.6 * scale;
    svgChild(g, 'line', { class:'sym', x1:-s, y1:0, x2:s, y2:0 });
  },
  // 5: ◆ ダイヤ（紫）
  (g, scale=1) => {
    const s = 5.4 * scale;
    svgChild(g, 'polygon', { class:'sym-fill', points: `0,${-s} ${s},0 0,${s} ${-s},0` });
  },
  // 6: ★ 星（シアン）
  (g, scale=1) => {
    const r1 = 5.2 * scale, r2 = 2.2 * scale;
    const pts = [];
    for (let i=0;i<10;i++){
      const a = -Math.PI/2 + i * Math.PI/5;
      const r = (i%2===0) ? r1 : r2;
      pts.push(`${(r*Math.cos(a)).toFixed(2)},${(r*Math.sin(a)).toFixed(2)}`);
    }
    svgChild(g, 'polygon', { class:'sym-fill', points: pts.join(' ') });
  },
  // 7: ✕ バツ（ピンク）
  (g, scale=1) => {
    const s = 4 * scale;
    svgChild(g, 'line', { class:'sym', x1:-s, y1:-s, x2:s, y2:s });
    svgChild(g, 'line', { class:'sym', x1:-s, y1:s,  x2:s, y2:-s });
  },
];

// ----------- 通常レベル定義 -----------
const LEVELS = [
  {
    name: 'WARM-UP', colors: 3, slots: 5, undo: 3, add: 1, mag: 1,
    boards: [
      { x:  60, y:  40, w: 220, h: 110, rot: -3, layer: 1, n: 6 },
      { x: 320, y:  40, w: 220, h: 110, rot:  4, layer: 1, n: 6 },
      { x: 190, y: 200, w: 220, h: 110, rot:  2, layer: 2, n: 6 },
    ]
  },
  {
    name: 'STACK', colors: 4, slots: 5, undo: 3, add: 1, mag: 1,
    boards: [
      { x:  40, y:  30, w: 240, h: 110, rot: -4, layer: 1, n: 6 },
      { x: 300, y:  30, w: 240, h: 110, rot:  4, layer: 1, n: 6 },
      { x:  90, y: 160, w: 220, h: 110, rot:  3, layer: 2, n: 6 },
      { x: 290, y: 170, w: 240, h: 110, rot: -3, layer: 2, n: 6 },
      { x: 180, y: 290, w: 240, h: 110, rot:  2, layer: 3, n: 6 },
    ]
  },
  {
    name: 'WEAVE', colors: 5, slots: 5, undo: 2, add: 1, mag: 1,
    boards: [
      { x:  40, y:  30, w: 200, h: 100, rot: -5, layer: 1, n: 6 },
      { x: 250, y:  20, w: 200, h: 100, rot:  3, layer: 2, n: 6 },
      { x: 410, y:  50, w: 170, h: 100, rot:  6, layer: 1, n: 4 },
      { x:  60, y: 150, w: 220, h: 100, rot:  3, layer: 3, n: 6 },
      { x: 290, y: 140, w: 220, h: 100, rot: -2, layer: 1, n: 6 },
      { x: 110, y: 270, w: 220, h: 100, rot:  2, layer: 2, n: 6 },
      { x: 320, y: 280, w: 220, h: 100, rot: -4, layer: 3, n: 5 },
    ]
  },
  {
    name: 'PRESSURE', colors: 6, slots: 4, undo: 2, add: 1, mag: 1,
    boards: [
      { x:  20, y:  20, w: 200, h: 100, rot: -3, layer: 1, n: 6 },
      { x: 200, y:  20, w: 200, h: 100, rot:  3, layer: 2, n: 6 },
      { x: 380, y:  20, w: 200, h: 100, rot: -3, layer: 1, n: 6 },
      { x:  60, y: 130, w: 200, h: 100, rot:  4, layer: 3, n: 6 },
      { x: 240, y: 130, w: 200, h: 100, rot: -4, layer: 1, n: 6 },
      { x: 410, y: 130, w: 170, h: 100, rot:  3, layer: 3, n: 6 },
      { x:  20, y: 250, w: 220, h: 100, rot:  3, layer: 2, n: 6 },
      { x: 250, y: 250, w: 200, h: 100, rot: -2, layer: 3, n: 6 },
      { x: 420, y: 260, w: 170, h: 100, rot:  4, layer: 1, n: 6 },
    ]
  },
  {
    name: 'NIGHTMARE', colors: 7, slots: 4, undo: 1, add: 1, mag: 1,
    boards: [
      { x:  10, y:  20, w: 180, h:  90, rot: -5, layer: 1, n: 6 },
      { x: 170, y:  10, w: 180, h:  90, rot:  4, layer: 2, n: 6 },
      { x: 330, y:  20, w: 180, h:  90, rot: -3, layer: 3, n: 6 },
      { x: 470, y:  30, w: 120, h:  90, rot:  6, layer: 1, n: 4 },
      { x:  20, y: 110, w: 200, h:  90, rot:  4, layer: 2, n: 6 },
      { x: 220, y: 100, w: 180, h:  90, rot: -3, layer: 3, n: 6 },
      { x: 380, y: 110, w: 200, h:  90, rot:  3, layer: 2, n: 6 },
      { x:  40, y: 200, w: 200, h:  90, rot: -2, layer: 3, n: 6 },
      { x: 230, y: 200, w: 180, h:  90, rot:  3, layer: 1, n: 6 },
      { x: 400, y: 210, w: 180, h:  90, rot: -4, layer: 3, n: 5 },
      { x:  60, y: 300, w: 220, h:  90, rot:  3, layer: 1, n: 6 },
      { x: 290, y: 310, w: 220, h:  90, rot: -3, layer: 2, n: 6 },
    ]
  },
];

// ----------- LV6相当 ENDLESS POOL -----------
const HARD_POOL = [
  {
    name: 'CASCADE', colors: 7, slots: 4, undo: 1, add: 1, mag: 1,
    boards: [
      { x:  10, y:   5, w: 220, h:  90, rot: -3, layer: 1, n: 6 },
      { x: 200, y:  15, w: 200, h:  90, rot:  4, layer: 2, n: 6 },
      { x: 380, y:   5, w: 200, h:  90, rot: -4, layer: 3, n: 6 },
      { x:  10, y: 100, w: 200, h:  90, rot:  3, layer: 2, n: 6 },
      { x: 180, y: 110, w: 220, h:  90, rot: -3, layer: 3, n: 6 },
      { x: 380, y: 100, w: 200, h:  90, rot:  4, layer: 1, n: 6 },
      { x:  10, y: 200, w: 220, h:  90, rot: -4, layer: 3, n: 6 },
      { x: 210, y: 210, w: 180, h:  90, rot:  3, layer: 1, n: 6 },
      { x: 380, y: 200, w: 200, h:  90, rot: -3, layer: 2, n: 6 },
      { x:  10, y: 305, w: 200, h:  90, rot:  4, layer: 3, n: 4 },
      { x: 200, y: 295, w: 200, h:  90, rot: -3, layer: 1, n: 6 },
      { x: 380, y: 310, w: 200, h:  90, rot:  3, layer: 2, n: 5 },
    ] // total 69
  },
  {
    name: 'TOWER', colors: 7, slots: 4, undo: 1, add: 1, mag: 1,
    boards: [
      { x:  20, y:  10, w: 180, h:  85, rot: -3, layer: 1, n: 6 },
      { x: 200, y:  20, w: 180, h:  85, rot:  3, layer: 2, n: 6 },
      { x: 380, y:  10, w: 180, h:  85, rot: -4, layer: 3, n: 6 },
      { x:  60, y:  90, w: 200, h:  85, rot:  4, layer: 3, n: 6 },
      { x: 250, y: 100, w: 200, h:  85, rot: -3, layer: 1, n: 6 },
      { x: 420, y:  90, w: 160, h:  85, rot:  3, layer: 2, n: 5 },
      { x:  20, y: 180, w: 200, h:  85, rot: -3, layer: 2, n: 6 },
      { x: 220, y: 190, w: 180, h:  85, rot:  3, layer: 3, n: 6 },
      { x: 410, y: 180, w: 170, h:  85, rot: -4, layer: 1, n: 4 },
      { x:  60, y: 270, w: 200, h:  85, rot:  3, layer: 1, n: 6 },
      { x: 260, y: 280, w: 200, h:  85, rot: -3, layer: 3, n: 6 },
      { x:  30, y: 360, w: 220, h:  85, rot:  3, layer: 2, n: 6 },
      { x: 290, y: 365, w: 240, h:  85, rot: -2, layer: 1, n: 6 },
    ] // total 75
  },
  {
    name: 'STORM', colors: 8, slots: 4, undo: 1, add: 1, mag: 1,
    boards: [
      { x:  10, y:   5, w: 240, h:  90, rot: -4, layer: 2, n: 6 },
      { x: 230, y:  10, w: 200, h:  90, rot:  3, layer: 1, n: 6 },
      { x: 410, y:  20, w: 180, h:  90, rot: -3, layer: 3, n: 6 },
      { x:  20, y:  90, w: 180, h:  90, rot:  4, layer: 3, n: 6 },
      { x: 180, y: 105, w: 240, h:  90, rot: -3, layer: 1, n: 6 },
      { x: 400, y: 110, w: 200, h:  90, rot:  3, layer: 2, n: 6 },
      { x:  40, y: 195, w: 220, h:  90, rot: -3, layer: 3, n: 6 },
      { x: 240, y: 200, w: 180, h:  90, rot:  4, layer: 2, n: 6 },
      { x: 410, y: 200, w: 180, h:  90, rot: -2, layer: 1, n: 4 },
      { x:  10, y: 290, w: 200, h:  90, rot:  3, layer: 1, n: 6 },
      { x: 200, y: 295, w: 220, h:  90, rot: -3, layer: 2, n: 6 },
      { x: 410, y: 290, w: 180, h:  90, rot:  4, layer: 3, n: 6 },
      { x: 100, y: 375, w: 200, h:  85, rot: -3, layer: 1, n: 4 },
      { x: 290, y: 375, w: 220, h:  85, rot:  3, layer: 2, n: 6 },
    ] // total 80 → adjust
  },
  {
    name: 'FORTRESS', colors: 7, slots: 4, undo: 1, add: 1, mag: 1,
    boards: [
      { x:  10, y:  10, w: 280, h: 110, rot: -3, layer: 1, n: 6 },
      { x: 310, y:  10, w: 280, h: 110, rot:  3, layer: 2, n: 6 },
      { x:  60, y: 130, w: 240, h: 100, rot:  3, layer: 3, n: 6 },
      { x: 300, y: 135, w: 240, h: 100, rot: -3, layer: 1, n: 6 },
      { x:  10, y: 240, w: 200, h:  95, rot: -2, layer: 2, n: 6 },
      { x: 200, y: 245, w: 200, h:  95, rot:  3, layer: 3, n: 6 },
      { x: 390, y: 240, w: 200, h:  95, rot: -3, layer: 1, n: 6 },
      { x:  20, y: 350, w: 280, h:  95, rot:  2, layer: 3, n: 6 },
      { x: 310, y: 360, w: 280, h:  95, rot: -3, layer: 2, n: 6 },
    ] // total 54
  },
  {
    name: 'LATTICE', colors: 8, slots: 4, undo: 1, add: 1, mag: 1,
    boards: [
      { x:  10, y:  10, w: 160, h:  85, rot: -4, layer: 1, n: 4 },
      { x: 160, y:  20, w: 160, h:  85, rot:  3, layer: 2, n: 4 },
      { x: 310, y:  10, w: 160, h:  85, rot: -3, layer: 3, n: 4 },
      { x: 460, y:  20, w: 130, h:  85, rot:  4, layer: 1, n: 4 },
      { x:  30, y: 100, w: 160, h:  85, rot:  4, layer: 2, n: 4 },
      { x: 180, y: 110, w: 160, h:  85, rot: -3, layer: 3, n: 4 },
      { x: 330, y: 100, w: 160, h:  85, rot:  3, layer: 1, n: 4 },
      { x: 470, y: 110, w: 130, h:  85, rot: -4, layer: 2, n: 4 },
      { x:  10, y: 195, w: 160, h:  85, rot: -3, layer: 3, n: 4 },
      { x: 160, y: 200, w: 160, h:  85, rot:  4, layer: 1, n: 4 },
      { x: 310, y: 195, w: 160, h:  85, rot: -3, layer: 2, n: 4 },
      { x: 460, y: 200, w: 130, h:  85, rot:  3, layer: 3, n: 4 },
      { x:  30, y: 290, w: 160, h:  85, rot:  3, layer: 1, n: 4 },
      { x: 180, y: 295, w: 160, h:  85, rot: -3, layer: 2, n: 4 },
      { x: 330, y: 290, w: 160, h:  85, rot:  4, layer: 3, n: 4 },
      { x: 470, y: 295, w: 130, h:  85, rot: -3, layer: 1, n: 4 },
      { x:  60, y: 380, w: 200, h:  80, rot:  3, layer: 1, n: 4 },
      { x: 270, y: 385, w: 200, h:  80, rot: -3, layer: 2, n: 4 },
    ] // total 72
  },
];

// ----------- SE -----------
const tapPool = [];
for (let i = 0; i < 4; i++) {
  const a = new Audio('tapu.ogg');
  a.preload = 'auto';
  a.volume = 0.6;
  tapPool.push(a);
}
let tapIdx = 0;
function playTap() {
  const a = tapPool[tapIdx];
  tapIdx = (tapIdx + 1) % tapPool.length;
  try { a.currentTime = 0; a.play().catch(()=>{}); } catch (e) {}
}
const clearAudio = new Audio('clear.ogg');
clearAudio.preload = 'auto';
clearAudio.volume = 0.85;
function playClear() {
  try { clearAudio.currentTime = 0; clearAudio.play().catch(()=>{}); } catch (e) {}
}

// iOS等で audio をユーザー操作後に unlock
let audioPrimed = false;
function primeAudio() {
  if (audioPrimed) return;
  audioPrimed = true;
  [...tapPool, clearAudio].forEach(a => {
    const v = a.volume;
    a.volume = 0;
    a.play().then(() => { a.pause(); a.currentTime = 0; a.volume = v; })
            .catch(() => { a.volume = v; });
  });
}

// ----------- 状態 -----------
const State = {
  levelIdx: 0,
  curLevel: null,
  boards: [],
  screws: [],
  tray: [],
  slotCap: 5,
  bonusSlots: 0,
  history: [],
  uses: { undo: 0, add: 0, mag: 0 },
  movesUsed: 0,
  busy: false,
  gameOver: false,
  justAddedFrom: 0,
};

// ----------- DOM参照 -----------
const $ = id => document.getElementById(id);
const stage = $('stage');
const tray = $('tray');

// ----------- ユーティリティ -----------
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
function shuffle(arr, rand) {
  for (let i = arr.length-1; i>0; i--) {
    const j = Math.floor(rand()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr;
}

function localToWorld(b, lx, ly) {
  const cx = b.x + b.w/2, cy = b.y + b.h/2;
  const rad = b.rot * Math.PI / 180;
  const dx = lx - b.w/2, dy = ly - b.h/2;
  return {
    x: cx + dx*Math.cos(rad) - dy*Math.sin(rad),
    y: cy + dx*Math.sin(rad) + dy*Math.cos(rad)
  };
}
function pointInBoard(px, py, b) {
  const cx = b.x + b.w/2, cy = b.y + b.h/2;
  const rad = -b.rot * Math.PI / 180;
  const dx = px - cx, dy = py - cy;
  const lx = dx*Math.cos(rad) - dy*Math.sin(rad);
  const ly = dx*Math.sin(rad) + dy*Math.cos(rad);
  return Math.abs(lx) <= b.w/2 - 4 && Math.abs(ly) <= b.h/2 - 4;
}

// ----------- レベル選択 -----------
function pickLevel(idx) {
  if (idx < LEVELS.length) return LEVELS[idx];
  // LV6以降は HARD_POOL からランダム
  const i = Math.floor(Math.random() * HARD_POOL.length);
  return HARD_POOL[i];
}

// 総ネジ数を3の倍数に揃える（過剰分はランダム板から減らす）
function adjustToMultipleOf3(boards, rand) {
  let total = boards.reduce((s,b)=>s+b.n, 0);
  let safety = 30;
  while (total % 3 !== 0 && safety-- > 0) {
    const candidates = boards.filter(b => b.n > 1);
    if (!candidates.length) break;
    const b = candidates[Math.floor(rand()*candidates.length)];
    b.n--;
    total--;
  }
}

// ----------- レベル初期化 -----------
function initLevel(idx) {
  State.levelIdx = idx;
  const def = pickLevel(idx);
  State.curLevel = def;

  // ボードを deep copy（ランダムpoolを破壊しないため）
  State.boards = def.boards.map((b, i) => ({
    id: i, x: b.x, y: b.y, w: b.w, h: b.h, rot: b.rot, layer: b.layer, n: b.n,
    cleared: false
  }));
  State.slotCap = def.slots;
  State.bonusSlots = 0;
  State.tray = [];
  State.history = [];
  State.movesUsed = 0;
  State.busy = false;
  State.gameOver = false;
  State.justAddedFrom = 0;
  State.uses = { undo: def.undo, add: def.add, mag: def.mag };

  const seed = 12345 + idx*7919 + Math.floor(Math.random()*1e6);
  const rand = rng(seed);

  adjustToMultipleOf3(State.boards, rand);

  // ネジ生成
  let allScrews = [];
  let sid = 0;
  for (const b of State.boards) {
    const positions = gridPositions(b, b.n, rand);
    for (const p of positions) {
      const w = localToWorld(b, p.x, p.y);
      allScrews.push({
        id: sid++, boardId: b.id,
        lx: p.x, ly: p.y, wx: w.x, wy: w.y,
        color: -1, removed: false, locked: false,
      });
    }
  }
  // 色割り当て (multiple of 3)
  const total = allScrews.length;
  const C = def.colors;
  const counts = new Array(C).fill(0);
  for (let c=0; c<C; c++) counts[c] = 3;
  let remaining = total - 3*C;
  while (remaining >= 3) {
    const c = Math.floor(rand()*C);
    counts[c] += 3; remaining -= 3;
  }
  // remaining must be 0 since we adjusted total
  const colorBag = [];
  for (let c=0; c<C; c++) for (let k=0;k<counts[c];k++) colorBag.push(c);
  shuffle(colorBag, rand);
  for (let i=0;i<allScrews.length;i++) allScrews[i].color = colorBag[i] || 0;

  State.screws = allScrews;
  render();
  updateHud();
}

function gridPositions(b, n, rand) {
  const mx = 20, my = 18;
  const innerW = b.w - mx*2, innerH = b.h - my*2;
  let cols, rows;
  if (n <= 3) { cols=3; rows=1; }
  else if (n<=4){ cols=2; rows=2; }
  else if (n<=6){ cols=3; rows=2; }
  else if (n<=8){ cols=4; rows=2; }
  else { cols=3; rows=3; }
  const slots = [];
  for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
    const x = mx + (innerW/(cols)) * c + innerW/(cols*2);
    const y = my + (innerH/(rows)) * r + innerH/(rows*2);
    slots.push({x,y});
  }
  shuffle(slots, rand);
  return slots.slice(0, n);
}

// ----------- ロック判定 -----------
function recomputeLocks() {
  for (const s of State.screws) {
    if (s.removed) continue;
    s.locked = false;
    const myBoard = State.boards[s.boardId];
    for (const b2 of State.boards) {
      if (b2.id === myBoard.id || b2.cleared) continue;
      if (b2.layer <= myBoard.layer) continue;
      if (pointInBoard(s.wx, s.wy, b2)) {
        s.locked = true;
        break;
      }
    }
  }
}

// ----------- 描画 -----------
function svgEl(name, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function render() {
  stage.innerHTML = '';
  const defs = svgEl('defs');
  defs.innerHTML = `
    <linearGradient id="boardGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#e8dec0"/>
      <stop offset="40%" stop-color="#b3a886"/>
      <stop offset="100%" stop-color="#75694a"/>
    </linearGradient>
    <radialGradient id="screwHead" cx="35%" cy="30%" r="70%">
      <stop offset="0%"  stop-color="#7a6f5e"/>
      <stop offset="60%" stop-color="#3a3026"/>
      <stop offset="100%" stop-color="#15100a"/>
    </radialGradient>
    <filter id="boardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feOffset dx="0" dy="3"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  `;
  stage.appendChild(defs);

  const sorted = [...State.boards].sort((a,b)=>a.layer-b.layer);
  for (const b of sorted) {
    if (b.cleared) continue;
    drawBoard(b);
  }
  recomputeLocks();
  for (const s of State.screws) {
    if (s.removed || !s.el) continue;
    s.el.classList.toggle('locked', s.locked);
  }
  renderTray();
}

function drawBoard(b) {
  const g = svgEl('g', {
    class: 'board-group',
    transform: `translate(${b.x+b.w/2},${b.y+b.h/2}) rotate(${b.rot}) translate(${-b.w/2},${-b.h/2})`
  });
  b.el = g;
  g.appendChild(svgEl('rect', {
    class: 'board-rect',
    x: 0, y: 0, width: b.w, height: b.h,
    rx: 10, ry: 10
  }));
  const inset = 6;
  for (const [bx,by] of [[inset,inset],[b.w-inset,inset],[inset,b.h-inset],[b.w-inset,b.h-inset]]) {
    g.appendChild(svgEl('circle', { class: 'board-bolt', cx: bx, cy: by, r: 2 }));
  }
  g.appendChild(svgEl('rect', {
    x: 4, y: 4, width: b.w-8, height: 8,
    rx: 4, ry: 4,
    fill: 'rgba(255,255,255,0.22)'
  }));
  stage.appendChild(g);

  for (const s of State.screws) {
    if (s.boardId !== b.id || s.removed) continue;
    drawScrew(s, g);
  }
}

function drawScrew(s, parent) {
  const c = PALETTE[s.color];
  const g = svgEl('g', {
    class: 'screw',
    transform: `translate(${s.lx},${s.ly})`,
    'data-id': s.id
  });
  // タップ判定エリア（不可視・大きめ）
  g.appendChild(svgEl('circle', { class: 'hit', cx: 0, cy: 0, r: 18 }));
  // カラーリング
  g.appendChild(svgEl('circle', {
    class: 'ring', cx: 0, cy: 0, r: 14, stroke: c.hex,
  }));
  // ヘッド
  g.appendChild(svgEl('circle', {
    class: 'head', cx: 0, cy: 0, r: 10
  }));
  // 色固有シンボル
  (SYMBOLS_SVG[s.color] || SYMBOLS_SVG[0])(g, 1);

  // クリック処理は document 全体のデリゲート (タップ vs スワイプ判別)
  s.el = g;
  parent.appendChild(g);
}

// ============= タップ検出（スワイプを除外） =============
const TAP_THRESHOLD_SQ = 100; // 移動 10px までならタップ扱い
let tapState = null;
function setupTapDelegate() {
  document.addEventListener('pointerdown', ev => {
    // ピンチ等の2本目以降は無視
    if (!ev.isPrimary) { tapState = null; return; }
    if (State.gameOver || State.busy) return;
    const screwG = ev.target && ev.target.closest && ev.target.closest('.screw');
    if (!screwG) { tapState = null; return; }
    if (screwG.classList.contains('locked')) { tapState = null; return; }
    const id = +screwG.getAttribute('data-id');
    if (Number.isNaN(id)) return;
    tapState = { pid: ev.pointerId, id, sx: ev.clientX, sy: ev.clientY };
  }, { passive: true });
  document.addEventListener('pointermove', ev => {
    if (!tapState || ev.pointerId !== tapState.pid) return;
    const dx = ev.clientX - tapState.sx, dy = ev.clientY - tapState.sy;
    if (dx*dx + dy*dy > TAP_THRESHOLD_SQ) tapState = null;
  }, { passive: true });
  document.addEventListener('pointerup', ev => {
    if (!tapState || ev.pointerId !== tapState.pid) return;
    const id = tapState.id;
    tapState = null;
    onScrewClick(id);
  }, { passive: true });
  document.addEventListener('pointercancel', () => { tapState = null; }, { passive: true });
}

function renderTray() {
  tray.innerHTML = '';
  const total = State.slotCap + State.bonusSlots;
  for (let i=0;i<total;i++) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    if (i >= State.slotCap) slot.classList.add('bonus');
    const item = State.tray[i];
    if (item != null) {
      const bead = document.createElement('div');
      bead.className = 'bead';
      bead.style.setProperty('--c', PALETTE[item.color].hex);
      if (i >= State.justAddedFrom) bead.classList.add('dropping');
      if (item._matching) bead.classList.add('matching');
      // シンボルSVGを内部に追加
      const sym = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      sym.setAttribute('class', 'bead-sym');
      sym.setAttribute('viewBox', '-10 -10 20 20');
      sym.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      (SYMBOLS_SVG[item.color] || SYMBOLS_SVG[0])(sym, 1.3);
      bead.appendChild(sym);
      slot.appendChild(bead);
    }
    tray.appendChild(slot);
  }
  State.justAddedFrom = State.tray.length;
  // 警告
  const usedCount = State.tray.length;
  if (usedCount >= total - 1 && usedCount > 0) {
    const slots = tray.querySelectorAll('.slot');
    if (slots[total-1]) slots[total-1].classList.add('warn');
    if (usedCount === total && slots[total-2]) slots[total-2].classList.add('warn');
  }
}

// ----------- HUD -----------
function updateHud() {
  $('lvNum').textContent = State.levelIdx + 1;
  const remaining = State.screws.filter(s => !s.removed).length;
  $('remCount').textContent = remaining;
  $('moveCount').textContent = State.movesUsed;
  $('useUndo').textContent = State.uses.undo;
  $('useAdd').textContent  = State.uses.add;
  $('useMag').textContent  = State.uses.mag;
  $('btnUndo').disabled = State.uses.undo <= 0 || State.history.length === 0 || State.busy;
  $('btnAdd').disabled  = State.uses.add  <= 0 || State.busy;
  $('btnMagnet').disabled = State.uses.mag <= 0 || State.busy;
}

// ----------- 操作（即時反応） -----------
function onScrewClick(id) {
  if (State.gameOver || State.busy) return;
  const s = State.screws[id];
  if (!s || s.removed || s.locked) return;
  const cap = State.slotCap + State.bonusSlots;
  if (State.tray.length >= cap) return;

  pushHistory();
  State.movesUsed++;
  State.justAddedFrom = State.tray.length;
  State.tray.push({ color: s.color, screwId: s.id });
  s.removed = true;
  if (s.el) s.el.remove();
  playTap();
  afterMove();
}

function afterMove() {
  // ボードクリアチェック
  for (const b of State.boards) {
    if (b.cleared) continue;
    const has = State.screws.some(s => s.boardId === b.id && !s.removed);
    if (!has) {
      b.cleared = true;
      if (b.el) {
        b.el.classList.add('board-fading');
        b.el.style.opacity = '0';
        const tr = b.el.getAttribute('transform') || '';
        b.el.setAttribute('transform', tr + ' scale(1.04)');
        setTimeout(() => b.el && b.el.remove(), 320);
      }
    }
  }
  recomputeLocks();
  for (const s of State.screws) {
    if (s.removed || !s.el) continue;
    s.el.classList.toggle('locked', s.locked);
  }
  renderTray();
  updateHud();

  if (State.screws.every(s => s.removed) && State.tray.length === 0) {
    win(); return;
  }

  // マッチ判定
  if (hasMatch()) {
    triggerMatch();
  } else if (State.tray.length >= State.slotCap + State.bonusSlots) {
    setTimeout(lose, 250);
  }
}

function hasMatch() {
  const counts = {};
  for (const t of State.tray) counts[t.color] = (counts[t.color]||0)+1;
  return Object.values(counts).some(v=>v>=3);
}

function triggerMatch() {
  const counts = {};
  for (const t of State.tray) counts[t.color] = (counts[t.color]||0)+1;
  let targetColor = -1;
  for (const c in counts) {
    if (counts[c] >= 3) { targetColor = +c; break; }
  }
  if (targetColor < 0) return;

  // 該当色の最初の3つにマーキング
  let n = 3;
  for (const t of State.tray) {
    if (t.color === targetColor && n>0) {
      t._matching = true;
      n--;
    }
  }
  State.busy = true;
  renderTray();
  updateHud();

  setTimeout(() => {
    State.tray = State.tray.filter(t => !t._matching);
    State.busy = false;
    renderTray();
    updateHud();
    if (State.screws.every(s => s.removed) && State.tray.length === 0) {
      win(); return;
    }
    if (hasMatch()) triggerMatch();
  }, 360);
}

// ----------- 履歴 / Undo -----------
function pushHistory() {
  State.history.push({
    tray: State.tray.map(t => ({...t})),
    screws: State.screws.map(s => ({ removed: s.removed })),
    boards: State.boards.map(b => ({ cleared: b.cleared })),
    bonusSlots: State.bonusSlots,
    movesUsed: State.movesUsed,
    uses: { ...State.uses },
  });
  if (State.history.length > 30) State.history.shift();
}
function doUndo() {
  if (State.uses.undo <= 0 || State.history.length === 0 || State.busy) return;
  const h = State.history.pop();
  State.tray = h.tray.map(t => { delete t._matching; return t; });
  State.screws.forEach((s,i) => s.removed = h.screws[i].removed);
  State.boards.forEach((b,i) => b.cleared = h.boards[i].cleared);
  State.bonusSlots = h.bonusSlots;
  State.movesUsed = h.movesUsed;
  State.uses.undo--;
  State.justAddedFrom = State.tray.length;
  render();
  updateHud();
}

// ----------- パワー: 枠+2 -----------
function doAddSlot() {
  if (State.uses.add <= 0 || State.busy) return;
  pushHistory();
  State.bonusSlots += 2;
  State.uses.add--;
  renderTray();
  updateHud();
}

// ----------- パワー: 磁石 -----------
function doMagnet() {
  if (State.uses.mag <= 0 || State.busy) return;
  const cap = State.slotCap + State.bonusSlots;
  if (State.tray.length + 3 > cap) {
    flashMessage('トレイに3個分の空きが必要');
    return;
  }
  const cnt = {};
  for (const s of State.screws) if (!s.removed) cnt[s.color] = (cnt[s.color]||0)+1;
  let bestC = -1, bestN = 0;
  for (const c in cnt) if (cnt[c]>=3 && cnt[c]>bestN) { bestC = +c; bestN = cnt[c]; }
  if (bestC < 0) {
    flashMessage('使用できる色がありません');
    return;
  }
  pushHistory();
  const targets = State.screws.filter(s => !s.removed && s.color === bestC).slice(0,3);
  State.uses.mag--;
  State.justAddedFrom = State.tray.length;
  for (const s of targets) {
    State.tray.push({ color: s.color, screwId: s.id });
    s.removed = true;
    if (s.el) s.el.remove();
  }
  afterMove();
}

function flashMessage(msg) {
  const m = document.createElement('div');
  m.textContent = msg;
  m.style.cssText = 'position:absolute;top:80px;left:50%;transform:translateX(-50%);background:#fff5d0;color:#5a3818;padding:10px 18px;border-radius:8px;border:1px solid #8a5a25;z-index:60;font-size:14px;letter-spacing:.1em;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-weight:700;';
  $('game').appendChild(m);
  setTimeout(()=>m.remove(), 1400);
}

// ----------- 勝敗 -----------
function win() {
  State.gameOver = true;
  playClear();
  const next = State.levelIdx + 1;
  const isHard = State.levelIdx >= LEVELS.length;
  const titleSuffix = isHard ? ' (ENDLESS)' : '';
  showOverlay('CLEAR!',
    `Lv${State.levelIdx+1}${titleSuffix} 突破\n名前: ${State.curLevel.name} / 手数: ${State.movesUsed}`,
    `次へ (Lv${next+1})`,
    () => initLevelAndHide(next),
    'やり直す',
    () => initLevelAndHide(State.levelIdx)
  );
}
function lose() {
  State.gameOver = true;
  showOverlay('GAME OVER', 'トレイが詰まりました\nもう一度挑戦しましょう',
    'やり直す',
    () => initLevelAndHide(State.levelIdx),
    'タイトルへ',
    () => showTitle()
  );
}
function initLevelAndHide(i){
  $('overlay').classList.add('hidden');
  initLevel(i);
}

function showOverlay(title, text, mainLabel, mainFn, subLabel, subFn) {
  $('overlayTitle').textContent = title;
  $('overlayText').textContent = text;
  $('overlayText').style.whiteSpace = 'pre-line';
  $('overlayMain').textContent = mainLabel;
  $('overlaySub').textContent = subLabel;
  $('overlayMain').onclick = mainFn;
  $('overlaySub').onclick = subFn;
  $('overlay').classList.remove('hidden');
}

function showTitle() {
  showOverlay(
    'ネジマッチ',
    `Lv1〜5 を抜けると Lv6 以降は\nランダム HARD ステージが続きます`,
    'スタート (Lv1)', () => initLevelAndHide(0),
    'ルール',          showRules
  );
}
function showRules() {
  showOverlay(
    'ルール',
    '・ネジをタップ→トレイへ\n・上の板に覆われたネジは取れない\n・同色3個でクリア\n・トレイが詰まるとGAME OVER',
    '了解', () => initLevelAndHide(0),
    '戻る', showTitle
  );
}

// ----------- 起動 -----------
$('btnUndo').addEventListener('click', doUndo);
$('btnAdd').addEventListener('click', doAddSlot);
$('btnMagnet').addEventListener('click', doMagnet);
$('btnRestart').addEventListener('click', () => initLevel(State.levelIdx));

setupTapDelegate();
document.addEventListener('pointerdown', primeAudio, { once: true });
showTitle();
