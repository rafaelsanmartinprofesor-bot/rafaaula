'use strict';
// Minijuego 2: Encaje vectorial (Tetris isométrico).
// Una pieza debe llegar a su hueco combinando giros, reflexiones y traslaciones.
// Giros y reflexiones se hacen respecto al origen del plano cartesiano.

const MIN = -6, MAX = 5;            // celdas con esquina inferior izquierda entre -6 y 5 (tablero de 12 x 12)
const TOTAL_ROUNDS = 8;
const STEPS_BY_ROUND = [2, 2, 3, 3, 4, 4, 5, 5];
const FAMILIES = ['tr', 'rot', 'ref']; // traslación, rotación, reflexión: misma probabilidad cada una
const ORDER_BONUS = [50, 30, 10];
const SCALE = Number(process.env.TP_TIME_SCALE) || 1; // solo para pruebas automáticas
const INTRO_MS = 6000 * SCALE, RESULT_MS = 10000 * SCALE;
const playMs = (steps) => (30 + 10 * steps) * 1000 * SCALE;

// Polominós sin simetría de espejo, para que las reflexiones sí se noten.
const EASY = [
  [[0, 0], [0, 1], [0, 2], [1, 0]],          // L
  [[0, 0], [1, 0], [1, 1], [2, 1]]           // S
];
const HARD = [
  [[1, 0], [0, 1], [1, 1], [1, 2], [2, 2]],  // F
  [[0, 0], [0, 1], [1, 1], [1, 2], [1, 3]],  // N
  [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],  // P
  [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1]],  // Y
  [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0]]   // L larga
];
const LINEAR = ['r90', 'r-90', 'r180', 'mx', 'my'];
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (list) => list[rnd(list.length)];

// Celdas como centros en coordenadas dobles: la celda (x, y) tiene centro (2x+1, 2y+1).
const toC = ([x, y]) => [2 * x + 1, 2 * y + 1];
const fromC = ([a, b]) => [(a - 1) / 2, (b - 1) / 2];
function applyOp(cs, op) {
  switch (op.t) {
    case 'r90': return cs.map(([a, b]) => [-b, a]);        // 90° antihorario
    case 'r-90': return cs.map(([a, b]) => [b, -a]);       // 90° horario
    case 'r180': return cs.map(([a, b]) => [-a, -b]);
    case 'mx': return cs.map(([a, b]) => [a, -b]);         // reflexión respecto al eje X
    case 'my': return cs.map(([a, b]) => [-a, b]);         // reflexión respecto al eje Y
    case 'tr': return cs.map(([a, b]) => [a + 2 * op.dx, b + 2 * op.dy]);
    default: return cs;
  }
}
const run = (cs, ops) => ops.reduce((acc, op) => applyOp(acc, op), cs);
const keyOf = (cs) => cs.map((c) => c.join(',')).sort().join('|');
const inside = (cs) => cs.every((c) => { const [x, y] = fromC(c); return x >= MIN && x <= MAX && y >= MIN && y <= MAX; });
const flip = (op) => (op.t === 'r90' ? { t: 'r-90' } : op.t === 'r-90' ? { t: 'r90' } : op);

function makeRound(round) {
  const steps = STEPS_BY_ROUND[Math.min(round, TOTAL_ROUNDS) - 1];
  const shape = pick(round <= 2 ? EASY : EASY.concat(HARD));
  for (let attempt = 0; attempt < 800; attempt++) {
    const w = Math.max(...shape.map((c) => c[0])) + 1, h = Math.max(...shape.map((c) => c[1])) + 1;
    const ox = MIN + rnd(MAX - MIN + 2 - w), oy = MIN + rnd(MAX - MIN + 2 - h);
    const start = shape.map(([x, y]) => toC([x + ox, y + oy]));
    // Familias de transformación: nunca dos iguales seguidas y, desde 3 pasos, aparecen las tres.
    let fams;
    do {
      fams = [];
      for (let i = 0; i < steps; i++) {
        let f;
        do { f = pick(FAMILIES); } while (i > 0 && f === fams[i - 1]);
        fams.push(f);
      }
    } while (steps >= 3 && new Set(fams).size < 3);
    const ops = fams.map((f) => {
      if (f === 'tr') {
        let dx = 0, dy = 0;
        while (dx === 0 && dy === 0) { dx = rnd(9) - 4; dy = rnd(9) - 4; }
        return { t: 'tr', dx, dy };
      }
      return { t: f === 'rot' ? pick(['r90', 'r-90', 'r180']) : pick(['mx', 'my']) };
    });
    const target = run(start, ops);
    if (inside(target) && keyOf(target) !== keyOf(start)) {
      return { steps, start, target, solution: ops };
    }
  }
  // Respaldo muy poco probable: una traslación simple.
  const start = shape.map(([x, y]) => toC([x - 4, y - 4]));
  const ops = [{ t: 'tr', dx: 5, dy: 4 }];
  return { steps: 1, start, target: run(start, ops), solution: ops };
}

const award = (room, g, keyOf) => room.awardSession && room.awardSession([...g.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, key: keyOf(p) })));

function publicState(g) {
  if (!g) return null;
  const reveal = g.phase === 'result' || g.phase === 'end';
  return {
    type: 'tetris', phase: g.phase, round: g.round, rounds: TOTAL_ROUNDS,
    steps: g.steps, maxSteps: g.steps + 1, bounds: { min: MIN, max: MAX },
    start: g.start ? g.start.map(fromC) : [], target: g.target ? g.target.map(fromC) : [],
    solution: reveal ? g.solution : null,
    endsAt: g.endsAt, durationMs: g.durationMs, now: Date.now(),
    hit: [...g.hit], pendingHits: g.pending.size,
    players: [...g.players.values()].map((p) => ({
      id: p.id, name: p.name, color: p.color, score: p.score,
      solved: p.solved, order: p.order, gain: p.gain, hasItem: p.hasItem
    }))
  };
}
const emit = (room, io) => io.to(room.code).emit('game:state', publicState(room.game));
function stop(room) { if (room.game && room.game.timer) clearTimeout(room.game.timer); room.game = null; }

