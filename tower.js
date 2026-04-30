'use strict';
/* ============================================================
 * CORE DEFENSE — Step6: synth audio + pause overlay polish
 * ============================================================ */
(() => {

const TWO_PI = Math.PI * 2;
const SAVE_KEY = 'core-defense-meta-v1';
const MUTE_KEY = 'core-defense-mute-v1';
const rand   = (a, b) => a + Math.random() * (b - a);
const pick   = arr => arr[(Math.random() * arr.length) | 0];

// ---------- Audio (synthed via WebAudio) ----------
const Sfx = (() => {
  let ctx = null, master = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch {}

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  function tone(freq, dur, type='sine', vol=0.4, glide=0) {
    if (muted) return;
    ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * glide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol=0.4, hp=200) {
    if (muted) return;
    ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * dur, sr);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass'; filt.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(master);
    src.start(t);
  }
  return {
    isMuted: () => muted,
    toggle() {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch {}
      if (!muted) ensure();
      return muted;
    },
    resume() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shoot()       { tone(900 + Math.random() * 80, 0.05, 'square', 0.10, 0.55); },
    hit()         { noise(0.05, 0.18, 1500); },
    crit()        { tone(1400, 0.08, 'sawtooth', 0.16, 0.4); },
    kill()        { tone(220, 0.12, 'triangle', 0.18, 0.5); },
    bossDown()    { tone(80, 0.5, 'sawtooth', 0.30, 0.3); noise(0.4, 0.15, 200); },
    coreHit()     { tone(140, 0.18, 'sawtooth', 0.30, 0.5); },
    levelUp()     {
      tone(660, 0.10, 'square', 0.18);
      setTimeout(() => tone(880, 0.10, 'square', 0.18), 90);
      setTimeout(() => tone(1320, 0.18, 'square', 0.20), 180);
    },
    waveStart()   { tone(440, 0.12, 'triangle', 0.18, 1.6); },
    bossWarn()    { tone(160, 0.4, 'square', 0.22, 1.4); },
    pickup()      { tone(1500, 0.04, 'sine', 0.10, 1.2); },
    coin()        { tone(1200, 0.05, 'square', 0.18); setTimeout(() => tone(1800, 0.05, 'square', 0.18), 50); },
    gameOver()    { tone(220, 0.6, 'sawtooth', 0.30, 0.25); },
  };
})();

// ---------- Persistent meta progress ----------
function defaultMeta() {
  return { points: 0, lifeKills: 0, bestWave: 0, totalRuns: 0, upgrades: {} };
}
function loadMeta() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultMeta();
    return Object.assign(defaultMeta(), JSON.parse(raw));
  } catch { return defaultMeta(); }
}
function saveMeta() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(meta)); } catch {}
}
let meta = loadMeta();

// ---------- Meta upgrades (permanent across runs) ----------
const META_UPGRADES = [
  { id:'dmg',    ico:'⚔', name:'初期火力',  desc:'開始時ダメージ +5%/Lv',
    max:20, cost:lv => 30 + lv * 18,
    apply:(lv, t) => { t.damage *= 1 + 0.05 * lv; } },
  { id:'rate',   ico:'⚡', name:'初期連射',  desc:'開始時 攻撃間隔 -3%/Lv',
    max:15, cost:lv => 40 + lv * 22,
    apply:(lv, t) => { t.fireInterval *= Math.pow(0.97, lv); } },
  { id:'hp',     ico:'♥', name:'コア強度',  desc:'最大HP +1/Lv',
    max:10, cost:lv => 60 + lv * 38,
    apply:(lv, t) => { t.maxHp += lv; t.hp = t.maxHp; } },
  { id:'speed',  ico:'➹', name:'弾速',     desc:'弾速 +5%/Lv',
    max:10, cost:lv => 30 + lv * 14,
    apply:(lv, t) => { t.bulletSpeed *= 1 + 0.05 * lv; } },
  { id:'crit',   ico:'✦', name:'初期クリ率', desc:'クリ率 +2%/Lv',
    max:8,  cost:lv => 50 + lv * 22,
    apply:(lv, t) => { t.critChance += 0.02 * lv; } },
  { id:'regen',  ico:'✚', name:'自己修復',  desc:'HP回復 +0.05/秒 /Lv',
    max:10, cost:lv => 70 + lv * 30,
    apply:(lv, t) => { t.regen += 0.05 * lv; } },
  { id:'magnet', ico:'⌬', name:'磁場',     desc:'XP回収範囲 +20%/Lv',
    max:5,  cost:lv => 40 + lv * 18,
    apply:(lv, t) => { t.magnetRange *= 1 + 0.20 * lv; } },
  { id:'xp',     ico:'★', name:'熟練',     desc:'EXP取得 +6%/Lv',
    max:10, cost:lv => 50 + lv * 24,
    apply:(lv, t, g) => { g.xpMul *= 1 + 0.06 * lv; } },
  { id:'meta',   ico:'◆', name:'勲章',     desc:'終了時メタ点 +10%/Lv',
    max:10, cost:lv => 80 + lv * 36,
    apply:(lv, _t, g) => { g.metaMul *= 1 + 0.10 * lv; } },
  { id:'startlv',ico:'⇧', name:'先制強化',  desc:'ラン開始時にLvを+1',
    max:3,  cost:lv => 120 + lv * 80,
    apply:(lv, _t, g) => { g.pendingLevelUps += lv; } },
  { id:'reroll', ico:'⟲', name:'リロール所持', desc:'ラン開始時のリロール +1/Lv',
    max:5,  cost:lv => 90 + lv * 50,
    apply:(lv, _t, g) => { g.rerollsLeft += lv; } },
  { id:'orbital',ico:'◯', name:'初期ドローン', desc:'ラン開始時に周回ドローン +1',
    max:2,  cost:lv => 200 + lv * 150,
    apply:(lv, t) => { t.orbitalCount += lv; } },
];

function metaLv(id)  { return meta.upgrades[id] || 0; }
function metaCost(u) { return u.cost(metaLv(u.id)); }

function applyMetaToRun(g) {
  g.metaMul = 1;
  for (const u of META_UPGRADES) {
    const lv = metaLv(u.id);
    if (lv > 0) u.apply(lv, g.tower, g);
  }
}

function runEndPoints(g) {
  // (wave-1 * 8 + kills * 0.4) * metaMul, floored.
  const base = Math.max(0, (g.wave - 1) * 8 + g.kills * 0.4);
  return Math.max(0, Math.floor(base * (g.metaMul || 1)));
}

// ---------- Enemy archetypes ----------
// hp/speed scale with wave; baseline values here are for wave 1.
const ENEMY_TYPES = {
  grunt:    { color:'#ff5d6e', r:14, hp:3,  speed:55,  damage:1, score:10 },
  fast:     { color:'#ffa05d', r:11, hp:2,  speed:115, damage:1, score:14 },
  tank:     { color:'#a06eff', r:24, hp:14, speed:32,  damage:2, score:32 },
  shield:   { color:'#5da6ff', r:15, hp:5,  speed:48,  damage:1, score:24, shield:6 },
  splitter: { color:'#5dffa1', r:17, hp:6,  speed:50,  damage:1, score:18, splits:2 },
  ranged:   { color:'#ff5dc4', r:13, hp:4,  speed:42,  damage:1, score:24,
              ranged:true, keepDist:200, shotCd:1.6, projSpeed:210, projDmg:1 },
  boss:     { color:'#ff3a3a', r:54, hp:90, speed:22,  damage:5, score:300, boss:true,
              shotCd:1.1,  projSpeed:230, projDmg:1, multishot:5, spread:0.5 },
  charger:  { color:'#ffaa3a', r:46, hp:130, speed:55, damage:6, score:340, boss:true },
  artillery:{ color:'#a06eff', r:60, hp:110, speed:14, damage:4, score:360, boss:true,
              shotCd:1.6,  projSpeed:170, projDmg:1, multishot:9, spread:1.4, keepDist:260 },
};

