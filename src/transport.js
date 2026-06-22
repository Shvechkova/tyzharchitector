// ПОРТ транспорта (ports & adapters).
//
// UI работает только через этот интерфейс и не знает, локальная игра или сетевая.
// Меняя адаптер (Local ↔ Network), мы меняем режим, не трогая ни ядро, ни UI.
//
// Контракт транспорта:
//   getState()        → текущее состояние игры (см. game-core.createGame)
//   applyMove(move)   → применить ход; внутри прогоняет game-core.reduce и
//                       оповещает подписчиков
//   subscribe(cb)     → подписка на изменения состояния; возвращает функцию
//                       отписки. cb вызывается с новым state.
//
// LocalTransport (Этап 1) живёт в transport-local.js.
// NetworkTransport (Этап 2) — заглушка ниже: тот же контракт, поэтому подключится
// без переписывания UI и ядра.

// База с реестром подписчиков — переиспользуют оба адаптера.
export class BaseTransport {
  constructor() {
    this._subs = new Set();
  }
  subscribe(cb) {
    this._subs.add(cb);
    return () => this._subs.delete(cb);
  }
  _emit(state) {
    for (const cb of this._subs) cb(state);
  }
  // Адаптеры обязаны реализовать:
  getState() { throw new Error('getState() not implemented'); }
  applyMove() { throw new Error('applyMove() not implemented'); }
}

// --- ЗАГЛУШКА Этапа 2 ---
//
// Реал-тайм мультиплеер со скрытыми руками. Реализуется отдельной задачей:
//   • маленький Node+ws сервер: комнаты, коды, раздача скрытых рук, рассылка ходов;
//   • клиент шлёт move на сервер, получает обновлённый state, оповещает подписчиков.
// Ядро (game-core.reduce) переезжает на сервер как есть — переписывать не нужно.
//
// GitHub Pages держит только статику, поэтому сервер деплоится отдельно
// (Render/Railway/Fly), а его URL прокидывается сюда.
export class NetworkTransport extends BaseTransport {
  constructor({ url, room } = {}) {
    super();
    this.url = url;
    this.room = room;
    throw new Error(
      'NetworkTransport — Этап 2 (мультиплеер). Пока не реализован. ' +
      'Используй LocalTransport (соло / хотсит). См. README → Roadmap.'
    );
  }
  // getState() / applyMove(move) — реализовать поверх WebSocket в Этапе 2.
}
