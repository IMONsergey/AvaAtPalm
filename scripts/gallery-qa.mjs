import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const project = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
const atlantis = manifest.name.startsWith('atlantis');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || process.env.BASE_URL || `http://127.0.0.1:${atlantis ? 14322 : 14325}`;
const output = process.env.GALLERY_QA_OUTPUT || path.join(project, 'artifacts/pixel-audit-20261101-v2/gallery');
const engines = (process.env.GALLERY_QA_ENGINES || 'chromium,webkit').split(',');
const secondSource = atlantis ? 'interiorMiddle' : 'interior-2';
const countSelector = atlantis ? '[data-slider-count]' : '[data-counter]';
const trackSelector = atlantis ? '.interior-slides' : '[data-track]';
const report = { base, startedAt: new Date().toISOString(), engines: [], apiRequests: 0, pageErrors: [] };
await mkdir(output, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function state(page) {
  return page.locator('#interiors').evaluate((gallery, config) => {
    const slides = [...gallery.querySelectorAll('[data-slide]')];
    const selected = slides.filter(slide => slide.getAttribute('aria-hidden') === 'false');
    const active = selected[0], image = active?.querySelector('img');
    const frame = gallery.querySelector(config.trackSelector === '[data-track]' ? '.gallery-window' : config.trackSelector);
    function rect(el) { const r = el?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } : null; }
    let opacity = 1;
    for (let node = image; node && node !== gallery.parentElement; node = node.parentElement) {
      const style = getComputedStyle(node); opacity *= Number(style.opacity);
      if (style.visibility === 'hidden' || style.display === 'none') opacity = 0;
    }
    return { counter: gallery.querySelector(config.countSelector).textContent.trim(), selected: selected.length,
      index: slides.indexOf(active), naturalWidth: image?.naturalWidth, src: image?.currentSrc, alt: image?.alt,
      opacity, image: rect(image), slide: rect(active), frame: rect(frame), gallery: rect(gallery), scrollY,
      bodyLock: document.body.classList.contains('has-dialog'), bodyOverflow: getComputedStyle(document.body).overflowY, htmlOverflow: getComputedStyle(document.documentElement).overflowY,
      dialogs: document.querySelectorAll('dialog[open]').length,
      inactive: slides.filter(slide => slide !== active).every(slide => slide.inert && slide.getAttribute('aria-hidden') === 'true') };
  }, { trackSelector, countSelector });
}
async function waitCount(page, number) {
  await page.waitForFunction(({ selector, number }) => document.querySelector('#interiors ' + selector)?.textContent.trim().startsWith(number + ' /'), { selector: countSelector, number });
}
async function readyFrame(page) {
  await page.waitForFunction(() => {
    const gallery = document.querySelector('#interiors'), active = gallery.querySelector('[data-slide][aria-hidden="false"]');
    const image = active?.querySelector('img'), frame = gallery.querySelector('.gallery-window,.interior-slides');
    if (!image?.complete || !image.naturalWidth || !frame) return false;
    const actual = active.getBoundingClientRect(), photo = image.getBoundingClientRect(), expected = frame.getBoundingClientRect();
    // AVA's second photograph intentionally extends beyond the slide for its source crop.
    return Number(getComputedStyle(active).opacity) > .98 && Math.abs(actual.x - expected.x) < 2 && Math.abs(actual.y - expected.y) < 2 && photo.x <= expected.x + 1 && photo.right >= expected.right - 1 && photo.y <= expected.y + 1 && photo.bottom >= expected.bottom - 1;
  });
}
function assertFrame(observed) {
  assert.equal(observed.selected, 1); assert.equal(observed.inactive, true);
  assert.ok(observed.naturalWidth > 0 && observed.opacity > .98, `Frame is blank: ${JSON.stringify(observed)}`);
  assert.ok(Math.abs(observed.slide.x - observed.frame.x) < 2, `Frame shifted horizontally: ${JSON.stringify(observed)}`);
  assert.ok(Math.abs(observed.slide.y - observed.frame.y) < 2, `Frame shifted vertically: ${JSON.stringify(observed)}`);
  assert.ok(observed.image.x <= observed.frame.x + 1 && observed.image.right >= observed.frame.right - 1 && observed.image.y <= observed.frame.y + 1 && observed.image.bottom >= observed.frame.bottom - 1, 'Photo no longer covers the selected frame');
  assert.equal(observed.dialogs, 0); assert.equal(observed.bodyLock, false);
  assert.notEqual(observed.htmlOverflow, 'hidden'); assert.notEqual(observed.bodyOverflow, 'hidden');
}
async function prepare(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#interiors').evaluate(el => scrollTo({ top: el.getBoundingClientRect().top + scrollY, behavior: 'instant' }));
  await page.locator('#interiors [data-slide] img').first().evaluate(async image => { image.loading = 'eager'; await image.decode(); });
  await pause(250);
}
let failed;
try {
  for (const engine of engines) {
    assert.ok(['chromium', 'webkit'].includes(engine));
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    const result = { engine, browserVersion: browser.version(), checks: [] }; report.engines.push(result);
    async function run(name, setup, check, cleanup = () => {}) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'no-preference' });
      await context.route('**/api/**', route => { report.apiRequests++; return route.abort(); });
      const page = await context.newPage(); page.setDefaultTimeout(8000);
      page.on('pageerror', error => report.pageErrors.push({ engine, name, message: error.message }));
      try { await setup(context); await prepare(page); const observed = await check(page, context); result.checks.push({ name, passed: true, observed }); }
      catch (error) { await page.screenshot({ path: path.join(output, `${engine}-${name}-failure.png`) }).catch(() => {}); result.checks.push({ name, passed: false, message: error.message }); throw error; }
      finally { cleanup(); await context.close(); await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
    }
    try {
      let held = true, releases = [];
      await run('delayed-last-request', context => context.route(`**/*${secondSource}*`, async route => {
        if (held) await new Promise(resolve => releases.push(resolve));
        await route.continue().catch(() => {});
      }), async page => {
        const before = await state(page); await page.locator('#interiors [data-next]').click(); await pause(150);
        const pending = await state(page); assert.equal(pending.counter, before.counter); assert.equal(pending.src, before.src); assertFrame(pending);
        await page.screenshot({ path: path.join(output, `${engine}-pending-frame.png`) });
        await page.locator('#interiors [data-next]').click(); await waitCount(page, 3); await readyFrame(page);
        const latest = await state(page); assertFrame(latest);
        held = false; releases.forEach(release => release()); releases = []; await pause(600);
        const late = await state(page); assert.equal(late.counter, latest.counter); assert.equal(late.src, latest.src); assertFrame(late);
        return { before, pending, latest, late };
      }, () => { held = false; releases.forEach(release => release()); releases = []; });
      let rejectImage = true;
      await run('failed-image-skip-and-retry', context => context.route(`**/*${secondSource}*`, route => rejectImage ? route.abort('failed') : route.continue()), async page => {
        await page.locator('#interiors [data-next]').click(); await pause(300);
        const rejected = await state(page); assert.equal(rejected.counter, atlantis ? '1 / 3' : '1 / 4'); assertFrame(rejected);
        await page.locator('#interiors [data-next]').click(); await waitCount(page, 3); await readyFrame(page);
        const skipped = await state(page); assertFrame(skipped);
        rejectImage = false; await page.locator('#interiors [data-prev]').click(); await waitCount(page, 2); await readyFrame(page);
        const retried = await state(page); assertFrame(retried); await page.screenshot({ path: path.join(output, `${engine}-recovered-frame.png`) });
        await prepare(page); await page.locator('#interiors [data-next]').click(); await waitCount(page, 2); await readyFrame(page); const reloaded = await state(page); assertFrame(reloaded);
        return { rejected, skipped, retried, reloaded };
      });
      await run('motion-switch-and-pointer-cancel', async () => {}, async (page, context) => {
        const samples = [];
        for (let i = 0; i < 6; i++) {
          const before = await state(page); const total = Number(before.counter.split('/')[1]); const expected = (before.index + 1) % total + 1;
          await page.locator('#interiors [data-next]').click(); await waitCount(page, expected);
          const readingTop = (await state(page)).gallery.y;
          await page.emulateMedia({ reducedMotion: 'reduce' }); await pause(200);
          const reduced = await state(page); assertFrame(reduced); assert.ok(Math.abs(reduced.gallery.y - readingTop) < 2, 'Reduced motion lost reading position');
          await page.emulateMedia({ reducedMotion: 'no-preference' }); await pause(200);
          const normal = await state(page); assertFrame(normal); assert.ok(Math.abs(normal.gallery.y - readingTop) < 2, 'Normal motion lost reading position');
          samples.push({ reduced, normal });
        }
        let pointerCancellation = 'Not run: native Chromium CDP touch only';
        if (engine === 'chromium') {
          const client = await context.newCDPSession(page);
          const frame = (await state(page)).frame;
          const x = frame.x + Math.min(frame.width * .7, 250), y = Math.max(40, frame.y + 120);
          const before = await state(page);
          await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 75, y }] });
          await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
          await pause(150); assert.equal((await state(page)).counter, before.counter, 'Cancelled gesture advanced gallery');
          await page.locator('#interiors [data-next]').click(); await waitCount(page, (before.index + 1) % Number(before.counter.split('/')[1]) + 1); await readyFrame(page); assertFrame(await state(page));
          pointerCancellation = 'Native touchStart/touchMove/touchCancel; no advance, next button remains usable';
        }
        await page.screenshot({ path: path.join(output, `${engine}-motion-restored.png`) });
        return { samples, pointerCancellation };
      });
    } finally { await browser.close(); }
  }
  assert.equal(report.apiRequests, 0); assert.deepEqual(report.pageErrors, []);
} catch (error) { failed = error; }
report.finishedAt = new Date().toISOString(); report.passed = !failed;
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, engines: report.engines.map(result => ({ engine: result.engine, checks: result.checks.map(check => ({ name: check.name, passed: check.passed })) })), apiRequests: report.apiRequests, pageErrors: report.pageErrors, error: failed?.message }));
if (failed) process.exitCode = 1;
