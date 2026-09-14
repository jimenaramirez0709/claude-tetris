'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#bbdefb', // J - pale blue
  '#ffb74d', // L - orange
  '#9e9e9e', // NUT - metallic gray
  '#37474f', // BOMB - carbón oscuro (el arte real lo pinta drawBomb)
];

const NUT = 8; // tipo de pieza "tuerca": anillo 3x3 con hueco central que nunca se puede llenar
const BOMB = 9; // tipo de pieza "bomba": power-up 1x1 que al aterrizar explota un área 3x3

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // NUT
  [[9]],                                       // BOMB
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const BOMB_MIN_LINES = 4;
const BOMB_MAX_LINES = 8;
const BOMB_BLOCK_SCORE = 50;
const BLAST_DURATION = 350; // ms de la animación de explosión
const COMBO_MAX = 10;            // tope del multiplicador de racha
const COMBO_FX_DURATION = 900;   // ms del aviso flotante "COMBO xN"

const SOUND_STORAGE_KEY = 'tetris-muted';
const MASTER_VOLUME = 0.35;   // volumen base, cómodo y no estridente
const MAX_VOICES = 14;        // tope de osciladores/ruidos simultáneos
const MOVE_SFX_THROTTLE = 40; // ms mínimos entre sonidos repetitivos (mover/rotar/soft drop)

const MAX_PARTICLES = 180;      // tope de partículas vivas a la vez
const FLASH_DURATION = 260;     // ms del destello de una línea limpiada
const BANNER_DURATION = 800;    // ms del banner "TETRIS!" / "NIVEL N"
const PARTICLE_GRAVITY = 0.35;  // aceleración vertical de las partículas
const SHAKE_HARD_DROP = { mag: 3, dur: 140 };
const SHAKE_TETRIS = { mag: 6, dur: 260 };
const SHAKE_BOMB = { mag: 8, dur: 320 };

// ---- Barra de energía: se llena limpiando líneas y dispara sola al llenarse ----
const ENERGY_MAX = 100;
const ENERGY_GAIN = [0, 10, 25, 45, 70]; // índice = líneas limpiadas de golpe (bonus por multi-línea)
const ENERGY_FX_DURATION = 600; // ms del barrido en la fila inferior al disparar
const SHAKE_ZAP = { mag: 5, dur: 200 };

// ---- Modo desafío: 40 líneas en 2 minutos ----
const MODE_CLASSIC = 'classic';
const MODE_CHALLENGE = 'challenge';
const MODE_STORAGE_KEY = 'tetris-mode';
const CHALLENGE_LINES = 40;              // objetivo de líneas
const CHALLENGE_TIME_MS = 120000;        // 2 minutos
const CHALLENGE_WARN_MS = 30000;         // umbral de aviso en el HUD
const CHALLENGE_CRITICAL_MS = 10000;     // umbral crítico en el HUD

// ---- Records locales ----
const SCORES_STORAGE_KEY = 'tetris-scores';
const LAST_NAME_STORAGE_KEY = 'tetris-last-name';
const TOP_SCORES_MAX = 5;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const comboSection = document.getElementById('combo-section');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const themeToggleIcon = themeToggle.querySelector('.theme-toggle-icon');
const soundToggle = document.getElementById('sound-toggle');
const soundToggleIcon = soundToggle.querySelector('.sound-toggle-icon');
const modeToggle = document.getElementById('mode-toggle');
const modeToggleIcon = modeToggle.querySelector('.mode-toggle-icon');
const timerEl = document.getElementById('timer');
const timerSection = document.getElementById('timer-section');
const energySection = document.getElementById('energy-section');
const energyFillEl = document.getElementById('energy-fill');

// ---- Pantalla de inicio / panel de resultado / records ----
const panelStart = document.getElementById('panel-start');
const panelResult = document.getElementById('panel-result');
const playBtn = document.getElementById('play-btn');
const startModeSelect = document.getElementById('start-mode-select');
const startResetRecordsBtn = document.getElementById('start-reset-records-btn');
const startRecordsMode = document.getElementById('start-records-mode');
const startRecordsList = document.getElementById('start-records-list');
const startBestCombo = document.getElementById('start-best-combo');
const startBestLines = document.getElementById('start-best-lines');
const newRecordBox = document.getElementById('new-record-box');
const newRecordText = document.getElementById('new-record-text');
const newRecordForm = document.getElementById('new-record-form');
const playerNameInput = document.getElementById('player-name-input');
const resultRecordsList = document.getElementById('result-records-list');
const resultBestCombo = document.getElementById('result-best-combo');
const resultBestLines = document.getElementById('result-best-lines');

const THEME_STORAGE_KEY = 'tetris-theme';

let board, holes, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let linesUntilBomb, blast, animClock;
let combo, comboFx, maxCombo;
let energy, energyReady, energyFx, lastEnergyPct;
let mode, timeLeft, challengeWon, lastTimerText;
let started;         // false mientras se muestra la pantalla de inicio (aún no hay partida en curso)
let scores;           // { classic: {top:[...], bestCombo, bestLines}, challenge: {...} }
let pendingRecord;    // entrada de la partida que acaba de terminar, a la espera del nombre (o null)

