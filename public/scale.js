'use strict';
// Pantallas del minijuego 5 (Vector × escalar): proyector y teléfono.
(() => {
  const TP = window.TP;
  const { socket, app } = TP;
  const esc = TP.escapeHtml;
  window.TPGames = window.TPGames || {};

  const LETTERS = ['A', 'B', 'C', 'D'];
  const COLORS = ['#35C9A5', '#FFD166', '#F06CB4', '#6C7CFF'];
  let s = null, offset = 0, round = -1, mine = null, sig = '', timerId = null, resend = null;

  const me = () => (s && TP.player ? s.players.find((p) => p.id === TP.player.id) : null);
  const byScore = (a, b) => b.score - a.score;

  // Plano con el vector v (y w cuando se pregunta por el escalar).
  function plane(q) {
    const R = Math.max(4, Math.min(9, 1 + Math.max(...q.v.map(Math.abs), ...(q.w ? q.w.map(Math.abs) : [0])))), S = 2 * R + 1;
    let h = `<svg class="sc-plane" viewBox="${-R - 0.5} ${-R - 0.5} ${S} ${S}" role="img" aria-label="Plano con el vector">`
      + `<defs><marker id="scA" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#35C9A5"/></marker>`
      + `<marker id="scB" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFD166"/></marker></defs>`;
    for (let i = -R; i <= R; i++) {
      h += `<line class="${i === 0 ? 'ax' : 'g'}" x1="${i}" y1="${-R}" x2="${i}" y2="${R}"/><line class="${i === 0 ? 'ax' : 'g'}" x1="${-R}" y1="${i}" x2="${R}" y2="${i}"/>`;
    }
    const arrow = (v, cls, marker, label) => `<line class="sc-vec ${cls}" x1="0" y1="0" x2="${v[0]}" y2="${-v[1]}" marker-end="url(#${marker})"/><text class="sc-lbl ${cls}" x="${v[0] + (v[0] >= 0 ? 0.35 : -0.35)}" y="${-v[1] + (v[1] >= 0 ? -0.35 : 0.8)}" text-anchor="${v[0] >= 0 ? 'start' : 'end'}">${label}</text>`;
    h += arrow(q.v, 'va', 'scA', 'v');
    if (q.w) h += arrow(q.w, 'vb', 'scB', 'w');
    return `${h}</svg>`;
  }

  function timerBlock() { return '<div class="tbar"><span id="scf"></span></div><div class="tsec" id="scs"></div>'; }
  function tick() {
    if (!s) return;
    const left = Math.max(0, (s.endsAt - (Date.now() + offset)) / 1000);
    const total = Math.max(1, s.durationMs / 1000);
    const f = document.getElementById('scf'), t = document.getElementById('scs');
    if (f) f.style.width = `${Math.min(100, (left / total) * 100)}%`;
    if (t) t.textContent = s.phase === 'end' ? '' : `${Math.ceil(left)} s`;
  }

  // ---------- Proyector ----------
  function hostView() {
    const ranking = [...s.players].sort(byScore);
    const titles = { intro: '¡Prepárense!', ask: '¡Responde rápido!', reveal: 'Respuesta de la ronda', end: 'Resultado final' };
    const q = s.question;
    let main = '', side = '';
    if (s.phase === 'intro') {
      main = '<div class="sc-intro">✖️<h2>Vector × escalar</h2></div>';
      side = '<p class="rule">En cada ronda aparece una pregunta con 4 alternativas. Multiplica el vector por el escalar y toca la alternativa correcta en tu teléfono.<br>Aciertas: <strong>100 puntos</strong> más hasta <strong>100 por rapidez</strong>. Tu primera respuesta queda fija. Nadie queda eliminado.</p>';
    } else if (s.phase === 'end') {
      const top = ranking.slice(0, 3);
      main = `<div class="winner">🏆<h2>${top[0] ? esc(top[0].name) : ''}</h2></div><ol class="t-sol">${top.map((p, i) => `<li>${['🥇', '🥈', '🥉'][i]} ${esc(p.name)}: ${p.score} puntos</li>`).join('')}</ol>`;
    } else {
      const reveal = s.phase === 'reveal';
      const max = Math.max(1, ...(s.counts || [0]));
      const opts = q.options.map((o, i) => `<div class="sc-opt${reveal ? (i === s.correctIndex ? ' good' : ' dim') : ''}" style="--c:${COLORS[i]}"><b>${LETTERS[i]}</b><span>${esc(o)}</span>${reveal ? `<i class="sc-bar" style="width:${Math.round((s.counts[i] / max) * 100)}%"></i><em>${s.counts[i]}</em>` : ''}</div>`).join('');
      main = `<div class="sc-host-q">${esc(q.text)}</div><div class="sc-host-row">${plane(q)}<div class="sc-opts">${opts}</div></div>`
        + (reveal ? `<p class="sc-explain">✔ ${esc(s.explain)}</p>` : '')
        + timerBlock();
      side = `<p class="rule">Ronda <strong>${s.round} de ${s.rounds}</strong>${reveal ? '' : `. Ya respondieron <strong>${s.players.filter((p) => p.answered).length} de ${s.players.length}</strong>.`}${reveal ? `. Acertaron <strong>${s.players.filter((p) => p.correct).length} de ${s.players.length}</strong>.` : ''}</p>`;
    }
    const list = ranking.slice(0, 10).map((p, i) => `<li><span class="t-pos">${i + 1}</span><span class="t-dotc" style="--c:${esc(p.color)}"></span><span class="t-nm">${esc(p.name)}${s.phase === 'ask' && p.answered ? ' ✓' : ''}</span><span class="t-pts">${p.score}${s.phase === 'reveal' ? ` <small class="${p.correct ? 'ok' : 'bad'}">${p.correct ? `+${p.gain}` : '✖'}</small>` : ''}</span></li>`).join('');
    return `
      <div class="lobby-heading"><div><span class="eyebrow">VECTOR × ESCALAR · RONDA ${Math.max(s.round, 1)} DE ${s.rounds}</span><h1>${titles[s.phase]}</h1></div><span class="state-pill">${s.players.length} JUGANDO</span></div>
      <div class="gm-layout">
        <section class="panel gm-board">${main}</section>
        <aside class="panel gm-side">${side}<h3>Puntajes</h3><ul class="mm-rank">${list}</ul></aside>
      </div>
      ${s.phase === 'end' ? TP.switchPicker('scale') : ''}
      ${TP.playersPanel()}
      <section class="host-controls panel"><div class="control-copy"><strong>Controles del profesor</strong><span>Las rondas avanzan solas. Cada ronda trae un escalar más difícil y menos tiempo.</span></div>
        <div class="control-buttons">${s.phase === 'end' ? '<button class="button" id="gRestart" type="button">Jugar otra vez</button>' : ''}<button class="button secondary" id="gLobby" type="button">↶ Volver al lobby</button><button class="button danger" id="gEnd" type="button">Terminar sala</button></div></section>`;
  }

  // ---------- Teléfono ----------
  function playerView() {
    const m = me();
    if (!m) return '<section class="started-card panel"><h1>Mira el proyector.</h1></section>';
    const head = `<div class="t-top"><span class="room-badge" style="--c:${esc(m.color)}">● ${esc(m.name)}</span><span class="t-score">⭐ ${m.score}</span></div>`;
    const q = s.question;
    let body = '';
    if (s.phase === 'intro') {
      body = '<h1>¡Prepárate!</h1><p>Vas a ver un vector y 4 alternativas. Toca la correcta lo más rápido que puedas: ganas más puntos entre más rápido aciertes.</p>';
    } else if (s.phase === 'ask') {
      const chosen = m.answered ? mine : null;
      const btns = q.options.map((o, i) => `<button type="button" class="sc-btn${chosen === i ? ' picked' : ''}" data-i="${i}" style="--c:${COLORS[i]}" ${m.answered ? 'disabled' : ''}><b>${LETTERS[i]}</b><span>${esc(o)}</span></button>`).join('');
      body = `<div class="t-info">Ronda ${s.round} de ${s.rounds}</div><div class="sc-q">${esc(q.text)}</div>${plane(q)}${timerBlock()}<div class="sc-btns">${btns}</div>`
        + (m.answered ? '<p class="mm-hint">✅ Respuesta enviada. Espera a que termine la ronda.</p>' : '');
    } else if (s.phase === 'reveal') {
      if (m.correct === null) return `<section class="gm-phone t-phone panel">${head}<h1>👋 ¡Entraste a la partida!</h1><p>Esta ronda ya terminó. Juegas desde la próxima.</p></section>`;
      const title = m.correct ? `✅ ¡Correcto! +${m.gain}` : (m.choice === null ? '⏱ No alcanzaste a responder' : '❌ Esta vez no');
      body = `<h1>${title}</h1><div class="sc-q">${esc(q.text)}</div><p class="mm-hint">Respuesta correcta: <strong>${LETTERS[s.correctIndex]}) ${esc(q.options[s.correctIndex])}</strong></p>${m.choice !== null && !m.correct ? `<p class="mm-hint">Marcaste: ${LETTERS[m.choice]}) ${esc(q.options[m.choice])}</p>` : ''}<p class="sc-explain">${esc(s.explain)}</p>`;
    } else {
      const r = 1 + s.players.filter((p) => p.score > m.score).length;
      body = `<h1>${r === 1 ? '🏆 ¡Ganaste!' : `Quedaste en el lugar ${r}`}</h1><p>Puntaje final: <strong>${m.score}</strong>. Mira el proyector para ver el podio.</p><p>${esc(TP.sessionLine(m.id))}</p>`;
    }
    return `<section class="gm-phone t-phone panel">${head}${body}</section>`;
  }

  const mySig = () => { const m = me(); return m ? [s.phase, s.round, m.answered, m.score, m.correct].join('|') : 'x'; };

  function choose(i) {
    const m = me();
    if (!s || s.phase !== 'ask' || !m || m.answered) return;
    mine = i;
    const r = s.round;
    const send = () => socket.emit('game:action', { code: TP.room.code, type: 'answer', i });
    send();
    // Con mala señal el envío puede perderse: si el servidor no confirma, se reenvía.
    clearTimeout(resend);
    resend = setTimeout(() => { const mm = me(); if (s && s.phase === 'ask' && s.round === r && mm && !mm.answered) send(); }, 1500);
    // Respuesta local inmediata: se bloquean los botones y se marca la elegida.
    app.querySelectorAll('.sc-btn').forEach((b) => { b.disabled = true; if (Number(b.dataset.i) === i) b.classList.add('picked'); });
  }

  function draw() {
    if (!s || !TP.role) return;
    clearInterval(timerId);
    const host = TP.role === 'host';
    if (!host) sig = mySig();
    app.innerHTML = host ? hostView() : playerView();
    if (host) {
      const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
      on('gRestart', () => TP.hostAction('restart'));
      on('gLobby', () => TP.hostAction('reset'));
      on('gEnd', () => { if (window.confirm('¿Terminar esta sala?')) TP.hostAction('end'); });
      TP.bindSwitchPicker(app);
    } else {
      app.querySelectorAll('.sc-btn').forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.i))));
    }
    timerId = setInterval(tick, 200); tick();
  }

  window.TPGames.scale = {
    type: 'scale',
    onState(next) {
      s = next;
      if (!s) { clearInterval(timerId); clearTimeout(resend); sig = ''; round = -1; mine = null; return; }
      offset = s.now - Date.now();
      if (s.round !== round) { round = s.round; mine = null; }
      if (!(TP.room && TP.room.status === 'started' && TP.role)) return;
      if (TP.role === 'player' && mySig() === sig) return;
      draw();
    },
    draw() { draw(); }
  };
})();
