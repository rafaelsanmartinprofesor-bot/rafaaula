'use strict';
// Minijuego 6 (Orientación): Mito, Realidad o Depende.
// Cada afirmación pasa por tres momentos: se vota (en secreto), se muestra cómo votó el curso y se revela la respuesta
// con su explicación. El profesor controla el ritmo (pausar, siguiente, saltar). Sin puntajes ni ranking:
// los votos son anónimos y al final el juego muestra qué afirmaciones dividieron más al curso.

const SCALE = Number(process.env.TP_TIME_SCALE) || 1; // solo para pruebas automáticas
const INTRO_MS = 10000 * SCALE, VOTE_MS = 25000 * SCALE, DIST_MS = 7000 * SCALE, REVEAL_MS = 16000 * SCALE;

const STATEMENTS = [
  { text: 'Si una droga es natural, entonces no puede ser dañina.', answer: 'M',
    explain: 'Que una sustancia sea natural no significa que sea inocua. Algunas sustancias de origen natural pueden producir efectos importantes sobre el organismo y generar riesgos.',
    talk: '¿Por qué creen que asociamos “natural” con “seguro”?' },
  { text: 'Todas las personas que consumen drogas desarrollan una adicción.', answer: 'M',
    explain: 'No todas las personas que consumen una sustancia desarrollan un trastorno por consumo. Sin embargo, esto no significa que el consumo sea seguro. El riesgo depende de múltiples factores relacionados con la sustancia, la persona, la frecuencia, el contexto y otras circunstancias.',
    talk: '¿Es lo mismo “consumir”, “abusar” y “tener una dependencia”?' },
  { text: 'El alcohol también es una droga.', answer: 'R',
    explain: 'El alcohol es una sustancia psicoactiva que puede afectar el funcionamiento del cerebro y producir cambios en el comportamiento, además de generar problemas de salud y dependencia.',
    talk: '¿Por qué creen que socialmente muchas veces no pensamos en el alcohol como una droga?' },
  { text: 'Si una persona consume solamente los fines de semana, no existe ningún riesgo.', answer: 'M',
    explain: 'La frecuencia por sí sola no determina el riesgo. También importan la cantidad, la sustancia, la edad, el contexto y las consecuencias del consumo.',
    talk: '¿Qué situaciones podrían hacer que un consumo ocasional sea particularmente riesgoso?' },
  { text: 'La presión de los amigos puede influir en la decisión de consumir.', answer: 'R',
    explain: 'La presión directa o indirecta del grupo puede influir en las decisiones. Por eso es importante desarrollar habilidades para expresar límites, tomar decisiones propias y buscar apoyo.',
    talk: '¿Qué estrategias podría utilizar alguien que quiere decir “no” sin sentirse excluido?' },
  { text: 'El cannabis no produce ningún efecto sobre la memoria o la atención.', answer: 'M',
    explain: 'El cannabis puede afectar temporalmente funciones como la atención, la memoria, la coordinación y el tiempo de reacción. En adolescentes, además, existe especial preocupación por el cerebro en desarrollo.',
    talk: '¿Creen que una sustancia puede afectar la capacidad de estudiar o aprender aunque la persona no se sienta “mal”?' },
  { text: 'Los medicamentos también pueden ser peligrosos si se utilizan de manera incorrecta.', answer: 'R',
    explain: 'Los medicamentos deben utilizarse según indicación profesional. Utilizar medicamentos de otra persona, modificar las dosis o combinarlos sin orientación puede generar riesgos.',
    talk: '¿Por qué algo que puede ser beneficioso como medicamento también puede ser perjudicial?' },
  { text: 'Vapear es exactamente lo mismo que respirar vapor de agua.', answer: 'M',
    explain: 'Los aerosoles de los cigarrillos electrónicos no son simplemente vapor de agua. Pueden contener nicotina y otras sustancias, y su inhalación no es inocua.',
    talk: '¿De dónde obtenemos muchas veces la información sobre los vapeadores?' },
  { text: 'Una persona puede tener dificultades relacionadas con el consumo aunque todavía no tenga una adicción.', answer: 'R',
    explain: 'El consumo puede generar consecuencias negativas antes de que exista una dependencia, por ejemplo, problemas familiares, académicos, económicos, sociales o situaciones de riesgo.',
    talk: '¿El único problema que deberíamos considerar es la adicción?' },
  { text: 'Decir “no” frente a una invitación a consumir es una forma de autocuidado.', answer: 'R',
    explain: 'Establecer límites y tomar decisiones de acuerdo con los propios valores y objetivos es una habilidad de autocuidado.',
    talk: '¿Qué respuestas podrían ayudar a rechazar una invitación sin entrar en una discusión?' },
  { text: 'Las drogas afectan a todas las personas exactamente de la misma manera.', answer: 'M',
    explain: 'Los efectos pueden variar según la sustancia, la dosis, la forma de consumo, las características de la persona, su salud, la combinación con otras sustancias y el contexto.',
    talk: '¿Por qué no es seguro utilizar como referencia la experiencia de otra persona?' },
  { text: 'Pedir ayuda por una situación de consumo es una señal de debilidad.', answer: 'M',
    explain: 'Pedir ayuda es una estrategia de autocuidado y una muestra de capacidad para reconocer una dificultad y buscar apoyo.',
    talk: '¿A qué adulto de confianza podría acudir un adolescente que está preocupado por su propio consumo o por el de un amigo?' }
];
const TOTAL = STATEMENTS.length;
const CHOICES = ['M', 'R', 'D'];