// ---- Efectos visuales (solo render: nunca participan en colisiones ni puntuación) ----
let particles;  // [] { x, y, vx, vy, life, maxLife, color, size }
let flashes;    // [] { row, t }
let banner;     // { text, t, color } | null -> "TETRIS!" / "NIVEL N"
let shake;      // { t, dur, mag } | null

// ---- Motor de audio ----
let audioCtx = null;
let masterGain = null;
let muted = false;
let voices = 0;
let noiseBuffer = null;
const lastPlayed = {};

const cssVarCache = {};
function cssVar(name, fallback) {
  if (!(name in cssVarCache)) {
    cssVarCache[name] = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }
  return cssVarCache[name];
}

// ---------------------------------------------------------------------------
// Audio: todo sintetizado con Web Audio API, sin archivos ni dependencias.
// Fire-and-forget: nunca bloquea el loop ni afecta el estado del juego.
// ---------------------------------------------------------------------------

function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return; // navegador sin soporte: el juego sigue funcionando sin sonido
  if (!audioCtx) {
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : MASTER_VOLUME;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function getNoiseBuffer() {
  if (!noiseBuffer) {
    const len = audioCtx.sampleRate * 0.5;
    noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

// Tono simple: oscilador + envolvente exponencial attack/decay (evita clicks).
function tone({ type = 'square', freq = 440, freqTo = 0, dur = 0.12, gain = 0.2, delay = 0, attack = 0.006 } = {}) {
  if (!audioCtx || muted || voices >= MAX_VOICES) return;
  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(masterGain);
  voices++;
  osc.onended = () => { voices--; osc.disconnect(); g.disconnect(); };
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Ráfaga de ruido filtrado: para el impacto de la bomba y el thud del hard drop.
function noise({ dur = 0.3, gain = 0.2, delay = 0, filterFrom = 2000, filterTo = 200 } = {}) {
  if (!audioCtx || muted || voices >= MAX_VOICES) return;
  const t0 = audioCtx.currentTime + delay;
  const src = audioCtx.createBufferSource();
  src.buffer = getNoiseBuffer();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFrom, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), t0 + dur);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(masterGain);
  voices++;
  src.onended = () => { voices--; src.disconnect(); filter.disconnect(); g.disconnect(); };
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// Deja pasar como mucho un sonido de tipo `key` cada MOVE_SFX_THROTTLE ms.
function throttled(key, fn) {
  const now = (audioCtx ? audioCtx.currentTime * 1000 : 0);
  if (lastPlayed[key] !== undefined && now - lastPlayed[key] < MOVE_SFX_THROTTLE) return;
  lastPlayed[key] = now;
  fn();
}

const SFX = {
  move() { throttled('move', () => tone({ type: 'square', freq: 200, dur: 0.03, gain: 0.06 })); },
  rotate() { throttled('rotate', () => tone({ type: 'square', freq: 320, freqTo: 460, dur: 0.05, gain: 0.08 })); },
  softDrop() { throttled('softDrop', () => tone({ type: 'triangle', freq: 150, dur: 0.025, gain: 0.05 })); },
  hardDrop() {
    tone({ type: 'sawtooth', freq: 190, freqTo: 55, dur: 0.13, gain: 0.18 });
    noise({ dur: 0.1, gain: 0.12, filterFrom: 900, filterTo: 120 });
  },
  lock() { tone({ type: 'square', freq: 130, dur: 0.05, gain: 0.1 }); },
  clear(n) {
    const notes = [523, 659, 784];
    for (let i = 0; i < n; i++) {
      tone({ type: 'triangle', freq: notes[Math.min(i, notes.length - 1)], dur: 0.09, gain: 0.16, delay: i * 0.05 });
    }
  },
  tetris() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      tone({ type: 'square', freq: f, dur: 0.14, gain: 0.2, delay: i * 0.06 });
      tone({ type: 'sawtooth', freq: f / 2, dur: 0.14, gain: 0.08, delay: i * 0.06 });
    });
  },
  combo(mult) {
    const tier = Math.min(mult, COMBO_MAX);
    const base = 392 * Math.pow(2, tier / 12);
    const gain = 0.12 + 0.01 * tier;
    tone({ type: 'square', freq: base, dur: 0.09, gain });
    tone({ type: 'square', freq: base * 1.5, dur: 0.11, gain, delay: 0.05 });
  },
  levelUp() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      const last = i === notes.length - 1;
      tone({ type: 'triangle', freq: f, dur: last ? 0.3 : 0.12, gain: 0.18, delay: i * 0.07 });
    });
  },
  win() {
    // una sola voz por nota (como levelUp): la victoria puede coincidir con un tetris
    // o un combo que ya encolaron varias voces, y MAX_VOICES no debe cortar la fanfarria
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      const last = i === notes.length - 1;
      tone({ type: 'triangle', freq: f, dur: last ? 0.5 : 0.12, gain: 0.22, delay: i * 0.09 });
    });
  },
  timeUp() {
    tone({ type: 'square', freq: 440, dur: 0.18, gain: 0.16 });
    tone({ type: 'square', freq: 440, dur: 0.18, gain: 0.16, delay: 0.24 });
    tone({ type: 'sawtooth', freq: 330, freqTo: 110, dur: 0.5, gain: 0.16, delay: 0.5 });
  },
  bomb() {
    noise({ dur: 0.35, gain: 0.25, filterFrom: 2000, filterTo: 100 });
    tone({ type: 'sawtooth', freq: 220, freqTo: 40, dur: 0.3, gain: 0.15 });
  },
  energyFull() {
    // arpegio ascendente corto, misma forma que levelUp() pero más brillante
    [659, 880, 1175].forEach((f, i) =>
      tone({ type: 'triangle', freq: f, dur: i === 2 ? 0.26 : 0.1, gain: 0.16, delay: i * 0.06 }));
  },
  zap() {
    noise({ dur: 0.25, gain: 0.2, filterFrom: 4000, filterTo: 400 });
    tone({ type: 'sawtooth', freq: 900, freqTo: 120, dur: 0.22, gain: 0.16 });
  },
  gameOver() {
    const notes = [440, 349, 294, 220];
    notes.forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.2, gain: 0.16, delay: i * 0.16 }));
  },
};

