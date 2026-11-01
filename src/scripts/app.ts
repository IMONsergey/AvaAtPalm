import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const menu = document.querySelector<HTMLDialogElement>('#menu-dialog');
const enquiry = document.querySelector<HTMLDialogElement>('#enquiry-dialog');
const form = document.querySelector<HTMLFormElement>('#enquiry-form');
let startedAt = Date.now();
let submissionId = crypto.randomUUID();
let submitted = false;
let sending = false;
let resetIdOnOpen = false;
let lastAttemptFingerprint = '';
let request: AbortController | undefined;
let dialogOrigin: HTMLElement | null = null;
const menuToggle = document.querySelector<HTMLButtonElement>('[data-action="menu"]');

function syncDialogState() {
  document.body.classList.toggle('has-dialog', Boolean(document.querySelector('dialog[open]')));
  menuToggle?.setAttribute('aria-expanded', String(Boolean(menu?.open)));
}

function openDialog(dialog: HTMLDialogElement | null, trigger?: HTMLElement) {
  if (!dialog || dialog.open) return;
  const origin = trigger ?? document.activeElement;
  // A dialog opened from another dialog returns to the original page control.
  if (origin instanceof HTMLElement && !origin.closest('dialog[open]')) dialogOrigin = origin;
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(other => other.close());
  dialog.showModal();
  syncDialogState();
  const first = dialog.querySelector<HTMLElement>('h2[tabindex="-1"],button[data-close],button');
  first?.focus({ preventScroll: true });
}

function openEnquiry(context = 'AVA at Palm Jumeirah', trigger?: HTMLElement) {
  if (!enquiry || !form) return;
  if (sending) { openDialog(enquiry, trigger); return; }
  const contextInput = form.elements.namedItem('context') as HTMLInputElement;
  if (submitted) {
    submissionId = crypto.randomUUID();
    resetIdOnOpen = false;
    lastAttemptFingerprint = '';
    startedAt = Date.now();
  }
  if (submitted) {
    form.reset();
    submitted = false;
    enquiry.querySelector<HTMLElement>('[data-enquiry-content]')!.hidden = false;
    enquiry.querySelector<HTMLElement>('.enquiry-success')!.hidden = true;
    ['name', 'email', 'phone', 'consent', 'message'].forEach(key => fieldError(key, ''));
    form.querySelector<HTMLElement>('.form-error')!.hidden = true;
  }
  if (Date.now() - startedAt > 7 * 24 * 60 * 60 * 1000) startedAt = Date.now();
  contextInput.value = context;
  enquiry.querySelector<HTMLElement>('[data-enquiry-context]')!.textContent = context;
  const messageField = form.querySelector<HTMLElement>('.field-message');
  if (messageField) messageField.hidden = context !== 'Privacy request';
  if (context !== 'Privacy request') (form.elements.namedItem('message') as HTMLTextAreaElement).value = '';
  openDialog(enquiry, trigger);
}

document.addEventListener('click', event => {
  const target = event.target as HTMLElement;
  const trigger = target.closest<HTMLElement>('[data-action]');
  if (trigger?.dataset.action === 'menu') openDialog(menu, trigger);
  if (trigger?.dataset.action === 'enquire') openEnquiry(trigger.dataset.context, trigger);
  if (trigger?.dataset.action === 'video') openDialog(document.querySelector('#video-dialog'), trigger);
  if (trigger?.dataset.action === 'location') openDialog(document.querySelector('#location-dialog'), trigger);
  target.closest('[data-close]')?.closest('dialog')?.close();
  if (target.closest('[data-menu-link]')) menu?.close();
  if (target.closest('.success-link')) enquiry?.close();
});

document.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    dialog.querySelector('video')?.pause();
    syncDialogState();
    if (!document.querySelector('dialog[open]') && dialogOrigin?.isConnected) {
      dialogOrigin.focus({ preventScroll: true });
    }
  });
});

function fieldError(name: string, message: string) {
  if (!form) return;
  const field = form.elements.namedItem(name) as HTMLInputElement | null;
  if (field && ['INPUT', 'TEXTAREA'].includes(field.tagName)) {
    field.setAttribute('aria-invalid', String(Boolean(message)));
    const error = form.querySelector<HTMLElement>(`#${name}-error`);
    if (error) error.textContent = message;
  }
}

