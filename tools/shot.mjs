// 本地截图检查（开发用）：先运行 node tools/serve.mjs，再运行 node tools/shot.mjs [场景名]
// 借用 CarrotHomeSystem/tools/ui-inspector 里已装好的 Playwright，可用 PLAYWRIGHT_DIR 改路径
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const pwDir = process.env.PLAYWRIGHT_DIR || join(here, '..', '..', 'CarrotHomeSystem', 'tools', 'ui-inspector', 'package.json');
const { chromium } = createRequire(pwDir)('playwright-core');
const out = join(here, '_shots');
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://localhost:8849/';
const tag = process.env.SHOT_TAG ? '-' + process.env.SHOT_TAG : '';
const only = process.argv[2];
const D = { width: 1366, height: 860 };

const scenes = [
  { name: 'desktop', vp: D },
  { name: 'reference', vp: { width: 765, height: 835 } },
  { name: 'laptop', vp: { width: 1180, height: 680 } },
  { name: 'desktop-card', vp: D, card: true },
  { name: 'desktop-play', vp: D, play: 9000 },
  { name: 'desktop-pause', vp: D, play: 6000, pause: true },
  { name: 'desktop-end', vp: D, play: 23300 },
  { name: 'poster', vp: D, poster: true },
  { name: 'template-link', vp: D, card: true,
    hash: '#%5B八音盒%3A速度66%7C拍号3/4%7C纸带3%7C信封3%7C木色2%7C旋律%3A(1,1+10);(3,12);(5,10);(7,4+13);(9,12);(11,11);(13,5+9);(15,8);(17,9);(19,1+5+10)%7C图形%3A(1,8);(2,9);(3,10);(4,9);(5,8)%7CTo%3A小兔%7CFrom%3A阿机%7C寄语%3A今晚给你写了一小段旋律，晚安。%5D' },
  { name: 'mobile', vp: { width: 390, height: 844 }, mobile: true },
  { name: 'mobile-card', vp: { width: 390, height: 844 }, mobile: true, card: true },
  { name: 'mobile-poster', vp: { width: 390, height: 844 }, mobile: true, poster: true },
].filter(s => !only || s.name === only);

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge', args: ['--autoplay-policy=no-user-gesture-required'] });
for (const s of scenes) {
  const page = await browser.newPage({ viewport: s.vp, deviceScaleFactor: s.mobile ? 2 : 1, hasTouch: !!s.mobile });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !/deprecated/.test(m.text()))) errs.push(m.type() + ': ' + m.text()); });
  await page.goto(base + (s.hash || ''));
  await page.waitForFunction(() => document.getElementById('loading').classList.contains('hidden'), null, { timeout: 30000 });
  await page.waitForTimeout(2600);
  if (s.card) { await page.click('#btnLetter'); await page.waitForTimeout(900); }
  if (s.play) { await page.click('#btnPlay'); await page.waitForTimeout(s.play); }
  if (s.pause) {
    await page.click('#btnPlay');
    await page.waitForTimeout(1500);
    const a = await page.evaluate(() => [document.getElementById('btnPlay').dataset.state, MBScene.mode()]);
    await page.click('#btnPlay');
    await page.waitForTimeout(1200);
    const b = await page.evaluate(() => [document.getElementById('btnPlay').dataset.state, MBScene.mode()]);
    console.log('  pause ->', a.join('/'), ' resume ->', b.join('/'));
  }
  if (s.poster) {
    await page.click('#btnSave');
    await page.waitForFunction(() => document.getElementById('posterLayer').classList.contains('open'), null, { timeout: 20000 });
    await page.waitForTimeout(700);
    if (!s.mobile) {
      for (const id of ['posterImgLetter']) {
        const b64 = await page.evaluate(async (id) => {
          const blob = await (await fetch(document.getElementById(id).src)).blob();
          return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
        }, id);
        writeFileSync(join(out, id + tag + '.png'), Buffer.from(b64, 'base64'));
      }
    }
  }
  await page.screenshot({ path: join(out, s.name + tag + '.png') });
  console.log(s.name, errs.length ? errs : 'ok');
  await page.close();
}
await browser.close();
