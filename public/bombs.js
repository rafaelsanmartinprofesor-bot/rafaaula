'use strict';
// Pantallas del minijuego 1 (Bombas de traslación): proyector y teléfono.
(() => {
  const TP = window.TP;
  const { socket, app } = TP;
  const esc = TP.escapeHtml;
  let sig = '', g = null, offset = 0, dx = 0, dy = 0, lastRound = -1, sent = false, timerId = null, resend = null;

  window.TPGames = window.TPGames || {};
  window.TPGames.bombs = {
    type: 'bombs',
    onState(s) {
      g = s;
      if (s) {
        offset = s.now - Date.now();
        if (s.round !== lastRound) { lastRound = s.round; dx = 0; dy = 0; sent = false; clearTimeout(resend); }
        if (TP.room && TP.room.status === 'started') {
          // En el teléfono no se redibuja cuando solo cambian los demás: así los botones no se pierden al tocar.
          const m = TP.role === 'player' && s.players.find((p) => p.id === (TP.player && TP.player.id));
          const mine = m ? [s.phase, s.round, m.x, m.y, m.score, m.submitted, m.result].join('|') : null;
          if (mine && mine === sig) return;
          sig = mine || '';
          draw();
        }
      } else { sig = ''; lastRound = -1; clearInterval(timerId); clearTimeout(resend); }
    },
    draw() { draw(); }
  };

  const dot = (p, ring) => `<span class="gdot${ring ? ' me' : ''}" style="--c:${esc(p.color)}" title="${esc(p.name)}">${esc(p.name.slice(0, 1).toUpperCase())}</span>`;
  const byScore = (a, b) => b.score - a.score;

  function board(meId) {
    const H = g.half;
    const bombs = new Set(g.bombs.map((b) => b.join(',')));
    let h = `<div class="bb" style="--n:${2 * H + 2}">`;
    for (let y = H; y >= -H; y--) {
      h += `<i class="ax">${y}</i>`;
      for (let x = -H; x <= H; x++) {
        const bomb = g.phase !== 'intro' && bombs.has(`${x},${y}`);
        let inner = bomb ? '<b class="bomb">💣</b>' : '';
        g.players.filter((p) => p.x === x && p.y === y && (!meId || p.id === meId)).forEach((p) => { inner += dot(p, p.id === meId); });
        if (g.phase === 'result') g.players.filter((p) => p.result === 'boom' && p.tx === x && p.ty === y && (!meId || p.id === meId)).forEach(() => { inner += '<b class="boom">💥</b>'; });
        h += `<div class="cell${bomb ? ' danger' : ''}${x === 0 || y === 0 ? ' axis' : ''}">${inner}</div>`;
      }
    }
    h += '<i class="ax"></i>';
    for (let x = -H; x <= H; x++) h += `<i class="ax">${x}</i>`;
    return h + '</div>';
  }

  const timerBlock = () => '<div class="tbar"><span id="tfill"></span></div><div class="tsec" id="tsec"></div>';
  function tick() {
    if (!g) return;
    const left = Math.max(0, (g.endsAt - (Date.now() + offset)) / 1000);
    const total = Math.max(1, (g.durationMs || 1000) / 1000);
    const fill = document.getElementById('tfill'), sec = document.getElementById('tsec');
    if (fill) fill.style.width = `${Math.min(100, (left / total) * 100)}%`;
    if (sec) sec.textContent = g.phase === 'end' ? '' : `${Math.ceil(left)} s`;
  }

  function hostView() {
    const ranking = [...g.players].sort(byScore);
    const titles = { intro: '¡Prepárense!', input: '¡Salven sus casillas!', result: 'Resultado de la ronda', end: '¡Tenemos ganador!' };
    const winners = g.players.filter((p) => g.winners.includes(p.id));
    const side = g.phase === 'end'
      ? `<div class="winner">🏆<h2>${winners.map((p) => esc(p.name)).join(' y ') || 'Nadie'}</h2></div>`
      : `<p class="rule">Escribe en tu teléfono el vector de traslación <strong>(a, b)</strong> que te lleve desde tu casilla a una casilla sin bomba. <strong>a</strong> mueve en horizontal (x) y <strong>b</strong> en vertical (y).<br>Nueva posición = <strong>(x + a, y + b)</strong>. Si caes en una bomba o sales del tablero no sumas, pero sigues jugando.<br>Salvarse da 100 puntos más hasta 100 por rapidez.</p>`;
    const list = ranking.slice(0, 10).map((p, i) => {
      const mark = g.phase === 'input' ? (p.submitted ? ' ✓' : '') : '';
      const res = g.phase === 'result' ? (p.result === 'safe' ? `<small class="ok">${p.gain ? `+${p.gain}` : '✓'}</small>` : `<small class="bad">${p.result === 'out' ? 'fuera' : '💥'}</small>`) : '';
      return `<li><span class="t-pos">${i + 1}</span><span class="t-dotc" style="--c:${esc(p.color)}"></span><span class="t-nm">${esc(p.name)}${mark}</span><span class="t-pts">${p.score} ${res}</span></li>`;
    }).join('');
    const answered = g.players.filter((p) => p.submitted).length;
    return `
      <div class="lobby-heading"><div><span class="eyebrow">BOMBAS DE TRASLACIÓN · RONDA ${g.round || 1} DE ${g.rounds}</span><h1>${titles[g.phase]}</h1></div><span class="state-pill">${g.phase === 'input' ? `${answered} DE ${g.players.length} LISTOS` : `${g.players.length} JUGANDO`}</span></div>
      <div class="gm-layout">
        <section class="panel gm-board">${board(null)}${g.phase === 'end' ? '' : timerBlock()}</section>
        <aside class="panel gm-side">${side}
          <h3>Puntajes</h3><ul class="mm-rank">${list}</ul>
        </aside>
      </div>
      ${g.phase === 'end' ? TP.switchPicker('bombs') : ''}
      ${TP.playersPanel()}
      <section class="host-controls panel"><div class="control-copy"><strong>Controles del profesor</strong><span>Las rondas avanzan solas: menos tiempo y más bombas en cada una. Nadie queda eliminado.</span></div>
        <div class="control-buttons">${g.phase === 'end' ? '<button class="button" id="gRestart" type="button">Jugar otra vez</button>' : ''}<button class="button secondary" id="gLobby" type="button">↶ Volver al lobby</button><button class="button danger" id="gEnd" type="button">Terminar sala</button></div></section>`;
  }

  function playerView() {
    const me = g.players.find((p) => p.id === (TP.player && TP.player.id));
    if (!me) return '<section class="started-card panel"><h1>Mira el proyector.</h1></section>';
    const head = `<div class="t-top"><span class="room-badge" style="--c:${esc(me.color)}">● ${esc(me.name)}</span><span class="t-score">⭐ ${me.score}</span></div>`;
    let body;
    if (g.phase === 'end') {
      const rank = 1 + g.players.filter((p) => p.score > me.score).length;
      body = `<h1>${rank === 1 ? '🏆 ¡Ganaste!' : `Quedaste en el lugar ${rank}`}</h1><p>Puntaje final: <strong>${me.score}</strong>. Mira el proyector para ver el podio.</p><p>${esc(TP.sessionLine(me.id))}</p>`;
    } else if (g.phase === 'intro') {
      body = `<h1>¡Prepárate!</h1><p>Estás en <strong>(${me.x}, ${me.y})</strong>. Pronto aparecerán bombas. Entre más rápido envíes un vector seguro, más puntos ganas.</p>`;
    } else if (g.phase === 'result') {
      if (me.result === null) body = `<h1>👋 ¡Entraste a la partida!</h1><p>Esta ronda ya terminó. Estás en <strong>(${me.x}, ${me.y})</strong> y juegas desde la próxima.</p>`;
      else if (me.result === 'safe') body = `<h1>🎉 ¡Salvado! ${me.gain ? `+${me.gain}` : ''}</h1><p>Ahora estás en <strong>(${me.x}, ${me.y})</strong>.${me.gain ? '' : ' No enviaste vector, así que no sumas puntos.'} Prepárate para la siguiente ronda.</p>`;
      else body = `<h1>💥 ${me.result === 'out' ? 'Saliste del tablero' : 'Caíste en una bomba'}</h1><p>Esta ronda no sumas, pero sigues jugando desde <strong>(${me.x}, ${me.y})</strong>. ¡La próxima es tuya!</p>`;
    } else {
      body = `<p class="pos">Estás en <strong>(${me.x}, ${me.y})</strong></p>${board(me.id)}${timerBlock()}
      <div class="steppers">${['dx', 'dy'].map((k) => `<div class="stp"><span>${k === 'dx' ? 'a · horizontal (x)' : 'b · vertical (y)'}</span><div><button type="button" data-k="${k}" data-d="-1">−</button><output id="v${k}">${k === 'dx' ? dx : dy}</output><button type="button" data-k="${k}" data-d="1">+</button></div></div>`).join('')}</div>
      <button class="button join-submit" id="gSend" type="button">${sent ? 'Enviado ✓ (puedes cambiarlo)' : 'Enviar vector'}</button>`;
    }
    return `<section class="gm-phone panel">${g.phase === 'input' ? `<span class="room-badge" style="--c:${esc(me.color)}">● ${esc(me.name)}</span>` : head}${body}</section>`;
  }

  // Con mala señal el envío puede perderse: si el servidor no confirma, se reenvía una vez.
  function sendVector() {
    socket.emit('game:submit', { code: TP.room.code, dx, dy });
    sent = true;
    clearTimeout(resend);
    const round = lastRound;
    resend = setTimeout(() => {
      const me = g && g.players.find((p) => p.id === (TP.player && TP.player.id));
      if (g && g.phase === 'input' && g.round === round && me && !me.submitted) socket.emit('game:submit', { code: TP.room.code, dx, dy });
    }, 1500);
  }

  function draw() {
    if (!g || !TP.role) return;
    clearInterval(timerId);
    const host = TP.role === 'host';
    app.innerHTML = host ? hostView() : playerView();
    if (host) {
      const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
      on('gRestart', () => TP.hostAction('restart'));
      on('gLobby', () => TP.hostAction('reset'));
      TP.bindSwitchPicker(app);
      on('gEnd', () => { if (window.confirm('¿Terminar esta sala?')) TP.hostAction('end'); });
    } else {
      app.querySelectorAll('.steppers button').forEach((b) => b.addEventListener('click', () => {
        const d = Number(b.dataset.d);
        if (b.dataset.k === 'dx') dx = Math.max(-9, Math.min(9, dx + d)); else dy = Math.max(-9, Math.min(9, dy + d));
        document.getElementById('vdx').textContent = dx; document.getElementById('vdy').textContent = dy;
        sent = false; const s = document.getElementById('gSend'); if (s) s.textContent = 'Enviar vector';
      }));
      const send = document.getElementById('gSend');
      if (send) send.addEventListener('click', () => { sendVector(); send.textContent = 'Enviado ✓ (puedes cambiarlo)'; });
    }
    timerId = setInterval(tick, 200); tick();
  }
})();
