# AVA final source checkpoint

## Base restored

This working copy was created from the original AVA implementation at
`/workspace/scratch/6ba048c62957/sites/AvaAtPalm`.
The source original and the separate recovery experiment were not modified.
Excluded from the copy: `.git`, `node_modules`, `dist`, `.astro`, `.vercel`,
`artifacts`, `tests`, `output`, and `design`.

All original pages, editorial scenes, typography, images, responsive variants,
gallery, residence details, and floor-plan viewer remain present.

## Changes in this copy

- `src/scripts/app.ts`: a normalized enquiry payload fingerprint preserves the
  submission UUID for unchanged retries, including closing and reopening the
  dialog. Changing data after an attempted request creates a new UUID. The
  original start time survives ordinary reopen. The existing sending guard now
  also disables all form fields and restores their previous disabled states
  after the request. A success is accepted only with `ok: true` and the matching
  server-confirmed submission reference.
- `src/components/Enquiry.astro`: show the confirmed reference in the existing
  success state, with wrapping for narrow screens.
- `scripts/browser-qa.mjs`: an original-selector browser QA program for 1440,
  768, 390, and 320 px. It checks main and inner-page overflow, image loading,
  menu focus/Escape, architectural anchor hotspots, gallery, features, both
  residence pages and zoomable plans, validation, failed/unchanged/edited retry,
  pending controls, duplicate prevention, and confirmed success reference.
  All enquiry POSTs are mocked. No real enquiries are sent.

## Recovery validation and handoff (historical)

Browser QA starts Astro on port 4315, uses the server's shared Playwright at
`/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright`, and stops
the child server in `finally`. `BASE_URL`, `PLAYWRIGHT_PATH`, and `QA_OUTPUT`
can override those defaults. Run with `node scripts/browser-qa.mjs`.
Screenshots and the JSON report are written under `artifacts/`.

`node --check scripts/browser-qa.mjs` passed locally. A file digest comparison
confirmed that only the two source files above differ from the original; there
are no missing files outside the requested exclusions.

That preparation entry preceded the successful recovery release below. The
parent task handled transfer, the reviewed shared API, dependency installation
and release validation. The later motion update has separate server verification
and a subsequent confirmed publication entry at the end of this file.

## Publication verification, 2026-11-01

Recovered original design source and optimized assets preserved. Fresh npm install, production build, type checks, five enquiry API tests, and browser interaction checks passed on the authorized server. Private enquiry storage is configured on the Vercel project. Production HTTP and storage verification is recorded separately after deployment.

## Motion polish verified on server, 2026-11-01

Prepared the current task's patch in `src/scripts/app.ts`, `src/styles/global.css` and `src/components/Header.astro`: responsive/reduced-motion GSAP lifecycle, feature-disclosure geometry refresh, decoded latest-request gallery navigation and robust pointer cancellation, explicit dialog trigger restoration, menu expanded state, initial/resize/load plan geometry, stable modal scroll locking, and reduced-motion-aware dialog entrances. Original visual assets and composition are retained; API/submission payload behavior is unchanged.

`git diff --check` passed in the text snapshot. Final server typecheck/build and the existing Chromium browser suite subsequently passed as recorded below. `docs/MOTION-QA-2026-11-01.md` distinguishes the completed automated coverage from additional manual scenarios. Publication was handed to the release owner and was subsequently confirmed below.

## Final motion verification and publication status, 2026-11-01

The release owner reported final authorized server job `20261101T124548-54c1d23d28` with exit 0: all ten typecheck/build tasks across the five repositories passed, including AVA. Browser job `20261101T124919-e3044c77a5` also exited 0 with all five existing suites passing, including AVA `scripts/browser-qa.mjs`. All fresh AVA hero screenshots supplied for the final review were visually accepted by root.