function showFormError(message: string) {
  const error = form?.querySelector<HTMLElement>('.form-error');
  if (!error) return;
  error.textContent = message;
  error.hidden = false;
  error.focus({ preventScroll: true });
}

form?.addEventListener('input', event => {
  const field = event.target as HTMLInputElement;
  if (field.name) fieldError(field.name, '');
});

form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (sending || !enquiry) return;
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  const email = String(data.get('email') || '').trim().toLowerCase();
  const phone = String(data.get('phone') || '').trim();
  const consent = data.get('consent') === 'on';
  const errors: Record<string, string> = {};
  if (name.length < 2 || name.length > 100) errors.name = 'Please enter a name between 2 and 100 characters.';
  const emailInput = form.elements.namedItem('email') as HTMLInputElement;
  if (!email || !emailInput.validity.valid) errors.email = 'Please enter a valid email address.';
  if (phone && !/^[+\d()\s.-]{6,30}$/.test(phone)) errors.phone = 'Please check your phone number, including the country code.';
  if (!consent) errors.consent = 'Please confirm that we may contact you about this enquiry.';
  ['name', 'email', 'phone', 'consent'].forEach(key => fieldError(key, errors[key] || ''));
  const errorBox = form.querySelector<HTMLElement>('.form-error')!;
  errorBox.hidden = true;
  if (Object.keys(errors).length) {
    (form.elements.namedItem(Object.keys(errors)[0]) as HTMLElement)?.focus();
    return;
  }
  const payload = { project: 'ava-at-palm', context: String(data.get('context') || '').trim(), name, email, phone, consent, website: String(data.get('website') || ''), message: String(data.get('message') || '').trim() };
  const fingerprint = JSON.stringify(payload);
  // A timed-out write may have succeeded. Reuse its reference only for the same payload.
  if (resetIdOnOpen || (lastAttemptFingerprint && fingerprint !== lastAttemptFingerprint)) {
    submissionId = crypto.randomUUID();
    resetIdOnOpen = false;
  }
  lastAttemptFingerprint = fingerprint;
  const controls = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('input, textarea, select, button'));
  const disabledStates = controls.map(control => control.disabled);
  const label = form.querySelector<HTMLElement>('[data-submit-label]')!;
  const status = form.querySelector<HTMLElement>('.submission-note')!;
  sending = true;
  controls.forEach(control => { control.disabled = true; });
  form.setAttribute('aria-busy', 'true');
  label.textContent = 'Sending your enquiry';
  status.textContent = 'Please wait while your details are sent securely.';
  request = new AbortController();
  const timeout = window.setTimeout(() => request?.abort(), 25000);
  try {
    const response = await fetch('/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: request.signal,
      body: JSON.stringify({ ...payload, startedAt, submissionId }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true || typeof result.id !== 'string' || result.id !== submissionId) {
      if (response.status === 409) resetIdOnOpen = true;
      if (result.fields && typeof result.fields === 'object') Object.entries(result.fields).forEach(([key, message]) => fieldError(key, String(message)));
      throw new Error(typeof result.error === 'string' ? result.error : 'We could not send your enquiry. Your details are still here. Please try again.');
    }
    submitted = true;
    enquiry.querySelector<HTMLElement>('[data-enquiry-reference]')!.textContent = result.id;
    enquiry.querySelector<HTMLElement>('[data-enquiry-content]')!.hidden = true;
    const success = enquiry.querySelector<HTMLElement>('.enquiry-success')!;
    success.hidden = false;
    success.focus();
  } catch (error) {
    const message = error instanceof Error && error.name !== 'AbortError' ? error.message : 'The connection took too long. Your details are still here. Please try again.';
    showFormError(navigator.onLine ? message : 'You appear to be offline. Reconnect and try again. Your details are still here.');
    label.textContent = 'Try again';
  } finally {
    window.clearTimeout(timeout);
    sending = false;
    controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
    form.removeAttribute('aria-busy');
    status.textContent = '';
    if (submitted) label.textContent = 'Send enquiry';
  }
});

