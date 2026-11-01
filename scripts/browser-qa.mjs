import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright');
const project = fileURLToPath(new URL('../', import.meta.url));
const base = process.env.BASE_URL || 'http://127.0.0.1:4315';
const output = process.env.QA_OUTPUT || `${project}/artifacts`;
await mkdir(output, { recursive: true });

let serverLog = '';
let serverError;
const server = process.env.BASE_URL ? null : spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1', '--port', '4315'], { cwd: project, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
const serverClosed = server ? new Promise(resolve => server.once('close', resolve)) : Promise.resolve();
server?.stdout.on('data', chunk => { serverLog = (serverLog + chunk).slice(-20000); });
server?.stderr.on('data', chunk => { serverLog = (serverLog + chunk).slice(-20000); });
server?.on('error', error => { serverError = error; });

let browser;
let activePage;
let step = 'start';
const report = [];
let cleanupPromise;

function signalServer(signal) {
  if (!server?.pid) return;
  try {
    if (process.platform === 'win32') server.kill(signal);
    else process.kill(-server.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function stopServer() {
  if (!server) return;
  signalServer('SIGTERM');
  await Promise.race([serverClosed, delay(1500)]);
  // Also covers a helper process left behind after the main Astro process exits.
  signalServer('SIGKILL');
  await Promise.race([serverClosed, delay(1500)]);
}

function cleanup() {
  cleanupPromise ??= Promise.allSettled([
    stopServer(),
    Promise.race([Promise.resolve(browser?.close()), delay(5000)]),
  ]);
  return cleanupPromise;
}

process.once('exit', () => signalServer('SIGKILL'));
process.once('SIGINT', () => { void cleanup().finally(() => process.exit(130)); });
process.once('SIGTERM', () => { void cleanup().finally(() => process.exit(143)); });

async function auditPage(page, label) {
  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images].filter(image => image.getAttribute('src') || image.getAttribute('srcset'));
    images.forEach(image => { image.loading = 'eager'; });
    // Let eager loading and responsive candidate selection start before observing readiness.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const failures = [];
    const resourceDeadline = performance.now() + 15000;
    async function awaitLoad(image) {
      if (image.complete) return;
      await new Promise(resolve => {
        const finish = () => { clearTimeout(timer); image.removeEventListener('load', finish); image.removeEventListener('error', finish); resolve(); };
        const timer = setTimeout(finish, Math.max(0, resourceDeadline - performance.now()));
        image.addEventListener('load', finish, { once: true });
        image.addEventListener('error', finish, { once: true });
        if (image.complete) finish();
      });
    }
    // Sequential decode avoids forcing every large source into the decoder at once.
    for (const image of images) {
      let decodeError = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        await awaitLoad(image);
        const candidate = image.currentSrc || image.src;
        if (image.complete && image.naturalWidth) {
          try { await image.decode(); decodeError = ''; }
          catch (error) { decodeError = String(error); }
        }
        if (candidate === (image.currentSrc || image.src)) break;
      }
      if (!image.complete || !image.naturalWidth || decodeError) failures.push({
        src: image.currentSrc || image.getAttribute('src'), complete: image.complete,
        naturalWidth: image.naturalWidth, decodeError,
      });
    }
    return {
      width: innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      imageCount: images.length,
      brokenImages: failures,
    };
  });
  assert.ok(result.scrollWidth <= result.clientWidth + 1 && result.bodyScrollWidth <= result.clientWidth + 1, `${label}: horizontal overflow ${JSON.stringify(result)}`);
  assert.deepEqual(result.brokenImages, [], `${label}: all referenced images must finish loading and decode`);
  return { page: label, ...result };
}

async function galleryCount(page, value) {
  await page.waitForFunction(value => document.querySelector('[data-carousel] [data-counter]')?.textContent?.trim() === value, value);
}

async function expectFocus(locator, label) {
  assert.equal(await locator.evaluate(element => element === document.activeElement), true, label);
}

