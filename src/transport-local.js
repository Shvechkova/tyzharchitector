// LOCAL-адаптер транспорта (Этап 1).
//
// Держит одно состояние игры в текущей вкладке, синхронно прогоняет ходы через
// игровое ядро и оповещает подписчиков. Этого хватает для двух режимов:
//   • соло (пасьянс)        — один игрок против ключа ответов;
//   • хотсит / проектор     — несколько игроков по очереди за общим экраном.
//
// Сервер не нужен: всё живёт в браузере, открывается двойным кликом и с GitHub Pages.

import { createGame, reduce } from './game-core.js';
import { BaseTransport } from './transport.js';

export class LocalTransport extends BaseTransport {
  constructor(gameOpts = {}) {
    super();
    this._opts = gameOpts;
    this._state = createGame(gameOpts);
  }

  getState() {
    return this._state;
  }

  applyMove(move) {
    const next = reduce(this._state, move);
    if (next !== this._state) {
      this._state = next;
      this._emit(this._state);
    }
    return this._state;
  }

  // Локальная роскошь: начать новую партию с теми же (или новыми) настройками.
  restart(gameOpts) {
    this._opts = gameOpts || this._opts;
    this._state = createGame(this._opts);
    this._emit(this._state);
    return this._state;
  }
}
