# Stream Dock HTTP Request

Плагин для **AJAZZ / Stream Dock** (MiraBox HotSpot): тихие HTTP-запросы **без открытия вкладок браузера**.

Подходит для локальных API вроде [OBS Stream Widget Statistics v2]([https://github.com/](https://github.com/ARTJ1/OBS-Stream-Widget-Statistics-v2/releases)) (`http://127.0.0.1:19123/api/...`). [пак кнопок для этого виджета](https://github.com/ARTJ1/OBS-Stream-Widget-Statistics-v2/releases/tag/streamdock-icons-v1.0.0)

## Возможности

- Методы: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`
- Custom headers (JSON) и body
- Пресеты для виджета: Win / Loss / Rank Up / Rank Down / Reset
- Индикация успеха/ошибки на кнопке
- Кнопка **Test request** в настройках

## Требования

- Stream Dock / AJAZZ software с поддержкой Node.js плагинов (SDK V2, `Nodejs.Version: 20`)
- Node.js 18+ на ПК (только для сборки/установки)

## Установка из Release (рекомендуется)

1. Скачай `streamdock-http-request.zip` из [Releases](../../releases)
2. Распакуй папку `com.kdfx.streamdock.httprequest.sdPlugin` в:
   `%AppData%\HotSpot\StreamDock\plugins\`
3. Перезапусти Stream Dock

CI автоматически собирает zip на каждый push в `main`.

## Установка из исходников

```powershell
cd com.kdfx.streamdock.httprequest.sdPlugin\plugin
npm install
npm run build
```

`npm run build` соберёт бандл и скопирует плагин в:

`%AppData%\HotSpot\StreamDock\plugins\com.kdfx.streamdock.httprequest.sdPlugin`

После этого **перезапусти Stream Dock**.

### Быстрая установка без бандла (dev)

```powershell
cd com.kdfx.streamdock.httprequest.sdPlugin\plugin
npm install
npm run install-plugin
```

## Использование

1. Открой Stream Dock
2. Найди категорию **HTTP Request**
3. Перетащи действие на кнопку
4. Выбери пресет (например **Widget Win**) или укажи свой URL/Method
5. Нажми кнопку на деке — запрос уйдёт в фоне, браузер не откроется

### Пример для виджета

| Кнопка | URL | Method |
|--------|-----|--------|
| Win | `http://127.0.0.1:19123/api/win` | GET |
| Loss | `http://127.0.0.1:19123/api/loss` | GET |
| Rank Up | `http://127.0.0.1:19123/api/rank/up` | GET |
| Rank Down | `http://127.0.0.1:19123/api/rank/down` | GET |
| Reset | `http://127.0.0.1:19123/api/reset` | GET |

Порт смотри в админке виджета / `data/runtime.json`, если `19123` занят.

## Структура

```
com.kdfx.streamdock.httprequest.sdPlugin/
  manifest.json
  plugin/                 # Node backend
  propertyInspector/      # UI настроек кнопки
  static/                 # иконки + sdpi.css
  en.json / ru.json
```

## Отладка

Список плагинов Stream Dock:

http://localhost:23519/

Логи плагина: `plugin/log/` (в установленной копии).

## Лицензия

MIT
