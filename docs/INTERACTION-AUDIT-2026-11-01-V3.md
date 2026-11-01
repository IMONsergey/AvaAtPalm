# AVA interaction and visual audit, V3

Audit label: 2026-11-01. This is a continuation of the audit; exact UTC browser capture timestamps are in the evidence. Baseline: `a36d1c6ceb6001cc92171fd61ce4d5a58bcce0f0`.

This report records fresh baseline reproductions and local fixes after the user reported broken interactions and inaccurate branding. Earlier V2 PASS results were not used as acceptance for these changes. Publication and the live enquiry backend are outside this local verification.

## Result and scope

**AVA has 13 primary journeys per engine: 26/26 fixed journeys passed in Chromium 145.0.7632.6 and WebKit 26.0.** The shared suite has 19 journeys per engine across AVA and Atlantis together; it is not 19 for AVA alone. Before the fixes, 11 of AVA's 13 journeys in each engine exposed the documented defects; two positive controls already passed. A scenario can cover several steps, and the same finding can appear in several scenarios.

The source inventory contains 194 anchor/button/select/summary instances across the generated routes, including repeated shared dialogs. That count is an inventory, not a claim of 194 individual browser passes. All 129 anchor instances have valid local file/route/fragment targets in the static route check. Source checks found no text arrow glyphs or arrow HTML entities; interface arrows use icons.

| Surface | Reviewed contract and browser coverage |
| --- | --- |
| Home, mobile menu, logos and navigation | Actual menu open/close, anchor selection, detail navigation and browser Back/Forward. Header/menu logos remain links home. Footer/privacy destinations were checked against generated routes. |
| Residences 801 and 1601 | Image and View floor plan now open the same unit-specific viewer. Slow/failing loads, repeated open/close, changing units, actual zoom/pan/fit and downloaded image bytes were exercised. The downloaded 1601 file SHA matches the source image. |
| Enquiry and contextual actions | Required/optional inputs, context routing, request lifecycle and idempotency intent reviewed in source. A held local mock request was followed by Close/reopen, 503, same-input retry, 422, edited-input retry, matching mock receipt and fresh-form reopening. No live enquiry was sent. |
| Interior gallery | Real Next/Previous input through failed image, Retry, recovery and late completion of a superseded image; counter/source/latest intent checked. Error and Retry must be fully within the viewport. Mobile WebKit uses touch input for the failure/recovery path. |
| Feature disclosures | Seven native disclosures and their destinations reviewed. The first has project copy/photo; the remaining six honestly open a feature-specific enquiry. No unavailable feature copy was invented. |
| Location, privacy and 404 | All generated internal destinations and fragment targets checked. External provider availability is outside the static route check. |
| Film and poster | Normal missing-film build and configured fixture build verified separately; see the exact boundary below. |
| Branding, controls and motion | Primary Figma exports compared with decoded actual brand frames; desktop 1440, tablet 900, mobile 390 and 320 reviewed. Dark dialog/footer action colors, mobile close/submit controls, normal-motion gallery transition and preference switching checked separately. |

## Confirmed findings and fixes

### AVA-V3-01: Floor-plan image leaves the application

**Reproduce:** Open /residences/801/ or /residences/1601/ and activate the floor-plan preview.

**Baseline:** The preview navigates to the raw WebP, while View floor plan opens a dialog.

**Fixed:** Normal preview activation now uses the same viewer, title and source as the button. Modifier/no-JavaScript original-file fallback is retained.

### AVA-V3-02: Asynchronous floor-plan readiness is not represented

**Reproduce:** Delay or fail plan-1601.webp, then open, close/reopen, or switch residences.

**Baseline:** The dialog can be blank with enabled zoom/download and no loading or retry state. Chromium baseline showed a blank image, not a demonstrated wrong-801 frame.

**Fixed:** A decoded matching source is committed atomically. Loading/error/retry are visible; zoom and download wait for readiness. Tokens cancel stale commits after close or later intent.

### AVA-V3-03: Enquiry error and invalid field can remain out of view

**Reproduce:** At 390×600 submit the intercepted fixture, close/reopen while pending, then return 503 and 422.

