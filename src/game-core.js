// Игровое ЯДРО «Диагноз и лекарство».
//
// Чистая логика: правила, колоды, подсчёт очков, резолв ключа ответов.
// НИЧЕГО не знает про DOM и про сеть — поэтому одинаково работает в браузере
// (LocalTransport) и на сервере (NetworkTransport, Этап 2), и тестируется
// напрямую через node:test без всякого окружения.
//
// Стиль — редьюсер: createGame(...) → state; reduce(state, move) → nextState.
// Тот же reduce крутится и локально, и на сервере — состояние всегда выводимо
// из последовательности ходов.

import { templates, symptoms, templateById, symptomById } from './cards.js';

// --- утилиты ---

// Детерминируемый shuffle (Fisher–Yates) с инъекцией rng — для тестов.
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isHeavy(cardId) {
  return !!(templateById[cardId] && templateById[cardId].heavy);
}

// --- ПОДСЧЁТ ОЧКОВ (чистая функция, сердце правил) ---
//
// Возвращает { points, kind, verdict } для сыгранного набора карт на симптоме.
//   kind: 'best' | 'combo-full' | 'combo-partial' | 'alt' | 'miss'
//       | 'trap-best' | 'trap-bad' | 'trap-alt' | 'trap-miss' | 'empty'
export function scorePlay(symptom, selected) {
  const picked = selected || [];
  const r = (points, kind, verdict) => ({ points, kind, verdict });

  if (picked.length === 0) return r(0, 'empty', 'Ничего не выбрано.');

  const inBest = picked.some(id => symptom.best.includes(id));
  const inAlt = picked.some(id => symptom.alt.includes(id));

  // Ловушка: лучшее лечение — НЕ усложнять.
  if (symptom.trap) {
    const heavyOffenders = picked.filter(id => isHeavy(id) && !symptom.best.includes(id));
    if (heavyOffenders.length > 0) {
      return r(-2, 'trap-bad', '🪤 Оверинжиниринг на ловушке: тяжёлый шаблон там, где надо было НЕ усложнять.');
    }
    if (inBest) return r(3, 'trap-best', '✂️ Сдержанность — верно: лучшее лекарство здесь в том, чтобы не усложнять.');
    if (inAlt) return r(2, 'trap-alt', 'Допустимо, но не идеал.');
    return r(0, 'trap-miss', 'Лечит не то.');
  }

  // Комбо: лечится связкой карт.
  if (symptom.combo) {
    const need = symptom.best;
    const pickedBest = need.filter(id => picked.includes(id));
    if (need.length > 0 && pickedBest.length === need.length) {
      return r(5, 'combo-full', '💊 Полное комбо — лучшее лечение (+3) и бонус за связку (+2).');
    }
    if (pickedBest.length > 0) {
      return r(2, 'combo-partial', 'Половина связки — частичный балл. Не хватает карт комбо.');
    }
    if (inAlt) return r(2, 'alt', '✅ Допустимая альтернатива.');
    return r(0, 'miss', '⚠️ Лечит симптом, а не причину.');
  }

  // Обычный симптом.
  if (inBest) return r(3, 'best', '💊 Точное лекарство.');
  if (inAlt) return r(2, 'alt', '✅ Допустимая альтернатива с обоснованием.');
  return r(0, 'miss', '⚠️ Лечит симптом, а не причину.');
}

// Развёрнутый ключ ответов для показа на вердикте.
export function answerKey(symptom) {
  const names = ids => ids.map(id => (templateById[id] ? templateById[id].name : id));
  return {
    best: names(symptom.best),
    alt: names(symptom.alt),
    bad: names(symptom.bad || []),
    note: symptom.note || '',
    combo: !!symptom.combo,
    trap: !!symptom.trap,
  };
}

