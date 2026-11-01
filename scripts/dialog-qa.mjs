import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const atlantis=manifest.name.startsWith('atlantis');
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_BASE_URL||process.env.BASE_URL||`http://127.0.0.1:${atlantis?14322:14325}`;
const output=process.env.DIALOG_QA_OUTPUT||path.join(root,'artifacts/pixel-audit-20261101-v2/dialogs');
const engines=(process.env.DIALOG_QA_ENGINES||'chromium,webkit').split(',');
await mkdir(output,{recursive:true});
const report={base,startedAt:new Date().toISOString(),cases:[],apiRequests:0,pageErrors:[]};
let failure;
try{
 for(const engine of engines){
  const browser=await pw[engine].launch({headless:true});try{
   for(const viewport of [{width:320,height:740},...(!atlantis?[{width:768,height:1024}]:[]),{width:844,height:390}])for(const kind of ['enquiry','menu']){
    const rotateMenu=!atlantis&&kind==='menu'&&viewport.width>=768;
    const context=await browser.newContext({viewport:rotateMenu?{width:320,height:740}:viewport,reducedMotion:'no-preference'});
    await context.route('**/api/**',route=>{report.apiRequests++;return route.abort();});
    const result={engine,browserVersion:browser.version(),kind,viewport,rotateOpenMenu:rotateMenu};report.cases.push(result);
    const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>report.pageErrors.push(error.message));
    try{
     await page.goto(base+(kind==='enquiry'&&!atlantis?'/privacy/':'/'),{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
     const trigger=page.locator(kind==='menu'?(atlantis?'.menu-toggle':'[data-action="menu"]'):(atlantis?'.reach':'[data-context="Privacy request"]'));
     await trigger.click();const selector=kind==='enquiry'?'#enquiry-dialog':atlantis?'#site-menu':'#menu-dialog';const dialog=page.locator(selector);
     await dialog.waitFor({state:'visible'});if(rotateMenu)await page.setViewportSize(viewport);await page.waitForTimeout(400);
     if(!atlantis&&kind==='enquiry'&&viewport.width>=768){
      result.editorial=await dialog.locator('.enquiry-editorial').evaluate(e=>{
       const bounds=e.getBoundingClientRect(),title=e.querySelector('.display');
       return{right:bounds.right,fontSize:getComputedStyle(title).fontSize,lines:[...title.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>{const range=document.createRange();range.selectNodeContents(n);return{text:n.textContent,rects:[...range.getClientRects()].map(r=>({right:r.right,width:r.width}))}})};
      });
      assert.ok(result.editorial.lines.every(line=>line.rects.length===1&&line.rects.every(r=>r.right<=result.editorial.right-24)),'Editorial heading must preserve each authored line without clipping');
     }
     const close=dialog.locator('[data-close]').first();
     const read=()=>close.evaluate(el=>{
      const r=el.getBoundingClientRect(),d=el.closest('dialog'),dr=d.getBoundingClientRect();
      return{rect:{top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height},dialog:{top:dr.top,left:dr.left,right:dr.right,bottom:dr.bottom},visible:r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),scroll:[d,...d.querySelectorAll('*')].filter(n=>n.clientHeight>80&&n.scrollHeight>n.clientHeight+1&&['auto','scroll'].includes(getComputedStyle(n).overflowY)).map(n=>({class:n.className,id:n.id,top:n.scrollTop,max:n.scrollHeight-n.clientHeight}))};
     });
     if(kind==='enquiry')await dialog.locator('[name="name"]').fill('Dialog continuity audit');
     result.before=await read();const box=await dialog.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+Math.min(box.height*.6,240));await page.mouse.wheel(0,2000);await page.waitForTimeout(400);result.after=await read();
     await page.screenshot({path:path.join(output,`${engine}-${kind}-${viewport.width}-scrolled.png`)});
     assert.ok(result.after.visible&&result.after.hit,`Close is unreachable after native wheel: ${JSON.stringify(result.after)}`);
     assert.ok(Math.abs(result.before.rect.top-result.after.rect.top)<2,'Close changed its authored top coordinate while scrolling');
     await page.mouse.click((result.after.rect.left+result.after.rect.right)/2,(result.after.rect.top+result.after.rect.bottom)/2);await page.waitForTimeout(200);
     result.closed=await page.evaluate(()=>({open:document.querySelectorAll('dialog[open]').length,bodyClass:document.body.classList.contains('has-dialog'),body:getComputedStyle(document.body).overflowY,html:getComputedStyle(document.documentElement).overflowY}));
     assert.equal(result.closed.open,0);assert.equal(result.closed.bodyClass,false);assert.notEqual(result.closed.body,'hidden');assert.notEqual(result.closed.html,'hidden');
     if(await trigger.isVisible()){result.focusRestored=await trigger.evaluate(el=>el===document.activeElement);assert.equal(result.focusRestored,true);}
     else result.focusRestored='Original mobile trigger is hidden after rotation';
     if(rotateMenu)await page.setViewportSize({width:320,height:740});
     let reopen=trigger;
     if(kind==='enquiry'){
      const options=page.locator(atlantis?'[data-enquire]':'[data-action="enquire"]');
      for(let i=0;i<await options.count();i++){const candidate=options.nth(i);if(await candidate.isVisible()&&!await candidate.evaluate(e=>Boolean(e.closest('dialog')))&&!await candidate.evaluate((e,original)=>e===document.querySelector(original),atlantis?'.reach':'[data-context="Privacy request"]')){reopen=candidate;break;}}
     }
     await reopen.click();await dialog.waitFor({state:'visible'});await page.waitForTimeout(300);
     result.reopened=await dialog.evaluate(d=>({scroll:[...d.querySelectorAll('.enquiry-scroll,.menu-scroll')].map(e=>e.scrollTop),context:d.querySelector('[data-enquiry-context]')?.textContent,name:d.querySelector('[name="name"]')?.value}));
     assert.ok(result.reopened.scroll.every(top=>top===0),'Reopened dialog retained its old scroll offset');
     if(kind==='enquiry')assert.equal(result.reopened.name,'Dialog continuity audit','Reopening must preserve entered values');
     await page.keyboard.press('Escape');
     result.passed=true;
    }catch(error){result.passed=false;result.error=error.message;throw error;}
    finally{await context.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
   }
  }finally{await browser.close();}
 }
 assert.equal(report.apiRequests,0);assert.deepEqual(report.pageErrors,[]);
}catch(error){failure=error;}
report.passed=!failure;report.finishedAt=new Date().toISOString();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,cases:report.cases.map(c=>({engine:c.engine,kind:c.kind,viewport:c.viewport,passed:c.passed,beforeTop:c.before?.rect.top,afterTop:c.after?.rect.top})),apiRequests:report.apiRequests,pageErrors:report.pageErrors,error:failure?.message}));if(failure)process.exitCode=1;