// ---------- Run-only upgrades (chosen at level up) ----------
// rarity:  common(60%) / rare(30%) / epic(10%)
const RUN_UPGRADES = [
  // === Core stats (deep stacking) ===
  { id:'damage',  ico:'⚔', name:'火力上昇',     desc:'ダメージ +20%',          max:40, rar:'common',
    apply: t => { t.damage *= 1.20; } },
  { id:'fire',    ico:'⚡', name:'連射速度',     desc:'攻撃間隔 -12%',          max:30, rar:'common',
    apply: t => { t.fireInterval *= 0.88; } },
  { id:'speed',   ico:'➹', name:'弾速強化',     desc:'弾速 +20%',             max:20, rar:'common',
    apply: t => { t.bulletSpeed *= 1.20; } },
  { id:'pierce',  ico:'➤', name:'貫通弾',       desc:'弾が +1 体貫通',         max:20, rar:'rare',
    apply: t => { t.pierce += 1; } },
  { id:'multi',   ico:'⋘', name:'マルチショット', desc:'同時発射 +1',            max:12, rar:'rare',
    apply: t => { t.multishot += 1; } },
  { id:'crit',    ico:'✦', name:'クリ率',       desc:'クリティカル率 +10%',    max:20, rar:'common',
    apply: t => { t.critChance += 0.10; } },
  { id:'critdmg', ico:'✸', name:'クリ倍率',     desc:'クリ倍率 +0.4x',         max:16, rar:'rare',
    apply: t => { t.critMul += 0.4; } },
  { id:'maxhp',   ico:'♥', name:'装甲増設',     desc:'最大HP +1（全回復）',   max:30, rar:'common',
    apply: t => { t.maxHp += 1; t.hp = t.maxHp; } },
  { id:'regen',   ico:'✚', name:'自己修復',     desc:'HP 自動回復 +0.2/秒',   max:20, rar:'rare',
    apply: t => { t.regen += 0.2; } },
  { id:'magnet',  ico:'⌬', name:'磁場拡張',     desc:'XP回収範囲 +40%',        max:15, rar:'common',
    apply: t => { t.magnetRange *= 1.40; } },
  { id:'xp',      ico:'★', name:'熟達',         desc:'EXP取得 +18%',           max:20, rar:'common',
    apply: (_, g) => { g.xpMul *= 1.18; } },
  { id:'leech',   ico:'◍', name:'吸命',         desc:'撃破毎に HP +0.06（蓄積）', max:12, rar:'epic',
    apply: t => { t.lifesteal += 0.06; } },
  { id:'slow',    ico:'❄', name:'氷結弾',       desc:'被弾敵を +8% スロウ',     max:10, rar:'epic',
    apply: t => { t.slowOnHit = Math.min(0.8, t.slowOnHit + 0.08); } },
  // === Bullet mechanics ===
  { id:'explode', ico:'✺', name:'爆発弾',       desc:'命中時に小範囲爆発 +1',   max:10, rar:'epic',
    apply: t => { t.explosive += 1; } },
  { id:'chain',   ico:'⌁', name:'連鎖雷',       desc:'弾が他の敵に飛び火 +1',   max:10, rar:'epic',
    apply: t => { t.chain += 1; } },
  { id:'bossdmg', ico:'☠', name:'ボス特効',     desc:'ボスへのダメージ +25%',   max:10, rar:'rare',
    apply: t => { t.bossDamage *= 1.25; } },
  // === Independent weapon systems ===
  { id:'orbital', ico:'◯', name:'周回ドローン',  desc:'周回する自動攻撃 +1',    max:8,  rar:'epic',
    apply: t => { t.orbitalCount += 1; rebuildDrones(); } },
  { id:'missile', ico:'🚀', name:'ミサイル',     desc:'追尾爆発弾を装備/強化',  max:25, rar:'rare',
    apply: t => { t.missileLv += 1; } },
  { id:'lightning',ico:'⚡', name:'雷撃',        desc:'ランダム敵に落雷/強化',  max:25, rar:'rare',
    apply: t => { t.lightningLv += 1; } },
  { id:'wave',    ico:'◎', name:'死の波動',     desc:'拡大リングAoE/強化',     max:25, rar:'epic',
    apply: t => { t.deathWaveLv += 1; } },
  { id:'garlic',  ico:'❀', name:'パルス',       desc:'タワー周囲に持続ダメ/強化', max:25, rar:'rare',
    apply: t => { t.garlicLv += 1; } },
];

const RAR_WEIGHT = { common:60, rare:30, epic:10 };

function rollLevelUpCards() {
  const taken = game.upgrades;
  const pool = RUN_UPGRADES.filter(u => (taken[u.id] || 0) < u.max);
  const choices = [];
  const exclude = new Set();
  for (let i = 0; i < 3 && pool.length > exclude.size; i++) {
    let total = 0;
    for (const u of pool) {
      if (exclude.has(u.id)) continue;
      total += RAR_WEIGHT[u.rar] || 10;
    }
    let r = Math.random() * total;
    for (const u of pool) {
      if (exclude.has(u.id)) continue;
      const w = RAR_WEIGHT[u.rar] || 10;
      if ((r -= w) <= 0) {
        choices.push(u);
        exclude.add(u.id);
        break;
      }
    }
  }
  return choices;
}

function applyUpgrade(u) {
  const t = game.tower;
  u.apply(t, game);
  game.upgrades[u.id] = (game.upgrades[u.id] || 0) + 1;
}

// Enemy type unlocked at given wave (boss handled separately every 5 waves).
function rollWave(wave) {
  const queue = [];
  if (wave % 5 === 0) {
    // boss wave: rotate variants every 5 waves
    const bossPool = ['boss', 'charger', 'artillery'];
    const bossType = bossPool[((wave / 5 | 0) - 1) % bossPool.length];
    queue.push({ type: bossType, delay:1.2 });
    const minionCount = 4 + Math.floor(wave / 5) * 2;
    const minionPool = wave >= 15 ? ['grunt','fast','splitter'] : ['grunt','fast'];
    for (let i = 0; i < minionCount; i++) {
      queue.push({ type: pick(minionPool), delay: 1.6 + i * 0.7 });
    }
    return queue;
  }
  // pool unlocks
  const pool = ['grunt'];
  if (wave >= 3)  pool.push('fast');
  if (wave >= 6)  pool.push('tank');
  if (wave >= 8)  pool.push('shield');
  if (wave >= 10) pool.push('splitter');
  if (wave >= 12) pool.push('ranged');
  // count + spacing
  const count = 10 + wave * 2;
  const interval = Math.max(0.28, 0.95 - wave * 0.035);
  for (let i = 0; i < count; i++) {
    queue.push({ type: pick(pool), delay: 0.4 + i * interval });
  }
  return queue;
}

// ---------- Wave banner ----------
const banner = document.createElement('div');
banner.className = 'wave-banner';
function showBanner(main, sub) {
  banner.innerHTML = `${main}<span class="sub">${sub || ''}</span>`;
  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => banner.classList.remove('show'), 1600);
}

// ---------- DOM ----------
const canvas       = document.getElementById('stage');
const ctx          = canvas.getContext('2d');
const stageWrap    = document.getElementById('stageWrap');
const overlay      = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText  = document.getElementById('overlayText');
const overlayStats = document.getElementById('overlayStats');
const overlayMain  = document.getElementById('overlayMain');
const overlaySub   = document.getElementById('overlaySub');
const hint         = document.getElementById('centerHint');
const hudWave      = document.getElementById('waveNum');
const hudScore     = document.getElementById('scoreNum');
const hudHp        = document.getElementById('hpFill');
const hudEnemy     = document.getElementById('enemyNum');
const btnPause     = document.getElementById('btnPause');
const btnMute      = document.getElementById('btnMute');

// ---------- Canvas sizing ----------
let W = 0, H = 0, CX = 0, CY = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const r = stageWrap.getBoundingClientRect();
  W = r.width; H = r.height;
  CX = W / 2; CY = H / 2;
  canvas.width  = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);