function setMuted(v) {
  muted = v;
  if (masterGain) masterGain.gain.value = muted ? 0 : MASTER_VOLUME;
  localStorage.setItem(SOUND_STORAGE_KEY, muted ? '1' : '0');
  soundToggle.setAttribute('aria-checked', muted ? 'false' : 'true');
  soundToggle.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar sonido');
  soundToggleIcon.textContent = muted ? '🔇' : '🔊';
}

function initSound() {
  setMuted(localStorage.getItem(SOUND_STORAGE_KEY) === '1');
}

// ---------------------------------------------------------------------------
// Efectos visuales: partículas, destellos de línea, banner y sacudida de
// pantalla. Todo es estado de solo render, igual que `holes` — nunca toca
// board/current/score/combo ni la lógica de colisión.
// ---------------------------------------------------------------------------

function shakeScreen(mag, dur) {
  if (!shake || mag >= shake.mag) shake = { t: 0, dur, mag };
}

function spawnParticles(cx, cy, count, color) {
  const room = MAX_PARTICLES - particles.length;
  const n = Math.max(0, Math.min(count, room));
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      life: 300 + Math.random() * 300,
      maxLife: 600,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

function spawnLineParticles(row, color) {
  for (let c = 0; c < COLS; c += 2) {
    spawnParticles((c + 0.5) * BLOCK, (row + 0.5) * BLOCK, 3, color);
  }
}

function tickEffects(dt) {
  for (let i = flashes.length - 1; i >= 0; i--) {
    flashes[i].t += dt;
    if (flashes[i].t >= FLASH_DURATION) flashes.splice(i, 1);
  }
  if (banner) {
    banner.t += dt;
    if (banner.t >= BANNER_DURATION) banner = null;
  }
  if (shake) {
    shake.t += dt;
    if (shake.t >= shake.dur) shake = null;
  }
  if (energyFx) {
    energyFx.t += dt;
    if (energyFx.t >= ENERGY_FX_DURATION) energyFx = null;
  }
  const step = dt / 16;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += PARTICLE_GRAVITY * step;
    p.x += p.vx * step;
    p.y += p.vy * step;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function pulseCombo() {
  comboSection.classList.remove('combo-active');
  void comboSection.offsetWidth; // fuerza reflow para poder reiniciar la animación CSS
  comboSection.classList.add('combo-active');
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function bombInterval() {
  return BOMB_MIN_LINES + Math.floor(Math.random() * (BOMB_MAX_LINES - BOMB_MIN_LINES + 1));
}

// true si el evento de teclado viene de un campo de texto/selector (nombre del jugador, modo):
// evita que KeyM/KeyP/KeyC disparen mientras se está tecleando.
function isTyping(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  if (linesUntilBomb <= 0) {
    linesUntilBomb = bombInterval();
    return makePiece(BOMB);
  }
  return makePiece(Math.floor(Math.random() * 8) + 1);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  if (gameOver || paused) return false;
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return true;
    }
  }
  return false;
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c]) {
        board[current.y + r][current.x + c] = current.shape[r][c];
        holes[current.y + r][current.x + c] = 0; // si se rellena un hueco previamente expuesto, deja de dibujarse
      }
  if (current.type === NUT) holes[current.y + 1][current.x + 1] = 1;
}

function comboMultiplier() {
  return Math.max(1, Math.min(combo, COMBO_MAX));
}