AVA's suite is Chromium-only. At 1440/768/390/320 px it checks home, both residence pages, location and privacy assets/overflow; menu focus, hotspots, gallery controls, features, both original plans, and mocked enquiry validation/retry identity/pending/success behavior. A separate normal-motion flow verifies desktop-to-mobile hero transform cleanup, feature spacing and Location visibility, followed by live reduced-motion cleanup. The load/decode audit correction has passed: both original plan images load and decode at all four tested widths, including the previously reported plan-1601.webp. Exact coverage and generated evidence paths are in `docs/MOTION-QA-2026-11-01.md`.

**Publication confirmed, 2026-11-01:** the release owner confirmed UI commit `0ef0a1f5c50bc1762ad95f41a534ca530e1f9a0f` in READY deployment `dpl_asipfgq2i7pgNPr7CKvv1GheWgZz`. This supersedes the earlier verified-but-unpublished handoff. The authoritative record for final commits, deployments and live acceptance across all five sites is [MOTION-RELEASE-2026-11-01.md](https://github.com/IMONsergey/LuxuryRealty/blob/main/docs/MOTION-RELEASE-2026-11-01.md).

The historical publication/API evidence above belongs to the earlier release. The listed final server browser suite intercepts every enquiry and does not repeat production storage verification. That run does not establish WebKit/Safari, physical-touch/pinch, throttled-network or performance coverage; any subsequent live acceptance is recorded in the central release report.

The earlier documentation handoff covered only `CHECKPOINT.md` and `docs/MOTION-QA-2026-11-01.md`. The historical `docs/browser-qa.json` was not replaced with an invented current report; the server verification reports remain in the referenced jobs' actual output. This publication-status correction changes documentation only and adds no new test result.

## Visual audit handoff, 2026-11-01, second pass

Завершен новый cloud аудит поверх documentation HEAD `e0bf9bc` и опубликованного UI `0ef0a1f`. Все 6 маршрутов проверены на 7 размерах: 207 viewport captures основной матрицы, 54 группы интерактивных состояний и 77 дополнительных фото-кадров. Все текущие enquiries mocked/blocked.

Переданный source исправляет textual control glyphs через исходные SVG contours, reading-position continuity, failed-image navigation/retry, доступность Close, reset внутренней прокрутки при reopen/success, честный Request the film CTA и выбор существующих responsive candidates. Поздний visual review также исправил Information320, clipped COMPARE768/844, микротекст body на768-1100, контраст title/counter светлого gallery кадра и пересечение Architecture/Sky copy с CTA на планшете. Sky paragraph имеет минимальную ширину300px только в tablet диапазоне, чтобы CTA оставался на светлом небе. Фотографии, семейства шрифтов, цвета и исходное кадрирование сохранены.

Проверки: check/clean build PASS; gallery6/6; native dialogs12/12; reading10/10; text geometry14/14; final copy/CTA14/14; image candidates20/20; existing browser suite1440/768/390/320 плюс normal motion PASS. Runtime: Node24.22.1, Playwright1.58.2, Chromium145.0.7632.6, WebKit26.0. Source fingerprint `91f0873dd3939a2e5a38f64e0f23af1d0f51b53745e322b5cc0d57e3bd1cdac8`. Clean check/build, final copy/CTA, reading, existing suite и 6 выбранных кадров относятся к нему. Остальные reports сохраняют собственный этап: image/dialog/gallery source после соответствующих suites не менялся; поздние copy/CTA captures заменяют дефектные области дополнительной photo матрицы.

Локальный build однажды оставил HTML со старым CSS reference. Generated output/cache сохранены, выполнен чистый build, hashes отданных HTML/CSS проверены до финальных тестов. При восстановлении контекста ориентироваться на [VISUAL-AUDIT-2026-11-01.md](docs/VISUAL-AUDIT-2026-11-01.md) и [verification.json](docs/verification/design-2026-11-01/verification.json), где находятся 6 итоговых screenshots, фактические offsets, source hashes и границы проверки. Финальные commit/deployment/live acceptance ведет владелец релиза в [общем release report](https://github.com/IMONsergey/LuxuryRealty/blob/main/docs/MOTION-RELEASE-2026-11-01.md).
