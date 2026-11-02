'use strict';
// Minijuego 5: Vector × escalar (ponderación de un vector por un escalar), con alternativas.
// Todos responden las 10 rondas. Puntaje: 100 por acertar + hasta 100 por rapidez. La primera respuesta queda fija.

const TOTAL_ROUNDS = 10;
const SCALE = Number(process.env.TP_TIME_SCALE) || 1; // solo para pruebas automáticas
const INTRO_MS = 5000 * SCALE, REVEAL_MS = 6500 * SCALE;
const answerMs = (round) => Math.max(12, 22 - round) * 1000 * SCALE;  // de 21 s a 12 s
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (list) => list[rnd(list.length)];
const shuffle = (list) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const MINUS = '−';
const num = (n) => (n < 0 ? `${MINUS}${-n}` : String(n));
const vec = ([x, y]) => `(${num(x)}, ${num(y)})`;
const pn = (n) => (n < 0 ? `(${num(n)})` : String(n)); // paréntesis para negativos dentro de una operación
const pf = (k) => (k[0] < 0 ? `(${frac(k)})` : frac(k));
const frac = ([n, d]) => (d === 1 ? num(n) : `${num(n)}/${d}`);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

// Escalera de dificultad: cada ronda tiene su tipo de pregunta y los escalares posibles, como [numerador, denominador].
const LADDER = [
  { kind: 'vec', ks: [[2, 1], [3, 1]] },
  { kind: 'vec', ks: [[2, 1], [3, 1]] },
  { kind: 'vec', ks: [[-1, 1], [-2, 1]] },
  { kind: 'vec', ks: [[-2, 1], [-3, 1], [-1, 1]] },
  { kind: 'vec', ks: [[1, 2]] },
  { kind: 'vec', ks: [[-1, 2], [1, 2], [-3, 1]] },
  { kind: 'vec', ks: [[-1, 2], [3, 2], [-1, 3]] },
  { kind: 'scalar', ks: [[2, 1], [-2, 1], [3, 1], [-1, 1], [1, 2]] },
  { kind: 'scalar', ks: [[-1, 2], [-3, 1], [3, 2], [-2, 1]] },
  { kind: 'scalar', ks: [[-3, 2], [2, 3], [-2, 3], [3, 2], [-1, 2]] }
];

// Componentes posibles del vector: múltiplos del denominador, sin cero, con resultado dentro de ±9.
function components([n, d]) {
  const out = [];
  for (let c = -6; c <= 6; c++) {
    if (c === 0 || c % d !== 0) continue;
    if (Math.abs((c * n) / d) > 8) continue;
    out.push(c);
  }
  return out;
}

function times(v, [n, d]) { return [(v[0] * n) / d, (v[1] * n) / d]; }

function phrase(k, v) {
  const t = vec(v);
  if (k[1] === 1 && k[0] === 2) return pick([`¿Cuál de las siguientes alternativas es el doble del vector v = ${t}?`, `Multiplica el vector v = ${t} por 2. ¿Cuál es el resultado?`]);
  if (k[1] === 1 && k[0] === 3) return pick([`¿Cuál de las siguientes alternativas es el triple del vector v = ${t}?`, `Multiplica el vector v = ${t} por 3. ¿Cuál es el resultado?`]);
  if (k[1] === 2 && k[0] === 1) return pick([`¿Cuál de las siguientes alternativas es la mitad del vector v = ${t}?`, `Multiplica el vector v = ${t} por 1/2. ¿Cuál es el resultado?`]);
  if (k[1] === 1 && k[0] === -1) return pick([`¿Cuál de las siguientes alternativas es el opuesto del vector v = ${t}?`, `Multiplica el vector v = ${t} por ${MINUS}1. ¿Cuál es el resultado?`]);
  return `Multiplica el vector v = ${t} por ${frac(k)}. ¿Cuál es el resultado?`;
}

