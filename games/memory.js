'use strict';
// Minijuego 3: Memoria de transformaciones.
// La clase ve una secuencia de transformaciones animadas y cada jugador escribe el orden en que aparecieron.
// Cada ronda trae más transformaciones y van más rápido. Nadie queda eliminado: se suman puntos por cada posición acertada.

const KINDS = ['tr', 'rot', 'ref', 'hom']; // traslación, rotación, reflexión, homotecia
const TOTAL_ROUNDS = 10;
const SCALE = Number(process.env.TP_TIME_SCALE) || 1; // solo para pruebas automáticas
const INTRO_MS = 5000 * SCALE, RESULT_MS = 7000 * SCALE;
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (list) => list[rnd(list.length)];

function config(round) {
  const n = round + 2;                                           // ronda 1: 3 transformaciones, ronda 10: 12
  return {
    n,
    stepMs: Math.max(450, 1500 - 110 * (round - 1)) * SCALE,     // cada transformación dura menos
    gapMs: Math.max(200, 450 - 25 * (round - 1)) * SCALE,        // y hay menos pausa entre ellas
    inputMs: (6 + 2.5 * n) * 1000 * SCALE
  };
}

function makeStep(kind) {
  if (kind === 'tr') {
    const v = [-90, -60, 0, 60, 90];
    let dx = pick(v), dy = pick(v);
    if (dx === 0 && dy === 0) dx = 90;
    return { kind, dx, dy };
  }
  if (kind === 'rot') return { kind, angle: pick([90, 180, 270, -90]) };
  if (kind === 'ref') return { kind, axis: pick(['h', 'v']) };
  return { kind: 'hom', k: pick([2, 0.5]) };
}

function makeSequence(n) {
  for (;;) {
    const seq = Array.from({ length: n }, () => makeStep(pick(KINDS)));
    if (new Set(seq.map((s) => s.kind)).size >= 2) return seq; // evita secuencias de un solo tipo
  }
}

const award = (room, g, keyOf) => room.awardSession && room.awardSession([...g.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, key: keyOf(p) })));

function publicState(g) {
  if (!g) return null;
  const reveal = g.phase === 'result' || g.phase === 'end';
  return {
    type: 'memory', phase: g.phase, round: g.round, rounds: TOTAL_ROUNDS,
    n: g.n, stepMs: g.stepMs, gapMs: g.gapMs,
    endsAt: g.endsAt, durationMs: g.durationMs, now: Date.now(),
    solution: reveal ? g.seq.map((s) => s.kind) : null,
    players: [...g.players.values()].map((p) => ({
      id: p.id, name: p.name, color: p.color, score: p.score,
      answered: Boolean(p.answer), gain: p.gain,
      answer: reveal ? p.answer : null, hits: reveal ? p.hits : null,
      correct: reveal ? p.correct : null
    }))
  };
}
const emit = (room, io) => io.to(room.code).emit('game:state', publicState(room.game));
function stop(room) { if (room.game && room.game.timer) clearTimeout(room.game.timer); room.game = null; }

function start(room, io) {
  stop(room);
  const players = new Map();
  for (const p of room.players.values()) {
    players.set(p.id, { id: p.id, name: p.name, color: p.color, score: 0, answer: null, answeredAt: 0, gain: 0, hits: null, correct: null });
  }
  room.game = {
    type: 'memory', phase: 'intro', round: 0, players, seq: [], n: 0, stepMs: 0, gapMs: 0,
    endsAt: Date.now() + INTRO_MS, durationMs: INTRO_MS, timer: null
  };
  emit(room, io);
  room.game.timer = setTimeout(() => startShow(room, io), INTRO_MS);
}

function startShow(room, io) {
  const g = room.game; if (!g) return;
  g.round += 1;
  Object.assign(g, config(g.round));
  g.seq = makeSequence(g.n);
  g.players.forEach((p) => { p.answer = null; p.gain = 0; p.hits = null; p.correct = null; });
  g.phase = 'show';
  const lead = 900 * SCALE;
  g.durationMs = lead + g.n * (g.stepMs + g.gapMs);
  g.endsAt = Date.now() + g.durationMs;
  emit(room, io);
  let i = 0;
  const next = () => {
    if (room.game !== g) return;
    if (i >= g.n) { startInput(room, io); return; }
    io.to(room.code).emit('game:step', { round: g.round, i, n: g.n, stepMs: g.stepMs, ...g.seq[i] });
    i += 1;
    g.timer = setTimeout(next, g.stepMs + g.gapMs);
  };
  g.timer = setTimeout(next, lead);
}

function startInput(room, io) {
  const g = room.game; if (!g) return;
  const { inputMs } = config(g.round);
  g.phase = 'input';
  g.durationMs = inputMs;
  g.endsAt = Date.now() + inputMs;
  emit(room, io);
  g.timer = setTimeout(() => resolve(room, io), inputMs + 600);
}

function resolve(room, io) {
  const g = room.game; if (!g || g.phase !== 'input') return;
  clearTimeout(g.timer);
  const truth = g.seq.map((s) => s.kind);
  const base = 100 + 20 * g.n;
  for (const p of g.players.values()) {
    p.hits = p.answer ? p.answer.filter((k, i) => k === truth[i]).length : 0;
    p.correct = p.hits === g.n;
    // Puntaje parcial por posición acertada; la rapidez cuenta solo si todo está correcto.
    p.gain = Math.round(base * p.hits / g.n);
    if (p.correct) p.gain += Math.round(100 * Math.max(0, (g.endsAt - p.answeredAt) / g.durationMs));
    p.score += p.gain;
  }
  g.phase = 'result';
  g.durationMs = RESULT_MS;
  g.endsAt = Date.now() + RESULT_MS;
  emit(room, io);
  g.timer = setTimeout(() => afterResult(room, io), RESULT_MS);
}

function afterResult(room, io) {
  const g = room.game; if (!g) return;
  if (g.round >= TOTAL_ROUNDS) {
    g.phase = 'end';
    g.endsAt = Date.now();
    emit(room, io);
    award(room, g, (p) => p.score);
  } else startShow(room, io);
}

function submit(room, io, playerId, data) {
  const g = room.game;
  if (!g || g.phase !== 'input' || Date.now() > g.endsAt + 400) return;
  const p = g.players.get(playerId);
  if (!p || p.answer) return;
  const seq = data && data.seq;
  if (!Array.isArray(seq) || seq.length !== g.n || !seq.every((k) => KINDS.includes(k))) return;
  p.answer = seq.slice();
  p.answeredAt = Date.now();
  if ([...g.players.values()].every((q) => q.answer)) resolve(room, io); else emit(room, io);
}

function action(room, io, playerId, type, data) {
  if (type === 'submit') submit(room, io, playerId, data);
}

function addPlayer(room, io, rp) {
  const g = room.game; if (!g || g.players.has(rp.id)) return;
  g.players.set(rp.id, { id: rp.id, name: rp.name, color: rp.color, score: 0, answer: null, answeredAt: 0, gain: 0, hits: null, correct: null });
  emit(room, io);
}
function removePlayer(room, io, id) {
  const g = room.game; if (!g || !g.players.delete(id)) return;
  if (g.phase === 'input' && g.players.size && [...g.players.values()].every((q) => q.answer)) resolve(room, io); else emit(room, io);
}

module.exports = { start, stop, publicState, action, addPlayer, removePlayer };
