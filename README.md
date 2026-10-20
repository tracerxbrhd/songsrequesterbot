# 🎵 Songs Requester Bot — Yandex Cloud Functions

Личный Telegram-бот для **Яндекс Музыки**. Полный перенос с Telegram Cloud Serverless на Python 3.12 в **Yandex Cloud Functions**: сохранены ссылки на треки, поиск, карточки, команда `/diagnose` и попытка передачи **разрешённого незашифрованного MP3** прямо в Telegram.

**Статус:** код и тесты готовы к Cloud Functions; реальные обращения к Яндекс Музыке из новой облачной среды и отправка MP3 требуют собственного облака, Lockbox и Bot API токена. Перенос **не гарантирует** снятие HTTP 451/403 или разрешение Яндекса на копирование контента.

## Архитектура

Telegram → публичный HTTPS endpoint Cloud Functions → проверка `X-Telegram-Bot-Api-Secret-Token` + проверка Telegram ID владельца → Python-обработчик → `yandex-music` → Telegram Bot API.

Используются `yandex-music==3.2.2`, `requests`, Python 3.12 и Yandex Lockbox.

**Нет** отдельного VPS, Mini App, Telegram Cloud SDK или JavaScript-рантайма. Никаких фоновых задач и обработки альбомов/плейлистов. Все музыкальные источники кроме Яндекс Музыки удалены.

### Поддерживаемые функции

- Ссылка `https://music.yandex.ru/album/31348570/track/126278860?...` или `https://music.yandex.ru/track/126278860`
- Поиск по исполнителю и названию, кнопки выбора из списка
- Карточка композиции, кнопка загрузки MP3 и ссылка на Яндекс Музыку
- `/start`, `/help`, `/status`, `/diagnose`, `/id`
- Только личный Telegram ID; приватные чаты, без сторонних пользователей
- Отправка доступного MP3 через multipart в Bot API, локальный warm-кеш `file_id` в пределах экземпляра функции
- Диагностика отправляется без токенов, приватных API-ответов и подписанных ссылок

### Ограничения

- Яндекс API **неофициальный** и может отказать в выдаче файла. Оффлайн-музыка в приложении Яндекса не тождественна открытым MP3-файлам.
- Метод получения файлов запрашивает строго `codec=mp3`, `transport=raw`. Если API возвращает `encraw` или запрет, расшифровка и обход ограничений не выполняются.
- Максимальный размер аудио — **40 МиБ**, поток обрабатывается через временный файл.
- Telegram webhook и отправка аудио работают синхронно. При длительной загрузке Telegram может повторно доставить update. Warm-кеш update_id уменьшает число дублей в одном экземпляре, но **не является распределённой транзакцией**.
- Кеш аудио **не постоянный**. Старая SQLite-база Telegram Cloud не переносится.
- Cloud Functions оплачивается по действующим тарифам при выходе за бесплатные лимиты.

## 🚀 Миграция

**Начни с [docs/MIGRATION.md](docs/MIGRATION.md).** В ней пошаговая подготовка Yandex Cloud, двух сервисных аккаунтов, Lockbox, GitHub Variables/Secrets и запуск деплоя.

После настройки `main` автоматически публикует новые версии. **Мердж не переключает webhook.** Это отдельный шаг `workflow_dispatch` → Deploy Yandex Cloud Function → `activate_webhook=true`.

Перед переключением `tools/activate_webhook.py` запускает диагностику **из Yandex Cloud**. При недоступности OAuth/каталога/поиска или MP3 целевой webhook **не меняется**. Если принимаешь работу только поиска, есть явная опция `allow_metadata_only=true`.

Публичный endpoint защищён webhook secret token и дополнительно ID владельца. Не полагайся исключительно на ограничения BotFather после перехода на внешний webhook.

## Структура

- `cloud_function/index.py` — HTTPS handler / команды Telegram
- `cloud_function/yandex_provider.py` — библиотека `yandex-music` и разрешённые MP3
- `cloud_function/telegram_api.py` — Bot API, включая multipart
- `cloud_function/parse.py` — ссылки и callback-данные
- `cloud_function/requirements.txt` — фиксированные зависимости
- `tools/activate_webhook.py` — проверка новой среды и безопасный cutover
- `tests/` — тесты без Yandex Cloud / OAuth
- `.github/workflows/` — Python CI и деплой в Yandex Cloud

## Локальные тесты

Python 3.12:

~~~bash
python -m pip install -r cloud_function/requirements.txt
PYTHONPATH=cloud_function python -m unittest discover -s tests -v
~~~

## Безопасность

Секреты `TELEGRAM_BOT_TOKEN`, `YANDEX_OAUTH_TOKEN` и `TELEGRAM_WEBHOOK_SECRET` хранятся в **Yandex Lockbox** и предоставляются через переменные окружения функции. У GitHub Actions — отдельный deploy service account с ключом `YC_SA_KEY_JSON` (плановый переход на GitHub OIDC federation возможен позже). В Git и логи токены не добавляются.

При компрометации необходимо отозвать ключи, создать новую версию Lockbox secret и переиздать функцию. Отключение Telegram Cloud Serverless до проверки нового endpoint **не рекомендуется**.

## Источники

- [Cloud Functions: Python dependencies](https://yandex.cloud/en/docs/functions/lang/python/dependencies)
- [Cloud Functions: Lockbox integration](https://yandex.cloud/en/docs/lockbox/operations/serverless/functions)
- [Cloud Functions: Function version create](https://yandex.cloud/en/docs/cli/cli-ref/serverless/cli-ref/function/version/create)
- [MarshalX/yandex-music-api](https://github.com/MarshalX/yandex-music-api)
- [Telegram Bot API](https://core.telegram.org/bots/api)