function clearLines(neutralTurn) {
  // Se captura fila y colores ANTES del splice: una vez spliceada la fila
  // desaparece del board, así que es el único momento en que el flash/las
  // partículas pueden saber dónde y de qué color pintarse.
  const clearedRows = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      clearedRows.push({ row: r, colors: board[r].slice() });
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      holes.splice(r, 1);
      holes.unshift(new Array(COLS).fill(0));
      r++;
    }
  }
  const cleared = clearedRows.length;
  if (cleared) {
    const prevLevel = level;
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    lines += cleared;
    linesUntilBomb -= cleared;
    score += (LINE_SCORES[cleared] || 0) * level * comboMultiplier();
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);

    if (!energyReady) {
      energy = Math.min(ENERGY_MAX, energy + (ENERGY_GAIN[cleared] || ENERGY_GAIN[4]));
      if (energy >= ENERGY_MAX) { energyReady = true; SFX.energyFull(); }
    }

    clearedRows.forEach(({ row, colors }) => {
      flashes.push({ row, t: 0 });
      const midColor = COLORS[colors[Math.floor(COLS / 2)]] || cssVar('--combo-color', '#ffb300');
      spawnLineParticles(row, midColor);
    });

    if (cleared >= 4) {
      SFX.tetris();
      banner = { text: '¡TETRIS!', t: 0, color: cssVar('--combo-color', '#ffb300') };
      shakeScreen(SHAKE_TETRIS.mag, SHAKE_TETRIS.dur);
    } else {
      SFX.clear(cleared);
    }

    if (combo >= 2) {
      comboFx = { mult: comboMultiplier(), t: 0 };
      pulseCombo();
      SFX.combo(comboMultiplier());
    }

    if (level > prevLevel) {
      banner = { text: `NIVEL ${level}`, t: 0, color: cssVar('--value-color', '#7aa2f7') };
      SFX.levelUp();
    }

    updateHUD();
    checkChallengeWin();
  } else if (!neutralTurn && combo) {
    combo = 0;
    updateHUD();
  }
}

// Compartida por clearLines() y zapBottomRow(): ambas pueden hacer crecer `lines`
// hasta el objetivo del desafío.
function checkChallengeWin() {
  if (mode === MODE_CHALLENGE && !gameOver && lines >= CHALLENGE_LINES) {
    banner = { text: '¡GANASTE!', t: 0, color: cssVar('--win-color', '#81c784') };
    finishChallenge(true);
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  if (gameOver || paused) return;
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  SFX.hardDrop();
  shakeScreen(SHAKE_HARD_DROP.mag, SHAKE_HARD_DROP.dur);
  lockPiece();
}

function softDrop() {
  if (gameOver || paused) return;
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    SFX.softDrop();
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (gameOver) return;
  const isBomb = current.type === BOMB;
  if (isBomb) explode(current.x, current.y);
  else { merge(); SFX.lock(); }
  clearLines(isBomb);
  if (gameOver) return; // el desafío pudo terminar al limpiar la línea 40: no generar otra pieza

  // Habilidad automática de la barra de energía: solo se dispara si la fila
  // inferior tiene algo que borrar, así una barra llena con esa fila vacía
  // (p. ej. por un Tetris reciente) queda a la espera en vez de desperdiciarse.
  if (energyReady && board[ROWS - 1].some(v => v !== 0)) {
    energyReady = false;
    energy = 0;
    zapBottomRow();
    if (gameOver) return; // el zap pudo cerrar el desafío al llegar a la línea 40
  }

  spawn();
}

function explode(cx, cy) {
  let destroyed = 0;
  const cols = new Set();
  for (let r = cy - 1; r <= cy + 1; r++) {
    if (r < 0 || r >= ROWS) continue;
    for (let c = cx - 1; c <= cx + 1; c++) {
      if (c < 0 || c >= COLS) continue;
      cols.add(c);
      if (board[r][c]) destroyed++;
      board[r][c] = 0;
      holes[r][c] = 0;
    }
  }
  if (destroyed) {
    score += destroyed * BOMB_BLOCK_SCORE * level;
    updateHUD();
  }
  blast = { cx, cy, t: 0 };
  SFX.bomb();
  shakeScreen(SHAKE_BOMB.mag, SHAKE_BOMB.dur);
  spawnParticles((cx + 0.5) * BLOCK, (cy + 0.5) * BLOCK, 24, cssVar('--combo-color', '#ffb300'));
  cols.forEach(collapseColumn);
}

// Habilidad de la barra de energía: elimina la fila inferior completa.
// No otorga energía ni toca `combo`, así que no puede encadenarse consigo misma.
function zapBottomRow() {
  const row = ROWS - 1;
  const colors = board[row].slice(); // capturar ANTES del splice, igual que en clearLines()
  const destroyed = board[row].filter(v => v !== 0).length;

  board.splice(row, 1);
  board.unshift(new Array(COLS).fill(0));
  holes.splice(row, 1);
  holes.unshift(new Array(COLS).fill(0));

  const prevLevel = level;
  score += destroyed * BOMB_BLOCK_SCORE * level;
  lines += 1;
  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);

  flashes.push({ row, t: 0 });
  spawnLineParticles(row, COLORS[colors[Math.floor(COLS / 2)]] || cssVar('--energy-ready', '#4dd0e1'));
  energyFx = { t: 0 };
  shakeScreen(SHAKE_ZAP.mag, SHAKE_ZAP.dur);
  SFX.zap();

  if (level > prevLevel) {
    banner = { text: `NIVEL ${level}`, t: 0, color: cssVar('--value-color', '#7aa2f7') };
    SFX.levelUp();
  } else if (!banner) {
    // el slot de banner es único: no pisar un "¡TETRIS!"/"NIVEL N" recién puesto por clearLines()
    banner = { text: '¡ZAP!', t: 0, color: cssVar('--energy-ready', '#4dd0e1') };
  }

  updateHUD();
  checkChallengeWin();
}