// ---------- Game state ----------
let game = null;
let mode = 'title'; // title | playing | gameover
let paused = false;

function newGame() {
  game = {
    wave: 1,
    score: 0,
    kills: 0,
    tower: {
      x: 0, y: 0, r: 22,
      hp: 5, maxHp: 5,
      angle: -Math.PI / 2,
      cooldown: 0,
      fireInterval: 0.45,
      damage: 3,
      bulletSpeed: 560,
      bulletRadius: 4,
      level: 1,
      xp: 0,
      xpToNext: 6,
      magnetRange: 50,
      pierce: 0,
      multishot: 1,
      spreadAngle: 0.10,
      critChance: 0.05,
      critMul: 1.8,
      lifesteal: 0,
      slowOnHit: 0,
      regen: 0,
      regenAcc: 0,
      orbitalCount: 0,
      explosive: 0,
      chain: 0,
      bossDamage: 1,
      missileLv: 0,
      missileCd: 0,
      lightningLv: 0,
      lightningCd: 0,
      deathWaveLv: 0,
      deathWaveCd: 0,
      garlicLv: 0,
      garlicCd: 0,
    },
    enemies: [],
    bullets: [],
    enemyShots: [],
    gems: [],
    drones: [],
    chainLines: [],
    missiles: [],
    deathWaves: [],
    particles: [],
    dmgTexts: [],
    shake: 0,
    waveQueue: rollWave(1),
    waveTimer: 0,
    waveCleared: false,
    betweenWaves: 0,
    flash: 0,
    pendingLevelUps: 0,
    upgrades: {},
    xpMul: 1,
    rerollsLeft: 0,
    bossesKilled: 0,
  };
  applyMetaToRun(game);
  rebuildDrones();
  mode = 'playing';
  paused = false;
  hideOverlay();
  fadeHint();
  if (banner.parentNode !== stageWrap) stageWrap.appendChild(banner);
  showBanner(`WAVE 1`, '迎撃開始');
  updateHud();
  // pending startlv level-ups: open the chooser shortly
  if (game.pendingLevelUps > 0) {
    setTimeout(() => { if (mode === 'playing') showLevelUp(); }, 600);
  }
}

// ---------- Enemy spawn ----------
function spawnEnemy(type, originAngle) {
  const cfg  = ENEMY_TYPES[type];
  const wave = game.wave;
  const a = originAngle != null ? originAngle : Math.random() * TWO_PI;
  const dist = Math.max(W, H) * 0.6 + 40;
  const x = CX + Math.cos(a) * dist;
  const y = CY + Math.sin(a) * dist;

  // scaling: hp grows ~6%/wave, speed +1%/wave (capped)
  const hpScale    = 1 + (wave - 1) * 0.07;
  const speedScale = 1 + Math.min(0.6, (wave - 1) * 0.012);
  const hp     = Math.round(cfg.hp     * hpScale);
  const shield = cfg.shield ? Math.round(cfg.shield * hpScale) : 0;
  const speed  = cfg.speed  * speedScale;

  game.enemies.push({
    x, y,
    kind: type,
    r: cfg.r,
    color: cfg.color,
    hp, maxHp: hp,
    shield, maxShield: shield,
    speed,
    damage: cfg.damage,
    score:  cfg.score,
    boss:   !!cfg.boss,
    splits: cfg.splits || 0,
    ranged: !!cfg.ranged,
    keepDist: cfg.keepDist || 0,
    shotCd:   cfg.shotCd ? cfg.shotCd * 0.6 + Math.random() * cfg.shotCd : 0,
    shotInterval: cfg.shotCd || 0,
    projSpeed: cfg.projSpeed || 0,
    projDmg:   cfg.projDmg   || 0,
    multishot: cfg.multishot || 1,
    spread:    cfg.spread    || 0,
    flash: 0,
    dead: false,
  });

  if (cfg.boss) { showBanner('!!  BOSS  !!', `WAVE ${wave}`); Sfx.bossWarn(); }
}

function rebuildDrones() {
  const t = game.tower;
  const n = t.orbitalCount | 0;
  // preserve existing angles when adding new drones
  const existing = game.drones.length;
  if (n === existing) return;
  if (n < existing) {
    game.drones.length = n;
    return;
  }
  // grow: redistribute angles evenly
  game.drones = [];
  for (let i = 0; i < n; i++) {
    game.drones.push({
      angle: (i / n) * TWO_PI,
      dist: 70,
      r: 7,
      orbitSpeed: 2.6,
      hitTimer: new Map(),
      x: 0, y: 0,
    });
  }
}

// ---------- Independent weapon systems ----------
function missileCdFor(lv)   { return Math.max(0.4, 4.0 * Math.pow(0.90, lv - 1)); }
function missileDmgFor(lv)  { return 12 * lv * (1 + (game.tower.damage / 8)); }
function missileRadFor(lv)  { return 50 + lv * 4; }

function lightningCdFor(lv)  { return Math.max(0.5, 4.5 * Math.pow(0.91, lv - 1)); }
function lightningDmgFor(lv) { return 8 * lv * (1 + (game.tower.damage / 10)); }
function lightningChainFor(lv){ return Math.min(15, 1 + Math.floor(lv / 2)); }

function deathWaveCdFor(lv)  { return Math.max(2.0, 9.0 * Math.pow(0.93, lv - 1)); }
function deathWaveDmgFor(lv) { return 10 * lv * (1 + (game.tower.damage / 6)); }
function deathWaveRadFor(lv) { return 180 + lv * 22; }

function garlicCdFor(lv)     { return Math.max(0.20, 0.7 * Math.pow(0.93, lv - 1)); }
function garlicDmgFor(lv)    { return 1.5 * lv * (1 + (game.tower.damage / 12)); }
function garlicRadFor(lv)    { return 90 + lv * 6; }

function fireMissile() {
  const t = game.tower;
  // pick highest-HP enemy on screen
  let target = null, bestHp = -1;
  for (const e of game.enemies) {
    if (e.dead) continue;
    if (e.hp > bestHp) { bestHp = e.hp; target = e; }
  }
  if (!target) return;
  const a = Math.atan2(target.y - t.y, target.x - t.x);
  game.missiles.push({
    x: t.x, y: t.y,
    vx: Math.cos(a) * 100,
    vy: Math.sin(a) * 100,
    target,
    dmg: missileDmgFor(t.missileLv),
    radius: missileRadFor(t.missileLv),
    life: 5.0,
    dead: false,
  });
  Sfx.shoot();
}

function fireLightning() {
  const t = game.tower;
  if (game.enemies.length === 0) return;
  const start = game.enemies[(Math.random() * game.enemies.length) | 0];
  if (!start || start.dead) return;
  const dmg = lightningDmgFor(t.lightningLv);
  const jumps = lightningChainFor(t.lightningLv);
  // strike from sky to first enemy
  game.chainLines.push({
    kind:'bolt',
    x1: start.x + (Math.random() - 0.5) * 30, y1: -20,
    x2: start.x, y2: start.y,
    life:0.18, maxLife:0.18,
    dead:false,
  });
  applyDamage(start, dmg);
  // chain from start
  let last = start;
  let curDmg = dmg * 0.85;
  const seen = new Set([start]);
  const range = 220;
  for (let i = 0; i < jumps; i++) {
    let next = null, bestD = range * range;
    for (const e of game.enemies) {
      if (e.dead || seen.has(e)) continue;
      const dx = e.x - last.x, dy = e.y - last.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD) { bestD = d2; next = e; }
    }
    if (!next) break;
    applyDamage(next, curDmg);
    game.chainLines.push({
      kind:'bolt',
      x1:last.x, y1:last.y, x2:next.x, y2:next.y,
      life:0.16, maxLife:0.16,
      dead:false,
    });
    seen.add(next);
    last = next;
    curDmg *= 0.85;
  }
  Sfx.crit();
}