const connectedOf = (room, id) => { const rp = room.players.get(id); return rp && rp.socketId; };

function tally(g) {
  const counts = { M: 0, R: 0, D: 0 };
  for (const v of g.votes.values()) counts[v] += 1;
  return counts;
}

function publicState(g) {
  if (!g) return null;
  const cur = g.index >= 0 && g.index < TOTAL ? STATEMENTS[g.index] : null;
  const showStatement = cur && ['vote', 'dist', 'reveal'].includes(g.phase);
  const showDist = g.phase === 'dist' || g.phase === 'reveal';
  return {
    type: 'myth', phase: g.phase, round: g.index + 1, rounds: TOTAL,
    statement: showStatement ? cur.text : null,
    counts: showDist ? tally(g) : null, total: g.votes.size,
    answer: g.phase === 'reveal' ? cur.answer : null,
    explain: g.phase === 'reveal' ? cur.explain : null,
    talk: g.phase === 'reveal' ? cur.talk : null,
    divided: g.phase === 'end' ? g.divided : null,
    paused: g.paused, pausedLeft: g.paused ? g.pausedLeft : null,
    endsAt: g.endsAt, durationMs: g.durationMs, now: Date.now(),
    players: [...g.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, voted: g.votes.has(p.id) }))
  };
}
const emit = (room, io) => io.to(room.code).emit('game:state', publicState(room.game));
function stop(room) { if (room.game) clearTimeout(room.game.timer); room.game = null; }
function privateState(room, playerId) {
  const g = room.game;
  return g ? { vote: g.votes.get(playerId) || null } : null;
}
function tellVotes(room, io) {
  const g = room.game; if (!g) return;
  for (const p of g.players.values()) {
    const sock = connectedOf(room, p.id);
    if (sock) io.to(sock).emit('game:self', { vote: g.votes.get(p.id) || null });
  }
}

function setPhase(room, io, phase, ms) {
  const g = room.game; if (!g) return;
  clearTimeout(g.timer);
  g.phase = phase; g.paused = false;
  g.durationMs = ms; g.endsAt = Date.now() + ms;
  emit(room, io);
  g.timer = setTimeout(() => advance(room, io), ms);
}

