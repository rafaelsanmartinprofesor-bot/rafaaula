'use strict';
// Pantallas del minijuego 3 (Memoria de transformaciones): proyector y teléfono.
(() => {
  const TP = window.TP;
  const { socket, app } = TP;
  const esc = TP.escapeHtml;
  window.TPGames = window.TPGames || {};

  const K = {
    tr: { icon: '➜', name: 'Traslación', c: '#35C9A5' },
    rot: { icon: '↻', name: 'Rotación', c: '#FFD166' },
    ref: { icon: '⇋', name: 'Reflexión', c: '#F06CB4' },
    hom: { icon: '⤢', name: 'Homotecia', c: '#6C7CFF' }
  };
  const CELLS = [[1, 0], [0, 1], [1, 1], [1, 2], [2, 2]]; // pieza F: sin simetrías, así cada transformación se distingue
  const cellsHtml = CELLS.map(([x, y]) => `<i style="grid-column:${x + 1};grid-row:${3 - y}"></i>`).join('');
  const stage = () => `<div class="mm-stage" role="img" aria-label="Figura que se transforma"><div class="mm-ghost">${cellsHtml}</div><div class="mm-fig" id="mmFig">${cellsHtml}</div></div>`;

  let s = null, offset = 0, round = -1, ans = [], sig = '', timerId = null, stepTimer = null;

  const me = () => (s && TP.player ? s.players.find((p) => p.id === TP.player.id) : null);
  const rankOrder = (a, b) => b.score - a.score;
  const chip = (kind, extra = '', big = false, mark = '') => `<span class="mm-chip${big ? ' big' : ''}${mark}" style="--c:${K[kind].c}">${extra}<b>${K[kind].icon}</b>${K[kind].name}</span>`;
  // Fila con el orden de un jugador, marcando qué posiciones acertó frente a la solución.
  const answerRow = (answer, solution, big) => (answer && answer.length
    ? answer.map((k, i) => chip(k, `<span class="n">${i + 1}</span> `, big, k === solution[i] ? ' hit' : ' miss')).join('')
    : '<span class="mm-hint">No enviaste respuesta</span>');

  // ---------- Animación de cada transformación ----------
  function transformOf(st) {
    if (st.kind === 'tr') return `translate(${st.dx}%, ${st.dy}%)`;
    if (st.kind === 'rot') return `rotate(${st.angle}deg)`;
    if (st.kind === 'ref') return st.axis === 'h' ? 'scale(1, -1)' : 'scale(-1, 1)';
    return `scale(${st.k})`;
  }
  socket.on('game:step', (st) => {
    if (!s || s.phase !== 'show') return;
    const fig = document.getElementById('mmFig');
    if (!fig) return;
    clearTimeout(stepTimer);
    fig.style.transition = 'none';
    fig.style.transform = 'none';
    void fig.offsetWidth; // fuerza a reiniciar la figura antes de animar
    fig.style.transition = `transform ${Math.round(st.stepMs * 0.7)}ms ease-in-out`;
    fig.style.transform = transformOf(st);
    const count = document.getElementById('mmCount');
    if (count) count.textContent = `${st.i + 1} / ${st.n}`;
    stepTimer = setTimeout(() => { fig.style.transition = 'none'; fig.style.transform = 'none'; }, st.stepMs);
  });

  function timerBlock() { return '<div class="tbar"><span id="mtf"></span></div><div class="tsec" id="mts"></div>'; }
  function tick() {
    if (!s) return;
    const left = Math.max(0, (s.endsAt - (Date.now() + offset)) / 1000);
    const total = Math.max(1, s.durationMs / 1000);
    const f = document.getElementById('mtf'), t = document.getElementById('mts');
    if (f) f.style.width = `${Math.min(100, (left / total) * 100)}%`;
    if (t) t.textContent = s.phase === 'end' ? '' : `${Math.ceil(left)} s`;
  }

  // ---------- Proyector ----------
  function hostView() {
    const ranking = [...s.players].sort(rankOrder);
    const titles = { intro: '¡A memorizar!', show: 'Mira las transformaciones', input: 'Escribe el orden', result: 'Resultado de la ronda', end: 'Resultado final' };
    const slots = Array.from({ length: s.n }, () => '<span class="mm-chip big empty">?</span>').join('');
    let left = '', side = '';
    if (s.phase === 'intro') {
      left = stage();
      side = '<p class="rule">Vas a ver una figura que se transforma una y otra vez: <strong>traslación</strong>, <strong>rotación</strong>, <strong>reflexión</strong> u <strong>homotecia</strong>.<br>Después escribe en tu teléfono el <strong>orden</strong> en que aparecieron. Cada ronda trae más transformaciones y van más rápido.<br>Cada posición acertada suma puntos, y si aciertas todo ganas un bonus por rapidez. Nadie queda eliminado.</p>';
    } else if (s.phase === 'show') {
      left = `${stage()}<div class="mm-count" id="mmCount">&nbsp;</div>`;
      side = `<p class="rule">Ronda <strong>${s.round} de ${s.rounds}</strong>. Son <strong>${s.n}</strong> transformaciones. Cada una dura ${(s.stepMs / 1000).toFixed(2)} s.</p>`;
    } else if (s.phase === 'input') {
      left = `<p class="mm-hint">¿En qué orden aparecieron las ${s.n} transformaciones?</p><div class="mm-chips">${slots}</div>${timerBlock()}`;
      side = `<p class="rule">Ronda <strong>${s.round} de ${s.rounds}</strong>. Ya respondieron <strong>${s.players.filter((p) => p.answered).length} de ${s.players.length}</strong>.</p>`;
    } else if (s.phase === 'result') {
      left = `<p class="mm-hint">El orden correcto era:</p><div class="mm-chips">${(s.solution || []).map((k, i) => chip(k, `<span class="n">${i + 1}</span> `, true)).join('')}</div>${timerBlock()}`;
      side = `<p class="rule">${s.players.filter((p) => p.correct).length} de ${s.players.length} acertaron todo. Las demás posiciones también suman.</p>`;
    } else {
      const top = ranking.slice(0, 3);
      left = `<div class="winner">🏆<h2>${top[0] ? esc(top[0].name) : ''}</h2></div><ol class="t-sol">${top.map((p, i) => `<li>${['🥇', '🥈', '🥉'][i]} ${esc(p.name)}: ${p.score} puntos</li>`).join('')}</ol>`;
    }
    const list = ranking.slice(0, 10).map((p, i) => `<li><span class="t-pos">${i + 1}</span><span class="t-dotc" style="--c:${esc(p.color)}"></span><span class="t-nm">${esc(p.name)}${s.phase === 'input' && p.answered ? ' ✓' : ''}</span><span class="t-pts">${p.score}${s.phase === 'result' && p.correct !== null ? ` <small class="${p.correct ? 'ok' : 'bad'}">${p.hits}/${s.n} +${p.gain}</small>` : ''}</span></li>`).join('');
    return `
      <div class="lobby-heading"><div><span class="eyebrow">MEMORIA DE TRANSFORMACIONES · RONDA ${Math.max(s.round, 1)} DE ${s.rounds}</span><h1>${titles[s.phase]}</h1></div><span class="state-pill">${s.players.length} JUGANDO</span></div>
      <div class="gm-layout">
        <section class="panel gm-board">${left}</section>
        <aside class="panel gm-side">${side}<h3>Jugadores</h3><ul class="mm-rank">${list}</ul></aside>
      </div>
      ${s.phase === 'end' ? TP.switchPicker('memory') : ''}
      ${TP.playersPanel()}
      <section class="host-controls panel"><div class="control-copy"><strong>Controles del profesor</strong><span>Las rondas avanzan solas. Nadie queda eliminado: todos suman puntos hasta el final.</span></div>
        <div class="control-buttons">${s.phase === 'end' ? '<button class="button" id="gRestart" type="button">Jugar otra vez</button>' : ''}<button class="button secondary" id="gLobby" type="button">↶ Volver al lobby</button><button class="button danger" id="gEnd" type="button">Terminar sala</button></div></section>`;
  }

  // ---------- Teléfono ----------
  function playerView() {
    const m = me();
    if (!m) return '<section class="started-card panel"><h1>Mira el proyector.</h1></section>';
    const head = `<div class="t-top"><span class="room-badge" style="--c:${esc(m.color)}">● ${esc(m.name)}</span><span class="t-score">⭐ ${m.score}</span></div>`;
    let body = '';
    if (s.phase === 'intro') {
      body = '<h1>¡Prepárate!</h1><p>Mira cómo se transforma la figura. Después escribe el orden: traslación, rotación, reflexión u homotecia. Cada posición acertada suma puntos.</p>';
    } else if (s.phase === 'show') {
      body = `<div class="t-info">Ronda ${s.round} de ${s.rounds} · ${s.n} transformaciones</div>${stage()}<div class="mm-count" id="mmCount">&nbsp;</div><p class="mm-hint">Memoriza el orden.</p>`;
    } else if (s.phase === 'input') {
      if (m.answered) body = '<h1>✅ Enviado</h1><p>Espera a que termine la ronda para ver el resultado.</p>';
      else {
        const slots = Array.from({ length: s.n }, (_, i) => (ans[i] ? chip(ans[i]) : '<span class="mm-chip empty">?</span>')).join('');
        body = `<div class="t-info">Ronda ${s.round} de ${s.rounds} · ¿en qué orden aparecieron?</div><div class="mm-chips">${slots}</div>${timerBlock()}`
          + `<div class="mm-btns">${Object.keys(K).map((k) => `<button type="button" class="mm-btn" data-kind="${k}" style="--c:${K[k].c}" ${ans.length >= s.n ? 'disabled' : ''}><b>${K[k].icon}</b>${K[k].name}</button>`).join('')}</div>`
          + `<div class="t-actions"><button type="button" class="button outline" id="mUndo" ${ans.length ? '' : 'disabled'}>Deshacer</button><button type="button" class="button outline" id="mClear" ${ans.length ? '' : 'disabled'}>Borrar todo</button><button type="button" class="button" id="mSend" ${ans.length === s.n ? '' : 'disabled'}>Enviar</button></div>`;
      }
    } else if (s.phase === 'result') {
      const sol = s.solution || [];
      if (m.hits === null) { body = '<h1>👋 ¡Entraste a la partida!</h1><p>Esta ronda ya terminó. Juegas desde la próxima.</p>'; return `<section class="gm-phone t-phone mm-phone panel">${head}${body}</section>`; }
      const title = m.correct ? `✅ ¡Todo correcto! +${m.gain}` : (m.hits > 0 ? `👏 Acertaste ${m.hits} de ${s.n}: +${m.gain}` : `❌ Esta vez no acertaste: +${m.gain}`);
      body = `<h1>${title}</h1><p class="mm-hint">Tu orden:</p><div class="mm-chips">${answerRow(m.answer, sol, false)}</div><p class="mm-hint">El orden correcto era:</p><div class="mm-chips">${sol.map((k, i) => chip(k, `<span class="n">${i + 1}</span> `)).join('')}</div><p class="mm-hint">Verde: posición acertada. Rojo: posición errada.</p>`;
    } else {
      const r = 1 + s.players.filter((p) => p.score > m.score).length;
      body = `<h1>${r === 1 ? '🏆 ¡Ganaste!' : `Quedaste en el lugar ${r}`}</h1><p>Puntaje final: <strong>${m.score}</strong>. Mira el proyector para ver el podio.</p><p>${esc(TP.sessionLine(m.id))}</p>`;
    }
    return `<section class="gm-phone t-phone mm-phone panel">${head}${body}</section>`;
  }

  function mySig() {
    const m = me();
    return m ? [s.phase, s.round, m.score, m.answered, m.correct, m.hits].join('|') : 'x';
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
      TP.bindSwitchPicker(app);
      on('gEnd', () => { if (window.confirm('¿Terminar esta sala?')) TP.hostAction('end'); });
    } else {
      const click = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
      app.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { if (ans.length < s.n) { ans.push(b.dataset.kind); draw(); } }));
      click('mUndo', () => { ans.pop(); draw(); });
      click('mClear', () => { ans = []; draw(); });
      click('mSend', () => {
        if (ans.length !== s.n) return;
        const send = () => socket.emit('game:action', { code: TP.room.code, type: 'submit', seq: ans.slice() });
        const r = s.round;
        send();
        // Con mala señal el envío puede perderse: si el servidor no confirma, se reenvía una vez.
        setTimeout(() => { const m = me(); if (s && s.phase === 'input' && s.round === r && m && !m.answered) send(); }, 1500);
      });
    }
    timerId = setInterval(tick, 200); tick();
  }

  window.TPGames.memory = {
    type: 'memory',
    onState(next) {
      s = next;
      if (!s) { clearInterval(timerId); clearTimeout(stepTimer); sig = ''; round = -1; return; }
      offset = s.now - Date.now();
      if (s.round !== round) { round = s.round; ans = []; }
      if (!(TP.room && TP.room.status === 'started' && TP.role)) return;
      if (TP.role === 'player' && mySig() === sig) return;
      draw();
    },
    draw() { draw(); }
  };
})();