function fireDeathWave() {
  const t = game.tower;
  game.deathWaves.push({
    x: t.x, y: t.y,
    r: t.r,
    maxR: deathWaveRadFor(t.deathWaveLv),
    speed: 360,
    dmg: deathWaveDmgFor(t.deathWaveLv),
    life: 1.5,
    hits: new Set(),
    dead: false,
  });
  addShake(3);
  Sfx.bossDown();
}

function fireGarlic() {
  const t = game.tower;
  const dmg = garlicDmgFor(t.garlicLv);
  const rad = garlicRadFor(t.garlicLv);
  let hit = 0;
  for (const e of game.enemies) {
    if (e.dead) continue;
    const dx = e.x - t.x, dy = e.y - t.y;
    if (dx*dx + dy*dy <= rad * rad) {
      applyDamage(e, dmg);
      hit++;
    }
  }
  if (hit > 0) {
    game.chainLines.push({
      kind:'ring',
      x: t.x, y: t.y, r: rad,
      life:0.18, maxLife:0.18,
      dead:false,
    });
  }
}

function spawnGem(x, y, value) {
  const a = Math.random() * TWO_PI;
  const sp = rand(20, 70);
  game.gems.push({
    x, y,
    vx: Math.cos(a) * sp,
    vy: Math.sin(a) * sp,
    value,
    age: 0,
    dead: false,
  });
}

function spawnParticles(x, y, color, count, speedRange = [60, 220], lifeRange = [0.3, 0.7]) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TWO_PI;
    const sp = rand(speedRange[0], speedRange[1]);
    game.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: rand(1.5, 3),
      life: rand(lifeRange[0], lifeRange[1]),
      maxLife: 0,
      color,
      dead: false,
    });
    const p = game.particles[game.particles.length - 1];
    p.maxLife = p.life;
  }
}

function spawnDamageNumber(x, y, text, color = '#fff', size = 12) {
  game.dmgTexts.push({
    x, y: y - 4,
    vy: -50,
    life: 0.7,
    maxLife: 0.7,
    text: String(text),
    color,
    size,
    dead: false,
  });
}

function addShake(amount) {
  game.shake = Math.min(14, Math.max(game.shake, amount));
}

function spawnEnemyShot(e, angle) {
  game.enemyShots.push({
    x: e.x, y: e.y,
    vx: Math.cos(angle) * e.projSpeed,
    vy: Math.sin(angle) * e.projSpeed,
    r: 5,
    damage: e.projDmg,
    life: 4.0,
    color: e.color,
    dead: false,
  });
}

// ---------- Targeting ----------
function findTarget(t) {
  let best = null, bestD = Infinity;
  for (const e of game.enemies) {
    if (e.dead) continue;
    const dx = e.x - t.x, dy = e.y - t.y;
    const d2 = dx*dx + dy*dy;
    if (d2 < bestD) { bestD = d2; best = e; }
  }
  return best;
}

