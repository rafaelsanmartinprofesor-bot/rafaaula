'use strict';
// Pantallas del minijuego 7 (Mapa de nuestra red de apoyo): proyector y teléfono. Todo es anónimo.
(() => {
  const TP = window.TP;
  const { socket, app } = TP;
  const esc = TP.escapeHtml;
  window.TPGames = window.TPGames || {};

  const CONTACTS = [
    ['🏫', 'En el liceo', 'Tu profesor/a jefe, el orientador o la orientadora, el psicólogo o la psicóloga y el equipo de convivencia escolar.'],
    ['📞', 'Fono Drogas y Alcohol 1412 (SENDA)', 'Orienta sobre consumo de drogas y alcohol. Es gratuito, anónimo y confidencial.'],
    ['🏥', 'Cesfam o consultorio de tu comuna', 'Equipos de salud que pueden orientarte y acompañarte.'],
    ['🧭', 'SENDA Previene de tu comuna', 'Equipo local de prevención del consumo de drogas y alcohol.'],
    ['🚑', 'Servicio de urgencia del hospital', 'Si hay una emergencia o alguien está en riesgo, acude de inmediato.']
  ];

  let s = null, offset = 0, mine = { sel: {}, custom: {} }, pending = [], sig = '', timerId = null, drafts = {};

  const me = () => (s && TP.player ? s.players.find((p) => p.id === TP.player.id) : null);
  const myDone = () => s ? s.cats.filter((c) => (mine.sel[c.id] || []).length + (mine.custom[c.id] || []).length > 0).length : 0;

  function timerBlock() { return '<div class="tbar"><span id="spf"></span></div><div class="tsec" id="sps"></div>'; }
  function tick() {
    if (!s) return;
    const left = Math.max(0, (s.endsAt - (Date.now() + offset)) / 1000);
    const total = Math.max(1, s.durationMs / 1000);
    const f = document.getElementById('spf'), t = document.getElementById('sps');
    if (f) f.style.width = `${Math.min(100, (left / total) * 100)}%`;
    if (t) { const m = Math.floor(left / 60), sec = Math.ceil(left % 60); t.textContent = s.phase === 'end' ? '' : (left >= 60 ? `${m} min ${sec === 60 ? 0 : sec} s` : `${Math.ceil(left)} s`); }
  }

  const contactsMarkup = () => `<ul class="sp-contacts">${CONTACTS.map(([i, t, d]) => `<li><span>${i}</span><div><strong>${esc(t)}</strong><p>${esc(d)}</p></div></li>`).join('')}</ul>`;

  // ---------- Proyector ----------
  function hostView() {
    const titles = { intro: 'Nuestra red de apoyo', build: 'Armemos el mapa del curso', end: 'Este es el mapa de nuestro curso' };
    const total = Math.max(1, s.total);
    const percent = Math.round((100 * s.done) / total);
    const maxCount = Math.max(1, ...s.cats.flatMap((c) => [...c.options.map((o) => o.count), ...c.customs.map((o) => o.count)]));
    const rows = (c) => [...c.options, ...c.customs].filter((o) => s.phase !== 'end' || o.count > 0)
      .sort((a, b) => (s.phase === 'end' ? b.count - a.count : 0))
      .map((o) => `<li class="${o.count ? 'has' : ''}"><span class="sp-lbl">${esc(o.label || o.text)}</span><i class="sp-fill" style="width:${Math.round((o.count / maxCount) * 100)}%"></i><em>${o.count}</em></li>`).join('');
    const cards = s.cats.map((c) => `<article class="sp-cat"><h3><span>${c.icon}</span>${esc(c.label)}</h3><ul>${rows(c)}</ul></article>`).join('');
    let intro = '';
    if (s.phase === 'intro') intro = '<p class="rule">En tu teléfono marca <strong>a quién acudirías</strong> si tienes dudas sobre el consumo de drogas, en cada categoría: liceo, familia, amigos y personas o instituciones externas. Puedes elegir varias.<br>Nadie ve lo que marca cada persona: solo aparece el mapa completo del curso.</p>';
    const pendingMarkup = pending.length ? `<section class="panel sp-review"><div class="sp-review-head"><div><span class="card-kicker">TEXTOS POR REVISAR (SOLO LOS VES TÚ)</span><p>Aprueba los que se pueden mostrar en el mapa del curso. Los demás no aparecerán.</p></div><button class="button" id="spApproveAll" type="button">Aprobar todos (${pending.length})</button></div><ul>${pending.map((e) => { const c = s.cats.find((x) => x.id === e.cat); return `<li><span class="sp-cat-tag">${c ? c.icon : ''}</span><span class="sp-lbl">${esc(e.text)}</span><button class="button outline kp-btn" data-approve="${esc(e.id)}" type="button">Mostrar</button><button class="button danger kp-btn" data-hide="${esc(e.id)}" type="button">Ocultar</button></li>`; }).join('')}</ul></section>` : '';
    const goal = s.phase === 'intro' ? '' : `<div class="sp-goal"><div class="sp-goal-top"><strong>Meta del curso: que todos completen las 4 categorías</strong><span>${s.done} de ${s.total} · ${percent}%${percent === 100 ? ' 🎉' : ''}</span></div><div class="tbar"><span style="width:${percent}%"></span></div></div>`;
    return `
      <div class="lobby-heading"><div><span class="eyebrow">ORIENTACIÓN · MAPA DE NUESTRA RED DE APOYO</span><h1>${titles[s.phase]}</h1></div>${s.phase === 'build' ? `<span class="state-pill">${s.marks} MARCAS</span>` : ''}</div>
      <section class="panel gm-board sp-main">${intro}${goal}<div class="sp-grid">${cards}</div>${s.phase === 'build' ? timerBlock() : ''}</section>
      ${pendingMarkup}
      ${s.phase === 'end' ? `<section class="panel sp-real"><span class="card-kicker">A QUIÉN PUEDES ACUDIR</span>${contactsMarkup()}</section>` : ''}
      ${s.phase === 'end' ? TP.switchPicker('support', { noRanking: true }) : ''}
      ${TP.playersPanel()}
      <section class="host-controls panel"><div class="control-copy"><strong>Controles del profesor</strong><span>${s.phase === 'build' ? 'Cuando termine el tiempo o la mayoría esté lista, pasa al mapa final.' : 'Todo es anónimo: nadie ve lo que marcó cada persona.'}</span></div>
        <div class="control-buttons">${s.phase === 'end' ? '<button class="button" id="gRestart" type="button">Jugar otra vez</button>' : `<button class="button" id="spNext" type="button">${s.phase === 'intro' ? 'Comenzar ›' : 'Ver mapa final ›'}</button>`}<button class="button secondary" id="gLobby" type="button">↶ Volver al lobby</button><button class="button danger" id="gEnd" type="button">Terminar sala</button></div></section>`;
  }

  // ---------- Teléfono ----------
  function playerView() {
    const m = me();
    if (!m) return '<section class="started-card panel"><h1>Mira el proyector.</h1></section>';
    const head = `<div class="t-top"><span class="room-badge" style="--c:${esc(m.color)}">● ${esc(m.name)}</span></div>`;
    if (s.phase === 'intro') return `<section class="gm-phone t-phone panel">${head}<h1>Tu red de apoyo</h1><p>Vas a marcar a quién podrías acudir si tienes dudas sobre el consumo de drogas. Puedes elegir varias personas en cada categoría. Nadie ve lo que marcas.</p></section>`;
    if (s.phase === 'end') {
      return `<section class="gm-phone t-phone panel">${head}<h1>Tu red de apoyo</h1><p>Mira el mapa del curso en el proyector. Estas son personas e instituciones a las que puedes acudir:</p>${contactsMarkup()}</section>`;
    }
    const done = myDone();
    const sections = s.cats.map((c) => {
      const sel = new Set(mine.sel[c.id] || []);
      const own = mine.custom[c.id] || [];
      const ok = sel.size + own.length > 0;
      const chips = c.options.map((o) => `<button type="button" class="sp-chip${sel.has(o.id) ? ' on' : ''}" data-cat="${c.id}" data-id="${o.id}">${esc(o.label)}</button>`).join('')
        + own.map((t) => `<button type="button" class="sp-chip on own" data-cat="${c.id}" data-un="${esc(t)}">${esc(t)} ✕</button>`).join('');
      const canAdd = own.length < 2;
      return `<section class="sp-sec${ok ? ' ok' : ''}"><h3>${c.icon} ${esc(c.label)} <span class="sp-check">${ok ? '✓' : ''}</span></h3><div class="sp-chips">${chips}</div>${canAdd ? `<form class="sp-add" data-cat="${c.id}"><input class="input sp-in" maxlength="30" placeholder="Otra persona o lugar (opcional)" data-cat="${c.id}" value="${esc(drafts[c.id] || '')}"><button class="button outline" type="submit">Agregar</button></form>` : ''}</section>`;
    }).join('');
    return `<section class="gm-phone t-phone sp-phone panel">${head}<div class="t-info">Completa las 4 categorías: ${done} de 4 ${done === 4 ? '🎉' : ''}</div>${timerBlock()}<p class="mm-hint">Toca para marcar. Puedes elegir varias. Nadie ve lo que marcas.</p>${sections}</section>`;
  }

  const mySig = () => [s.phase, JSON.stringify(mine)].join('|');

  function draw() {
    if (!s || !TP.role) return;
    clearInterval(timerId);
    const host = TP.role === 'host';
    if (!host) {
      app.querySelectorAll('.sp-in').forEach((i) => { drafts[i.dataset.cat] = i.value; }); // conserva lo que se estaba escribiendo
      sig = mySig();
    }
    app.innerHTML = host ? hostView() : playerView();
    if (host) {
      const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
      on('spNext', () => TP.hostGame('next'));
      on('spApproveAll', () => TP.hostGame('approve-all'));
      on('gRestart', () => TP.hostAction('restart'));
      on('gLobby', () => TP.hostAction('reset'));
      on('gEnd', () => { if (window.confirm('¿Terminar esta sala?')) TP.hostAction('end'); });
      app.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => TP.hostGame('approve', { id: b.dataset.approve })));
      app.querySelectorAll('[data-hide]').forEach((b) => b.addEventListener('click', () => TP.hostGame('hide', { id: b.dataset.hide })));
      TP.bindSwitchPicker(app);
    } else {
      const act = (type, data) => socket.emit('game:action', { code: TP.room.code, type, ...data });
      app.querySelectorAll('.sp-chip').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.un !== undefined) {
          const list = mine.custom[b.dataset.cat] || [];
          mine.custom[b.dataset.cat] = list.filter((t) => t !== b.dataset.un);
          act('uncustom', { cat: b.dataset.cat, text: b.dataset.un });
        } else {
          const cur = new Set(mine.sel[b.dataset.cat] || []);
          if (cur.has(b.dataset.id)) cur.delete(b.dataset.id); else cur.add(b.dataset.id);
          mine.sel[b.dataset.cat] = [...cur];
          act('toggle', { cat: b.dataset.cat, id: b.dataset.id });
        }
        draw();
      }));
      app.querySelectorAll('.sp-add').forEach((f) => f.addEventListener('submit', (e) => {
        e.preventDefault();
        const cat = f.dataset.cat, input = f.querySelector('input');
        const text = input.value.trim().replace(/\s+/g, ' ');
        if (text.length < 2) return;
        mine.custom[cat] = [...(mine.custom[cat] || []), text.slice(0, 30)];
        input.value = ''; drafts[cat] = '';
        act('custom', { cat, text });
        draw();
      }));
    }
    timerId = setInterval(tick, 200); tick();
  }

  // El servidor confirma lo marcado: así el teléfono se mantiene al día si se pierde algún envío.
  socket.on('game:self', (d) => {
    if (!d || !d.sel || !s || TP.role !== 'player') return;
    mine = { sel: d.sel, custom: d.custom || {} };
    if (mySig() !== sig) draw();
  });
  socket.on('game:host', (d) => {
    if (!d || d.type !== 'support' || TP.role !== 'host') return;
    pending = d.pending || [];
    if (s) draw();
  });

  window.TPGames.support = {
    type: 'support',
    onState(next) {
      s = next;
      if (!s) { clearInterval(timerId); sig = ''; mine = { sel: {}, custom: {} }; pending = []; drafts = {}; return; }
      offset = s.now - Date.now();
      if (!(TP.room && TP.room.status === 'started' && TP.role)) return;
      if (TP.role === 'player' && mySig() === sig) return;
      draw();
    },
    draw() { draw(); }
  };
})();
