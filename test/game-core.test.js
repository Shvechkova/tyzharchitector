// Тесты игрового ядра. Без зависимостей: встроенные node:test + node:assert.
// Запуск:  node --test     (из корня репозитория)
//
// Ядро чистое (без DOM/сети), поэтому проверяется напрямую.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  scorePlay, answerKey, createGame, reduce, isOver, winners, shuffle,
} from '../src/game-core.js';
import { symptomById } from '../src/cards.js';
import { LocalTransport } from '../src/transport-local.js';

const S = id => symptomById[id];

// ---------- ПОДСЧЁТ ОЧКОВ ----------

test('точное лекарство = +3', () => {
  const r = scorePlay(S('S8'), ['idempotency']); // S8: best idempotency
  assert.equal(r.points, 3);
  assert.equal(r.kind, 'best');
});

test('допустимая альтернатива = +2', () => {
  const r = scorePlay(S('S11'), ['cache-cdn']); // S11: alt cache-cdn
  assert.equal(r.points, 2);
  assert.equal(r.kind, 'alt');
});

test('лечит симптом, а не причину = 0', () => {
  const r = scorePlay(S('S8'), ['cache-cdn']); // не из best/alt
  assert.equal(r.points, 0);
  assert.equal(r.kind, 'miss');
});

test('пустой выбор = 0', () => {
  const r = scorePlay(S('S8'), []);
  assert.equal(r.points, 0);
  assert.equal(r.kind, 'empty');
});

// ---------- КОМБО ----------

test('полное комбо = +5 (лучшее +3 и бонус +2)', () => {
  const r = scorePlay(S('S6'), ['timeout', 'circuit-breaker', 'bulkhead']);
  assert.equal(r.points, 5);
  assert.equal(r.kind, 'combo-full');
});

test('половина комбо = +2 (частичный балл)', () => {
  const r = scorePlay(S('S6'), ['timeout']);
  assert.equal(r.points, 2);
  assert.equal(r.kind, 'combo-partial');
});

// ---------- АНТИДОТ ОВЕРИНЖИНИРИНГА (ловушки) ----------

test('тяжёлый шаблон на ловушке = −2', () => {
  const r = scorePlay(S('S23'), ['cqrs']); // S23 trap, cqrs heavy
  assert.equal(r.points, -2);
  assert.equal(r.kind, 'trap-bad');
});

test('карта сдержанности на ловушке = +3', () => {
  const r = scorePlay(S('S23'), ['keep-monolith']); // best на ловушке
  assert.equal(r.points, 3);
  assert.equal(r.kind, 'trap-best');
});

test('допустимый скромный стиль на ловушке = +2', () => {
  const r = scorePlay(S('S23'), ['n-tier']); // alt на ловушке
  assert.equal(r.points, 2);
  assert.equal(r.kind, 'trap-alt');
});

test('space-based на ловушке S32 = −2', () => {
  const r = scorePlay(S('S32'), ['space-based']);
  assert.equal(r.points, -2);
});

test('скромный стиль на ловушке S32 = +3', () => {
  const r = scorePlay(S('S32'), ['n-tier']); // best на S32
  assert.equal(r.points, 3);
  assert.equal(r.kind, 'trap-best');
});

// ---------- РЕЗОЛВ КЛЮЧА ----------

test('answerKey отдаёт имена шаблонов и флаги', () => {
  const k = answerKey(S('S6'));
  assert.ok(k.best.includes('Тайм-аут'));
  assert.equal(k.combo, true);
  assert.equal(k.trap, false);
  assert.equal(typeof k.note, 'string');
});

test('каждый симптом имеет непустой best и валидные id', () => {
  for (const id of Object.keys(symptomById)) {
    const s = symptomById[id];
    assert.ok(Array.isArray(s.best) && s.best.length > 0, `${id}: best пуст`);
  }
});

// ---------- РАЗДАЧА / КОЛОДА ----------

