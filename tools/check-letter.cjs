const {createRequire}=require('module');const {chromium}=createRequire(process.cwd()+'/../CarrotHomeSystem/tools/ui-inspector/package.json')('playwright-core');
(async()=>{
const b=await chromium.launch({channel:'msedge'});const p=await b.newPage({viewport:{width:390,height:844},acceptDownloads:true});p.on('pageerror',e=>console.log('ERROR',e.message));
await p.goto('http://localhost:8849',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.querySelector('#loading').classList.contains('hidden'));console.log('loaded');
await p.evaluate(()=>{const h=document.querySelector('#hint');h.classList.remove('hidden','fade','entering');void h.offsetWidth;h.classList.add('entering')});
const a=await p.locator('#hint').evaluate(e=>Number(getComputedStyle(e).opacity));await p.waitForTimeout(500);const z=await p.locator('#hint').evaluate(e=>Number(getComputedStyle(e).opacity));console.log('fade',a,z);if(!(a<z&&z<1))throw Error('fade');
await p.click('#btnSave');await p.waitForFunction(()=>document.querySelector('#posterLayer').classList.contains('open'));console.log('poster open');
console.log('fonts',await p.evaluate(()=>document.fonts.status));const event=p.waitForEvent('download');await p.click('#posterSave');const d=await event;console.log('download',await d.failure());
console.log(await p.evaluate(()=>{const box=MB.parseMarker(MB.DEMO_MARKER).box;box.to='长名字'.repeat(6);box.from='长署名'.repeat(6);box.message='这是一段长寄语。'.repeat(30);box.stamp=[];const c=MBPoster.makeLetter(box);return {images:document.querySelectorAll('.poster-slide img').length,longLetter:[c.width,c.height]}}));await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