// ---------- Update ----------
function update(dt) {
  const g = game;
  const t = g.tower;
  t.x = CX; t.y = CY;

  // ----- Spawn from queue -----
  g.waveTimer += dt;
  while (g.waveQueue.length && g.waveQueue[0].delay <= g.waveTimer) {
    const item = g.waveQueue.shift();
    spawnEnemy(item.type);
  }

  // ----- Tower aim & fire -----
  const target = findTarget(t);
  if (target) {
    const dx = target.x - t.x, dy = target.y - t.y;
    t.angle = Math.atan2(dy, dx);
  }
  t.cooldown -= dt;
  if (t.cooldown <= 0 && target) {
    fireBullet(t, target);
    t.cooldown = t.fireInterval;
  }

  // ----- Player bullets -----
  for (const b of g.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    if (b.x < -50 || b.x > W + 50 || b.y < -50 || b.y > H + 50) { b.dead = true; continue; }
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (b.hits && b.hits.has(e)) continue;
      const dx = e.x - b.x, dy = e.y - b.y;
      const rr = e.r + b.r;
      if (dx*dx + dy*dy <= rr*rr) {
        applyDamage(e, b.damage, b.crit);
        if (t.slowOnHit > 0) applySlow(e, t.slowOnHit, 1.2);
        if (t.explosive > 0) doExplosion(e.x, e.y, b.damage, t.explosive);
        if (t.chain > 0) doChain(e, b.damage, t.chain);
        if (b.pierce > 0) {
          b.pierce--;
          if (!b.hits) b.hits = new Set();
          b.hits.add(e);
        } else {
          b.dead = true;
        }
        break;
      }
    }
  }
  g.bullets = g.bullets.filter(b => !b.dead);

  // ----- Enemy shots -----
  for (const s of g.enemyShots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.life <= 0) { s.dead = true; continue; }
    const dx = t.x - s.x, dy = t.y - s.y;
    const rr = t.r + s.r;
    if (dx*dx + dy*dy <= rr*rr) {
      damageCore(s.damage);
      s.dead = true;
    }
  }
  g.enemyShots = g.enemyShots.filter(s => !s.dead);

  // ----- Enemies move / fire -----
  for (const e of g.enemies) {
    if (e.dead) continue;
    const dx = t.x - e.x, dy = t.y - e.y;
    const d  = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);

    // slow effect
    if (e.slowEnd > 0) {
      e.slowEnd -= dt;
      if (e.slowEnd <= 0) e.slowFactor = 0;
    }
    const speed = e.speed * (1 - (e.slowFactor || 0));

    // ranged & boss: keep distance
    let shouldMove = true;
    if ((e.ranged || e.boss) && e.keepDist > 0 && d <= e.keepDist + 4) {
      shouldMove = false;
    } else if (e.boss && d <= 220) {
      shouldMove = false;
    }
    if (shouldMove) {
      e.x += (dx / d) * speed * dt;
      e.y += (dy / d) * speed * dt;
    }
    if (e.flash > 0) e.flash -= dt;

    // shooting
    if (e.shotInterval > 0) {
      e.shotCd -= dt;
      if (e.shotCd <= 0 && d < Math.max(W, H)) {
        if (e.boss && e.multishot > 1) {
          for (let i = 0; i < e.multishot; i++) {
            const t01 = (e.multishot === 1) ? 0 : (i / (e.multishot - 1)) - 0.5;
            spawnEnemyShot(e, ang + t01 * e.spread);
          }
        } else {
          spawnEnemyShot(e, ang);
        }
        e.shotCd = e.shotInterval;
      }
    }

    // reach core
    if (d < t.r + e.r) {
      damageCore(e.damage);
      e.dead = true;
    }
  }

  g.enemies = g.enemies.filter(e => !e.dead);

  // ----- XP gems (always attract; magnetRange = auto-pickup radius) -----
  for (const gm of g.gems) {
    gm.age += dt;
    const dx = t.x - gm.x, dy = t.y - gm.y;
    const d = Math.hypot(dx, dy) || 1;
    // brief outward burst, then strong pull regardless of distance
    const pull = 260 + gm.age * 520;
    gm.vx += (dx / d) * pull * dt;
    gm.vy += (dy / d) * pull * dt;
    // fps-independent damping
    const damp = Math.pow(0.05, dt);
    gm.vx *= damp;
    gm.vy *= damp;
    gm.x += gm.vx * dt;
    gm.y += gm.vy * dt;
    // pickup either inside magnet radius OR touching tower body
    if (d < Math.max(t.r + 6, t.magnetRange)) {
      addXp(gm.value);
      gm.dead = true;
      Sfx.pickup();
      spawnParticles(t.x, t.y, '#5ad6ff', 3, [40, 120], [0.15, 0.3]);
    }
  }
  g.gems = g.gems.filter(gm => !gm.dead);

  // ----- Independent weapons (cooldown ticks) -----
  if (t.missileLv > 0) {
    t.missileCd -= dt;
    if (t.missileCd <= 0 && g.enemies.length > 0) {
      fireMissile();
      t.missileCd = missileCdFor(t.missileLv);
    }
  }
  if (t.lightningLv > 0) {
    t.lightningCd -= dt;
    if (t.lightningCd <= 0 && g.enemies.length > 0) {
      fireLightning();
      t.lightningCd = lightningCdFor(t.lightningLv);
    }
  }
  if (t.deathWaveLv > 0) {
    t.deathWaveCd -= dt;
    if (t.deathWaveCd <= 0) {
      fireDeathWave();
      t.deathWaveCd = deathWaveCdFor(t.deathWaveLv);
    }
  }
  if (t.garlicLv > 0) {
    t.garlicCd -= dt;
    if (t.garlicCd <= 0) {
      fireGarlic();
      t.garlicCd = garlicCdFor(t.garlicLv);
    }
  }

  // ----- Missiles (homing + explode on contact) -----
  for (const m of g.missiles) {
    m.life -= dt;
    if (m.life <= 0) { m.dead = true; continue; }
    // re-acquire if target died
    if (!m.target || m.target.dead) {
      let best = null, bestD = Infinity;
      for (const e of g.enemies) {
        if (e.dead) continue;
        const dx = e.x - m.x, dy = e.y - m.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < bestD) { bestD = d2; best = e; }
      }
      m.target = best;
    }
    if (m.target) {
      const dx = m.target.x - m.x, dy = m.target.y - m.y;
      const d = Math.hypot(dx, dy) || 1;
      // homing acceleration
      const accel = 600;
      m.vx += (dx / d) * accel * dt;
      m.vy += (dy / d) * accel * dt;
      // cap speed
      const sp = Math.hypot(m.vx, m.vy);
      const maxSp = 360;
      if (sp > maxSp) { m.vx *= maxSp / sp; m.vy *= maxSp / sp; }
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    // collision check
    let exploded = false;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const dx = e.x - m.x, dy = e.y - m.y;
      const rr = e.r + 6;
      if (dx*dx + dy*dy <= rr*rr) {
        // explosion!
        for (const e2 of g.enemies) {
          if (e2.dead) continue;
          const ex = e2.x - m.x, ey = e2.y - m.y;
          if (ex*ex + ey*ey <= m.radius * m.radius) {
            applyDamage(e2, m.dmg);
          }
        }
        spawnParticles(m.x, m.y, '#ffa05d', 20, [120, 320], [0.3, 0.7]);
        g.chainLines.push({ kind:'ring', x:m.x, y:m.y, r:m.radius, life:0.3, maxLife:0.3, dead:false });
        addShake(4);
        m.dead = true;
        exploded = true;
        break;
      }
    }
    if (exploded) continue;
  }
  g.missiles = g.missiles.filter(m => !m.dead);

  // ----- Death waves (expanding ring) -----
  for (const w of g.deathWaves) {
    w.life -= dt;
    w.r += w.speed * dt;
    if (w.r >= w.maxR || w.life <= 0) { w.dead = true; continue; }
    for (const e of g.enemies) {
      if (e.dead || w.hits.has(e)) continue;
      const dx = e.x - w.x, dy = e.y - w.y;
      const d  = Math.hypot(dx, dy);
      if (d <= w.r + e.r && d >= w.r - 18) {
        applyDamage(e, w.dmg);
        w.hits.add(e);
      }
    }
  }
  g.deathWaves = g.deathWaves.filter(w => !w.dead);

  // ----- Orbital drones -----
  for (const dr of g.drones) {
    dr.angle += dr.orbitSpeed * dt;
    dr.x = t.x + Math.cos(dr.angle) * dr.dist;
    dr.y = t.y + Math.sin(dr.angle) * dr.dist;
    // tick cooldowns
    for (const [k, v] of dr.hitTimer) {
      const nv = v - dt;
      if (nv <= 0) dr.hitTimer.delete(k);
      else dr.hitTimer.set(k, nv);
    }
    // hit enemies
    for (const e of g.enemies) {
      if (e.dead || dr.hitTimer.has(e)) continue;
      const ex = e.x - dr.x, ey = e.y - dr.y;
      const rr = e.r + dr.r;
      if (ex*ex + ey*ey <= rr*rr) {
        applyDamage(e, t.damage * 0.6);
        if (t.slowOnHit > 0) applySlow(e, t.slowOnHit, 1.0);
        dr.hitTimer.set(e, 0.45);
      }
    }
  }

  // ----- Chain lines fade -----
  for (const ln of g.chainLines) {
    ln.life -= dt;
    if (ln.life <= 0) ln.dead = true;
  }
  g.chainLines = g.chainLines.filter(ln => !ln.dead);

  // ----- Particles -----
  for (const p of g.particles) {
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.05, dt);
    p.vy *= Math.pow(0.05, dt);
  }
  g.particles = g.particles.filter(p => !p.dead);

  // ----- Damage numbers -----
  for (const d of g.dmgTexts) {
    d.life -= dt;
    if (d.life <= 0) { d.dead = true; continue; }
    d.y += d.vy * dt;
    d.vy *= Math.pow(0.4, dt);
  }
  g.dmgTexts = g.dmgTexts.filter(d => !d.dead);

  // ----- Shake decay -----
  if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 24);

  // ----- HP regen -----
  if (t.regen > 0 && t.hp < t.maxHp) {
    t.regenAcc += t.regen * dt;
    while (t.regenAcc >= 1 && t.hp < t.maxHp) {
      t.regenAcc -= 1;
      t.hp = Math.min(t.maxHp, t.hp + 1);
      spawnDamageNumber(t.x, t.y - t.r - 6, '+1', '#5dffa1', 13);
    }
  }

  // wave clear (queue empty AND no enemies on field)
  if (!g.waveCleared && g.waveQueue.length === 0 && g.enemies.length === 0) {
    g.waveCleared = true;
    g.betweenWaves = 1.6;
  }
  if (g.waveCleared) {
    g.betweenWaves -= dt;
    if (g.betweenWaves <= 0) nextWave();
  }

  if (g.flash > 0) g.flash -= dt;

  updateHud();
}

function applyDamage(e, dmg, isCrit) {
  if (e.boss && game.tower.bossDamage > 1) dmg *= game.tower.bossDamage;
  let shieldAbsorbed = 0;
  if (e.shield > 0) {
    shieldAbsorbed = Math.min(e.shield, dmg);
    e.shield -= shieldAbsorbed;
    dmg -= shieldAbsorbed;
  }
  if (dmg > 0) e.hp -= dmg;
  e.flash = 0.12;
  if (isCrit) Sfx.crit(); else Sfx.hit();
  spawnParticles(e.x, e.y, e.color, 3, [60, 180], [0.18, 0.4]);
  if (shieldAbsorbed > 0) {
    spawnDamageNumber(e.x, e.y - e.r * 0.5, fmtDmg(shieldAbsorbed), '#9ed4ff', 11);
  }
  if (dmg > 0) {
    const col = isCrit ? '#ffd24a' : '#fff7a8';
    const sz  = isCrit ? 16 : 12;
    spawnDamageNumber(e.x, e.y - e.r * 0.7, fmtDmg(dmg), col, sz);
  }
  if (e.hp <= 0) {
    e.dead = true;
    onEnemyKilled(e);
  }
}

function fmtDmg(v) {
  return (v >= 10 ? Math.round(v) : v.toFixed(1)).toString();
}

function applySlow(e, factor, dur) {
  e.slowFactor = factor;
  e.slowEnd = (e.slowEnd || 0) > 0 ? Math.max(e.slowEnd, dur) : dur;
}

function doExplosion(x, y, baseDmg, level) {
  const radius = 36 + level * 16;
  const dmg = baseDmg * (0.35 + level * 0.10);
  for (const e of game.enemies) {
    if (e.dead) continue;
    const dx = e.x - x, dy = e.y - y;
    if (dx*dx + dy*dy <= radius * radius) {
      applyDamage(e, dmg);
    }
  }
  // visual: ring + particles
  spawnParticles(x, y, '#ffa05d', 10 + level * 2, [80, 220], [0.25, 0.5]);
  game.chainLines.push({
    kind: 'ring',
    x, y,
    r: radius,
    life: 0.22, maxLife: 0.22,
    dead: false,
  });
  addShake(2);
}