// Distractores con los errores más comunes: signo, una sola componente, intercambio, operación inversa, suma en vez de producto.
function vecDistractors(v, k, correct) {
  const kf = k[0] / k[1];
  const inv = [v[0] / kf, v[1] / kf];
  const c = [
    [-correct[0], -correct[1]],
    [correct[0], v[1]],
    [v[0], correct[1]],
    [correct[1], correct[0]],
    [correct[0], -correct[1]],
    [-correct[0], correct[1]],
    [v[0] + kf, v[1] + kf],
    Number.isInteger(inv[0]) && Number.isInteger(inv[1]) ? inv : null
  ].filter((x) => x && Number.isInteger(x[0]) && Number.isInteger(x[1]) && !same(x, correct));
  const uniq = [];
  for (const x of shuffle(c)) if (!uniq.some((u) => same(u, x))) uniq.push(x);
  let guard = 0;
  while (uniq.length < 3 && guard++ < 50) {
    const x = [correct[0] + pick([-2, -1, 1, 2]), correct[1] + pick([-2, -1, 0, 1, 2])];
    if (!same(x, correct) && !uniq.some((u) => same(u, x))) uniq.push(x);
  }
  return uniq.slice(0, 3);
}

function scalarDistractors(k) {
  const kf = k[0] / k[1];
  const raw = [[-k[0], k[1]], [k[1], k[0]], [k[0] + k[1], k[1]], [k[0] - k[1], k[1]], [2 * k[0], k[1]], [-k[1], k[0]], [k[0], 2 * k[1]], [k[0], k[1] + 1]];
  const uniq = [];
  for (const [n, d0] of shuffle(raw)) {
    let nn = n, dd = d0;
    if (dd < 0) { nn = -nn; dd = -dd; }
    if (nn === 0 || dd === 0 || Math.abs(nn / dd - kf) < 1e-9) continue;
    if (uniq.some((u) => Math.abs(u[0] / u[1] - nn / dd) < 1e-9)) continue;
    uniq.push([nn, dd]);
  }
  return uniq.slice(0, 3);
}

function makeQuestion(round) {
  const step = LADDER[Math.min(round, TOTAL_ROUNDS) - 1];
  for (let attempt = 0; attempt < 200; attempt++) {
    const k = pick(step.ks);
    const pool = components(k);
    if (pool.length < 2) continue;
    const v = [pick(pool), pick(pool)];
    const w = times(v, k);
    if (step.kind === 'vec') {
      const wrong = vecDistractors(v, k, w);
      if (wrong.length < 3) continue;
      const options = shuffle([w, ...wrong]);
      const correctIndex = options.findIndex((o) => same(o, w));
      return {
        kind: 'vec', v, w: null, text: phrase(k, v), options: options.map(vec), correctIndex,
        explain: `${pf(k)} · ${vec(v)} = (${pn(v[0])} · ${pf(k)}, ${pn(v[1])} · ${pf(k)}) = ${vec(w)}. Cada componente se multiplica por ${frac(k)}.`
      };
    }
    // Pregunta inversa: se muestran v y w y se pide el escalar.
    if (Math.abs(w[0]) > 8 || Math.abs(w[1]) > 8) continue;
    const wrong = scalarDistractors(k);
    if (wrong.length < 3) continue;
    const options = shuffle([k, ...wrong]);
    const correctIndex = options.findIndex((o) => Math.abs(o[0] / o[1] - k[0] / k[1]) < 1e-9);
    return {
      kind: 'scalar', v, w, text: `Si v = ${vec(v)} y w = ${vec(w)}, ¿por cuál escalar se multiplicó v para obtener w?`, options: options.map(frac), correctIndex,
      explain: `w = k · v, así que k = ${pn(w[0])} ÷ ${pn(v[0])} = ${frac(k)}. Se comprueba con la otra componente: ${pn(w[1])} ÷ ${pn(v[1])} = ${frac(k)}.`
    };
  }
  const v = [2, -1], k = [2, 1], w = times(v, k);
  return { kind: 'vec', v, w: null, text: phrase(k, v), options: [vec(w), vec([-4, -2]), vec([4, 1]), vec([1, -1])], correctIndex: 0, explain: `2 · (2, ${MINUS}1) = (4, ${MINUS}2).` };
}

const award = (room, g, keyFn) => room.awardSession && room.awardSession([...g.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, key: keyFn(p) })));