function start(room, io) {
  stop(room);
  const players = new Map();
  for (const p of room.players.values()) players.set(p.id, { id: p.id, name: p.name, color: p.color });
  room.game = { type: 'myth', phase: 'intro', index: -1, players, votes: new Map(), history: [], divided: null, paused: false, pausedLeft: 0, endsAt: 0, durationMs: INTRO_MS, timer: null };
  setPhase(room, io, 'intro', INTRO_MS);
}

function startStatement(room, io) {
  const g = room.game;
  g.index += 1;
  if (g.index >= TOTAL) { finish(room, io); return; }
  g.votes = new Map();
  setPhase(room, io, 'vote', VOTE_MS);
  tellVotes(room, io);
}

function finish(room, io) {
  const g = room.game;
  clearTimeout(g.timer);
  const ranked = g.history
    .filter((h) => h.total > 0)
    .map((h) => ({ ...h, split: 1 - Math.max(h.counts.M, h.counts.R, h.counts.D) / h.total }))
    .sort((a, b) => b.split - a.split || b.total - a.total);
  g.divided = ranked.slice(0, 3).map((h) => ({ n: h.n, text: h.text, answer: h.answer, counts: h.counts, total: h.total }));
  g.phase = 'end'; g.paused = false; g.endsAt = Date.now(); g.durationMs = 1;
  emit(room, io);
}

// Pasa al siguiente momento. 'skip' salta la afirmación completa sin registrarla.
function advance(room, io, skip = false) {
  const g = room.game; if (!g || g.phase === 'end') return;
  if (g.phase === 'intro') { startStatement(room, io); return; }
  if (skip) { startStatement(room, io); return; }
  if (g.phase === 'vote') setPhase(room, io, 'dist', DIST_MS);
  else if (g.phase === 'dist') {
    const cur = STATEMENTS[g.index];
    g.history.push({ n: g.index + 1, text: cur.text, answer: cur.answer, counts: tally(g), total: g.votes.size });
    setPhase(room, io, 'reveal', REVEAL_MS);
  } else if (g.phase === 'reveal') startStatement(room, io);
}

function vote(room, io, playerId, data) {
  const g = room.game;
  if (!g || g.phase !== 'vote' || g.paused) return;
  if (!g.players.has(playerId)) return;
  const c = String(data && data.v || '');
  if (!CHOICES.includes(c)) return;
  g.votes.set(playerId, c); // se puede cambiar mientras dure la votación
  const sock = connectedOf(room, playerId);
  if (sock) io.to(sock).emit('game:self', { vote: c });
  if ([...g.players.keys()].every((id) => g.votes.has(id))) advance(room, io); else emit(room, io);
}

function action(room, io, playerId, type, data) {
  if (type === 'vote') vote(room, io, playerId, data);
}

// Controles del profesor.
function hostAction(room, io, type) {
  const g = room.game; if (!g) return;
  if (type === 'next') { if (!g.paused) advance(room, io); else { g.paused = false; advance(room, io); } }
  else if (type === 'skip') { if (['vote', 'dist', 'reveal'].includes(g.phase)) advance(room, io, true); }
  else if (type === 'pause') {
    if (g.phase === 'end') return;
    if (!g.paused) { g.paused = true; g.pausedLeft = Math.max(0, g.endsAt - Date.now()); clearTimeout(g.timer); emit(room, io); }
    else { g.paused = false; g.endsAt = Date.now() + g.pausedLeft; g.timer = setTimeout(() => advance(room, io), g.pausedLeft); emit(room, io); }
  }
}

function addPlayer(room, io, rp) {
  const g = room.game; if (!g || g.players.has(rp.id)) return;
  g.players.set(rp.id, { id: rp.id, name: rp.name, color: rp.color });
  emit(room, io);
}
function removePlayer(room, io, id) {
  const g = room.game; if (!g || !g.players.delete(id)) return;
  g.votes.delete(id);
  if (g.phase === 'vote' && !g.paused && g.players.size && [...g.players.keys()].every((p) => g.votes.has(p))) advance(room, io); else emit(room, io);
}

module.exports = { start, stop, publicState, privateState, action, hostAction, addPlayer, removePlayer };