document.querySelectorAll<HTMLElement>('[data-carousel]').forEach(carousel => {
  const slides = Array.from(carousel.querySelectorAll<HTMLElement>('[data-slide]'));
  const track = carousel.querySelector<HTMLElement>('[data-track]');
  if (!track || slides.length < 2) return;
  const counter = carousel.querySelector<HTMLElement>('[data-counter]');
  let current = 0;
  let displayed = 0;
  let gesture: { id: number; x: number; y: number } | null = null;
  let requestId = 0;

  async function show(index: number) {
    const next = (index + slides.length) % slides.length;
    current = next;
    const id = ++requestId;
    // Keep the previous frame visible until the destination image is decoded.
    const image = slides[next].querySelector<HTMLImageElement>('img');
    if (image) {
      image.loading = 'eager';
      await image.decode().catch(() => undefined);
    }
    if (id !== requestId) return;
    if (image && !image.naturalWidth) { current = displayed; return; }
    displayed = next;
    gsap.to(track, { xPercent: -next * 100, duration: reduced.matches ? 0 : .55, ease: 'power2.inOut', overwrite: true });
    slides.forEach((slide, i) => {
      slide.setAttribute('aria-hidden', String(i !== next));
      slide.inert = i !== next;
    });
    if (counter) counter.textContent = `${next + 1} / ${slides.length}`;
  }
  carousel.querySelector('[data-next]')?.addEventListener('click', () => { void show(current + 1); });
  carousel.querySelector('[data-prev]')?.addEventListener('click', () => { void show(current - 1); });
  carousel.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      void show(current + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  track.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    track.setPointerCapture(event.pointerId);
  });
  track.addEventListener('pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    gesture = null;
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) void show(current + (dx < 0 ? 1 : -1));
  });
  track.addEventListener('pointercancel', () => { gesture = null; });
  track.addEventListener('lostpointercapture', () => { gesture = null; });
  reduced.addEventListener('change', () => {
    // Changing the OS preference during a transition settles on its decoded frame.
    gsap.killTweensOf(track);
    gsap.set(track, { xPercent: -displayed * 100 });
  });
  slides.forEach((slide, i) => { slide.inert = i !== 0; });
});

const planDialog = document.querySelector<HTMLDialogElement>('#plan-dialog');
if (planDialog) {
  const stage = planDialog.querySelector<HTMLElement>('[data-plan-stage]')!;
  const image = planDialog.querySelector<HTMLImageElement>('[data-plan-image]')!;
  const value = planDialog.querySelector<HTMLElement>('[data-zoom-value]')!;
  const plus = planDialog.querySelector<HTMLButtonElement>('[data-zoom-in]')!;
  const minus = planDialog.querySelector<HTMLButtonElement>('[data-zoom-out]')!;
  let zoom = 1, x = 0, y = 0, drag: { x: number; y: number } | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; zoom: number } | null = null;
  function distance() { const points=[...pointers.values()]; return Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y); }
  function draw() {
    const limitX = Math.max(0, (image.clientWidth * zoom - stage.clientWidth) / 2);
    const limitY = Math.max(0, (image.clientHeight * zoom - stage.clientHeight) / 2);
    x = Math.max(-limitX, Math.min(limitX, x)); y = Math.max(-limitY, Math.min(limitY, y));
    image.style.transform = `translate(${x}px,${y}px) scale(${zoom})`;
    value.textContent = `${Math.round(zoom * 100)}%`;
    plus.disabled = zoom >= 3; minus.disabled = zoom <= 1;
    stage.classList.toggle('is-zoomed', zoom > 1);
  }
  function change(amount: number) { zoom = Math.min(3, Math.max(1, Math.round((zoom + amount) * 10) / 10)); draw(); }
  document.querySelectorAll<HTMLElement>('[data-plan]').forEach(trigger => trigger.addEventListener('click', () => {
    image.src = trigger.dataset.plan!;
    image.alt = `Floor plan for ${trigger.dataset.planTitle || 'the residence'}`;
    planDialog.querySelector<HTMLElement>('#plan-title')!.textContent = trigger.dataset.planTitle || 'Residence floor plan';
    const download = planDialog.querySelector<HTMLAnchorElement>('[data-plan-download]')!;
    download.href = image.src; download.download = `AVA-${trigger.dataset.unit || 'residence'}-floor-plan.webp`;
    pointers.clear(); pinch = null; drag = null;
    zoom = 1; x = 0; y = 0;
    openDialog(planDialog, trigger);
    draw();
  }));
  plus.addEventListener('click', () => change(.3)); minus.addEventListener('click', () => change(-.3));
  planDialog.querySelector('[data-zoom-fit]')?.addEventListener('click', () => { zoom = 1; x = 0; y = 0; draw(); });
  planDialog.addEventListener('keydown', event => {
    if (['+', '=', '-', '0'].includes(event.key)) { event.preventDefault(); if (event.key === '0') { zoom = 1; x = 0; y = 0; draw(); } else change(event.key === '-' ? -.3 : .3); }
    if (zoom > 1 && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); x += event.key === 'ArrowLeft' ? 32 : event.key === 'ArrowRight' ? -32 : 0; y += event.key === 'ArrowUp' ? 32 : event.key === 'ArrowDown' ? -32 : 0; draw(); }
  });
  stage.addEventListener('pointerdown', event => {
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY}); stage.setPointerCapture(event.pointerId);
    if(pointers.size===2){pinch={distance:distance(),zoom};drag=null;}
    else if(zoom>1) drag={x:event.clientX-x,y:event.clientY-y};
  });
  stage.addEventListener('pointermove', event => {
    if(!pointers.has(event.pointerId))return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pinch&&pointers.size===2){zoom=Math.min(3,Math.max(1,pinch.zoom*distance()/Math.max(1,pinch.distance)));draw();}
    else if(drag){x=event.clientX-drag.x;y=event.clientY-drag.y;draw();}
  });
  function endPointer(event:PointerEvent){
    pointers.delete(event.pointerId);pinch=null;drag=null;
    if(pointers.size===1&&zoom>1){const point=[...pointers.values()][0];drag={x:point.x-x,y:point.y-y};}
  }
  stage.addEventListener('pointerup',endPointer);stage.addEventListener('pointercancel',endPointer);
  stage.addEventListener('lostpointercapture',endPointer);
  image.addEventListener('load', () => { if (planDialog.open) draw(); });
  // Image sizing depends on the visible dialog. Re-clamp after rotation or resize.
  const planResize = new ResizeObserver(() => { if (planDialog.open) draw(); });
  planResize.observe(stage);
  planDialog.addEventListener('close',()=>{pointers.clear();pinch=null;drag=null;});
  stage.addEventListener('wheel', event => { if (event.ctrlKey) { event.preventDefault(); change(event.deltaY < 0 ? .1 : -.1); } }, { passive: false });
}

