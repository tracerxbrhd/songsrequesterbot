# Songs Requester Bot — Agent Instructions

This repository is a Telegram Cloud Serverless bot, not a Node backend.
Runtime supports only JavaScript modules in tgcloud/, relative .js imports and sdk imports.
No npm imports, Node built-ins, environment-variable reads, filesystem access,
custom webhooks, or long-running workers inside tgcloud/.

## Hard constraints
- Never commit Bot API, CLI, Yandex OAuth, or any other access tokens.
- Do not implement DRM or stream decryption, paid-catalog ripping, or access bypass.
- Yandex provider is metadata/search only until a separately verified and authorized distribution interface exists.
- Jamendo delivery is allowed only when audiodownload_allowed is explicitly true.
- Keep private mode fail-closed until OWNER_TELEGRAM_ID is configured.
- Only use vetted provider audio URLs; never fetch arbitrary user-provided URLs.
- Keep handlers thin; isolate provider-specific integrations behind registry.
- CI: npm run check && npm test. Deploy only from main via GitHub Actions.
- No direct edits to main other than merging reviewed PRs.
