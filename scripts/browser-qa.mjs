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
  await page.evaluate(async () => {
    for (const image of document.images) image.loading = 'eager';
    await Promise.all([...document.images].filter(image => image.getAttribute('src')).map(image => image.decode().catch(() => null)));
    await document.fonts.ready;
  });
  const result = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    imageCount: document.images.length,
    brokenImages: [...document.images].filter(image => image.getAttribute('src') && !image.naturalWidth).map(image => image.currentSrc || image.getAttribute('src')),
  }));
  assert.ok(result.scrollWidth <= result.width + 1, `${label}: horizontal overflow ${result.scrollWidth}px at ${result.width}px`);
  assert.deepEqual(result.brokenImages, [], `${label}: all images must load`);
  return { page: label, ...result };
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
    const requests = [];
    const pages = [];
    let responseMode = 'failure';
    let releasePending;
    let requestReached;
    let pendingGate;
    page.on('pageerror', error => errors.push(error.message));

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
    assert.equal(await gallery.locator('[data-counter]').innerText(), '2 / 4');
    await gallery.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await gallery.locator('[data-counter]').innerText(), '3 / 4');
    await gallery.locator('[data-prev]').click();
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
    } finally {
      releasePending();
    }
    await enquiry.locator('.enquiry-success').waitFor({ state: 'visible' });
    assert.equal(await enquiry.locator('[data-enquiry-reference]').innerText(), requests[2].submissionId);
    await expectFocus(enquiry.locator('.enquiry-success'), 'Confirmed success receives focus');
    assert.equal(await enquiry.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, 'Success reference fits the dialog');
    await page.keyboard.press('Escape');
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
    report.push({ width, pages, menu: width < 768 ? 'pass' : 'desktop navigation', hotspots: 'pass', gallery: 'pass', features: 'pass', plans801And1601: 'pass', validation: 'pass', retryIdentity: 'pass', pendingGuard: 'pass', confirmedReference: 'pass', mockedRequests: requests.length, scriptErrors: errors });
    console.log(`AVA ${width}px: passed`);
    await page.close();
    activePage = null;
  }

  await writeFile(`${output}/report.json`, JSON.stringify({ ok: true, testedAt: new Date().toISOString(), base, report }, null, 2));
  console.log(JSON.stringify({ ok: true, output, report }, null, 2));
} catch (error) {
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/report.json`, JSON.stringify({ ok: false, testedAt: new Date().toISOString(), base, step, error: String(error), report, serverLog }, null, 2));
  throw error;
} finally {
  await cleanup();
}
