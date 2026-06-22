// UI «Диагноз и лекарство».
//
// Рендер и взаимодействие. Работает ТОЛЬКО через транспорт (getState / applyMove /
// subscribe) — не знает, локальная игра или сетевая. Никакой игровой логики здесь
// нет, она вся в ядре; UI лишь отражает state и шлёт ходы.

import { templates, symptoms, isHeavy, answerKey } from './game-core.js';
import { LocalTransport } from './transport-local.js';
import { rulesHTML } from './rules.js';

// Цвет-акцент и эмодзи по группе шаблонов (только для вида).
const GROUP_META = {
  'Устойчивость':       { color: '#0f9b8e', emoji: '🛡' },
  'Данные / связь':     { color: '#2f6fdb', emoji: '🗄' },
  'Границы':            { color: '#7d4bd1', emoji: '🔗' },
  'Безопасность':       { color: '#d2444a', emoji: '🔐' },
  'Процесс':            { color: '#d98324', emoji: '🏢' },
  'Стили архитектуры':  { color: '#4f57c4', emoji: '🏛' },
  'Практики':           { color: '#2e9e57', emoji: '🛠' },
  'Сдержанность':       { color: '#b08400', emoji: '🪤' },
};
const groupMeta = g => GROUP_META[g] || { color: '#888', emoji: '🎴' };

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class App {
  constructor(root) {
    this.root = root;
    this.transport = null;
    this.unsub = null;
    this.filter = '';
    this.screen = 'setup'; // 'setup' | 'game'
    this.timer = { sec: 0, handle: null };
    this.renderSetup();
  }

  // --- запуск партии ---
  start(opts) {
    if (this.unsub) this.unsub();
    this.transport = new LocalTransport(opts);
    this.unsub = this.transport.subscribe(() => this.renderGame());
    this.screen = 'game';
    this.filter = '';
    this.renderGame();
  }

  move(m) { this.transport.applyMove(m); }

  // --- модальные окна (правила и справочник-ключ лежат прямо в игре) ---
  openModal(title, contentNode) {
    this.closeModal();
    const overlay = el('div', 'modal-overlay');
    overlay.id = 'modal';
    const box = el('div', 'modal');
    const head = el('div', 'modal-head', `<h2>${esc(title)}</h2>`);
    const close = el('button', 'btn btn-ghost modal-x', '✕');
    close.addEventListener('click', () => this.closeModal());
    head.appendChild(close);
    box.appendChild(head);
    const body = el('div', 'modal-body');
    body.appendChild(contentNode);
    box.appendChild(body);
    overlay.appendChild(box);
    overlay.addEventListener('click', e => { if (e.target === overlay) this.closeModal(); });
    document.body.appendChild(overlay);
    this._escHandler = e => { if (e.key === 'Escape') this.closeModal(); };
    document.addEventListener('keydown', this._escHandler);
  }
  closeModal() {
    const m = document.getElementById('modal');
    if (m) m.remove();
    if (this._escHandler) { document.removeEventListener('keydown', this._escHandler); this._escHandler = null; }
  }

  showRules() {
    this.openModal('Правила', el('div', 'rules', rulesHTML));
  }

  // Справочник-ключ: все симптомы с лучшими/допустимыми/вредными лекарствами.
  showReference() {
    const wrap = el('div', 'reference');
    wrap.appendChild(el('p', 'ref-intro',
      'Полный ключ ответов — шпаргалка ведущего и материал для разбора. 💊 лучшее · ✅ допустимо · ⚠️ соблазн.'));
    const cats = [...new Set(symptoms.map(s => s.cat))];
    cats.forEach(cat => {
      wrap.appendChild(el('h3', 'ref-cat', esc(cat)));
      symptoms.filter(s => s.cat === cat).forEach(s => {
        const k = answerKey(s);
        const item = el('div', `ref-item ${s.trap ? 'trap' : ''}`);
        item.innerHTML = `
          <div class="ref-title"><b>${esc(s.id)}</b> ${esc(s.title)}
            ${s.combo ? '<span class="ref-flag combo">🔗 комбо</span>' : ''}
            ${s.trap ? '<span class="ref-flag trap">🪤 ловушка</span>' : ''}</div>
          <div class="ref-text">${esc(s.text)}</div>
          <div class="ref-key">
            <span class="key-tag best">💊</span> ${k.best.map(esc).join(', ') || '—'}
            &nbsp; <span class="key-tag alt">✅</span> ${k.alt.map(esc).join(', ') || '—'}
            ${k.bad.length ? `&nbsp; <span class="key-tag warn">⚠️</span> ${k.bad.map(esc).join(', ')}` : ''}
          </div>
          <div class="ref-note">${esc(k.note)}</div>
        `;
        wrap.appendChild(item);
      });
    });
    this.openModal('🔑 Справочник — ключ ответов', wrap);
  }

  // --- таймер раунда (только индикатор; принцип проекта №4) ---
  resetTimer(run) {
    clearInterval(this.timer.handle);
    this.timer.sec = 0;
    this.timer.handle = null;
    if (run) {
      this.timer.handle = setInterval(() => {
        this.timer.sec++;
        const t = this.root.querySelector('#timer');
        if (t) {
          t.textContent = this.fmtTime(this.timer.sec);
          t.classList.toggle('over', this.timer.sec > 90);
        }
      }, 1000);
    }
  }
  fmtTime(s) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

  // ===================== ЭКРАН НАСТРОЙКИ =====================
  renderSetup() {
    this.resetTimer(false);
    this.root.innerHTML = '';
    const wrap = el('div', 'setup');
    wrap.innerHTML = `
      <h1>🩺 Тыжархитектор</h1>
      <p class="subtitle">диагноз и лекарство</p>
      <p class="tagline">Тяни симптом системы → подбери шаблон-лекарство → узнай цену. Половина соблазнов лечит не то.</p>
      <div class="setup-card">
        <label class="field">
          <span>Режим</span>
          <select id="mode">
            <option value="solo">🧍 Соло — пасьянс против ключа ответов</option>
            <option value="hotseat">👥 Хотсит — по очереди за общим экраном</option>
          </select>
        </label>
        <div id="players-block" class="field hidden">
          <span>Игроки (по одному в строке)</span>
          <textarea id="players" rows="4" placeholder="Аня&#10;Бен&#10;Вера"></textarea>
        </div>
        <label class="field">
          <span>Симптомов в партии: <b id="cnt-label">10</b></span>
          <input type="range" id="cnt" min="4" max="32" value="10">
        </label>
        <button id="start" class="btn btn-primary">Начать партию ▸</button>
      </div>
      <div class="setup-links">
        <button id="rules" class="btn btn-ghost">📖 Правила</button>
        <button id="ref" class="btn btn-ghost">🔑 Справочник-ключ</button>
      </div>
      <p class="hint">🌐 Мультиплеер со скрытыми руками — Этап 2 (см. README). Сейчас доступны соло и хотсит.</p>
    `;
    this.root.appendChild(wrap);

    wrap.querySelector('#rules').addEventListener('click', () => this.showRules());
    wrap.querySelector('#ref').addEventListener('click', () => this.showReference());

    const mode = wrap.querySelector('#mode');
    const pb = wrap.querySelector('#players-block');
    mode.addEventListener('change', () => pb.classList.toggle('hidden', mode.value !== 'hotseat'));
    const cnt = wrap.querySelector('#cnt');
    cnt.addEventListener('input', () => { wrap.querySelector('#cnt-label').textContent = cnt.value; });

    wrap.querySelector('#start').addEventListener('click', () => {
      const m = mode.value;
      let players;
      if (m === 'hotseat') {
        players = wrap.querySelector('#players').value.split('\n').map(s => s.trim()).filter(Boolean);
        if (players.length < 2) players = ['Игрок 1', 'Игрок 2'];
      } else {
        players = ['Игрок'];
      }
      this.start({ mode: m, players, symptomsPerGame: Number(cnt.value) });
    });
  }

  // ===================== ЭКРАН ИГРЫ =====================
  renderGame() {
    const s = this.transport.getState();
    this.root.innerHTML = '';
    const app = el('div', 'game');

    app.appendChild(this.renderHeader(s));

    if (s.phase === 'over') {
      app.appendChild(this.renderOver(s));
      this.resetTimer(false);
      this.root.appendChild(app);
      return;
    }

    const board = el('div', 'board');
    board.appendChild(this.renderStage(s));   // симптом + вердикт + кнопки
    board.appendChild(this.renderFan(s));      // веер шаблонов
    app.appendChild(board);

    if (s.history.length) app.appendChild(this.renderHistory(s));

    this.root.appendChild(app);

    // таймер: бежит во время выбора лекарства
    if (s.phase === 'play') this.resetTimer(true);
    else this.resetTimer(false);
  }

  renderHeader(s) {
    const h = el('header', 'topbar');
    const players = s.players.map(p => {
      const active = s.players[s.currentPlayerIdx].id === p.id && s.mode === 'hotseat';
      return `<div class="score ${active ? 'active' : ''}"><span class="pn">${esc(p.name)}</span><b>${p.score}</b></div>`;
    }).join('');
    h.innerHTML = `
      <div class="brand">🩺 Тыжархитектор</div>
      <div class="meta">
        <span class="pill">Раунд ${Math.min(s.round + 1, s.totalRounds)}/${s.totalRounds}</span>
        <span class="pill">⏱ <span id="timer">00:00</span></span>
        ${s.mode === 'hotseat' ? `<span class="pill">Ходит: <b>${esc(s.players[s.currentPlayerIdx].name)}</b></span>` : `<span class="pill">🧍 Соло</span>`}
      </div>
      <div class="scores">${players}</div>
      <div class="topbar-btns">
        <button id="rules" class="btn btn-ghost" title="Правила">📖</button>
        <button id="ref" class="btn btn-ghost" title="Ключ ответов">🔑</button>
        <button id="quit" class="btn btn-ghost">Выйти</button>
      </div>
    `;
    h.querySelector('#rules').addEventListener('click', () => this.showRules());
    h.querySelector('#ref').addEventListener('click', () => this.showReference());
    h.querySelector('#quit').addEventListener('click', () => { this.closeModal(); this.renderSetup(); });
    return h;
  }

  renderStage(s) {
    const stage = el('section', 'stage');

    if (s.phase === 'draw') {
      const d = el('div', 'draw-pile');
      d.innerHTML = `<div class="card-back">🃏</div><button id="draw" class="btn btn-primary">Вытянуть симптом</button>`;
      d.querySelector('#draw').addEventListener('click', () => this.move({ type: 'draw' }));
      stage.appendChild(d);
      return stage;
    }

    const sym = symptomFull(s.currentSymptom);
    const symCard = el('div', `symptom ${sym.trap ? 'is-trap' : ''}`);
    symCard.innerHTML = `
      <div class="sym-cat">${esc(sym.cat)} · ${sym.id}</div>
      <h2 class="sym-title">${esc(sym.title)}</h2>
      <p class="sym-text">${esc(sym.text)}</p>
      ${sym.combo ? `<div class="sym-flag combo">🔗 лечится связкой карт</div>` : ''}
      ${sym.trap ? `<div class="sym-flag trap">🪤 возможно, лучшее лекарство — НЕ усложнять</div>` : ''}
    `;
    stage.appendChild(symCard);

    // выбранные карты
    const sel = el('div', 'selected-row');
    if (s.selected.length === 0) {
      sel.innerHTML = `<span class="placeholder">Выбери лекарство в колоде ниже…</span>`;
    } else {
      sel.appendChild(el('span', 'sel-label', 'Лечу: '));
      s.selected.forEach(id => {
        const t = templates.find(x => x.id === id);
        const chip = el('span', 'chip', `${esc(t.name)} ✕`);
        chip.style.borderColor = groupMeta(t.group).color;
        if (s.phase === 'play') chip.addEventListener('click', () => this.move({ type: 'toggle', cardId: id }));
        sel.appendChild(chip);
      });
    }
    stage.appendChild(sel);

    // кнопки фазы
    const actions = el('div', 'actions');
    if (s.phase === 'play') {
      const reveal = el('button', 'btn btn-primary', s.mode === 'solo' ? 'Открыть ключ' : 'Поставить диагноз');
      reveal.disabled = s.selected.length === 0;
      reveal.addEventListener('click', () => this.move({ type: 'reveal' }));
      actions.appendChild(reveal);
    } else if (s.phase === 'revealed') {
      const next = el('button', 'btn btn-primary', s.round + 1 >= s.totalRounds ? 'Итоги ▸' : 'Дальше ▸');
      next.addEventListener('click', () => this.move({ type: 'next' }));
      actions.appendChild(next);
    }
    stage.appendChild(actions);

    if (s.phase === 'revealed') stage.appendChild(this.renderVerdict(s));
    return stage;
  }

  renderVerdict(s) {
    const r = s.lastResult;
    const cls = r.points > 0 ? 'good' : (r.points < 0 ? 'bad' : 'neutral');
    const v = el('div', `verdict ${cls}`);
    const sign = r.points > 0 ? '+' : '';
    v.innerHTML = `
      <div class="verdict-head">
        <span class="pts">${sign}${r.points}</span>
        <span class="verdict-text">${esc(r.verdict)}</span>
      </div>
      <div class="key">
        <div class="key-row"><span class="key-tag best">💊 лучшее</span> ${r.key.best.map(esc).join(', ') || '—'}</div>
        <div class="key-row"><span class="key-tag alt">✅ допустимо</span> ${r.key.alt.map(esc).join(', ') || '—'}</div>
        ${r.key.bad.length ? `<div class="key-row"><span class="key-tag warn">⚠️ соблазн</span> ${r.key.bad.map(esc).join(', ')}</div>` : ''}
        <div class="key-note">${esc(r.key.note)}</div>
      </div>
    `;
    return v;
  }

  renderFan(s) {
    const fan = el('section', 'fan');
    const head = el('div', 'fan-head');
    head.innerHTML = `<h3>🎴 Колода лекарств</h3>`;
    const search = el('input', 'search');
    search.placeholder = 'Поиск шаблона…';
    search.value = this.filter;
    search.addEventListener('input', () => {
      this.filter = search.value.toLowerCase();
      this.refilterFan(s);
    });
    head.appendChild(search);
    fan.appendChild(head);

    const grid = el('div', 'fan-grid');
    grid.id = 'fan-grid';
    fan.appendChild(grid);
    this.fillFan(grid, s);
    return fan;
  }

  refilterFan(s) {
    const grid = this.root.querySelector('#fan-grid');
    if (grid) { grid.innerHTML = ''; this.fillFan(grid, s); }
  }

  fillFan(grid, s) {
    const interactive = s.phase === 'play';
    const f = this.filter;
    const groups = [...new Set(templates.map(t => t.group))];
    groups.forEach(g => {
      const list = templates.filter(t => t.group === g &&
        (!f || t.name.toLowerCase().includes(f) || t.cures.toLowerCase().includes(f)));
      if (!list.length) return;
      const gm = groupMeta(g);
      const sec = el('div', 'fan-group');
      sec.appendChild(el('div', 'fan-group-title', `${gm.emoji} ${esc(g)}`));
      const cards = el('div', 'cards');
      list.forEach(t => {
        const chosen = s.selected.includes(t.id);
        const c = el('button', `tcard ${chosen ? 'chosen' : ''} ${t.restraint ? 'restraint' : ''} ${isHeavy(t.id) ? 'heavy' : ''}`);
        c.style.setProperty('--accent', gm.color);
        c.innerHTML = `
          <span class="tcard-name">${esc(t.name)}</span>
          <span class="tcard-cures">${esc(t.cures)}</span>
          <span class="tcard-cost">цена: ${esc(t.cost)}</span>
        `;
        if (interactive) c.addEventListener('click', () => this.move({ type: 'toggle', cardId: t.id }));
        else c.disabled = true;
        cards.appendChild(c);
      });
      sec.appendChild(cards);
      grid.appendChild(sec);
    });
  }

  renderHistory(s) {
    const sec = el('section', 'history');
    sec.appendChild(el('h3', null, '✅ Вылеченные'));
    const lane = el('div', 'lane');
    s.history.slice().reverse().forEach(h => {
      const cls = h.points > 0 ? 'good' : (h.points < 0 ? 'bad' : 'neutral');
      const item = el('div', `hist ${cls}`);
      const cards = h.cards.map(id => { const t = templates.find(x => x.id === id); return t ? t.name : id; }).join(' + ') || '—';
      item.innerHTML = `<b>${esc(h.symptomId)}</b> ${esc(h.symptomTitle)}<br><span class="hist-cards">${esc(cards)}</span><span class="hist-pts">${h.points > 0 ? '+' : ''}${h.points}</span>`;
      lane.appendChild(item);
    });
    sec.appendChild(lane);
    return sec;
  }

  renderOver(s) {
    const over = el('section', 'over');
    const max = Math.max(...s.players.map(p => p.score));
    const board = s.players.slice().sort((a, b) => b.score - a.score).map(p =>
      `<div class="final ${p.score === max ? 'win' : ''}"><span>${p.score === max ? '🏆 ' : ''}${esc(p.name)}</span><b>${p.score}</b></div>`
    ).join('');
    over.innerHTML = `
      <h2>Партия окончена</h2>
      <div class="final-board">${board}</div>
      <div class="over-actions">
        <button id="again" class="btn btn-primary">Ещё партия</button>
        <button id="menu" class="btn btn-ghost">В меню</button>
      </div>
      <p class="hint">Разбери ленту «Вылеченные»: где ловушки требовали НЕ усложнять, а где одиночная карта не лечила без связки.</p>
    `;
    over.querySelector('#again').addEventListener('click', () => this.transport.restart());
    over.querySelector('#menu').addEventListener('click', () => this.renderSetup());
    return over;
  }
}

// Полные данные симптома (UI не лезет в cards.js напрямую — через ядро-реэкспорт).
import { symptomById } from './game-core.js';
function symptomFull(id) { return symptomById[id]; }