function doChain(srcEnemy, baseDmg, jumps) {
  let last = srcEnemy;
  let dmg = baseDmg * 0.55;
  const seen = new Set([srcEnemy]);
  const range = 180;
  for (let i = 0; i < jumps; i++) {
    let next = null, bestD = range * range;
    for (const e of game.enemies) {
      if (e.dead || seen.has(e)) continue;
      const dx = e.x - last.x, dy = e.y - last.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD) { bestD = d2; next = e; }
    }
    if (!next) break;
    applyDamage(next, dmg);
    game.chainLines.push({
      kind:'bolt',
      x1:last.x, y1:last.y, x2:next.x, y2:next.y,
      life:0.14, maxLife:0.14,
      dead:false,
    });
    seen.add(next);
    last = next;
    dmg *= 0.75;
  }
}

function onEnemyKilled(e) {
  game.kills++;
  game.score += e.score;
  if (e.boss) Sfx.bossDown(); else Sfx.kill();
  // lifesteal
  const t = game.tower;
  if (t.lifesteal > 0 && t.hp < t.maxHp) {
    t.regenAcc += t.lifesteal;
    while (t.regenAcc >= 1 && t.hp < t.maxHp) {
      t.regenAcc -= 1;
      t.hp = Math.min(t.maxHp, t.hp + 1);
      spawnDamageNumber(t.x, t.y - t.r - 6, '+1', '#5dffa1', 13);
    }
  }
  // big particle burst + XP drop
  spawnParticles(e.x, e.y, e.color, e.boss ? 28 : 9, [80, 280], [0.35, 0.8]);
  if (e.boss) {
    addShake(8);
    spawnDamageNumber(e.x, e.y, 'BOSS DOWN', '#ffd24a', 18);
  }
  // gems: bosses drop a swarm
  const gemValue = Math.max(1, Math.round(e.score * 0.1));
  const gemCount = e.boss ? 8 : (e.score >= 24 ? 2 : 1);
  for (let i = 0; i < gemCount; i++) spawnGem(e.x, e.y, gemValue);
  // splitter children
  if (e.splits > 0) {
    for (let s = 0; s < e.splits; s++) {
      const a = Math.random() * TWO_PI;
      spawnChild(e, a, e.r + 6);
    }
  }
}

function damageCore(amount) {
  const t = game.tower;
  t.hp -= amount;
  game.flash = Math.max(game.flash, 0.28);
  addShake(4 + amount * 1.5);
  Sfx.coreHit();
  spawnParticles(t.x, t.y, '#ff4f7a', 14, [80, 260], [0.3, 0.7]);
  if (t.hp <= 0) { t.hp = 0; Sfx.gameOver(); gameOver(); }
}

function addXp(amount) {
  const t = game.tower;
  t.xp += amount * (game.xpMul || 1);
  while (t.xp >= t.xpToNext) {
    t.xp -= t.xpToNext;
    t.level++;
    // soft-capped quadratic so endless leveling stays achievable
    const lv = t.level;
    const quad = Math.min(50, lv);
    t.xpToNext = Math.round(6 + lv * 4 + quad * lv * 0.5);
    game.pendingLevelUps++;
  }
  if (game.pendingLevelUps > 0 && mode === 'playing') showLevelUp();
}

function showLevelUp() {
  if (mode !== 'playing') return;
  mode = 'levelup';
  Sfx.levelUp();
  spawnParticles(game.tower.x, game.tower.y, '#5ad6ff', 30, [120, 320], [0.4, 0.9]);
  addShake(5);
  renderLevelUpCards();
}

function renderLevelUpCards() {
  const cards = rollLevelUpCards();
  if (!cards.length) {
    // nothing left to pick — just consume
    game.pendingLevelUps = 0;
    mode = 'playing';
    overlay.classList.add('hidden');
    return;
  }

  overlay.classList.remove('hidden');
  overlayTitle.textContent = 'LEVEL UP';
  overlayText.textContent  = `Lv.${game.tower.level} へ到達 — 強化を1つ選択`;
  overlayStats.innerHTML   = '';
  overlayMain.style.display = 'none';
  overlaySub.style.display  = 'none';

  let cw = overlayStats.parentNode.querySelector('.cards-wrap');
  if (cw) cw.remove();
  cw = document.createElement('div');
  cw.className = 'cards-wrap';
  cards.forEach(u => {
    const stack = game.upgrades[u.id] || 0;
    const el = document.createElement('button');
    el.className = 'card';
    el.innerHTML = `
      <span class="rar ${u.rar}">${u.rar.toUpperCase()}</span>
      <span class="ico">${u.ico}</span>
      <span class="name">${u.name}</span>
      <span class="desc">${u.desc}</span>
      <span class="stack">${stack}/${u.max}</span>
    `;
    el.addEventListener('click', () => pickUpgrade(u));
    cw.appendChild(el);
  });
  overlayStats.parentNode.insertBefore(cw, overlayStats.nextSibling);

  // reroll button as overlaySub
  overlaySub.style.display = '';
  overlaySub.textContent = `リロール (${game.rerollsLeft})`;
  overlaySub.disabled = game.rerollsLeft <= 0;
  overlaySub.style.opacity = overlaySub.disabled ? 0.4 : 1;
  overlaySub.onclick = () => {
    if (game.rerollsLeft <= 0) return;
    game.rerollsLeft--;
    Sfx.coin();
    renderLevelUpCards();
  };
}

function pickUpgrade(u) {
  applyUpgrade(u);
  // cleanup card UI
  const cw = document.querySelector('.cards-wrap');
  if (cw) cw.remove();
  overlayMain.style.display = '';
  overlaySub.disabled = false;
  overlaySub.style.opacity = 1;
  overlay.classList.add('hidden');
  game.pendingLevelUps--;
  mode = 'playing';
  if (game.pendingLevelUps > 0) showLevelUp();
}

function spawnChild(parent, angle, off) {
  const x = parent.x + Math.cos(angle) * off;
  const y = parent.y + Math.sin(angle) * off;
  const cfg = ENEMY_TYPES.grunt;
  const wave = game.wave;
  const hpScale = 1 + (wave - 1) * 0.05;
  const hp = Math.max(1, Math.round(cfg.hp * 0.6 * hpScale));
  game.enemies.push({
    x, y, kind:'grunt', r: cfg.r - 3, color: cfg.color,
    hp, maxHp: hp, shield:0, maxShield:0,
    speed: cfg.speed * 1.15, damage: cfg.damage, score: 6,
    boss:false, splits:0, ranged:false, keepDist:0,
    shotCd:0, shotInterval:0, projSpeed:0, projDmg:0,
    multishot:1, spread:0, flash:0, dead:false,
  });
}

function fireBullet(t, target) {
  Sfx.shoot();
  const baseAng = Math.atan2(target.y - t.y, target.x - t.x);
  const n = Math.max(1, t.multishot | 0);
  for (let i = 0; i < n; i++) {
    const t01 = (n === 1) ? 0 : (i / (n - 1)) - 0.5;
    const ang = baseAng + t01 * t.spreadAngle * (n - 1);
    const isCrit = Math.random() < t.critChance;
    const dmg = t.damage * (isCrit ? t.critMul : 1);
    const sp = t.bulletSpeed;
    game.bullets.push({
      x: t.x + Math.cos(ang) * (t.r + 2),
      y: t.y + Math.sin(ang) * (t.r + 2),
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      r: t.bulletRadius,
      damage: dmg,
      crit: isCrit,
      pierce: t.pierce | 0,
      hits: null, // assigned on demand
      life: 2.0,
      dead: false,
    });
  }
}

