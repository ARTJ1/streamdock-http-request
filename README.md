# Stream Dock HTTP Request

Плагин для **AJAZZ / Stream Dock**: тихие HTTP-запросы + **Live Mode** (цифры W/L и код ранга на кнопках).

Нужен [Widget Stats v2.5.0+](https://github.com/ARTJ1/OBS-Stream-Widget-Statistics-v2/releases) и [LIVE-иконки](https://github.com/ARTJ1/OBS-Stream-Widget-Statistics-v2/releases/tag/streamdock-icons-live-v1.0.0).

Полная инструкция: [STREAMDOCK-LIVE.md](https://github.com/ARTJ1/OBS-Stream-Widget-Statistics-v2/blob/main/docs/STREAMDOCK-LIVE.md)

## Возможности

- Методы: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`
- Пресеты виджета: Win / Loss ±1, Rank ↑↓, Reset, Game/Mode/Role, Show, роли OW
- **Live Mode** — WebSocket `/ws` + poll `/api/deck/state`: автообновление title на кнопках
- Коды ранга: `B5` `G2` `GM3` `CH1` `#42`

## Установка

1. Скачай `streamdock-http-request.zip` из [Releases](../../releases)
2. Папку `com.kdfx.streamdock.httprequest.sdPlugin` → `%AppData%\HotSpot\StreamDock\plugins\`
3. Перезапусти Stream Dock
4. Включи **Live Mode**, URL `http://127.0.0.1:19123`, пресеты Auto

## Сборка из исходников

```powershell
cd com.kdfx.streamdock.httprequest.sdPlugin\plugin
npm install
npm run build
```