try {
  const deadline = Date.now() + 45000;
  let ready = false;
  while (Date.now() < deadline) {
    if (serverError) throw serverError;
    if (server && (server.exitCode !== null || server.signalCode !== null)) throw new Error(`Astro exited with ${server.exitCode ?? server.signalCode}: ${serverLog}`);
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch {}
    await delay(500);
  }
  assert.equal(ready, true, `Astro did not become ready: ${serverLog}`);
  browser = await chromium.launch({ headless: true });

  for (const width of [1440, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: width >= 768 ? 1000 : 844 }, reducedMotion: 'reduce' });
    activePage = page;
    page.setDefaultTimeout(15000);
    const errors = [];
    const assetFailures = [];
    const requests = [];
    const pages = [];
    let responseMode = 'failure';
    let releasePending;
    let requestReached;
    let pendingGate;
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && /\/(assets|fonts)\//.test(new URL(response.url()).pathname)) assetFailures.push({ url: response.url(), status: response.status() }); });

    // Every enquiry in this program is intercepted; no real lead is created.
    await page.route('**/api/enquiry', async route => {
      const payload = route.request().postDataJSON();
      requests.push(payload);
      if (responseMode === 'pending-success') {
        requestReached();
        await pendingGate;
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, id: payload.submissionId }) });
      } else {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'QA connection unavailable. Please retry.' }) });
      }
    });

    step = `${width}: home layout and assets`;
    await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(await page.title(), 'AVA at Palm Jumeirah | Inhabit the infinite');
    assert.equal((await page.locator('h1').textContent()).trim(), 'The Sky Palace');
    pages.push(await auditPage(page, '/'));
    if (width === 1440 || width === 390) {
      await page.screenshot({ path: `${output}/ava-${width}-hero.png` });
      await page.screenshot({ path: `${output}/ava-${width}-home.png`, fullPage: true });
    }

    step = `${width}: menu and focus`;
    if (width < 768) {
      const menuButton = page.locator('.menu-toggle');
      await menuButton.click();
      await page.locator('#menu-dialog').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#menu-dialog').evaluate(dialog => dialog.contains(document.activeElement)), true);
      await page.keyboard.press('Escape');
      await page.locator('#menu-dialog').waitFor({ state: 'hidden' });
      await expectFocus(menuButton, 'Menu Escape restores trigger focus');
      await menuButton.click();
      await page.locator('#menu-dialog [href="/#location"]').click();
      await page.locator('#menu-dialog').waitFor({ state: 'hidden' });
      await page.waitForURL(url => url.hash === '#location');
    } else {
      assert.equal(await page.locator('.desktop-nav').isVisible(), true);
    }

    step = `${width}: architectural hotspots`;
    for (const hash of ['#sky-palace', '#residences', '#location', '#features']) {
      assert.equal(await page.locator(hash).count(), 1);
      await page.locator(`.hero-points .hotspot[href="${hash}"]`).click();
      await page.waitForURL(url => url.hash === hash);
    }

    step = `${width}: interior gallery`;
    const gallery = page.locator('[data-carousel]');
    assert.equal(await gallery.locator('[data-counter]').innerText(), '1 / 4');
    await gallery.locator('[data-next]').click();
    await galleryCount(page, '2 / 4');
    assert.equal(await gallery.locator('[data-counter]').innerText(), '2 / 4');
    await gallery.focus();
    await page.keyboard.press('ArrowRight');
    await galleryCount(page, '3 / 4');
    assert.equal(await gallery.locator('[data-counter]').innerText(), '3 / 4');
    await gallery.locator('[data-prev]').click();
    await galleryCount(page, '2 / 4');
    assert.equal(await gallery.locator('[data-counter]').innerText(), '2 / 4');
    assert.equal(await gallery.locator('[data-slide][aria-hidden="false"]').count(), 1);

    step = `${width}: Sky Palace features`;
    const feature = page.locator('#features details').filter({ has: page.locator('summary', { hasText: 'Private garage' }) });
    await feature.locator('summary').click();
    assert.equal(await feature.evaluate(element => element.open), true);
    const featureEnquiry = feature.locator('[data-action="enquire"]');
    await featureEnquiry.click();
    await page.locator('#enquiry-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#enquiry-form input[name="context"]').inputValue(), 'The Sky Palace / Private garage');
    await page.keyboard.press('Escape');
    await expectFocus(featureEnquiry, 'Enquiry Escape restores feature trigger focus');

    step = `${width}: residence pages and original plans`;
    await page.locator('.open-residence[href="/residences/801/"]').click();
    await page.waitForURL(url => url.pathname === '/residences/801/');
    for (const unit of ['801', '1601']) {
      await page.waitForURL(url => url.pathname === `/residences/${unit}/`);
      assert.equal(await page.title(), `Residence ${unit} | AVA at Palm Jumeirah`);
      pages.push(await auditPage(page, `/residences/${unit}/`));
      const planTrigger = page.locator(`[data-plan][data-unit="${unit}"]`);
      await planTrigger.click();
      const dialog = page.locator('#plan-dialog');
      await dialog.waitFor({ state: 'visible' });
      assert.match(await dialog.locator('#plan-title').innerText(), new RegExp(`Unit ${unit}`));
      await dialog.locator('[data-plan-image]').evaluate(image => image.decode());
      assert.equal(await dialog.locator('[data-plan-image]').getAttribute('src'), `/assets/plan-${unit}.webp`);
      assert.ok((await dialog.locator('[data-plan-download]').getAttribute('href')).endsWith(`/assets/plan-${unit}.webp`));
      await dialog.locator('[data-zoom-in]').click();
      assert.equal(await dialog.locator('[data-zoom-value]').innerText(), '130%');
      await dialog.locator('[data-plan-stage]').focus();
      await page.keyboard.press('Equal');
      assert.equal(await dialog.locator('[data-zoom-value]').innerText(), '160%');
      await page.keyboard.press('0');
      assert.equal(await dialog.locator('[data-zoom-value]').innerText(), '100%');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      await expectFocus(planTrigger, 'Plan Escape restores trigger focus');
      if (unit === '801') await page.locator('.detail-bottom a[href="/residences/1601/"]').click();
    }

    step = `${width}: form validation`;
    const enquiryTrigger = page.locator('[data-action="enquire"][data-context="Residence 1601 / 4 bedroom"]');
    const form = page.locator('#enquiry-form');
    const enquiry = page.locator('#enquiry-dialog');
    const submit = form.locator('button[type="submit"]');
    await enquiryTrigger.click();
    await enquiry.waitFor({ state: 'visible' });
    await submit.click();
    for (const name of ['name', 'email', 'consent']) {
      assert.ok(await form.locator(`#${name}-error`).innerText());
      assert.equal(await form.locator(`[name="${name}"]`).getAttribute('aria-invalid'), 'true');
    }
    await expectFocus(form.locator('[name="name"]'), 'Invalid form focuses its first invalid field');
    assert.equal(requests.length, 0, 'Invalid fields must not submit');

    step = `${width}: failed request and unchanged retry after reopen`;
    await form.locator('[name="name"]').fill('Website QA');
    await form.locator('[name="email"]').fill('website-qa@example.test');
    await form.locator('[name="consent"]').check();
    await submit.click();
    await page.waitForFunction(() => document.querySelector('#enquiry-form .form-error')?.textContent?.includes('QA connection unavailable'));
    await page.waitForFunction(() => !document.querySelector('#enquiry-form')?.hasAttribute('aria-busy'));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].context, 'Residence 1601 / 4 bedroom');
    assert.match(requests[0].submissionId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(await form.locator('[name="name"]').inputValue(), 'Website QA');
    assert.equal(await form.locator('[name="email"]').inputValue(), 'website-qa@example.test');
    const originalId = requests[0].submissionId;
    const originalStartedAt = requests[0].startedAt;
    await page.keyboard.press('Escape');
    await enquiryTrigger.click();
    await submit.click();
    await page.waitForFunction(() => !document.querySelector('#enquiry-form')?.hasAttribute('aria-busy') && !document.querySelector('#enquiry-form .form-error')?.hidden);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].submissionId, originalId, 'Unchanged retry preserves the reference across reopen');
    assert.equal(requests[1].startedAt, originalStartedAt, 'Reopening an unfinished enquiry preserves its start time');

    step = `${width}: changed payload, pending guard and confirmed success`;
    await form.locator('[name="phone"]').fill('+971 50 123 4567');
    responseMode = 'pending-success';
    const reached = new Promise(resolve => { requestReached = resolve; });
    pendingGate = new Promise(resolve => { releasePending = resolve; });
    await submit.click();
    let requestTimeout;
    try {
      await Promise.race([reached, new Promise((_, reject) => { requestTimeout = setTimeout(() => reject(new Error('Pending enquiry did not reach the mocked endpoint')), 15000); })]);
    } finally {
      clearTimeout(requestTimeout);
    }
    try {
      assert.equal(requests.length, 3);
      assert.notEqual(requests[2].submissionId, originalId, 'Changed enquiry data gets a new reference');
      assert.equal(await form.getAttribute('aria-busy'), 'true');
      assert.equal(await form.locator('input, textarea, select, button').evaluateAll(controls => controls.every(control => control.disabled)), true, 'All form controls freeze while sending');
      await form.evaluate(element => element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      await page.keyboard.press('Escape');
      await enquiryTrigger.click();
      assert.equal(await form.locator('[name="phone"]').inputValue(), '+971 50 123 4567');
      assert.equal(await form.locator('[name="phone"]').isDisabled(), true);
      assert.equal(await form.locator('[name="context"]').inputValue(), 'Residence 1601 / 4 bedroom');
      assert.equal(requests.length, 3, 'Pending request cannot be duplicated by submit or reopen');
      if (width === 1440) {
        await page.setViewportSize({ width: 844, height: 390 });
        await page.mouse.move(600, 240);
        await page.mouse.wheel(0, 2000);
        await page.waitForTimeout(150);
      }
    } finally {
      releasePending();
    }
    await enquiry.locator('.enquiry-success').waitFor({ state: 'visible' });
    assert.equal(await enquiry.locator('[data-enquiry-reference]').innerText(), requests[2].submissionId);
    await expectFocus(enquiry.locator('.enquiry-success'), 'Confirmed success receives focus');
    const successView = await enquiry.locator('.enquiry-success').evaluate(element => {
      const scroller = element.closest('[data-dialog-scroll]');
      return { scrollTop: scroller.scrollTop, scrollTopEdge: scroller.getBoundingClientRect().top, headingTop: element.querySelector('h2').getBoundingClientRect().top };
    });
    assert.ok(successView.scrollTop === 0 && successView.headingTop >= successView.scrollTopEdge, `Success heading is clipped after a scrolled form: ${JSON.stringify(successView)}`);
    assert.equal(await enquiry.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, 'Success reference fits the dialog');
    await page.keyboard.press('Escape');
    if (width === 1440) await page.setViewportSize({ width: 1440, height: 1000 });
    await enquiryTrigger.click();
    assert.equal(await form.locator('[name="name"]').inputValue(), '', 'New enquiry clears the completed form');
    assert.equal(await enquiry.locator('.enquiry-success').isVisible(), false);
    await page.keyboard.press('Escape');

    step = `${width}: location and privacy pages`;
    for (const path of ['/location/', '/privacy/']) {
      await page.goto(new URL(path, base).href, { waitUntil: 'networkidle' });
      pages.push(await auditPage(page, path));
      assert.equal(await page.locator('h1').count(), 1);
    }
    assert.deepEqual(errors, [], 'No uncaught JavaScript errors');
    assert.deepEqual(assetFailures, [], 'No missing image/font HTTP responses');
    report.push({ width, pages, menu: width < 768 ? 'pass' : 'desktop navigation', hotspots: 'pass', gallery: 'pass', features: 'pass', plans801And1601: 'pass', validation: 'pass', retryIdentity: 'pass', pendingGuard: 'pass', confirmedReference: 'pass', mockedRequests: requests.length, scriptErrors: errors, assetFailures });
    console.log(`AVA ${width}px: passed`);
    await page.close();
    activePage = null;
  }

  step = 'normal motion: responsive lifecycle and feature disclosure';
  const motion = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  activePage = motion;
  const motionErrors = [];
  motion.on('pageerror', error => motionErrors.push(error.message));
  await motion.goto(base, { waitUntil: 'networkidle' });
  await motion.evaluate(() => document.fonts.ready);
  await motion.evaluate(() => scrollTo({ top: 500, behavior: 'instant' }));
  await motion.waitForFunction(() => { const transform = getComputedStyle(document.querySelector('.hero-title')).transform; return transform !== 'none' && new DOMMatrixReadOnly(transform).m42 > 1; });
  await motion.setViewportSize({ width: 390, height: 844 });
  await motion.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await motion.waitForFunction(() => { const transform = getComputedStyle(document.querySelector('.hero-title')).transform; return transform === 'none' || Math.abs(new DOMMatrixReadOnly(transform).m42) < .5; });
  assert.equal(await motion.locator('.hero-title').isVisible(), true);
  assert.equal(await motion.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, 'Desktop transforms must not overflow the mobile composition');
  const expanded = motion.locator('#features details').filter({ has: motion.locator('summary', { hasText: 'Private garage' }) });
  await expanded.locator('summary').click();
  const spacing = await expanded.evaluate(element => ({ open: element.open, bottom: element.getBoundingClientRect().bottom, nextTop: element.nextElementSibling.getBoundingClientRect().top }));
  assert.ok(spacing.open && spacing.bottom <= spacing.nextTop + 1, `Expanded feature overlaps its successor: ${JSON.stringify(spacing)}`);
  await motion.locator('.location-title').scrollIntoViewIfNeeded();
  await motion.waitForFunction(() => Number(getComputedStyle(document.querySelector('.location-title')).opacity) > .98);
  await motion.screenshot({ path: `${output}/ava-motion-mobile-location.png` });
  await motion.setViewportSize({ width: 1440, height: 900 });
  await motion.locator('#interiors [data-next]').click();
  await galleryCount(motion, '2 / 4');
  const readingTop = await motion.locator('#interiors').evaluate(element => element.getBoundingClientRect().top);
  await motion.emulateMedia({ reducedMotion: 'reduce' });
  await motion.waitForFunction(() => [...document.querySelectorAll('[data-reveal]')].every(element => Number(getComputedStyle(element).opacity) > .98));
  await motion.waitForTimeout(600);
  const reducedTop = await motion.locator('#interiors').evaluate(element => element.getBoundingClientRect().top);
  assert.ok(Math.abs(reducedTop - readingTop) < 2, `Motion change moved the gallery out of the reading viewport: ${readingTop} -> ${reducedTop}`);
  await motion.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await motion.waitForFunction(() => { const transform = getComputedStyle(document.querySelector('.hero-title')).transform; return transform === 'none' || Math.abs(new DOMMatrixReadOnly(transform).m42) < .5; });
  assert.deepEqual(motionErrors, [], 'Normal-motion resize and preference changes must not throw');
  report.push({ mode: 'normal-motion', desktopToMobileResize: 'pass', featureDisclosureGeometry: 'pass', revealedLocation: 'pass', liveReducedMotion: 'pass', readingPosition: 'pass', scriptErrors: motionErrors });
  await motion.close(); activePage = null;

  await writeFile(`${output}/report.json`, JSON.stringify({ ok: true, testedAt: new Date().toISOString(), base, report }, null, 2));
  console.log(JSON.stringify({ ok: true, output, report }, null, 2));
} catch (error) {
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/report.json`, JSON.stringify({ ok: false, testedAt: new Date().toISOString(), base, step, error: String(error), report, serverLog }, null, 2));
  throw error;
} finally {
  await cleanup();
}
