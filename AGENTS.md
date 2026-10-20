# Songs Requester — Agent Instructions

## Scope
- PERSONAL Telegram bot, **only Yandex Music**. No Spotify, Jamendo or other sources.
- Python 3.12 on Yandex Cloud Functions. No Telegram Cloud Serverless runtime.
- Telegram bot + catalog search + raw MP3 when authorized; no DRM or restricted-content circumvention.

## Layout / Commands
- Function root: `cloud_function/`. Entrypoint: `index.handler`.
- Dependencies: `cloud_function/requirements.txt`; pin exact versions.
- Tests: `PYTHONPATH=cloud_function python -m unittest discover -s tests -v`.
- GitHub Actions CI/deploy; deploy only from main after bootstrap.
- Do not merge PR without owner request.

## Security
- Public webhook endpoint MUST validate X-Telegram-Bot-Api-Secret-Token with compare_digest.
- OWNER_TELEGRAM_ID is required and fail-closed even if BotFather has a personal restriction.
- Owner private chats only, ignore forged/non-owner updates.
- Never print bot token, Yandex OAuth, webhook secret, Lockbox content, signed CDN URLs, or raw API responses.
- Secrets only via Lockbox injected into the function; deployment key only in GitHub Secrets.
- YC deploy never automatically steals the existing Telegram Cloud webhook. Manual workflow_dispatch cutover after a successful in-cloud probe.
- Keep max_connections=1 while synchronous webhook handling has no durable idempotency store.

## Yandex Music
- Use community library MarshalX `yandex-music==3.2.2`.
- Request only `raw` `mp3`, no decrypt `encraw`, no 403/451 bypass, no proxy/IP evasion.
- Downloads must validate approved CDN hosts and paths; no arbitrary URLs or redirects.
- Limit size to 40 MiB. Upload files only within the applicable rights.
- CI does not guarantee availability of a specific track or resolution of earlier 451/403.

## Cloud
- Separate deploy SA and runtime SA.
- Runtime SA gets lockbox.payloadViewer for ONE project secret.
- Deploy SA gets functions.editor on folder, iam.serviceAccounts.user on runtime SA, and payloadViewer only if cutover is performed via Actions.
- All three runtime secrets must be in pinned YC_LOCKBOX_VERSION_ID.