function nextWave() {
  game.wave++;
  game.waveQueue = rollWave(game.wave);
  game.waveTimer = 0;
  game.waveCleared = false;
  Sfx.waveStart();
  if (game.wave % 5 === 0) {
    showBanner(`WAVE ${game.wave}`, 'BOSS WAVE');
  } else {
    showBanner(`WAVE ${game.wave}`, '迎撃継続');
  }
}

// ---------- Render ----------
function render() {
  ctx.clearRect(0, 0, W, H);

  // background grid
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#1c2740';
  ctx.lineWidth = 1;
  const step = 40;
  ctx.beginPath();
  for (let x = (CX % step); x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = (CY % step); y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.restore();

  // damage flash vignette
  if (game && game.flash > 0) {
    ctx.save();
    ctx.globalAlpha = game.flash * 1.2;
    const grd = ctx.createRadialGradient(CX, CY, Math.min(W,H)*0.2, CX, CY, Math.max(W,H)*0.7);
    grd.addColorStop(0, 'rgba(255,79,122,0)');
    grd.addColorStop(1, 'rgba(255,79,122,0.6)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  if (!game) return;

  // ----- shake offset for entity layer -----
  const sk = game.shake;
  const ox = sk > 0 ? (Math.random() - 0.5) * sk : 0;
  const oy = sk > 0 ? (Math.random() - 0.5) * sk : 0;
  ctx.save();
  ctx.translate(ox, oy);

  // gems (under entities)
  const gemPulse = 1 + Math.sin(performance.now() / 180) * 0.18;
  for (const gm of game.gems) {
    ctx.save();
    ctx.fillStyle = '#5ad6ff';
    ctx.shadowColor = '#5ad6ff';
    ctx.shadowBlur = 14;
    ctx.translate(gm.x, gm.y);
    ctx.rotate(gm.age * 4);
    const r = 4 * gemPulse;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // bullets
  for (const b of game.bullets) {
    ctx.save();
    ctx.fillStyle = '#fff7a8';
    ctx.shadowColor = '#ffd24a';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  // enemy projectiles
  for (const s of game.enemyShots) {
    ctx.save();
    ctx.fillStyle = s.color;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  // enemies
  for (const e of game.enemies) drawEnemy(e);

  // tower
  drawTower();

  // missiles
  for (const m of game.missiles) {
    const ang = Math.atan2(m.vy, m.vx);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(ang);
    ctx.shadowColor = '#ffa05d';
    ctx.shadowBlur = 14;
    // body
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, 4);
    ctx.lineTo(-6, -4);
    ctx.closePath();
    ctx.fill();
    // exhaust
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#ff8a3a';
    ctx.beginPath();
    ctx.arc(-8, 0, 3, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  // death waves
  for (const w of game.deathWaves) {
    const k = Math.max(0, 1 - w.r / w.maxR);
    ctx.save();
    ctx.strokeStyle = '#a8f0ff';
    ctx.shadowColor = '#5ad6ff';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 6 * (0.4 + k * 0.6);
    ctx.globalAlpha = 0.4 + k * 0.5;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r, 0, TWO_PI);
    ctx.stroke();
    // inner trailing line
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.25 * k;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r - 14, 0, TWO_PI);
    ctx.stroke();
    ctx.restore();
  }

  // orbital drones
  for (const dr of game.drones) {
    ctx.save();
    ctx.fillStyle = '#a8f0ff';
    ctx.shadowColor = '#5ad6ff';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(dr.x, dr.y, dr.r, 0, TWO_PI);
    ctx.fill();
    // small trail dot
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(
      game.tower.x + Math.cos(dr.angle - 0.25) * dr.dist,
      game.tower.y + Math.sin(dr.angle - 0.25) * dr.dist,
      dr.r * 0.55, 0, TWO_PI
    );
    ctx.fill();
    ctx.restore();
  }

  // chain lightning + explosion rings
  for (const ln of game.chainLines) {
    const k = Math.max(0, ln.life / ln.maxLife);
    ctx.save();
    if (ln.kind === 'bolt') {
      ctx.strokeStyle = '#a8f0ff';
      ctx.shadowColor = '#5ad6ff';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 2 + k * 2;
      ctx.globalAlpha = 0.4 + k * 0.6;
      // jagged line
      ctx.beginPath();
      const seg = 5;
      for (let i = 0; i <= seg; i++) {
        const f = i / seg;
        const px = ln.x1 + (ln.x2 - ln.x1) * f;
        const py = ln.y1 + (ln.y2 - ln.y1) * f;
        const j = (i === 0 || i === seg) ? 0 : (Math.random() - 0.5) * 12;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px + j, py + j);
      }
      ctx.stroke();
    } else if (ln.kind === 'ring') {
      ctx.strokeStyle = '#ffa05d';
      ctx.shadowColor = '#ffa05d';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 2 + k * 3;
      ctx.globalAlpha = k;
      ctx.beginPath();
      ctx.arc(ln.x, ln.y, ln.r * (1.05 - k * 0.4), 0, TWO_PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  // particles (above entities)
  for (const p of game.particles) {
    const k = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  // damage numbers
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const d of game.dmgTexts) {
    const k = Math.max(0, d.life / d.maxLife);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = d.color;
    ctx.font = `800 ${d.size}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.fillText(d.text, d.x, d.y);
    ctx.restore();
  }

  ctx.restore(); // end shake

  // pause overlay
  if (paused && mode === 'playing') {
    ctx.save();
    ctx.fillStyle = 'rgba(5,7,13,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e6ecff';
    ctx.font = '900 32px -apple-system,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#5ad6ff';
    ctx.shadowBlur = 14;
    ctx.fillText('PAUSED', CX, CY - 10);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#8d9bbf';
    ctx.font = '700 12px -apple-system,sans-serif';
    ctx.fillText('⏸ ボタンで再開', CX, CY + 22);
    ctx.restore();
  }

  // version stamp (lets us confirm fresh code is loaded)
  ctx.save();
  ctx.fillStyle = 'rgba(141,155,191,0.6)';
  ctx.font = '700 10px -apple-system,sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('v6 — weapon arsenal', 8, H - 6);
  ctx.restore();
}

function drawTower() {
  const t = game.tower;
  // XP ring (outer arc)
  const xpPct = t.xp / t.xpToNext;
  ctx.save();
  ctx.strokeStyle = 'rgba(90,214,255,0.18)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(t.x, t.y, t.r + 10, 0, TWO_PI);
  ctx.stroke();
  if (xpPct > 0) {
    ctx.strokeStyle = '#5ad6ff';
    ctx.shadowColor = '#5ad6ff';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r + 10, -Math.PI / 2, -Math.PI / 2 + TWO_PI * xpPct);
    ctx.stroke();
  }
  ctx.restore();

  // body
  ctx.save();
  ctx.fillStyle = '#0c1430';
  ctx.strokeStyle = '#5ad6ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#5ad6ff';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(t.x, t.y, t.r, 0, TWO_PI);
  ctx.fill();
  ctx.stroke();
  // barrel
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle);
  ctx.fillStyle = '#5ad6ff';
  ctx.fillRect(t.r - 4, -4, 16, 8);
  ctx.restore();
  // core dot
  ctx.save();
  ctx.fillStyle = '#a8f0ff';
  ctx.beginPath();
  ctx.arc(t.x, t.y, 5, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
  // level label
  ctx.save();
  ctx.fillStyle = '#0a1226';
  ctx.font = '800 11px -apple-system,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Lv.${t.level}`, t.x, t.y);
  ctx.restore();
}

// ---------- Enemy rendering ----------
function drawEnemy(e) {
  ctx.save();
  const baseFill = e.flash > 0 ? '#ffffff' : e.color;
  ctx.shadowColor = e.color;
  ctx.shadowBlur  = e.boss ? 22 : 10;

  if (e.kind === 'tank') {
    // hex
    ctx.fillStyle = baseFill;
    polygon(e.x, e.y, e.r, 6, 0);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1a0e36';
    polygon(e.x, e.y, e.r, 6, 0);
    ctx.stroke();
  } else if (e.kind === 'fast') {
    // triangle pointing toward core
    const ang = Math.atan2(CY - e.y, CX - e.x);
    ctx.fillStyle = baseFill;
    ctx.translate(e.x, e.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(e.r, 0);
    ctx.lineTo(-e.r * 0.7, e.r * 0.7);
    ctx.lineTo(-e.r * 0.7, -e.r * 0.7);
    ctx.closePath();
    ctx.fill();
  } else if (e.kind === 'splitter') {
    // diamond
    ctx.fillStyle = baseFill;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y - e.r);
    ctx.lineTo(e.x + e.r, e.y);
    ctx.lineTo(e.x, e.y + e.r);
    ctx.lineTo(e.x - e.r, e.y);
    ctx.closePath();
    ctx.fill();
  } else if (e.kind === 'ranged') {
    // square
    ctx.fillStyle = baseFill;
    ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
  } else if (e.boss) {
    // boss: body + outer ring + inner core
    ctx.fillStyle = baseFill;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 6, 0, TWO_PI);
    ctx.stroke();
    // inner core
    ctx.fillStyle = '#fff5b8';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 0.35, 0, TWO_PI);
    ctx.fill();
  } else {
    // grunt + shield default circle
    ctx.fillStyle = baseFill;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();

  // shield ring
  if (e.shield > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(150,210,255,0.85)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#5da6ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 4, 0, TWO_PI);
    ctx.stroke();
    ctx.restore();
  }

  // hp bar (skip for full-hp non-boss)
  if (e.hp < e.maxHp || e.boss) {
    const w = e.boss ? 80 : Math.max(24, e.r * 1.7);
    const h = e.boss ? 5 : 3;
    const yy = e.y - e.r - (e.boss ? 14 : 8);
    ctx.fillStyle = '#000a';
    ctx.fillRect(e.x - w/2, yy, w, h);
    ctx.fillStyle = e.boss ? '#ffd24a' : '#5dffa1';
    ctx.fillRect(e.x - w/2, yy, w * Math.max(0, e.hp / e.maxHp), h);
  }
}

function polygon(x, y, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + i * TWO_PI / sides;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// ---------- HUD ----------
function updateHud() {
  if (!game) return;
  hudWave.textContent  = game.wave;
  hudScore.textContent = game.score;
  hudEnemy.textContent = game.enemies.length;
  const pct = Math.max(0, game.tower.hp / game.tower.maxHp);
  hudHp.style.width = (pct * 100).toFixed(1) + '%';
  hudHp.classList.toggle('warn', pct <= 0.5 && pct > 0.25);
  hudHp.classList.toggle('crit', pct <= 0.25);
}

// ---------- Overlay ----------
function clearShopUI() {
  const cw = document.querySelector('.cards-wrap');     if (cw) cw.remove();
  const sl = document.querySelector('.shop-list');      if (sl) sl.remove();
  const sh = document.querySelector('.shop-head');      if (sh) sh.remove();
  // restore third button container if any (none in HTML)
}

function showTitle() {
  mode = 'title';
  clearShopUI();
  overlay.classList.remove('hidden');
  overlayTitle.textContent = 'CORE DEFENSE';
  overlayText.textContent  = '中央コアを守れ。360°から押し寄せる敵を自動で迎撃する。';
  overlayStats.innerHTML = `
    <div class="stat"><div class="label">メタ点</div><div class="val">${meta.points}</div></div>
    <div class="stat"><div class="label">最高WAVE</div><div class="val">${meta.bestWave}</div></div>
    <div class="stat"><div class="label">累計撃破</div><div class="val">${meta.lifeKills}</div></div>
  `;
  overlayMain.textContent  = 'スタート';
  overlayMain.style.display = '';
  overlaySub.style.display  = '';
  overlaySub.textContent    = '永続強化';
  overlayMain.onclick = () => newGame();
  overlaySub.onclick  = () => showShop();
}

function showShop() {
  mode = 'shop';
  clearShopUI();
  overlay.classList.remove('hidden');
  overlayTitle.textContent = '永続強化';
  overlayText.textContent  = '撃破点で永続的にコアを底上げする';
  overlayStats.innerHTML   = '';

  const head = document.createElement('div');
  head.className = 'shop-head';
  head.innerHTML = `<span>累計撃破: <b>${meta.lifeKills}</b> / 最高WAVE: <b>${meta.bestWave}</b></span>
    <span class="shop-coin">◆ ${meta.points}</span>`;
  overlayStats.parentNode.insertBefore(head, overlayStats);

  const list = document.createElement('div');
  list.className = 'shop-list';
  for (const u of META_UPGRADES) {
    const lv = metaLv(u.id);
    const isMax = lv >= u.max;
    const cost  = isMax ? 0 : metaCost(u);
    const row = document.createElement('div');
    row.className = 'shop-row' + (isMax ? ' maxed' : '');
    row.innerHTML = `
      <div class="top"><span class="nm">${u.ico} ${u.name}</span><span class="lv">${lv}/${u.max}</span></div>
      <div class="ds">${u.desc}</div>
      ${isMax
        ? `<div class="lv" style="text-align:right">MAX</div>`
        : `<button class="buy" ${meta.points < cost ? 'disabled' : ''}>◆ ${cost}</button>`}
    `;
    if (!isMax) {
      row.querySelector('.buy').addEventListener('click', () => {
        if (meta.points < cost) return;
        meta.points -= cost;
        meta.upgrades[u.id] = lv + 1;
        saveMeta();
        showShop();
      });
    }
    list.appendChild(row);
  }
  overlayStats.parentNode.insertBefore(list, overlayStats.nextSibling);

  overlayMain.style.display = 'none';
  overlaySub.style.display  = '';
  overlaySub.textContent    = '戻る';
  overlaySub.onclick = () => showTitle();
}

function gameOver() {
  if (mode === 'gameover') return;
  mode = 'gameover';
  clearShopUI();
  // accumulate stats
  meta.lifeKills += game.kills;
  meta.totalRuns = (meta.totalRuns || 0) + 1;
  if (game.wave > meta.bestWave) meta.bestWave = game.wave;
  const earned = runEndPoints(game);
  meta.points += earned;
  saveMeta();

  overlay.classList.remove('hidden');
  overlayTitle.textContent = 'GAME OVER';
  overlayText.textContent  = 'コアが破壊された';
  overlayStats.innerHTML = `
    <div class="stat"><div class="label">WAVE</div><div class="val">${game.wave}</div></div>
    <div class="stat"><div class="label">KILLS</div><div class="val">${game.kills}</div></div>
    <div class="stat"><div class="label">SCORE</div><div class="val">${game.score}</div></div>
    <div class="stat"><div class="label">獲得◆</div><div class="val">+${earned}</div></div>
  `;
  overlayMain.textContent  = 'もう一度';
  overlayMain.style.display = '';
  overlaySub.style.display = '';
  overlaySub.textContent   = '永続強化';
  overlayMain.onclick = () => newGame();
  overlaySub.onclick  = () => showShop();
}

function hideOverlay() { overlay.classList.add('hidden'); }
function fadeHint() {
  if (!hint) return;
  setTimeout(() => hint.classList.add('fade'), 2500);
}

// ---------- Buttons ----------
btnPause.addEventListener('click', () => {
  if (mode !== 'playing' && !(mode === 'paused')) return;
  paused = !paused;
  btnPause.textContent = paused ? '▶' : '⏸';
});
btnMute.addEventListener('click', () => {
  const m = Sfx.toggle();
  const span = btnMute.querySelector('#muteIcon') || btnMute;
  span.textContent = m ? '🔈' : '🔊';
});
// init mute icon
btnMute.textContent = Sfx.isMuted() ? '🔈' : '🔊';

// resume audio on first user gesture
window.addEventListener('pointerdown', () => Sfx.resume(), { once: true });

// ---------- Loop ----------
let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (mode === 'playing' && !paused) update(dt);
  render();
  requestAnimationFrame(tick);
}

// ---------- Init ----------
resize();
showTitle();
requestAnimationFrame(tick);

})();
