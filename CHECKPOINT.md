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

## Validation and handoff

Browser QA starts Astro on port 4315, uses the server's shared Playwright at
`/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright`, and stops
the child server in `finally`. `BASE_URL`, `PLAYWRIGHT_PATH`, and `QA_OUTPUT`
can override those defaults. Run with `node scripts/browser-qa.mjs`.
Screenshots and the JSON report are written under `artifacts/`.

`node --check scripts/browser-qa.mjs` passed locally. A file digest comparison
confirmed that only the two source files above differ from the original; there
are no missing files outside the requested exclusions.

This checkpoint records source preparation, not a successful build or browser
run. The parent task owns transfer, substitution of the reviewed shared API,
dependency installation, build/type checking, browser execution, and deployment.

## Publication verification, 2026-11-01

Recovered original design source and optimized assets preserved. Fresh npm install, production build, type checks, five enquiry API tests, and browser interaction checks passed on the authorized server. Private enquiry storage is configured on the Vercel project. Production HTTP and storage verification is recorded separately after deployment.
