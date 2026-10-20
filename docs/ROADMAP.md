# Songs Requester — Яндекс Музыка

## Current
- [x] Only Yandex Music; remove all other providers and registry
- [x] Shared-link parsing and catalog search
- [x] Metadata via POST /tracks with track-ids
- [x] Precise HTTP diagnostic codes and /diagnose
- [x] GitHub Secrets-based OAuth, without tokens in Git
- [x] Allowlisted raw MP3 URL handed to Telegram when permitted by Yandex
- [x] Cached Telegram file_id in SQLite
- [x] Regression tests for Serverless JavaScript and endpoints
- [ ] Live smoke-test of metadata and search after deploy
- [ ] Live smoke-test of raw MP3; last diagnostic returned HTTP 403

## Next
- Better UI for search and available qualities
- Better understanding of permitted download scenarios
- More reliability and stale-cache recovery

Other music providers are out of scope until the owner changes this decision.
