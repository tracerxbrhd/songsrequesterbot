# 🎵 Songs Requester — личный Telegram Music Bot

Telegram Cloud Serverless-бот для поиска треков и получения аудиофайлов через Telegram.

## Возможности

- **Яндекс Музыка:** ссылки на отдельные треки, поиск по названию и артисту.
- **Скачать MP3:** после настройки OAuth бот пытается запросить доступный аккаунту обычный MP3 через неофициальный API Яндекс Музыки и прислать в Telegram.
- **Jamendo:** скачивание MP3 при явном разрешении автора и наличии API Client ID.
- Общий кеш Telegram file_id в SQLite, чтобы один и тот же аудиофайл повторно не загружался.
- Русскоязычный интерфейс; команды /start, /help, /status, /search, /id, /privacy, /delete.
- Только Telegram Cloud Serverless, без отдельного VPS и Mini App.

**Ограничение:** Яндекс может не выдать незашифрованный MP3 (raw) для конкретного трека даже при действующей подписке. Шифрованные потоки encraw/DRM не расшифровываются. Работа неофициального API может меняться. Пользуйся файлами только в пределах предоставленных прав и правил сервиса.

## Личный доступ

**Владелец уже ограничил использование бота в BotFather**, поэтому в коде больше нет отдельной проверки OWNER_TELEGRAM_ID или флага PUBLIC_MODE. Если ограничение BotFather будет снято, код сам по себе не ограничивает пользователей.

## GitHub Actions Secrets

Добавь в репозитории: Settings → Secrets and variables → Actions → New repository secret.

| Имя | Для чего |
|---|---|
| **TGCLOUD_TOKEN** | BotFather → Serverless → CLI Access; это не Bot API token |
| **YANDEX_OAUTH_TOKEN** | OAuth access token *твоего* аккаунта Яндекс Музыки |

OAuth можно получить самостоятельно, например через **Device Flow** из [документации MarshalX](https://ym.marshal.dev/token/), на собственном устройстве. Не отправляй токен в Telegram, GitHub Issues, комментарии PR или этот чат. Не записывай его в tgcloud/lib/config.js.

При деплое скрипт scripts/prepare-runtime-secrets.mjs считывает GitHub Actions Secret и создаёт временный, игнорируемый Git файл tgcloud/lib/runtime-secrets.js. Он загружается в Telegram Cloud вместе с приложением, но **не добавляется в git**. Если YANDEX_OAUTH_TOKEN отсутствует, поиск работает, а загрузка из Яндекса подскажет подключить OAuth.

**Ограничение безопасности:** Telegram Cloud Serverless пока не предоставляет документированное хранилище runtime-секретов. Сгенерированный модуль с OAuth доступен редакторам проекта в BotFather. Не открывай посторонним доступ к проекту Serverless, отзывай скомпрометированный токен в Яндексе и перевыпускай при необходимости. OAuth токен не обновляется автоматически.

## Как проверить после деплоя

1. Влей PR; после этого GitHub Actions запустит Deploy Songs Requester.
2. В Telegram отправь боту **/status** — проверь строку «Яндекс OAuth: ✅ подключён».
3. Отправь боту ссылку вида https://music.yandex.ru/album/123/track/456.
4. Нажми «⬇️ Скачать MP3».
5. При наличии обычного MP3 (raw) получишь аудиофайл. При недоступности — объяснение.
6. Запроси тот же трек повторно: должен использоваться Telegram file_id из SQLite.

Бот не поддерживает FLAC, альбомы, плейлисты или большие (> ограничений Telegram Cloud) файлы в этой версии.

## Техническая реализация

- Запрос с OAuth к подписанному методу **/get-file-info**, codec=mp3, transport=raw; попытка качества hq, затем nq.
- HMAC-SHA256 целиком на JavaScript: Node и crypto.subtle внутри Telegram Cloud не нужны.
- Проверка хоста и пути возвращённой CDN-ссылки перед передачей аудио.
- Сначала отправка MP3 по URL с помощью Telegram Bot API, при распознанной URL-ошибке — резервная загрузка байтов до 25 МБ.
- В SQLite сохраняется только Telegram file_id, а не истекающая ссылка Яндекса.
- Деплой: fetch → push → migrate --safe → webhook sync.

Локальная проверка с Node.js 22+:

~~~sh
npm install --no-audit --no-fund
npm run check
npm test
~~~

Команда check создаёт пустой файл временной конфигурации, если переменная окружения YANDEX_OAUTH_TOKEN не передана. Git игнорирует этот файл.

## Источники

- [Неофициальная библиотека Yandex Music API](https://github.com/MarshalX/yandex-music-api)
- [Метод tracks_file_info и форматы raw/encraw](https://ym.marshal.dev/yandex_music._client_async.tracks/)
- [Документация Telegram Serverless](https://blogfork.telegram.org/bots/serverless)
