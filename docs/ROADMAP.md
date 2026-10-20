# Songs Requester — Roadmap

## YC migration
- [x] Python 3.12 Cloud Function: Telegram webhook, parser, keyboard UI
- [x] Python yandex-music 3.2.2 for metadata/search/raw MP3
- [x] Authenticated Telegram webhook + owner-only mode
- [x] Yandex Lockbox runtime secrets; dedicated deploy and runtime SAs
- [x] CI and GitHub Actions YC deployment
- [x] Separate cutover action, only after live in-cloud preflight
- [x] Removed old TGCloud code and workflows from active branch
- [ ] Create Yandex Cloud folder resources and IAM permissions
- [ ] Configure GitHub Actions Secret and Variables
- [ ] Actual in-cloud probe without cutover
- [ ] Cutover after confirming metadata and downloadable MP3
- [ ] End-to-end Telegram test

## Beyond first working version
- Durable idempotency for long Telegram updates (e.g. YDB serverless)
- Persistent Telegram file_id cache
- Better diagnostic messages for unexpected provider errors
- Optional long-audio task queue if downloads exceed Telegram webhook timeout

Do not reintroduce other music providers without a new product decision.

- [x] Warm update-id deduplication releases IDs on transient processing failures