function publicState(g) {
  if (!g) return null;
  const reveal = g.phase === 'reveal' || g.phase === 'end';
  const q = g.q;
  const counts = q ? q.options.map(() => 0) : [];
  if (reveal && q) g.players.forEach((p) => { if (p.choice !== null) counts[p.choice] += 1; });
  return {
    type: 'scale', phase: g.phase, round: g.round, rounds: TOTAL_ROUNDS,
    question: q && g.phase !== 'intro' ? { kind: q.kind, v: q.v, w: q.w, text: q.text, options: q.options } : null,
    correctIndex: reveal && q ? q.correctIndex : null, explain: reveal && q ? q.explain : null, counts: reveal ? counts : null,
    endsAt: g.endsAt, durationMs: g.durationMs, now: Date.now(),
    players: [...g.players.values()].map((p) => ({
      id: p.id, name: p.name, color: p.color, score: p.score, streak: p.streak, answered: p.choice !== null, gain: p.gain,
      choice: reveal ? p.choice : null, correct: reveal ? p.correct : null
    }))
  };
}
const emit = (room, io) => io.to(room.code).emit('game:state', publicState(room.game));
function stop(room) { if (room.game) clearTimeout(room.game.timer); room.game = null; }

function start(room, io) {
  stop(room);
  const players = new Map();
  for (const p of room.players.values()) {
    players.set(p.id, { id: p.id, name: p.name, color: p.color, score: 0, streak: 0, choice: null, answeredAt: 0, gain: 0, correct: null });
  }
  room.game = { type: 'scale', phase: 'intro', round: 0, players, q: null, endsAt: Date.now() + INTRO_MS, durationMs: INTRO_MS, timer: null };
  emit(room, io);
  room.game.timer = setTimeout(() => nextRound(room, io), INTRO_MS);
}

function nextRound(room, io) {
  const g = room.game; if (!g) return;
  g.round += 1;
  g.q = makeQuestion(g.round);
  g.players.forEach((p) => { p.choice = null; p.gain = 0; p.correct = null; });
  g.phase = 'ask';
  g.durationMs = answerMs(g.round);
  g.endsAt = Date.now() + g.durationMs;
  emit(room, io);
  g.timer = setTimeout(() => reveal(room, io), g.durationMs + 600);
}

function reveal(room, io) {
  const g = room.game; if (!g || g.phase !== 'ask') return;
  clearTimeout(g.timer);
  for (const p of g.players.values()) {
    p.correct = p.choice === g.q.correctIndex;
    if (p.correct) {
      const fraction = Math.max(0, Math.min(1, (g.endsAt - p.answeredAt) / g.durationMs));
      p.gain = 100 + Math.round(100 * fraction);
      p.score += p.gain;
      p.streak += 1;
    } else p.streak = 0;
  }
  g.phase = 'reveal';
  g.durationMs = REVEAL_MS;
  g.endsAt = Date.now() + REVEAL_MS;
  emit(room, io);
  g.timer = setTimeout(() => afterReveal(room, io), REVEAL_MS);
}

function afterReveal(room, io) {
  const g = room.game; if (!g) return;
  if (g.round >= TOTAL_ROUNDS) {
    g.phase = 'end';
    g.endsAt = Date.now();
    emit(room, io);
    award(room, g, (p) => p.score);
  } else nextRound(room, io);
}

function answer(room, io, playerId, data) {
  const g = room.game;
  if (!g || g.phase !== 'ask' || Date.now() > g.endsAt + 400) return;
  const p = g.players.get(playerId);
  if (!p || p.choice !== null) return; // la primera respuesta queda fija; reenviarla no cambia nada
  const i = Number(data && data.i);
  if (!Number.isInteger(i) || i < 0 || i >= g.q.options.length) return;
  p.choice = i;
  p.answeredAt = Date.now();
  if ([...g.players.values()].every((q) => q.choice !== null)) reveal(room, io); else emit(room, io);
}

function action(room, io, playerId, type, data) {
  if (type === 'answer') answer(room, io, playerId, data);
}

function addPlayer(room, io, rp) {
  const g = room.game; if (!g || g.players.has(rp.id)) return;
  g.players.set(rp.id, { id: rp.id, name: rp.name, color: rp.color, score: 0, streak: 0, choice: null, answeredAt: 0, gain: 0, correct: null });
  emit(room, io);
}
function removePlayer(room, io, id) {
  const g = room.game; if (!g || !g.players.delete(id)) return;
  if (g.phase === 'ask' && g.players.size && [...g.players.values()].every((q) => q.choice !== null)) reveal(room, io); else emit(room, io);
}

module.exports = { start, stop, publicState, action, addPlayer, removePlayer, _makeQuestion: makeQuestion };
