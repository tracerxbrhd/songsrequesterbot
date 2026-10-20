# Миграция Songs Requester → Yandex Cloud Functions

Мердж PR не должен отключать текущий Telegram Cloud Serverless. Переключение Telegram webhook — **отдельный ручной шаг после проверки**. Понадобятся Yandex Cloud с биллингом, CLI `yc` и права на каталог. Все токены и JSON-ключи держи в секретах: не отправляй их в чат.

## 1. Подготовь каталог и два сервисных аккаунта

Перейди в [консоль Yandex Cloud](https://console.yandex.cloud/), выбери каталог и установи [Yandex Cloud CLI](https://yandex.cloud/ru/docs/cli/quickstart), затем выполни `yc init`.

~~~bash
yc config get folder-id
yc iam service-account create --name songsrequester-runtime
yc iam service-account create --name songsrequester-deploy
~~~

В разделе IAM скопируй ID обоих аккаунтов. Обозначим их `RUNTIME_SA_ID` и `DEPLOY_SA_ID`, а ID каталога — `FOLDER_ID`.

Выдай deploy-аккаунту только управление функциями, а также разрешение использовать runtime SA при выпуске версии:

~~~bash
yc resource-manager folder add-access-binding FOLDER_ID \
  --role functions.editor --service-account-id DEPLOY_SA_ID

yc iam service-account add-access-binding RUNTIME_SA_ID \
  --role iam.serviceAccounts.user \
  --subject serviceAccount:DEPLOY_SA_ID
~~~

Подставь фактические ID вместо заглавных плейсхолдеров.

## 2. Создай секрет Yandex Lockbox

В консоли открой Lockbox → Создать секрет. Например, `songsrequester-secrets`. Создай **одну версию** с тремя текстовыми парами:

| Ключ | Значение |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Обычный Bot API token от BotFather формата `12345:ABC...` — не `TGCLOUD_TOKEN` |
| `YANDEX_OAUTH_TOKEN` | Уже полученный личный токен Яндекс Музыки |
| `TELEGRAM_WEBHOOK_SECRET` | Новый случайный секрет: `openssl rand -hex 32` на своём устройстве |

Сохрани два идентификатора: `LOCKBOX_SECRET_ID` (сам секрет) и `LOCKBOX_VERSION_ID` (конкретная версия). Никакие значения ключей не помещай в репозиторий.

Разреши двум сервисным аккаунтам получать содержимое **только этого секрета**:

~~~bash
yc lockbox secret add-access-binding --id LOCKBOX_SECRET_ID \
  --role lockbox.payloadViewer --subject serviceAccount:RUNTIME_SA_ID

yc lockbox secret add-access-binding --id LOCKBOX_SECRET_ID \
  --role lockbox.payloadViewer --subject serviceAccount:DEPLOY_SA_ID
~~~

Второе разрешение требуется для подтверждаемого переключения webhook через GitHub Actions. Если секрет зашифрован собственным KMS-ключом, runtime SA дополнительно потребуется `kms.keys.encrypterDecrypter` на этот ключ.

## 3. Создай Cloud Function (пока без webhook)

~~~bash
yc serverless function create --name songsrequesterbot
~~~

Скопируй ID функции (далее `FUNCTION_ID`). Сделай HTTPS-функцию публично вызываемой: Telegram не может передавать IAM-авторизацию, но обработчик дополнительно требует **секретный заголовок** и Telegram ID владельца.

~~~bash
yc serverless function allow-unauthenticated-invoke FUNCTION_ID
~~~

**Не отключай** Telegram Cloud Serverless и не вызывай старый webhook sync после будущего переключения.

## 4. Настрой GitHub Actions

В репозитории → Settings → Secrets and variables → Actions создай GitHub Actions **Secret**:

- `YC_SA_KEY_JSON` — полный JSON авторизованного ключа сервисного аккаунта `songsrequester-deploy`. Выдаётся через IAM → Service accounts → Authorized keys. Не публикуй JSON.

Авторизованный ключ долгоживущий: храни его как секрет, при необходимости отзови; позже можно перейти на GitHub OIDC Workload Identity Federation.

В том же разделе → **Variables** создай:

| Variable | Что указать |
| --- | --- |
| `YC_FOLDER_ID` | `FOLDER_ID` |
| `YC_FUNCTION_ID` | `FUNCTION_ID` |
| `YC_RUNTIME_SA_ID` | `RUNTIME_SA_ID` |
| `YC_LOCKBOX_SECRET_ID` | `LOCKBOX_SECRET_ID` |
| `YC_LOCKBOX_VERSION_ID` | `LOCKBOX_VERSION_ID` |
| `OWNER_TELEGRAM_ID` | Твой числовой ID из команды `/id` прежнего бота |

GitHub Actions deploy-job запускается только когда все переменные определены. Статус **Skipped** означает, что функция не опубликована, даже если CI зелёный.

## 5. Выполни деплой, не переключая Telegram

После мерджа код отправится в Yandex Cloud автоматически, если GitHub Variables/Secrets готовы. Иначе, когда закончишь настройку, вручную запусти:

Actions → Deploy Yandex Cloud Function → Run workflow → `activate_webhook=false`.

Версия создаётся из `cloud_function/`, устанавливает `requirements.txt`, получает три ключа из Lockbox и `OWNER_TELEGRAM_ID` как не-секретную переменную. Документированный runtime — Python 3.12, память 512 MiB, временный диск 128 MiB.

Для предварительной проверки можно открыть:

~~~text
https://functions.yandexcloud.net/FUNCTION_ID
~~~

Ожидается `{"status":"ok","service":"songsrequester"}`. Это лишь health-check, а не тест Яндекс Музыки.

## 6. Переключи Telegram только после живого теста

Когда новая функция готова, открой workflow **Deploy Yandex Cloud Function** и запусти вручную с `activate_webhook=true`.

`tools/activate_webhook.py` получает Bot API token и webhook secret из Lockbox **без печати**, вызывает приватный диагностический GET по `?probe=1` из самой Yandex Cloud Function и показывает четыре безопасных результата:

- OAuth
- Каталог — тестовый трек 126278860
- Поиск — «Монеточка»
- MP3 raw — доступность разрешённого файла

Если OAuth/каталог/поиск не работают, **webhook останется старым**. Если работает поиск, но MP3 не выдаётся, переключение по умолчанию тоже заблокировано. Только при сознательном согласии на режим без загрузок можно выбрать `allow_metadata_only=true`.

При успехе скрипт вызывает Telegram Bot API `setWebhook` с заголовком `secret_token`, `max_connections=1`, без сброса ожидающих обновлений (`drop_pending_updates=false`). После этого проверяет `getWebhookInfo`.

Теперь отправь боту `/start` и `/diagnose`, затем тестовую ссылку и запроси MP3. Не выдавай доступ к новой функции посторонним.

## 7. Откат и удаление старого сервиса

До переключения сохрани старый URL webhook из `getWebhookInfo` приватно, без токена. Если новая функция не работает, можно вернуть прежний URL через Bot API `setWebhook`, либо восстановить старую настройку BotFather, затем подтвердить `getWebhookInfo`.

Когда новый webhook стабильно работает, старую связку Telegram Cloud можно отключить. Старый `TGCLOUD_TOKEN` более не нужен; его допустимо отозвать/удалить **после** успешной миграции. Старые модули остаются доступны только в истории Git.

## Почему переезд может не решить 451 и 403

Yandex Cloud отличается от Telegram Cloud, но доступ к Яндекс Музыке не гарантируется. HTTP 451 может указывать на региональные/правовые ограничения, HTTP 403 — на отказ в выдаче аудио. Без подтверждённого доступа библиотека не сможет скачать файл. DRM и запреты API не обходим.

## Документация

- [Cloud Functions Python](https://yandex.cloud/en/docs/functions/lang/python/handler)
- [Lockbox для функций](https://yandex.cloud/en/docs/lockbox/operations/serverless/functions)
- [Создание версии CLI](https://yandex.cloud/en/docs/cli/cli-ref/serverless/cli-ref/function/version/create)
- [Публичная функция](https://yandex.cloud/en/docs/functions/operations/function/function-public)
- [Telegram Bot API](https://core.telegram.org/bots/api#setwebhook)