function start(room, io) {
  stop(room);
  const players = new Map();
  for (const p of room.players.values()) {
    players.set(p.id, { id: p.id, name: p.name, color: p.color, score: 0, solved: false, order: 0, gain: 0, hasItem: false });
  }
  room.game = {
    type: 'tetris', phase: 'intro', round: 0, players, hit: new Set(), pending: new Set(),
    steps: 0, start: null, target: null, solution: null, solvedCount: 0,
    endsAt: Date.now() + INTRO_MS, durationMs: INTRO_MS, timer: null
  };
  emit(room, io);
  room.game.timer = setTimeout(() => nextRound(room, io), INTRO_MS);
}

function nextRound(room, io) {
  const g = room.game; if (!g) return;
  g.round += 1;
  Object.assign(g, makeRound(g.round));
  g.phase = 'play';
  g.hit = new Set(g.pending); g.pending = new Set();
  g.solvedCount = 0;
  g.players.forEach((p) => { p.solved = false; p.order = 0; p.gain = 0; });
  g.durationMs = playMs(g.steps);
  g.endsAt = Date.now() + g.durationMs;
  emit(room, io);
  g.timer = setTimeout(() => finishRound(room, io), g.durationMs + 600);
}

function finishRound(room, io) {
  const g = room.game; if (!g || g.phase !== 'play') return;
  clearTimeout(g.timer);
  if (g.round >= TOTAL_ROUNDS) {
    g.phase = 'end';
    g.endsAt = Date.now();
    emit(room, io);
    award(room, g, (p) => p.score);
    return;
  }
  g.phase = 'result';
  g.durationMs = RESULT_MS;
  g.endsAt = Date.now() + RESULT_MS;
  emit(room, io);
  g.timer = setTimeout(() => nextRound(room, io), RESULT_MS);
}

function cleanSeq(seq, maxSteps) {
  if (!Array.isArray(seq) || seq.length < 1 || seq.length > maxSteps) return null;
  const out = [];
  for (const raw of seq) {
    if (!raw || typeof raw.t !== 'string') return null;
    if (LINEAR.includes(raw.t)) { out.push({ t: raw.t }); continue; }
    if (raw.t !== 'tr') return null;
    const dx = Number(raw.dx), dy = Number(raw.dy);
    if (!Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) > 12 || Math.abs(dy) > 12) return null;
    out.push({ t: 'tr', dx, dy });
  }
  return out;
}

function submit(room, io, playerId, data) {
  const g = room.game;
  if (!g || g.phase !== 'play' || Date.now() > g.endsAt + 400) return;
  const p = g.players.get(playerId);
  if (!p || p.solved) return;
  const seq = cleanSeq(data && data.seq, g.steps + 1);
  const reply = (payload) => { const rp = room.players.get(p.id); if (rp && rp.socketId) io.to(rp.socketId).emit('game:feedback', payload); };
  if (!seq) { reply({ ok: false, msg: 'Secuencia no válida.' }); return; }
  const victim = g.hit.has(p.id);
  const result = run(g.start, victim ? seq.map(flip) : seq);
  if (keyOf(result) !== keyOf(g.target)) { reply({ ok: false, msg: 'Todavía no encaja. Revisa el orden de los pasos.' }); return; }
  const order = g.solvedCount;
  g.solvedCount += 1;
  const fraction = Math.max(0, (g.endsAt - Date.now()) / g.durationMs);
  p.solved = true;
  p.order = order + 1;
  p.gain = 100 + Math.round(100 * fraction) + (ORDER_BONUS[order] || 0) + (seq.length <= g.steps ? 20 : 0);
  p.score += p.gain;
  if (order === 0) p.hasItem = true; // quien encaja primero gana un ítem de interferencia
  reply({ ok: true, gain: p.gain, order: p.order });
  const everyone = [...g.players.values()].every((q) => q.solved);
  if (everyone) finishRound(room, io); else emit(room, io);
}

function useItem(room, io, playerId, data) {
  const g = room.game;
  if (!g || g.phase !== 'result') return;
  const p = g.players.get(playerId);
  const targetId = String(data && data.target || '');
  if (!p || !p.hasItem || targetId === playerId || !g.players.has(targetId) || g.pending.has(targetId)) return;
  p.hasItem = false;
  g.pending.add(targetId);
  emit(room, io);
}

function action(room, io, playerId, type, data) {
  if (type === 'submit') submit(room, io, playerId, data);
  else if (type === 'item') useItem(room, io, playerId, data);
}

function addPlayer(room, io, rp) {
  const g = room.game; if (!g || g.players.has(rp.id)) return;
  g.players.set(rp.id, { id: rp.id, name: rp.name, color: rp.color, score: 0, solved: false, order: 0, gain: 0, hasItem: false });
  emit(room, io);
}
function removePlayer(room, io, id) {
  const g = room.game; if (!g || !g.players.delete(id)) return;
  g.hit.delete(id); g.pending.delete(id);
  if (g.phase === 'play' && g.players.size && [...g.players.values()].every((q) => q.solved)) finishRound(room, io); else emit(room, io);
}

module.exports = { start, stop, publicState, action, addPlayer, removePlayer };
