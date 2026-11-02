'use strict';
// Pantallas del minijuego 6 (Mito, Realidad o Depende): proyector y teléfono. Los votos son anónimos.
(() => {
  const TP = window.TP;
  const { socket, app } = TP;
  const esc = TP.escapeHtml;
  window.TPGames = window.TPGames || {};

  const CH = {
    M: { name: 'Mito', c: '#FF6B6B', icon: '✖' },
    R: { name: 'Realidad', c: '#35C9A5', icon: '✔' },
    D: { name: 'Depende', c: '#FFD166', icon: '≈' }
  };
  const ORDER = ['M', 'R', 'D'];
  let s = null, offset = 0, round = -1, vote = null, confirmed = null, sig = '', timerId = null, resend = null;

  const me = () => (s && TP.player ? s.players.find((p) => p.id === TP.player.id) : null);
  const pct = (n, total) => (total ? Math.round((100 * n) / total) : 0);

  function bars(counts, total, answer) {
    return `<div class="my-bars">${ORDER.map((k) => `<div class="my-bar${answer === k ? ' good' : ''}${answer && answer !== k ? ' dim' : ''}" style="--c:${CH[k].c}"><b>${CH[k].icon}</b><span class="my-name">${CH[k].name}</span><i class="my-fill" style="width:${pct(counts[k], total)}%"></i><em>${counts[k]} · ${pct(counts[k], total)}%</em></div>`).join('')}</div>`;
  }

  function timerBlock() { return '<div class="tbar"><span id="myf"></span></div><div class="tsec" id="mys"></div>'; }
  function tick() {
    if (!s) return;
    const left = s.paused ? (s.pausedLeft || 0) / 1000 : Math.max(0, (s.endsAt - (Date.now() + offset)) / 1000);
    const total = Math.max(1, s.durationMs / 1000);
    const f = document.getElementById('myf'), t = document.getElementById('mys');
    if (f) f.style.width = `${Math.min(100, (left / total) * 100)}%`;
    if (t) t.textContent = s.phase === 'end' ? '' : (s.paused ? 'En pausa' : `${Math.ceil(left)} s`);
  }

  // ---------- Proyector ----------
  function hostView() {
    const titles = { intro: 'Mitos y realidades sobre las drogas', vote: '¿Mito, realidad o depende?', dist: 'Así votó el curso', reveal: 'Lo que dice la evidencia', end: 'Las afirmaciones que más dividieron al curso' };
    let main = '', pill = '';
    if (s.phase === 'intro') {
      main = '<div class="my-intro"><p class="rule">Van a aparecer 12 afirmaciones. Vota en tu teléfono si cada una es <strong>Mito</strong>, <strong>Realidad</strong> o <strong>Depende</strong>.</p><p class="rule">Tu voto es anónimo. Equivocarse al inicio no importa: lo importante es argumentar y aprender a reconocer información confiable.</p><p class="rule">Hablamos de afirmaciones, no de personas.</p></div>';
    } else if (s.phase === 'end') {
      main = `<div class="my-divided">${(s.divided || []).map((d, i) => `<article class="my-card small"><span class="card-kicker">#${i + 1} · AFIRMACIÓN ${d.n}</span><p class="my-stmt">“${esc(d.text)}”</p>${bars(d.counts, d.total, null)}</article>`).join('') || '<p class="rule">No hubo votos suficientes.</p>'}</div><p class="rule">Cada grupo elige una de estas afirmaciones y responde: ¿Por qué pensamos eso? ¿Qué información necesitaríamos para estar seguros? ¿Dónde podríamos buscar información confiable?</p>`;
    } else {
      const voted = s.players.filter((p) => p.voted).length;
      pill = s.phase === 'vote' ? `${voted} DE ${s.players.length} VOTARON` : '';
      main = `<article class="my-card"><span class="card-kicker">AFIRMACIÓN ${s.round} DE ${s.rounds}</span><p class="my-stmt big">“${esc(s.statement)}”</p></article>`;
      if (s.phase === 'vote') main += `<div class="my-legend">${ORDER.map((k) => `<span style="--c:${CH[k].c}"><b>${CH[k].icon}</b>${CH[k].name}</span>`).join('')}</div>${timerBlock()}`;
      else main += bars(s.counts, s.total, s.phase === 'reveal' ? s.answer : null);
      if (s.phase === 'reveal') main += `<p class="my-answer" style="--c:${CH[s.answer].c}">${s.answer === 'M' ? 'Es un MITO' : 'Es una REALIDAD'}</p><p class="my-explain">${esc(s.explain)}</p><p class="my-talk">💬 ${esc(s.talk)}</p>${timerBlock()}`;
      if (s.phase === 'dist') main += `<p class="rule">¿Por qué votaron así? Conversemos un momento antes de ver la respuesta.</p>${timerBlock()}`;
    }
    const ctrl = s.phase === 'end'
      ? '<button class="button" id="gRestart" type="button">Jugar otra vez</button>'
      : `<button class="button outline" id="myPause" type="button">${s.paused ? '▶ Reanudar' : '⏸ Pausar'}</button><button class="button" id="myNext" type="button">Siguiente ›</button>${s.phase === 'intro' ? '' : '<button class="button outline" id="mySkip" type="button">Saltar afirmación</button>'}`;
    return `
      <div class="lobby-heading"><div><span class="eyebrow">ORIENTACIÓN · MITO, REALIDAD O DEPENDE</span><h1>${titles[s.phase]}</h1></div>${s.paused ? '<span class="state-pill">EN PAUSA</span>' : (pill ? `<span class="state-pill">${pill}</span>` : '')}</div>
      <section class="panel gm-board my-main">${main}</section>
      ${s.phase === 'end' ? TP.switchPicker('myth', { noRanking: true }) : ''}
      ${TP.playersPanel()}
      <section class="host-controls panel"><div class="control-copy"><strong>Controles del profesor</strong><span>Tú marcas el ritmo: pausa para conversar, avanza o salta una afirmación. Nadie ve el voto de otro.</span></div>
        <div class="control-buttons">${ctrl}<button class="button secondary" id="gLobby" type="button">↶ Volver al lobby</button><button class="button danger" id="gEnd" type="button">Terminar sala</button></div></section>`;
  }

  // ---------- Teléfono ----------
  function playerView() {
    const m = me();
    if (!m) return '<section class="started-card panel"><h1>Mira el proyector.</h1></section>';
    const pausedBanner = s.paused ? '<p class="my-paused">⏸ El profesor pausó el juego</p>' : '';
    let body = '';
    if (s.phase === 'intro') {
      body = '<h1>¡Prepárate!</h1><p>Vas a votar si cada afirmación es <strong>mito</strong>, <strong>realidad</strong> o <strong>depende</strong>. Tu voto es anónimo. Equivocarse no importa: lo importante es argumentar.</p>';
    } else if (s.phase === 'vote') {
      const btns = ORDER.map((k) => `<button type="button" class="my-btn${vote === k ? ' picked' : ''}" data-v="${k}" style="--c:${CH[k].c}" ${s.paused ? 'disabled' : ''}><b>${CH[k].icon}</b>${CH[k].name}</button>`).join('');
      body = `<div class="t-info">Afirmación ${s.round} de ${s.rounds}</div><p class="my-stmt">“${esc(s.statement)}”</p>${timerBlock()}<div class="my-btns">${btns}</div><p class="mm-hint">${vote ? '✅ Voto enviado. Puedes cambiarlo mientras dure el tiempo.' : 'Toca una opción. Nadie ve tu voto.'}</p>`;
    } else if (s.phase === 'dist') {
      body = `<div class="t-info">Afirmación ${s.round} de ${s.rounds}</div><p class="my-stmt">“${esc(s.statement)}”</p><p class="mm-hint">${vote ? `Tu voto: <strong>${CH[vote].name}</strong>` : 'No alcanzaste a votar.'}</p>${bars(s.counts, s.total, null)}<p class="mm-hint">Conversemos antes de ver la respuesta.</p>`;
    } else if (s.phase === 'reveal') {
      const note = !vote ? '' : (vote === s.answer ? '✔ Tu voto coincide con la evidencia.' : (vote === 'D' ? 'Elegiste Depende: analizar los matices también es una buena idea.' : 'Pensabas distinto, y eso ayuda a conversar.'));
      body = `<div class="t-info">Afirmación ${s.round} de ${s.rounds}</div><p class="my-stmt">“${esc(s.statement)}”</p><p class="my-answer" style="--c:${CH[s.answer].c}">${s.answer === 'M' ? 'Es un MITO' : 'Es una REALIDAD'}</p>${note ? `<p class="mm-hint">${note}</p>` : ''}<p class="my-explain">${esc(s.explain)}</p><p class="my-talk">💬 ${esc(s.talk)}</p>`;
    } else {
      body = '<h1>¡Gracias por participar!</h1><p>Mira en el proyector las afirmaciones que más dividieron al curso. Elijan una en tu grupo para analizarla.</p>';
    }
    return `<section class="gm-phone t-phone panel"><div class="t-top"><span class="room-badge" style="--c:${esc(m.color)}">● ${esc(m.name)}</span></div>${pausedBanner}${body}</section>`;
  }

  const mySig = () => [s.phase, s.round, vote, s.paused, s.phase === 'dist' ? s.total : ''].join('|');

  function choose(k) {
    if (!s || s.phase !== 'vote' || s.paused) return;
    vote = k;
    const r = s.round;
    const send = () => socket.emit('game:action', { code: TP.room.code, type: 'vote', v: k });
    send();
    clearTimeout(resend);
    // Con mala señal el envío puede perderse: si el servidor no confirma el voto, se reenvía.
    resend = setTimeout(() => { if (s && s.phase === 'vote' && s.round === r && confirmed !== k) send(); }, 1500);
    draw();
  }

  function draw() {
    if (!s || !TP.role) return;
    clearInterval(timerId);
    const host = TP.role === 'host';
    if (!host) sig = mySig();
    app.innerHTML = host ? hostView() : playerView();
    if (host) {
      const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
      on('myPause', () => TP.hostGame('pause'));
      on('myNext', () => TP.hostGame('next'));
      on('mySkip', () => { if (window.confirm('¿Saltar esta afirmación? No se contará en el resultado final.')) TP.hostGame('skip'); });
      on('gRestart', () => TP.hostAction('restart'));
      on('gLobby', () => TP.hostAction('reset'));
      on('gEnd', () => { if (window.confirm('¿Terminar esta sala?')) TP.hostAction('end'); });
      TP.bindSwitchPicker(app);
    } else {
      app.querySelectorAll('.my-btn').forEach((b) => b.addEventListener('click', () => choose(b.dataset.v)));
    }
    timerId = setInterval(tick, 200); tick();
  }

  socket.on('game:self', (d) => {
    if (!d || !('vote' in d) || !s || TP.role !== 'player') return;
    confirmed = d.vote;
    if (d.vote !== vote) { vote = d.vote; if (s.phase === 'vote') draw(); }
  });

  window.TPGames.myth = {
    type: 'myth',
    onState(next) {
      s = next;
      if (!s) { clearInterval(timerId); clearTimeout(resend); sig = ''; round = -1; vote = null; confirmed = null; return; }
      offset = s.now - Date.now();
      if (s.round !== round) { round = s.round; vote = null; confirmed = null; }
      if (!(TP.room && TP.room.status === 'started' && TP.role)) return;
      if (TP.role === 'player' && mySig() === sig) return;
      draw();
    },
    draw() { draw(); }
  };
})();