test('drawSymptom не повторяет карты, колода = symptomsPerGame', () => {
  let st = createGame({ mode: 'solo', symptomsPerGame: 8, rng: seeded(42) });
  const drawn = [];
  while (!isOver(st)) {
    st = reduce(st, { type: 'draw' });
    drawn.push(st.currentSymptom);
    st = reduce(st, { type: 'toggle', cardId: 'idempotency' });
    st = reduce(st, { type: 'reveal' });
    st = reduce(st, { type: 'next' });
  }
  assert.equal(drawn.length, 8);
  assert.equal(new Set(drawn).size, 8, 'есть повтор симптома');
});

test('shuffle с фиксированным rng детерминирован и сохраняет состав', () => {
  const a = shuffle([1, 2, 3, 4, 5], seeded(1));
  const b = shuffle([1, 2, 3, 4, 5], seeded(1));
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5]);
});

// ---------- ПОТОК / РЕДЬЮСЕР ----------

test('reveal начисляет очки текущему игроку', () => {
  let st = createGame({ mode: 'solo', symptomsPerGame: 3, rng: seeded(7) });
  st = reduce(st, { type: 'draw' });
  const sym = symptomById[st.currentSymptom];
  st = reduce(st, { type: 'toggle', cardId: sym.best[0] });
  st = reduce(st, { type: 'reveal' });
  assert.ok(st.players[0].score > 0);
  assert.equal(st.phase, 'revealed');
  assert.equal(st.history.length, 1);
});

test('хотсит: ход переходит по кругу на next', () => {
  let st = createGame({ mode: 'hotseat', players: ['A', 'B'], symptomsPerGame: 4, rng: seeded(3) });
  assert.equal(st.currentPlayerIdx, 0);
  st = reduce(st, { type: 'draw' });
  st = reduce(st, { type: 'toggle', cardId: 'idempotency' });
  st = reduce(st, { type: 'reveal' });
  st = reduce(st, { type: 'next' });
  assert.equal(st.currentPlayerIdx, 1);
});

test('игра завершается и определяет победителя', () => {
  let st = createGame({ mode: 'hotseat', players: ['A', 'B'], symptomsPerGame: 2, rng: seeded(9) });
  for (let i = 0; i < 2; i++) {
    st = reduce(st, { type: 'draw' });
    st = reduce(st, { type: 'toggle', cardId: symptomById[st.currentSymptom].best[0] });
    st = reduce(st, { type: 'reveal' });
    st = reduce(st, { type: 'next' });
  }
  assert.equal(isOver(st), true);
  assert.ok(winners(st).length >= 1);
});

// ---------- КОНТРАКТ ТРАНСПОРТА ----------

test('LocalTransport: getState = ядро, subscribe оповещает на ход', () => {
  const tr = new LocalTransport({ mode: 'solo', symptomsPerGame: 5, rng: seeded(11) });
  let notified = 0;
  let last = null;
  const off = tr.subscribe(st => { notified++; last = st; });

  const before = tr.getState();
  assert.equal(before.phase, 'draw');

  tr.applyMove({ type: 'draw' });
  assert.equal(notified, 1);
  assert.equal(last, tr.getState());          // подписчик получил актуальное состояние
  assert.equal(tr.getState().phase, 'play');

  off();
  tr.applyMove({ type: 'toggle', cardId: 'idempotency' });
  assert.equal(notified, 1);                   // после отписки не зовётся
});

test('LocalTransport.restart начинает новую партию', () => {
  const tr = new LocalTransport({ mode: 'solo', symptomsPerGame: 5, rng: seeded(2) });
  tr.applyMove({ type: 'draw' });
  tr.restart();
  assert.equal(tr.getState().phase, 'draw');
  assert.equal(tr.getState().round, 0);
});

// Простой детерминированный ГПСЧ (LCG) для воспроизводимых тестов.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