**Baseline:** The form preserves its values but the error is below the inner scroll viewport; server-invalid email is not reliably focused after disabled controls are restored.

**Fixed:** After pending controls are restored, the active dialog scrolls/focuses its invalid field or error. Retry retains the same request reference for identical input.

### AVA-V3-04: Configured film lacks a usable failure/retry lifecycle

**Reproduce:** Build with a local fixture film URL; fail its request; activate Watch video and native Play; then rotate/scroll the short dialog.

**Baseline:** The nested source failure does not expose the custom fallback/retry. In short landscape the dialog close control scrolls out of view.

**Fixed:** Explicit activation starts playback, direct video src reports errors, Retry reloads, Close pauses, and an inner scroller keeps Close visible. Visibility/pagehide also pause in source.

### AVA-V3-05: Footer lockup proportions diverge from Figma

**Reproduce:** Compare the footer at desktop/tablet/mobile with Figma node 1:1985.

**Baseline:** Independent flex widths/heights and spacing distort the intended group and its tablet/mobile proportions.

**Fixed:** The complete 325.001×28.091 authored group now scales together, with its exact internal offsets and AVA crop.

### AVA-V3-06: Partner cards substitute type for original brand artwork

**Reproduce:** Compare partner cards to Figma nodes 1:1699 and 1:1704.

**Baseline:** Text approximations omit the original Dorchester mark and OMNIYAT artwork/color.

**Fixed:** Original transparent Figma layers are restored with the authored fill geometry. No brand artwork was redrawn.

### AVA-V3-07: Failed gallery navigation gives no explanation or retry

**Reproduce:** Fail the second interior image and activate Next.

**Baseline:** The visible first frame and counter remain unchanged, with no visible error/retry, making the button appear dead.

**Fixed:** The good frame is retained, a compact error and Try again appear, and recovery/late image completion respect the latest user intent.

## Primary design source and visual evidence

Figma file: `m3N3lJCoutaziEm4nt4CwO`. The existing design session `bcbc9432-ff5d-4e7e-acca-8bd2487dbf82` was reused. See [figma-provenance.json](verification/interaction-v3/figma-provenance.json) and [native-size pixel comparisons](verification/interaction-v3/figma-pixel-comparison.json).

