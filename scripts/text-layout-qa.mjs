import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const base = process.env.BASE_URL || 'http://127.0.0.1:14325';
const output = process.env.TEXT_QA_OUTPUT || path.join(root, 'artifacts/pixel-audit-20261101-v2/text-layout-final');
const engines = (process.env.TEXT_QA_ENGINES || 'chromium,webkit').split(',');
const copyOnly = process.env.TEXT_QA_COPY_ONLY === '1';
const sizes = [{width:390,height:844}, {width:768,height:1024}, {width:844,height:390}, {width:1024,height:768}, {width:1100,height:900}, {width:1101,height:900}, {width:1440,height:900}];
await mkdir(output, {recursive:true});
const report = {base, startedAt:new Date().toISOString(), cases:[], errors:[], apiRequests:0};

async function scrollToElement(page, selector) {
  await page.locator(selector).evaluate(e => scrollTo({top:scrollY + e.getBoundingClientRect().top, behavior:'instant'}));
  await page.waitForTimeout(900);
  // Reveal transforms affect the first measurement. Re-anchor settled copy so
  // the screenshot includes its first line as well as the following action.
  if(selector.endsWith('-copy')) {
    await page.locator(selector).evaluate(e=>scrollTo({top:scrollY+e.getBoundingClientRect().top-20,behavior:'instant'}));
    await page.waitForTimeout(150);
  }
}

async function read(page, selector) {
  return page.locator(selector).evaluate(e => {
    const rect = n => {const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const range=document.createRange();range.selectNodeContents(e);
    const style=getComputedStyle(e);
    return {box:rect(e), fontSize:Number.parseFloat(style.fontSize), lineHeight:Number.parseFloat(style.lineHeight), textShadow:style.textShadow,
      lines:[...range.getClientRects()].map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom})),
      parent:rect(e.parentElement), scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth};
  });
}

const overlaps = (a,b) => Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
let failure;
try {
  for (const engine of engines) {
    const browser=await pw[engine].launch({headless:true});
    try {
      for (const viewport of sizes) {
        const context=await browser.newContext({viewport, deviceScaleFactor:1, reducedMotion:'no-preference'});
        await context.route('**/api/**', route=>{report.apiRequests++;return route.abort();});
        const page=await context.newPage();
        page.on('pageerror', error=>report.errors.push(error.message));
        const result={engine,browserVersion:browser.version(),viewport,passed:false};report.cases.push(result);
        try {
          await page.goto(base, {waitUntil:'networkidle'});
          await page.evaluate(()=>document.fonts.ready);
          result.copyActions=[];
          for(const name of ['architecture','sky']) {
            await scrollToElement(page,'.'+name+'-copy');
            const copy=await read(page,'.'+name+'-copy'),cta=await read(page,'.'+name+'-cta');
            assert.equal(overlaps(copy.box,cta.box),false,`${name} CTA overlaps its body text`);
            if(viewport.width>=768&&viewport.width<=1100) {
              assert.ok(cta.box.top>=copy.box.bottom+20,`${name} CTA needs a clear gap below its paragraph`);
              if(name==='architecture') {
                const photo=await read(page,'.haven-city');
                assert.equal(overlaps(cta.box,photo.box),false,'Architecture CTA overlaps the next photograph');
              }
            }
            const hit=await page.locator('.'+name+'-cta .action').evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));});
            assert.equal(hit,true,`${name} CTA is obscured or outside the reading viewport`);
            result.copyActions.push({name,copy,cta,hit});
            await page.screenshot({path:path.join(output,`${engine}-${viewport.width}-${name}-copy.png`)});
          }
          if(copyOnly) {result.passed=true;continue;}
          await scrollToElement(page, '#interiors');
          result.gallery={copy:await read(page,'.gallery-copy'),title:await read(page,'.interior-title'),counter:await read(page,'.gallery-counter'),controls:await read(page,'.gallery-controls')};
          assert.equal(overlaps(result.gallery.copy.box,result.gallery.controls.box),false,'Gallery copy overlaps its controls');
          assert.ok(result.gallery.copy.box.bottom <= result.gallery.copy.parent.bottom+1,'Gallery body is clipped by its section');
          assert.ok(result.gallery.title.textShadow!=='none'&&result.gallery.counter.textShadow!=='none','Gallery overlay contrast treatment is absent');
          await page.screenshot({path:path.join(output,`${engine}-${viewport.width}-gallery-dark.png`)});
          await page.locator('[data-carousel] [data-next]').click();
          await page.waitForFunction(()=>/2\s*\/\s*4/.test(document.querySelector('[data-counter]').textContent));
          await scrollToElement(page, '#interiors');
          await page.screenshot({path:path.join(output,`${engine}-${viewport.width}-gallery-light.png`)});
          if(viewport.width>=768&&viewport.width<=1100) {
            assert.ok(result.gallery.copy.fontSize>=14&&result.gallery.counter.fontSize>=14,'Tablet gallery body/counter are too small');
            await scrollToElement(page, '.location');
            result.location={title:await read(page,'.location-title'),copy:await read(page,'.location-copy'),cta:await read(page,'.location-cta')};
            assert.ok(result.location.copy.fontSize>=14,'Tablet location body is too small');
            assert.ok(result.location.copy.box.top>=result.location.title.box.bottom+8,'Location title and body overlap');
            assert.ok(result.location.cta.box.top>=result.location.copy.box.bottom+20,'Location CTA overlaps its paragraph');
            assert.ok(result.location.cta.box.bottom<=result.location.copy.parent.bottom+1,'Location CTA is outside its section');
            assert.ok(result.location.copy.scrollWidth<=result.location.copy.clientWidth+1,'Tablet page overflows horizontally');
            await page.screenshot({path:path.join(output,`${engine}-${viewport.width}-location.png`)});
            await scrollToElement(page, '.partners');
            result.partners=[];
            for(const selector of ['.partner--omniyat','.partner--dorchester']) {
              const body=await read(page,selector+'>p:last-child');
              assert.ok(body.fontSize>=14,'Tablet partner body is too small');
              assert.ok(body.lines.every(r=>r.left>=body.parent.left&&r.right<=body.parent.right+1&&r.bottom<=body.parent.bottom+1),'Partner paragraph is clipped');
              result.partners.push(body);
            }
            result.footer=await read(page,'.footer');
            assert.ok(result.partners.every(p=>p.parent.bottom<=result.footer.box.top+1),'Partner cards overlap the footer');
            await page.screenshot({path:path.join(output,`${engine}-${viewport.width}-partners.png`)});
          }
          result.passed=true;
        } finally {
          await context.close();
          await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
        }
      }
    } finally {await browser.close();}
  }
  assert.deepEqual(report.errors,[]);assert.equal(report.apiRequests,0);
} catch(error) {failure=error;report.failure=error.message;}
report.passed=!failure;report.finishedAt=new Date().toISOString();
await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,errors:report.errors,apiRequests:report.apiRequests,failure:report.failure}));
if(failure)process.exitCode=1;