const video = document.querySelector<HTMLVideoElement>('#ava-film');
video?.addEventListener('error', () => { const error = document.querySelector<HTMLElement>('[data-video-error]'); if (error) error.hidden = false; });
document.querySelector('[data-video-retry]')?.addEventListener('click', () => { video?.load(); const error = document.querySelector<HTMLElement>('[data-video-error]'); if (error) error.hidden = true; });

const media = gsap.matchMedia();
media.add({ motion: '(prefers-reduced-motion: no-preference)', desktop: '(min-width: 768px)', fine: '(pointer: fine)' }, context => {
  const { motion, desktop, fine } = context.conditions as Record<string, boolean>;
  if (!motion) return;
  gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach(element => {
    // Do not replay already read content when a breakpoint changes.
    if (element.dataset.revealed === 'true' || element.getBoundingClientRect().bottom < 0) return;
    gsap.from(element, {
      y: 24, opacity: 0, duration: .85, ease: 'power2.out',
      scrollTrigger: { trigger: element, start: 'top 92%', once: true, onEnter: () => { element.dataset.revealed = 'true'; } },
    });
  });
  if (desktop && fine && document.querySelector('.hero')) {
    gsap.to('.hero-title', { y: 35, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: '30% top', scrub: .6 } });
    gsap.utils.toArray<HTMLElement>('[data-depth]').forEach(element => gsap.fromTo(element, { y: 25 }, { y: -25, ease: 'none', scrollTrigger: { trigger: element, start: 'top bottom', end: 'bottom top', scrub: .6 } }));
  }
});

// Native details change the geometry below them without a window resize.
// One deferred refresh coalesces initial font/image completion and disclosure changes.
let refreshFrame = 0;
function scheduleRefresh() {
  if (refreshFrame) return;
  refreshFrame = requestAnimationFrame(() => { refreshFrame = 0; ScrollTrigger.refresh(); });
}
document.querySelectorAll<HTMLDetailsElement>('.feature').forEach(feature => feature.addEventListener('toggle', scheduleRefresh));
document.fonts.ready.then(scheduleRefresh);
window.addEventListener('load', scheduleRefresh, { once: true });
window.addEventListener('pageshow', event => { if (event.persisted) scheduleRefresh(); });