function collapseColumn(c) {
  const stack = [];
  for (let r = ROWS - 1; r >= 0; r--)
    if (board[r][c]) stack.push([board[r][c], holes[r][c]]);
  for (let r = ROWS - 1; r >= 0; r--) {
    const cell = stack[ROWS - 1 - r];
    board[r][c] = cell ? cell[0] : 0;
    holes[r][c] = cell ? cell[1] : 0;
  }
}

function spawn() {
  const piece = next;
  if (collide(piece.shape, piece.x, piece.y)) {
    endGame();
    return;
  }
  current = piece;
  next = randomPiece();
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = mode === MODE_CHALLENGE ? `${lines} / ${CHALLENGE_LINES}` : lines;
  levelEl.textContent = level;
  comboEl.textContent = 'x' + comboMultiplier();
  comboSection.classList.toggle('combo-active', combo >= 2);
  comboSection.classList.toggle('combo-hot', combo >= 5);

  const pct = Math.round((energy / ENERGY_MAX) * 100);
  if (pct !== lastEnergyPct) {
    lastEnergyPct = pct;
    energyFillEl.style.width = pct + '%';
  }
  energySection.classList.toggle('energy-ready', energyReady);
}

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000)); // ceil: arranca en 2:00 y solo llega a 0:00 al expirar
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatElapsed(ms) {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const cs = Math.floor((t % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function updateTimer() {
  if (mode !== MODE_CHALLENGE) return;
  const text = formatClock(timeLeft);
  if (text === lastTimerText) return; // solo se escribe en el DOM al cambiar el segundo, no en cada frame
  lastTimerText = text;
  timerEl.textContent = text;
  timerSection.classList.toggle('timer-warn', timeLeft <= CHALLENGE_WARN_MS);
  timerSection.classList.toggle('timer-critical', timeLeft <= CHALLENGE_CRITICAL_MS);
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  if (colorIndex === BOMB) { drawBomb(context, x, y, size, alpha); return; }
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawBomb(context, x, y, size, alpha) {
  const cx = x * size + size / 2;
  const cy = y * size + size / 2;
  context.globalAlpha = alpha ?? 1;

  // cuerpo esférico
  const radius = size * 0.36;
  const bodyGrad = context.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.15, cx, cy, radius);
  bodyGrad.addColorStop(0, '#546e7a');
  bodyGrad.addColorStop(1, '#1c262b');
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fillStyle = bodyGrad;
  context.fill();

  // brillo
  context.beginPath();
  context.arc(cx - radius * 0.35, cy - radius * 0.35, radius * 0.22, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fill();

  // mecha
  const fuseStartX = cx + radius * 0.55;
  const fuseStartY = cy - radius * 0.55;
  const fuseEndX = cx + radius * 0.95;
  const fuseEndY = cy - radius * 1.4;
  context.strokeStyle = '#8d6e63';
  context.lineWidth = Math.max(1.5, size * 0.06);
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(fuseStartX, fuseStartY);
  context.quadraticCurveTo(cx + radius * 1.3, cy - radius * 0.9, fuseEndX, fuseEndY);
  context.stroke();

  // chispa pulsante
  const pulse = 0.5 + 0.5 * Math.sin((animClock || 0) / 120);
  const sparkRadius = size * (0.09 + 0.04 * pulse);
  const sparkGrad = context.createRadialGradient(fuseEndX, fuseEndY, 0, fuseEndX, fuseEndY, sparkRadius);
  sparkGrad.addColorStop(0, '#fff59d');
  sparkGrad.addColorStop(0.5, '#ffb300');
  sparkGrad.addColorStop(1, 'rgba(255,179,0,0)');
  context.beginPath();
  context.arc(fuseEndX, fuseEndY, sparkRadius, 0, Math.PI * 2);
  context.fillStyle = sparkGrad;
  context.fill();

  context.globalAlpha = 1;
}

function drawNutHole(context, x, y, size, alpha) {
  drawBlock(context, x, y, NUT, size, alpha);
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = cssVar('--board-bg', '#1a1a25');
  context.beginPath();
  context.arc(x * size + size / 2, y * size + size / 2, size * 0.28, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'rgba(0,0,0,0.35)';
  context.lineWidth = 1.5;
  context.stroke();
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = cssVar('--grid-line', '#22222e');
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height); // limpia TODO el canvas, antes de aplicar el shake
  ctx.save();
  if (shake) {
    const k = 1 - shake.t / shake.dur; // decae linealmente hasta 0
    ctx.translate(Math.sin(shake.t / 9) * shake.mag * k, Math.cos(shake.t / 7) * shake.mag * k);
  }

  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // huecos de tuercas ya bloqueadas
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (holes[r][c]) drawNutHole(ctx, c, r, BLOCK);

  // destello de líneas recién limpiadas (se estrecha hacia el centro de la fila)
  flashes.forEach(f => {
    const t = f.t / FLASH_DURATION;
    const inset = (BLOCK / 2) * t;
    ctx.globalAlpha = (1 - t) * 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, f.row * BLOCK + inset, COLS * BLOCK, BLOCK - inset * 2);
    ctx.globalAlpha = 1;
  });

  // partículas (línea limpiada / explosión de bomba)
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  ctx.globalAlpha = 1;

  // barrido de la habilidad de energía sobre la fila inferior
  if (energyFx) {
    const t = Math.min(energyFx.t / ENERGY_FX_DURATION, 1);
    const y = (ROWS - 1) * BLOCK;
    const color = cssVar('--energy-ready', '#4dd0e1');
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.fillRect(0, y + (BLOCK / 2) * t, COLS * BLOCK * (1 - t * 0.15), BLOCK - BLOCK * t);
    ctx.restore();
  }

  // animación de explosión de bomba
  if (blast) {
    const t = Math.min(blast.t / BLAST_DURATION, 1);
    const alpha = 1 - t;
    const bx = (blast.cx + 0.5) * BLOCK;
    const by = (blast.cy + 0.5) * BLOCK;
    const maxRadius = BLOCK * 2.1; // cubre el área 3x3
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ffb300';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bx, by, maxRadius * t, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,183,0,0.25)';
    ctx.beginPath();
    ctx.arc(bx, by, maxRadius * t * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // aviso flotante de combo: pop de entrada + color según el tier del multiplicador
  if (comboFx) {
    const t = Math.min(comboFx.t / COMBO_FX_DURATION, 1);
    const alpha = 1 - t;
    const pop = 1 + 0.5 * Math.pow(1 - Math.min(t * 4, 1), 3);
    const mult = comboFx.mult;
    const color = mult >= 10 ? '#4dd0e1' : mult >= 7 ? '#f06292' : mult >= 4 ? '#ff8a3d' : cssVar('--combo-color', '#ffb300');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate((COLS * BLOCK) / 2, ROWS * BLOCK * 0.28 - t * 16);
    ctx.scale(pop, pop);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 26px "Courier New", Courier, monospace';
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.fillText(`COMBO x${mult}`, 0, 0);
    ctx.restore();
  }

  // banner de logro especial: "¡TETRIS!" / "NIVEL N"
  if (banner) {
    const t = banner.t / BANNER_DURATION;
    const pop = 1 + 0.4 * Math.pow(1 - Math.min(t * 5, 1), 3);
    const alpha = t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate((COLS * BLOCK) / 2, ROWS * BLOCK * 0.45);
    ctx.scale(pop, pop);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 30px "Courier New", Courier, monospace';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(banner.text, 0, 0);
    ctx.fillStyle = banner.color;
    ctx.fillText(banner.text, 0, 0);
    ctx.restore();
  }

  if (gameOver || !current) { ctx.restore(); return; } // !current: pantalla de inicio, aún no hay pieza

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  if (current.type === NUT) drawNutHole(ctx, current.x + 1, gy + 1, BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === NUT) drawNutHole(ctx, current.x + 1, current.y + 1, BLOCK);

  ctx.restore();
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!next) return; // pantalla de inicio: aún no hay pieza "next" que previsualizar
  if (next.type === BOMB) {
    drawBomb(nextCtx, 0.5, 0.5, 60);
    return;
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.type === NUT) drawNutHole(nextCtx, offX + 1, offY + 1, NB);
}

// ---------------------------------------------------------------------------
// Records locales: top-5 por modo (clásico/desafío son partidas distintas) + el mejor
// combo y el máximo de líneas conseguidos alguna vez, que viven fuera del top-5 porque
// una racha récord puede darse en una partida que no entra en la tabla de puntuación.
// Persistido como JSON en localStorage; es el primer JSON.parse del archivo, así que va
// envuelto en try/catch — un valor corrupto no debe romper el arranque.
// ---------------------------------------------------------------------------

function emptyScores() {
  return {
    classic: { top: [], bestCombo: 0, bestLines: 0 },
    challenge: { top: [], bestCombo: 0, bestLines: 0 },
  };
}

function loadScores() {
  try {
    const raw = localStorage.getItem(SCORES_STORAGE_KEY);
    if (!raw) return emptyScores();
    const parsed = JSON.parse(raw);
    const base = emptyScores();
    for (const m of ['classic', 'challenge']) {
      const src = parsed && parsed[m];
      if (!src) continue;
      if (Array.isArray(src.top)) base[m].top = src.top.slice(0, TOP_SCORES_MAX);
      if (Number.isFinite(src.bestCombo)) base[m].bestCombo = src.bestCombo;
      if (Number.isFinite(src.bestLines)) base[m].bestLines = src.bestLines;
    }
    return base;
  } catch {
    return emptyScores(); // localStorage con JSON corrupto: seguir con la tabla vacía en vez de romper el arranque
  }
}

function saveScores() {
  localStorage.setItem(SCORES_STORAGE_KEY, JSON.stringify(scores));
}

function initRecords() {
  scores = loadScores();
}

function resetRecords() {
  scores = emptyScores();
  saveScores();
  renderRecords();
}

// Registra los máximos "de siempre" y decide si la partida entra en el top-5 de su modo.
// Devuelve el índice donde entraría (el número de entradas actuales con score >= la nueva,
// que es exactamente su posición tras el sort descendente de insertScore()), o -1 si no
// entra. Los máximos se guardan YA, entren o no en el top-5, para no perder una racha o un
// total de líneas récord de una partida floja.
function submitRun({ score, lines, combo }) {
  const bucket = scores[mode];
  if (combo > bucket.bestCombo) bucket.bestCombo = combo;
  if (lines > bucket.bestLines) bucket.bestLines = lines;
  saveScores();
  if (bucket.top.length >= TOP_SCORES_MAX && score <= bucket.top[bucket.top.length - 1].score) return -1;
  let rank = 0;
  while (rank < bucket.top.length && bucket.top[rank].score >= score) rank++;
  return rank;
}

function insertScore(entry) {
  const bucket = scores[mode];
  bucket.top.push(entry);
  bucket.top.sort((a, b) => b.score - a.score);
  bucket.top.length = Math.min(bucket.top.length, TOP_SCORES_MAX);
  saveScores();
  localStorage.setItem(LAST_NAME_STORAGE_KEY, entry.name);
}

// Escapa el nombre del jugador antes de inyectarlo vía innerHTML: viene de localStorage
// (leído en cada arranque/cambio de modo), y aunque el formulario lo trunca a 8 caracteres,
// no hay que asumir que ese valor no pueda contener '<'/'>'/'&' si el storage se edita a mano.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderList(listEl, top, highlightRank) {
  listEl.innerHTML = '';
  if (!top.length) {
    const li = document.createElement('li');
    li.className = 'records-empty';
    li.textContent = 'Sin puntuaciones todavía';
    listEl.appendChild(li);
    return;
  }
  top.forEach((entry, i) => {
    const li = document.createElement('li');
    li.className = 'record-row' + (i === highlightRank ? ' record-new' : '');
    li.innerHTML = `<span class="record-rank">${i + 1}</span>` +
      `<span class="record-name">${escapeHtml(entry.name)}</span>` +
      `<span class="record-score">${entry.score.toLocaleString()}</span>` +
      `<span class="record-detail">L${entry.level} · ${entry.lines}L</span>`;
    listEl.appendChild(li);
  });
}

// highlightRank: fila a resaltar en el panel de resultado justo después de guardar el nombre.
function renderRecords(highlightRank = -1) {
  const bucket = scores[mode];
  startRecordsMode.textContent = mode === MODE_CHALLENGE ? 'DESAFÍO' : 'CLÁSICO';
  renderList(startRecordsList, bucket.top, -1);
  startBestCombo.textContent = 'x' + bucket.bestCombo;
  startBestLines.textContent = bucket.bestLines;
  renderList(resultRecordsList, bucket.top, highlightRank);
  resultBestCombo.textContent = 'x' + bucket.bestCombo;
  resultBestLines.textContent = bucket.bestLines;
}

function stopRun() {
  gameOver = true;
  paused = false;
  cancelAnimationFrame(animId);
  animId = null;
  draw();
}

function showOverlay(title, detail, won) {
  overlayTitle.textContent = title;
  overlayTitle.classList.toggle('overlay-win', !!won);
  overlayScore.textContent = detail;
  panelStart.classList.add('hidden');
  panelResult.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

// Común a endGame()/finishChallenge(): actualiza mejor-combo/máx-líneas, decide si la
// partida entra en el top-5 y muestra (o no) el formulario de nombre.
function offerRecord() {
  const rank = submitRun({ score, lines, combo: maxCombo });
  if (rank === -1) {
    newRecordBox.classList.add('hidden');
    pendingRecord = null;
    renderRecords();
    return;
  }
  pendingRecord = { entry: { score, lines, level, combo: maxCombo }, rank };
  newRecordText.textContent = `¡Entras en el top ${TOP_SCORES_MAX} (puesto ${rank + 1})!`;
  playerNameInput.value = localStorage.getItem(LAST_NAME_STORAGE_KEY) || '';
  newRecordBox.classList.remove('hidden');
  renderRecords();
  setTimeout(() => playerNameInput.focus(), 0); // tras quitar `hidden`, para que el campo ya sea focuseable
}

function endGame() {
  if (gameOver) return;
  stopRun();
  SFX.gameOver();
  showOverlay('GAME OVER', `Puntuación: ${score.toLocaleString()}`, false);
  offerRecord();
}

function finishChallenge(won) {
  if (gameOver) return;
  challengeWon = won;
  stopRun();
  if (won) {
    SFX.win();
    showOverlay('¡GANASTE!', `${CHALLENGE_LINES} líneas en ${formatElapsed(CHALLENGE_TIME_MS - timeLeft)} · ${score.toLocaleString()} pts`, true);
  } else {
    SFX.timeUp();
    showOverlay('¡TIEMPO!', `${lines} / ${CHALLENGE_LINES} líneas · ${score.toLocaleString()} pts`, false);
  }
  updateTimer();
  offerRecord();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showOverlay('PAUSA', '', false);
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  animClock += dt;
  if (mode === MODE_CHALLENGE) timeLeft -= dt;
  tickEffects(dt);
  if (blast) {
    blast.t += dt;
    if (blast.t >= BLAST_DURATION) blast = null;
  }
  if (comboFx) {
    comboFx.t += dt;
    if (comboFx.t >= COMBO_FX_DURATION) comboFx = null;
  }
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (mode === MODE_CHALLENGE && !gameOver && timeLeft <= 0) {
    banner = { text: '¡TIEMPO!', t: 0, color: cssVar('--timer-critical-color', '#e57373') };
    finishChallenge(false);
    return; // finishChallenge ya dibujó y canceló el rAF
  }
  updateTimer();
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

// Resetea todo el estado de una partida (tablero, score, combo, energía, efectos…) sin
// arrancar el loop ni tocar el overlay. Usado tanto por init() (empezar a jugar) como por
// showStartScreen() (dejar todo en cero detrás de la pantalla de inicio).
function resetRunState() {
  board = createBoard();
  holes = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  linesUntilBomb = bombInterval();
  blast = null;
  animClock = 0;
  combo = 0;
  maxCombo = 0;
  comboFx = null;
  energy = 0;
  energyReady = false;
  energyFx = null;
  lastEnergyPct = -1; // -1 fuerza la primera escritura del ancho en updateHUD()
  particles = [];
  flashes = [];
  banner = null;
  shake = null;
  timeLeft = CHALLENGE_TIME_MS;
  challengeWon = false;
  lastTimerText = '';
  pendingRecord = null;
  newRecordBox.classList.add('hidden');
}

function init() {
  resetRunState();
  started = true;
  next = randomPiece();
  spawn();
  updateHUD();
  updateTimer();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// Pantalla de inicio: tablero vacío de fondo, records + selector de modo, sin loop corriendo.
function showStartScreen() {
  resetRunState();
  started = false;
  gameOver = true; // reutiliza los guards existentes (draw(), keydown…) para bloquear el juego
  current = null;
  next = null;
  cancelAnimationFrame(animId);
  animId = null;
  drawNext();
  draw();
  updateHUD();
  startModeSelect.value = mode;
  renderRecords();
  panelResult.classList.add('hidden');
  panelStart.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

document.addEventListener('keydown', e => {
  if (isTyping(e.target)) return; // no interceptar mientras se teclea un nombre o se usa un <select> del overlay
  unlockAudio(); // toda tecla es un gesto de usuario válido para desbloquear el audio
  if (e.code === 'KeyM') { setMuted(!muted); return; } // funciona incluso en pausa/game-over, como KeyP
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyC') { toggleMode(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) { current.x--; SFX.move(); }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) { current.x++; SFX.move(); }
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      if (tryRotate()) SFX.rotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => { unlockAudio(); init(); });

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.setAttribute('aria-checked', theme === 'light' ? 'true' : 'false');
  themeToggle.setAttribute('aria-label', theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  themeToggleIcon.textContent = theme === 'light' ? '☀️' : '🌙';
  for (const key in cssVarCache) delete cssVarCache[key]; // los colores del tema cambiaron: invalidar caché
}

function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('click', () => {
  unlockAudio();
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_STORAGE_KEY, next);
  applyTheme(next);
});

soundToggle.addEventListener('click', () => { unlockAudio(); setMuted(!muted); });

function applyMode(m) {
  mode = m;
  const challenge = m === MODE_CHALLENGE;
  document.body.classList.toggle('mode-challenge', challenge);
  modeToggle.setAttribute('aria-checked', challenge ? 'true' : 'false');
  modeToggle.setAttribute('aria-label', challenge ? 'Cambiar a modo clásico' : 'Cambiar a modo desafío');
  modeToggleIcon.textContent = challenge ? '⏱️' : '∞';
}

function initMode() {
  const saved = localStorage.getItem(MODE_STORAGE_KEY);
  applyMode(saved === MODE_CHALLENGE ? MODE_CHALLENGE : MODE_CLASSIC);
}

// Único punto que cambia `mode`: reinicia la partida en curso, o si aún no se ha jugado
// (pantalla de inicio), se limita a refrescar esa pantalla para el nuevo modo (sus records
// son distintos de los del otro modo).
function setMode(m) {
  localStorage.setItem(MODE_STORAGE_KEY, m);
  applyMode(m);
  if (started) init(); // cambiar de modo reinicia la partida
  else showStartScreen();
}

function toggleMode() {
  setMode(mode === MODE_CHALLENGE ? MODE_CLASSIC : MODE_CHALLENGE);
}

modeToggle.addEventListener('click', () => {
  unlockAudio();
  modeToggle.blur(); // el listener de keydown vive en document: si el botón conserva el foco, Enter lo reactivaría y reiniciaría la partida
  toggleMode();
});

startModeSelect.addEventListener('change', () => { unlockAudio(); setMode(startModeSelect.value); });

// ---------------------------------------------------------------------------
// Pantalla de inicio: botón JUGAR y reseteo de records.
// ---------------------------------------------------------------------------

playBtn.addEventListener('click', () => { unlockAudio(); playBtn.blur(); init(); });

startResetRecordsBtn.addEventListener('click', () => {
  unlockAudio();
  startResetRecordsBtn.blur();
  if (confirm('¿Borrar todos los records guardados?')) resetRecords();
});

// ---------------------------------------------------------------------------
// Formulario de nombre al entrar en el top-5.
// ---------------------------------------------------------------------------

newRecordForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!pendingRecord) return;
  const name = playerNameInput.value.trim().toUpperCase().slice(0, 8) || '---';
  insertScore({ ...pendingRecord.entry, name });
  newRecordBox.classList.add('hidden');
  renderRecords(pendingRecord.rank);
  pendingRecord = null;
});

resetRunState(); // board/holes/particles/etc. deben existir antes del primer draw() de showStartScreen()

initTheme();
initSound();
initMode();
initRecords();
showStartScreen();
