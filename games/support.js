'use strict';
// Minijuego 7 (Orientación): Mapa de nuestra red de apoyo.
// Juego cooperativo y anónimo: cada estudiante marca a quién acudiría en 4 categorías (Liceo, Familia, Amigos e
// Instituciones). El proyector arma el mapa del curso. Los textos escritos por los estudiantes quedan "por revisar":
// solo el profesor los ve y decide cuáles se muestran. No hay puntajes ni ranking.

const SCALE = Number(process.env.TP_TIME_SCALE) || 1; // solo para pruebas automáticas
const INTRO_MS = 8000 * SCALE, BUILD_MS = 300000 * SCALE;
const MAX_TEXT = 30, MAX_CUSTOM = 2;

const CATEGORIES = [
  { id: 'liceo', label: 'En el liceo', icon: '🏫', options: [
    { id: 'profe_jefe', label: 'Profesor/a jefe' }, { id: 'orientador', label: 'Orientador/a' },
    { id: 'psicologo', label: 'Psicólogo/a o dupla psicosocial' }, { id: 'convivencia', label: 'Encargado/a de convivencia escolar' },
    { id: 'inspector', label: 'Inspector/a' }, { id: 'otro_profe', label: 'Otro/a profesor/a de confianza' }] },
  { id: 'familia', label: 'En mi familia', icon: '🏠', options: [
    { id: 'madre_padre', label: 'Mamá, papá o apoderado/a' }, { id: 'abuelo', label: 'Abuelo/a' },
    { id: 'tio', label: 'Tío/a' }, { id: 'hermano', label: 'Hermano/a mayor' }, { id: 'otro_adulto', label: 'Otro adulto de la familia' }] },
  { id: 'amigos', label: 'Con mis amigos', icon: '🤝', options: [
    { id: 'amigo', label: 'Un/a amigo/a de confianza' }, { id: 'companero', label: 'Un/a compañero/a de curso' },
    { id: 'amigo_mayor', label: 'Un/a amigo/a mayor de confianza' }, { id: 'grupo', label: 'Mi grupo de amigos' }] },
  { id: 'instituciones', label: 'Personas o instituciones externas', icon: '🏥', options: [
    { id: 'cesfam', label: 'Cesfam o consultorio' }, { id: 'fono1412', label: 'Fono Drogas y Alcohol 1412 (SENDA)' },
    { id: 'senda_previene', label: 'SENDA Previene de mi comuna' }, { id: 'urgencia', label: 'Servicio de urgencia del hospital' },
    { id: 'salud_responde', label: 'Salud Responde (Minsal)' }] }
];
const CAT_IDS = CATEGORIES.map((c) => c.id);
const optionIds = (catId) => CATEGORIES.find((c) => c.id === catId).options.map((o) => o.id);

const norm = (t) => String(t || '').trim().replace(/\s+/g, ' ').slice(0, MAX_TEXT);
const key = (t) => norm(t).toLocaleLowerCase('es-CL');
const sockOf = (room, id) => { const rp = room.players.get(id); return rp && rp.socketId; };

const blankPlayer = (p) => ({ id: p.id, name: p.name, color: p.color, sel: Object.fromEntries(CAT_IDS.map((c) => [c, new Set()])), custom: Object.fromEntries(CAT_IDS.map((c) => [c, []])) });
const filled = (p) => CAT_IDS.every((c) => p.sel[c].size + p.custom[c].length > 0);

// Textos libres: id -> { id, cat, text, status: 'pending' | 'ok' | 'hidden' } (uno por texto distinto)
function customEntries(g) { return [...g.customs.values()]; }

function publicState(g) {
  if (!g) return null;
  const players = [...g.players.values()];
  const cats = CATEGORIES.map((c) => ({
    id: c.id, label: c.label, icon: c.icon,
    options: c.options.map((o) => ({ id: o.id, label: o.label, count: players.filter((p) => p.sel[c.id].has(o.id)).length })),
    customs: customEntries(g).filter((e) => e.cat === c.id && e.status === 'ok')
      .map((e) => ({ id: e.id, text: e.text, count: players.filter((p) => p.custom[c.id].some((t) => key(t) === key(e.text))).length }))
      .filter((e) => e.count > 0)
  }));
  const done = players.filter(filled).length;
  return {
    type: 'support', phase: g.phase, cats, total: players.length, done,
    marks: players.reduce((n, p) => n + CAT_IDS.reduce((m, c) => m + p.sel[c].size + p.custom[c].length, 0), 0),
    endsAt: g.endsAt, durationMs: g.durationMs, now: Date.now(),
    players: players.map((p) => ({ id: p.id, name: p.name, color: p.color, complete: filled(p) }))
  };
}
function hostData(g) {
  const held = (e) => [...g.players.values()].some((p) => p.custom[e.cat].some((t) => key(t) === key(e.text)));
  return { pending: customEntries(g).filter((e) => e.status === 'pending' && held(e)).map((e) => ({ id: e.id, cat: e.cat, text: e.text })) };
}
function pushHost(room, io) {
  const g = room.game; if (!g || !room.hostSocketId) return;
  io.to(room.hostSocketId).emit('game:host', { type: 'support', ...hostData(g) });
}
const emit = (room, io) => { io.to(room.code).emit('game:state', publicState(room.game)); pushHost(room, io); };
function stop(room) { if (room.game) { clearTimeout(room.game.timer); clearTimeout(room.game.pending); } room.game = null; }
function privateState(room, playerId) {
  const g = room.game; const p = g && g.players.get(playerId);
  return p ? { sel: Object.fromEntries(CAT_IDS.map((c) => [c, [...p.sel[c]]])), custom: p.custom } : null;
}
function tell(room, io, playerId) {
  const sock = sockOf(room, playerId);
  if (sock) io.to(sock).emit('game:self', privateState(room, playerId));
}
// Con muchos teléfonos marcando a la vez, el proyector se actualiza como máximo 3 veces por segundo.
function touch(room, io) {
  const g = room.game; if (!g || g.pending) return;
  g.pending = setTimeout(() => { g.pending = null; if (room.game === g) emit(room, io); }, 330);
}

