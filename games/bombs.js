'use strict';
// Minijuego 1: Bombas de traslación. Plano de -4 a 4 en x e y (origen al centro).
// Todos juegan las 10 rondas. Quien cae en una bomba o sale del tablero suma 0 en esa ronda y sigue jugando.
// Puntaje: 100 por salvarse + hasta 100 según la rapidez con que envió su vector.
const HALF = 4, SIZE = 9, INTRO_MS = 5000, RESULT_MS = 5500, TOTAL_ROUNDS = 10;
const SCALE = Number(process.env.TP_TIME_SCALE) || 1; // solo para pruebas automáticas
const key = (x, y) => `${x},${y}`;
const rnd = (n) => Math.floor(Math.random() * n);
const seconds = (round) => Math.max(6, 15 - (round - 1));           // de 15 s en la ronda 1 a 6 s en la ronda 10
const bombCount = (round) => Math.min(SIZE * SIZE - 8, 30 + 5 * (round - 1)); // de 30 a 75 bombas
const hitOwnCell = (round) => Math.min(0.95, 0.75 + 0.025 * (round - 1));     // casi todos deben moverse

const award = (room, g, keyOf) => room.awardSession && room.awardSession([...g.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, key: keyOf(p) })));

function publicState(g) {
  if (!g) return null;
  return {
    type: g.type, phase: g.phase, round: g.round, rounds: TOTAL_ROUNDS, half: HALF, bombs: g.bombs,
    endsAt: g.endsAt, durationMs: g.durationMs, now: Date.now(), winners: g.winners,
    players: [...g.players.values()].map((p) => ({
      id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, score: p.score, gain: p.gain,
      submitted: Boolean(p.answer), result: p.result, tx: p.tx, ty: p.ty
    }))
  };
}
function emit(room, io) { io.to(room.code).emit('game:state', publicState(room.game)); }
function stop(room) { if (room.game && room.game.timer) clearTimeout(room.game.timer); room.game = null; }

function start(room, io) {
  stop(room);
  const cells = [];
  for (let x = -HALF; x <= HALF; x++) for (let y = -HALF; y <= HALF; y++) cells.push([x, y]);
  cells.sort(() => Math.random() - 0.5);
  const players = new Map();
  let i = 0;
  for (const p of room.players.values()) {
    const [x, y] = cells[i++ % cells.length];
    players.set(p.id, { id: p.id, name: p.name, color: p.color, x, y, score: 0, gain: 0, answer: null, answeredAt: 0, result: null, tx: null, ty: null });
  }
  room.game = { type: 'bombs', phase: 'intro', round: 0, bombs: [], players, endsAt: Date.now() + INTRO_MS * SCALE, durationMs: INTRO_MS * SCALE, winners: [], timer: null };
  emit(room, io);
  room.game.timer = setTimeout(() => nextRound(room, io), INTRO_MS * SCALE);
}

function nextRound(room, io) {
  const g = room.game; if (!g) return;
  g.round += 1; g.phase = 'input';
  const all = [...g.players.values()];
  all.forEach((p) => { p.answer = null; p.answeredAt = 0; p.result = null; p.tx = null; p.ty = null; p.gain = 0; });
  const set = new Set();
  all.forEach((p) => { if (Math.random() < hitOwnCell(g.round)) set.add(key(p.x, p.y)); });
  const total = Math.max(bombCount(g.round), set.size);
  while (set.size < total) set.add(key(rnd(SIZE) - HALF, rnd(SIZE) - HALF));
  g.bombs = [...set].map((s) => s.split(',').map(Number));
  const ms = seconds(g.round) * 1000 * SCALE;
  g.durationMs = ms;
  g.endsAt = Date.now() + ms;
  emit(room, io);
  g.timer = setTimeout(() => resolve(room, io), ms + 600);
}

function resolve(room, io) {
  const g = room.game; if (!g || g.phase !== 'input') return;
  clearTimeout(g.timer);
  const bombs = new Set(g.bombs.map((b) => key(b[0], b[1])));
  for (const p of g.players.values()) {
    const a = p.answer || { dx: 0, dy: 0 }; // sin respuesta equivale a quedarse quieto
    p.tx = p.x + a.dx; p.ty = p.y + a.dy;
    const inside = Math.abs(p.tx) <= HALF && Math.abs(p.ty) <= HALF;
    if (inside && !bombs.has(key(p.tx, p.ty))) {
      p.x = p.tx; p.y = p.ty; p.result = 'safe';
      if (p.answer) {
        const fraction = Math.max(0, Math.min(1, (g.endsAt - p.answeredAt) / g.durationMs));
        p.gain = 100 + Math.round(100 * fraction);
        p.score += p.gain;
      }
    } else {
      p.result = inside ? 'boom' : 'out'; // se queda donde estaba y sigue jugando
    }
  }
  if (g.round >= TOTAL_ROUNDS) {
    g.phase = 'end';
    const top = Math.max(...[...g.players.values()].map((p) => p.score));
    g.winners = [...g.players.values()].filter((p) => p.score === top).map((p) => p.id);
    g.endsAt = Date.now();
    emit(room, io);
    award(room, g, (p) => p.score);
  } else {
    g.phase = 'result';
    g.durationMs = RESULT_MS * SCALE;
    g.endsAt = Date.now() + g.durationMs;
    emit(room, io);
    g.timer = setTimeout(() => nextRound(room, io), g.durationMs);
  }
}

function submit(room, io, playerId, dx, dy) {
  const g = room.game;
  if (!g || g.phase !== 'input' || Date.now() > g.endsAt + 400) return;
  const p = g.players.get(playerId);
  if (!p) return;
  dx = Number(dx); dy = Number(dy);
  if (!Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
  if (!p.answer || p.answer.dx !== dx || p.answer.dy !== dy) { p.answer = { dx, dy }; p.answeredAt = Date.now(); } // reenviar lo mismo no pierde tiempo
  const everyone = [...g.players.values()].every((q) => q.answer);
  if (everyone) resolve(room, io); else emit(room, io);
}

// Ingreso a mitad de partida: llega con 0 puntos a una casilla libre y juega desde la ronda en curso.
function addPlayer(room, io, rp) {
  const g = room.game; if (!g || g.players.has(rp.id)) return;
  const taken = new Set([...g.players.values()].map((p) => key(p.x, p.y)));
  const bombs = new Set(g.bombs.map((b) => key(b[0], b[1])));
  const free = [];
  for (let x = -HALF; x <= HALF; x++) for (let y = -HALF; y <= HALF; y++) if (!taken.has(key(x, y)) && !bombs.has(key(x, y))) free.push([x, y]);
  const [x, y] = free.length ? free[rnd(free.length)] : [rnd(SIZE) - HALF, rnd(SIZE) - HALF];
  g.players.set(rp.id, { id: rp.id, name: rp.name, color: rp.color, x, y, score: 0, gain: 0, answer: null, answeredAt: 0, result: null, tx: null, ty: null });
  emit(room, io);
}
// Expulsión: si los que quedan ya respondieron, la ronda se resuelve sin esperar el tiempo.
function removePlayer(room, io, id) {
  const g = room.game; if (!g || !g.players.delete(id)) return;
  g.winners = g.winners.filter((w) => w !== id);
  if (g.phase === 'input' && g.players.size && [...g.players.values()].every((q) => q.answer)) resolve(room, io); else emit(room, io);
}

module.exports = { start, stop, submit, publicState, addPlayer, removePlayer };
