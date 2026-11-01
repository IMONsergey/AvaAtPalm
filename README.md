# AVA at Palm Jumeirah

An Astro implementation of the prepared AVA design in the existing real-estate Figma file. The site retains the original panoramic sequence, artwork, typography, palette, asymmetric desktop composition and separate mobile arrangements.

## Run

Use Node 24.x.

```sh
npm ci
npm run dev
npm run check
node --test tests/enquiry.test.mjs
npm run build
```

The local development port is 4323. `ASTRO_TELEMETRY_DISABLED=1` can be set in restricted development environments. Dependencies are pinned and the lockfile is included.

## Pages and interactions

| Route | Content |
| --- | --- |
| `/` | Panoramic tower, architecture and collage, Sky Palace story, two supplied residence cards, four-image interior gallery, seven feature disclosures, Palm Jumeirah setting, enquiry and partner information |
| `/residences/801/` | Three-bedroom residence, supplied measurements, original plan, orientation and floor position |
| `/residences/1601/` | Four-bedroom residence, supplied measurements, original plan, orientation and floor position |
| `/location/` | Supplied aerial and waterfront images with the original location story |
| `/privacy/` | How this build's enquiry service uses submitted information; contextual privacy request form |
| `/api/enquiry` | Dynamic Astro endpoint for private enquiry storage |

The gallery supports buttons, arrow keys, pointer swipes and wraparound, without automatic playback. The plan viewer supports fit, zoom buttons, keyboard zoom and pan, dragging, two-finger pinch, and download of the supplied plan image. Native dialogs provide keyboard focus containment and Escape dismissal. Menus and feature disclosures use semantic controls. Enquiries carry the selected residence or feature into the form.

GSAP provides restrained heading/image reveals and desktop depth movement. Scrolling remains native. `prefers-reduced-motion` disables decorative motion and makes gallery changes immediate; content stays available.

## Design provenance

- [Original AVA design](https://www.figma.com/design/m3N3lJCoutaziEm4nt4CwO/?node-id=1-1690)
- [Prepared desktop](https://www.figma.com/design/m3N3lJCoutaziEm4nt4CwO/?node-id=2028-382)
- [Prepared mobile](https://www.figma.com/design/m3N3lJCoutaziEm4nt4CwO/?node-id=2038-696)
- [Residence 801 detail](https://www.figma.com/design/m3N3lJCoutaziEm4nt4CwO/?node-id=2038-935)
- [Residence 1601 detail](https://www.figma.com/design/m3N3lJCoutaziEm4nt4CwO/?node-id=2038-968)

Every photograph, plan and logo comes from the source Figma file. Figma-generated asset URLs were downloaded locally; the implementation has no dependency on expiring Figma URLs. One photo with a repeatedly failing export was retrieved as the exact original bitmap through its image hash. No page or section screenshot is used as a website background.

The font files are the supplied Catalina Village, SF UI Display and Graphik LCG originals, plus Inter. All are served locally. There are no font substitutions. Image dimensions and SHA-256 hashes of the downloaded originals are recorded in `src/data/assets.json`. Photos use WebP with responsive variants; drawings and logos use lossless encoding. UI text, controls, layout and interaction remain native HTML/CSS/TypeScript.

## Enquiry service

The Vercel adapter serves `/api/enquiry`; the other pages are statically generated. Configure the private Vercel Blob store for the project using the variables described in `.env.example`. Never expose server credentials through `PUBLIC_` variables.

The form posts `project`, `context`, `name`, `email`, optional `phone`/`message`, boolean `consent`, the empty `website` honeypot, a form-opening timestamp, and a UUID `submissionId`. The UUID remains stable on a retry. The client shows success only after an HTTP success response containing `ok: true`. Validation failures, storage errors, network errors and timeouts retain the entered fields. There is no simulated production success state.

The server validates input, limits request size, checks request origin, applies per-instance abuse limits, and writes enquiries to a private store. Retries use the same identifier without overwriting an earlier enquiry. Responses do not expose customer data. The privacy page describes this build's private inbox; the form does not claim automatic forwarding to the developer or property operator.

## Content boundaries and remaining source dependencies

The AVA residence collection and the Sky Palace are separate sections and enquiry contexts. The original reference to **17 private havens** describes the supplied AVA collection story; it is not presented as 17 Sky Palaces. The count, residence areas, parking counts and feature claims are carried over from the supplied design and should be confirmed by the owner when source content is maintained. Prices, live availability and new property specifications have not been invented.

The source provides full detail for **Life above 100 metres**. The other six feature labels lead to contextual enquiries; the first feature's photo and claims are not reused as invented descriptions for them.

No film file or confirmed film URL was supplied. The Watch video control opens a designed unavailable state with a contextual enquiry action. To connect the actual film, set `PUBLIC_AVA_FILM_URL` to the provided media URL (or a local public media path) and rebuild. Playback uses a native video element and has a real load-error/retry state.

The floor plans are supplied raster originals, 894 × 803 and 844 × 789 pixels. Their proportions and labels are preserved. Vector or PDF originals would improve high-magnification inspection; the current download is clearly labelled as an image. No PDF is fabricated. The location page uses the supplied imagery and text without inventing a street address or map pin.

## Verification

The implementation was checked in Chromium at 360, 390, 1024 and 1440 pixel viewport widths, across the five content routes. Browser checks cover image/font loading, horizontal overflow, menu focus and Escape, gallery controls and keyboard navigation, feature context, form validation, retained data and identifier on retry, success gating, plan controls, and reduced-motion behavior. Error and success responses are intercepted only inside the browser test harness; production requests always reach the actual endpoint.

The private server handler is covered by `tests/enquiry.test.mjs`. Build and type checks use the pinned production dependencies. Visual review includes desktop and mobile hero, architecture, residence cards, Sky Palace, features, closing section, detail plans and enquiry states.
