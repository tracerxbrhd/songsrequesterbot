# Songs Requester Bot — Agent Instructions

This is a PERSONAL Telegram Cloud Serverless bot. The user has restricted access
to their account in BotFather, so do not reintroduce duplicate owner ID checks
without an explicit request. If the BotFather restriction is ever removed, the
bot does not have an independent access-control layer.

## Runtime rules
- The only deployed code is JavaScript under tgcloud/. Use sdk + relative .js imports.
- No runtime npm modules, process.env, filesystem, Node built-ins or FFmpeg.
- The OAuth runtime module tgcloud/lib/runtime-secrets.js is GENERATED IN CI,
  is excluded by .gitignore, and must NEVER be committed.
- Use scripts/prepare-runtime-secrets.mjs in CI before tgcloud push.
- Do not log OAuth tokens, HTTP auth headers or expiring CDN URLs.

## Yandex behavior
- Authorization is a user's OAuth token from GitHub Actions Secret YANDEX_OAUTH_TOKEN.
- /get-file-info signature matches the Yandex desktop client convention.
- Request only codec mp3 and transport raw. NEVER decrypt encraw or bypass DRM.
- Validate generated CDN host/path. Never fetch arbitrary user URLs.
- CDN URLs expire rapidly and are never persisted; cache only Telegram file_id.
- Do not promise that all content is downloadable. Respect rights and API failures.

## Other providers
- Jamendo requires audiodownload_allowed=true.
- Keep provider modules behind the registry and delivery outside handlers.

## Quality and deployment
- npm run check and npm test validate pure JS; real cloud behavior requires smoke-test.
- Deploy only from main using GitHub Actions.
- Don't merge pull requests unless explicitly asked.

## Serverless specifics
- Browser URL, URLSearchParams and TextEncoder globals are not guaranteed; use pure string parsing and pure JS UTF-8/HMAC.
- Use Android X-Yandex-Music-Client for metadata/search and Desktop only for signed file-info.
- Never mask a failed primary provider as an empty search result.
- /diagnose must emit only fixed status codes, never raw server replies, auth headers or CDN URLs.
- sdk.fetch is text-oriented; don't attempt to stream arbitrary MP3 response bytes into InputFile.
