import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require=createRequire(import.meta.url);
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const base=process.env.BASE_URL||'http://127.0.0.1:14325';
const output=process.env.IMAGE_QA_OUTPUT||path.join(root,'artifacts/pixel-audit-20261101-v2/image-quality-final');
const engines=(process.env.IMAGE_QA_ENGINES||'chromium,webkit').split(',');
await mkdir(output,{recursive:true});
const report={base,startedAt:new Date().toISOString(),cases:[],apiRequests:0,pageErrors:[]};
let failure;
try {
  for(const engine of engines) {
    const browser=await pw[engine].launch({headless:true});
    try {
      for(const width of [320,768,1024,1440,1920]) {
        const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
        await context.route('**/api/**',route=>{report.apiRequests++;return route.abort();});
        const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
        try {
          for(const route of ['/','/location/']) {
            await page.goto(base+route,{waitUntil:'networkidle'});
            await page.evaluate(()=>document.fonts.ready);
            await page.evaluate(async()=>{
              const images=[...document.images].filter(i=>!i.closest('dialog:not([open])'));
              for(const image of images)image.loading='eager';
              await Promise.all(images.map(i=>i.decode().catch(()=>{})));
            });
            await page.waitForTimeout(300);
            const samples=await page.evaluate(async()=>{
              const decoded=new Map(),results=[];
              for(const image of document.images) {
                const rect=image.getBoundingClientRect(),style=getComputedStyle(image);
                if(!image.srcset||!image.complete||!image.naturalWidth||rect.width<1||rect.height<1||image.closest('dialog:not([open])')||style.display==='none'||style.visibility==='hidden')continue;
                let bitmap=decoded.get(image.currentSrc);
                if(!bitmap) {
                  // naturalWidth on a srcset element is density adjusted. Decode
                  // the selected resource alone to measure its actual pixels.
                  const probe=new Image();probe.src=image.currentSrc;await probe.decode();
                  bitmap={width:probe.naturalWidth,height:probe.naturalHeight};decoded.set(image.currentSrc,bitmap);
                }
                const original={width:Number(image.getAttribute('width')),height:Number(image.getAttribute('height'))};
                const ratio=original.width/original.height;
                const required=style.objectFit==='contain'?Math.min(rect.width,rect.height*ratio):Math.max(rect.width,rect.height*ratio);
                const available=Math.min(required,original.width);
                const intentionalBlur=/blur\((?!0px)/.test(style.filter);
                results.push({asset:image.dataset.asset,currentSrc:image.currentSrc,sizes:image.sizes,fit:style.objectFit,rendered:{width:rect.width,height:rect.height},bitmap,original,requiredWidth:Math.ceil(required),availableRequirement:Math.ceil(available),intentionalBlur,underCandidate:!intentionalBlur&&bitmap.width+1<available});
              }
              return results;
            });
            const entry={engine,browserVersion:browser.version(),width,route,samples,underCandidates:samples.filter(s=>s.underCandidate)};
            report.cases.push(entry);
            assert.deepEqual(entry.underCandidates,[],`An avoidably small image candidate was selected at ${engine} ${width} ${route}`);
            await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
          }
        } finally {await context.close();}
      }
    } finally {await browser.close();}
  }
  assert.deepEqual(report.pageErrors,[]);assert.equal(report.apiRequests,0);
} catch(error) {failure=error;report.failure=error.message;}
report.passed=!failure;report.finishedAt=new Date().toISOString();
await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,pageErrors:report.pageErrors,apiRequests:report.apiRequests,failure:report.failure}));
if(failure)process.exitCode=1;