// --- СОЗДАНИЕ ИГРЫ ---
//
// opts: { mode: 'solo'|'hotseat', players: [names], symptomsPerGame, rng }
export function createGame(opts = {}) {
  const mode = opts.mode === 'hotseat' ? 'hotseat' : 'solo';
  const rng = opts.rng || Math.random;
  const names = (opts.players && opts.players.length)
    ? opts.players
    : (mode === 'hotseat' ? ['Игрок 1', 'Игрок 2'] : ['Игрок']);

  const deckIds = shuffle(symptoms.map(s => s.id), rng);
  const perGame = Math.min(opts.symptomsPerGame || 10, deckIds.length);

  return {
    mode,
    players: names.map((name, i) => ({ id: 'p' + i, name, score: 0 })),
    currentPlayerIdx: 0,
    round: 0,
    totalRounds: perGame,
    deck: deckIds.slice(0, perGame),   // оставшиеся к раздаче
    currentSymptom: null,              // id
    selected: [],                      // id шаблонов, временно выложенных
    revealed: false,
    lastResult: null,                  // { points, kind, verdict, key, player, symptom, cards }
    history: [],                       // лента «вылеченных»
    phase: 'draw',                     // 'draw' | 'play' | 'revealed' | 'over'
  };
}

// --- РЕДЬЮСЕР ---
//
// move: { type: 'draw' }
//     | { type: 'toggle', cardId }
//     | { type: 'reveal' }
//     | { type: 'next' }
export function reduce(state, move) {
  const s = clone(state);
  switch (move.type) {
    case 'draw': {
      if (s.phase !== 'draw' || s.deck.length === 0) return state;
      s.currentSymptom = s.deck.shift();
      s.selected = [];
      s.revealed = false;
      s.lastResult = null;
      s.phase = 'play';
      return s;
    }

    case 'toggle': {
      if (s.phase !== 'play') return state;
      const i = s.selected.indexOf(move.cardId);
      if (i >= 0) s.selected.splice(i, 1);
      else s.selected.push(move.cardId);
      return s;
    }

    case 'reveal': {
      if (s.phase !== 'play' || !s.currentSymptom) return state;
      const sym = symptomById[s.currentSymptom];
      const res = scorePlay(sym, s.selected);
      const player = s.players[s.currentPlayerIdx];
      player.score += res.points;
      s.lastResult = {
        ...res,
        key: answerKey(sym),
        playerId: player.id,
        playerName: player.name,
        symptomId: sym.id,
        symptomTitle: sym.title,
        cards: s.selected.slice(),
      };
      s.history.push({
        round: s.round + 1,
        playerName: player.name,
        symptomId: sym.id,
        symptomTitle: sym.title,
        cards: s.selected.slice(),
        points: res.points,
        kind: res.kind,
      });
      s.revealed = true;
      s.phase = 'revealed';
      return s;
    }

    case 'next': {
      if (s.phase !== 'revealed') return state;
      s.round += 1;
      s.currentSymptom = null;
      s.selected = [];
      s.revealed = false;
      s.lastResult = null;
      if (s.mode === 'hotseat') {
        s.currentPlayerIdx = (s.currentPlayerIdx + 1) % s.players.length;
      }
      s.phase = (s.round >= s.totalRounds || s.deck.length === 0) ? 'over' : 'draw';
      return s;
    }

    default:
      return state;
  }
}

export function isOver(state) {
  return state.phase === 'over';
}

export function winners(state) {
  const max = Math.max(...state.players.map(p => p.score));
  return state.players.filter(p => p.score === max);
}

// Глубокая копия состояния (структура простая: объекты/массивы/примитивы).
function clone(state) {
  return {
    ...state,
    players: state.players.map(p => ({ ...p })),
    deck: state.deck.slice(),
    selected: state.selected.slice(),
    history: state.history.map(h => ({ ...h, cards: h.cards.slice() })),
    lastResult: state.lastResult ? { ...state.lastResult } : null,
  };
}

// Реэкспорт данных для удобства потребителей ядра.
export { templates, symptoms, templateById, symptomById };
