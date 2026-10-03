import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const bm = readFileSync('dist/bookmarklet.txt', 'utf8');
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('file://' + process.cwd() + '/test/fixtures/pumpkin-muffins-tasty.html');
await p.evaluate((c) => (0, eval)(decodeURIComponent(c.slice('javascript:'.length))), bm);
console.log('bookmarklet pills:', await p.$$eval('.ia-pill', (x) => x.length));
await b.close();
