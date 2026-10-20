# Songs Requester — Agent Instructions

## Product scope
Personal Telegram bot, **only Yandex Music**. Do not reintroduce other providers or multi-provider registries without an explicit user request.
Access is already restricted by the owner in BotFather; handlers receive only private chats.

## Runtime
- Telegram Cloud Serverless V8; only sdk and relative .js imports under tgcloud/.
- No Node, npm modules, filesystems, browser URL/URLSearchParams/TextEncoder or FFmpeg.
- sdk.fetch returns text HTTP content. No arbitrary binary MP3 download into InputFile.
- The gitignored tgcloud/lib/runtime-secrets.js is generated during GitHub Actions from YANDEX_OAUTH_TOKEN. Never commit or print it.
- Do not log API response bodies, account data, auth headers or expiring CDN URLs.

## Yandex requests
- Metadata: POST /tracks with form track-ids. GET /tracks/{id} is incorrect.
- Search: GET /search using Android client profile.
- Audio: signed GET /get-file-info, desktop profile, codec=mp3, transport=raw.
- A 403 is an access refusal. Do not bypass it through alternate clients,
  cookies, proxies or encraw decryption.
- All audio URLs must pass the strict allowlist; store Telegram file_id only.
- Report fixed safe diagnostic codes (distinguish HTTP 400, 403 etc).

## Release process
- Run npm run check and npm test before PR.
- Only main deploys. Do not merge without the user's request.

## Current investigation
- Exact HTTP 400-599 codes must be preserved in /diagnose; do not collapse to 4XX/5XX.
- /account/status is only successful authentication when result.account.uid exists; never display UID.
- For POST /tracks use sdk.fetch.body.form({ 'track-ids': id, 'with-positions': 'True' }) when present; fallback to correctly encoded form body only for older SDKs.
- HTTP 403 raw file requests must not trigger bypass retries.