function start(room, io) {
  stop(room);
  const players = new Map();
  for (const p of room.players.values()) players.set(p.id, blankPlayer(p));
  room.game = { type: 'support', phase: 'intro', players, customs: new Map(), endsAt: Date.now() + INTRO_MS, durationMs: INTRO_MS, timer: null, pending: null };
  emit(room, io);
  room.game.timer = setTimeout(() => toBuild(room, io), INTRO_MS);
}
function toBuild(room, io) {
  const g = room.game; if (!g || g.phase !== 'intro') return;
  clearTimeout(g.timer);
  g.phase = 'build'; g.durationMs = BUILD_MS; g.endsAt = Date.now() + BUILD_MS;
  emit(room, io);
  g.timer = setTimeout(() => toEnd(room, io), BUILD_MS);
}
function toEnd(room, io) {
  const g = room.game; if (!g || g.phase === 'end') return;
  clearTimeout(g.timer);
  g.phase = 'end'; g.endsAt = Date.now(); g.durationMs = 1;
  emit(room, io);
}

function toggle(room, io, playerId, data) {
  const g = room.game; if (!g || g.phase !== 'build') return;
  const p = g.players.get(playerId); if (!p) return;
  const cat = String(data && data.cat || ''), id = String(data && data.id || '');
  if (!CAT_IDS.includes(cat) || !optionIds(cat).includes(id)) return;
  if (p.sel[cat].has(id)) p.sel[cat].delete(id); else p.sel[cat].add(id);
  tell(room, io, playerId); touch(room, io);
}
function addCustom(room, io, playerId, data) {
  const g = room.game; if (!g || g.phase !== 'build') return;
  const p = g.players.get(playerId); if (!p) return;
  const cat = String(data && data.cat || ''); const text = norm(data && data.text);
  if (!CAT_IDS.includes(cat) || text.length < 2) return;
  if (p.custom[cat].length >= MAX_CUSTOM || p.custom[cat].some((t) => key(t) === key(text))) return;
  p.custom[cat].push(text);
  const k = `${cat}|${key(text)}`;
  if (!g.customs.has(k)) g.customs.set(k, { id: k, cat, text, status: 'pending' }); // queda por revisar hasta que el profesor decida
  tell(room, io, playerId); emit(room, io);
}
function removeCustom(room, io, playerId, data) {
  const g = room.game; if (!g || g.phase !== 'build') return;
  const p = g.players.get(playerId); if (!p) return;
  const cat = String(data && data.cat || ''); const text = norm(data && data.text);
  if (!CAT_IDS.includes(cat)) return;
  p.custom[cat] = p.custom[cat].filter((t) => key(t) !== key(text));
  tell(room, io, playerId); touch(room, io);
}

function action(room, io, playerId, type, data) {
  if (type === 'toggle') toggle(room, io, playerId, data);
  else if (type === 'custom') addCustom(room, io, playerId, data);
  else if (type === 'uncustom') removeCustom(room, io, playerId, data);
}

// Controles del profesor: avanzar, y aprobar u ocultar los textos escritos por los estudiantes.
function hostAction(room, io, type, data) {
  const g = room.game; if (!g) return;
  if (type === 'next') { if (g.phase === 'intro') toBuild(room, io); else if (g.phase === 'build') toEnd(room, io); return; }
  if (type === 'approve' || type === 'hide') {
    const e = g.customs.get(String(data && data.id || ''));
    if (e) e.status = type === 'approve' ? 'ok' : 'hidden';
  } else if (type === 'approve-all') {
    for (const e of g.customs.values()) if (e.status === 'pending') e.status = 'ok';
  } else return;
  emit(room, io);
}

function addPlayer(room, io, rp) {
  const g = room.game; if (!g || g.players.has(rp.id)) return;
  g.players.set(rp.id, blankPlayer(rp));
  emit(room, io);
}
function removePlayer(room, io, id) {
  const g = room.game; if (!g || !g.players.delete(id)) return;
  emit(room, io);
}

module.exports = { start, stop, publicState, privateState, action, hostAction, addPlayer, removePlayer, pushHost, _categories: CATEGORIES };