| Source node | Restoration |
| --- | --- |
| [1:1985](https://www.figma.com/design/m3N3lJCoutaziEm4nt4CwO?node-id=1-1985), children 1:1986–1:1988 | Footer group 325.001 × 28.091; AVA crop frame 132 × 22, image crop top −111.11% / height 329.17%; authored Dorchester and divider offsets. The whole group scales together at smaller widths. |
| [1:1699](https://www.figma.com/design/m3N3lJCoutaziEm4nt4CwO?node-id=1-1699) | Dorchester card 315 × 44, using the original transparent square source with its authored nonuniform fill. Its raw square aspect is not its designed logo aspect. |
| [1:1704](https://www.figma.com/design/m3N3lJCoutaziEm4nt4CwO?node-id=1-1704) | OMNIYAT 141 × 37, retaining the original two transparent layers, black lettering and source red RGB 201,32,53. |

The opaque cream canvases returned by rendered-node exports are comparison references only. Runtime assets are the original transparent layers. No logo was recreated from typed text or repainted. Header/menu AVA masks were retained because their source geometry already matched.

Native-size browser captures use the production assets/styles with the reference canvas background. No image rescaling or recoloring is applied to the comparison. RGB mean absolute errors on a 0–255 scale are 0.249 for the footer, 0.100 for Dorchester and 3.471 for OMNIYAT. The OMNIYAT edge antialiasing differs, while its source solid black/red and outline proportions agree. These numbers support the visual comparison; they are not a whole-page pixel-perfect claim.

The initial fast footer capture happened before a lazy logo decoded. Acceptance captures now wait for complete, decoded images and actual paint. The visible footer, three brand layers and responsive proportions were inspected after that wait. Error status placement in the interior gallery was also corrected after a screenshot exposed a partly clipped desktop notice; its final desktop and mobile bounds are tested.

## Film behavior and its limits

The production configuration has no supplied `PUBLIC_AVA_FILM_URL`. A normal build with that variable empty contains no video element and exposes **Request the film**. Both Chromium and mobile WebKit confirmed that it opens the enquiry with `The Sky Palace / Film request`, closes correctly and returns focus. No `/__qa__/film.webm` path remains in this build.

The configured-film branch was tested separately in isolated baseline/fixed builds with an eight-second, synthetic 320 × 180 VP8 WebM. This asset is a local QA fixture and is not in the repository's public assets. Requests were failed and then restored. Verification used real media playback/currentTime progression, native controls, Retry, Close pause and reopened playback; it did not infer playback from DOM metadata. The close control remains visible in the 844 × 390 short-landscape dialog.

The fixture has no audio. Real project film availability, encoding, audio, hosting/CORS and delivery cannot be approved without the actual film asset. The source pauses on document hidden/pagehide. In the headless foreground-tab probe the first tab remained `visible`, so actual background-tab pause is **not** claimed as runtime-verified. Closing the dialog and playback pause/resume were verified with real playback.

## Reviewable evidence

- [Regression summary and before/fixed observations](verification/interaction-v3/regressions.json), [finding ledger](verification/interaction-v3/findings.json), [route/arrow checks](verification/interaction-v3/source-route-check.json).
- [Plan image baseline](verification/interaction-v3/before-webkit-plan-image-801.jpg), [fixed viewer](verification/interaction-v3/after-webkit-plan-image-801.jpg), [loading](verification/interaction-v3/after-webkit-plan-1601-pending.jpg), [failed load with Retry](verification/interaction-v3/after-webkit-plan-1601-error.jpg).
- [Enquiry error before](verification/interaction-v3/before-webkit-enquiry-error-after-reopen.jpg) and [after](verification/interaction-v3/after-webkit-enquiry-error-after-reopen.jpg).
- [Film failure/retry](verification/interaction-v3/after-webkit-film-failure.jpg), [landscape Close](verification/interaction-v3/after-webkit-film-landscape-scrolled.jpg), [production missing-film enquiry](verification/interaction-v3/production-no-film-webkit-enquiry.jpg).
- [Partner cards before](verification/interaction-v3/before-webkit-partners-390.jpg) and [after](verification/interaction-v3/after-webkit-partners-390.jpg), [decoded desktop footer](verification/interaction-v3/after-chromium-footer-1440.jpg), [mobile gallery error](verification/interaction-v3/after-webkit-gallery-failure-interiors.jpg).
- [Additional visual/normal-motion results](verification/interaction-v3/visual-probe-results.json), [normal production missing-film results](verification/interaction-v3/production-no-film-results.json).

## Verification method, source freeze and boundaries

Baseline and fixed source were built in separate local directories and served on localhost. Form responses were intercepted before network delivery, using controlled 503/422/200 responses and fictional `example.invalid` input. All external requests and unmocked non-GET requests were blocked; the static server independently rejects non-GET. Primary fixed journeys report no page errors and no unexpected outbound requests.

Held images and 503 responses verify pending/failure behavior instead of relying only on cached success. For two intentionally pending WebKit screenshot states, the harness bypasses Playwright's `document.fonts.ready` wait because that wait also waits for the held image. Ordinary brand/visual captures wait for fonts and decoded images. This changes only the capture harness, not application behavior.

`npm run check` and the relevant final builds succeeded. AVA's check retains one pre-existing unused-import hint in `tests/enquiry.test.mjs` with zero errors/warnings; no unrelated test code was changed. The source file hashes and exact local build flags are in [source-freeze.json](verification/interaction-v3/source-freeze.json). Detailed raw results, original PNGs, source inventory, logs and the controlled harness remain in `artifacts/logic-audit-20261101-v3/`; compact evidence is versioned here. Old V2 reports were not overwritten.

These results establish the listed routes and changed contracts in the stated browser/viewport combinations. They do not certify every physical device, actual multi-finger pinch hardware, every network/OS media policy, external service uptime or real enquiry delivery. Normal-motion checks exercise decoded transitions and preference changes; they are not a frame-rate benchmark. Primary design source comparison is explicit about rendering differences and does not assert that every page pixel is identical across browsers.
