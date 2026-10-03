import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const script = readFileSync(path.join(dir, '../src/inline-amounts.user.js'), 'utf8');
const shots = process.argv.includes('--shots');

// Each expected string must appear in the step text, with pills rendered as [amount].
const cases = {
  'pumpkin-muffins-tasty.html': {
    pills: 12,
    expect: {
      '#s2': ['flour [1¾ cups (219g)]', 'baking soda [1 tsp]', 'cinnamon [2 tsp]', 'pumpkin pie spice [1 tsp]',
        'salt [½ tsp]', 'oil [½ cup (113g/120ml)]', 'granulated sugar [½ cup (100g)]', 'brown sugar [½ cup (100g)]',
        'pumpkin puree [1½ cups (340g)]', 'eggs [2 large]', 'milk [¼ cup (60ml)]'],
      '#s3': ['coarse sugar [2 Tbsp], if using'],
    },
    scaled2: { '#s2': ['flour [3½ cups (438g)]', 'eggs [4 large]', 'oil [1 cup (226g/240ml)]'] },
  },
  'chicken-skillet-wprm.html': {
    expect: {
      'li:nth-child(1)': ['olive oil [2 Tbsp]', 'chicken [1 lb]'],
      'li:nth-child(2)': ['half the butter [2 Tbsp]', 'onion [1 medium]', 'garlic [3 cloves]'],
      'li:nth-child(3)': ['broth [1 cup]', 'tomatoes [1 (14.5-ounce) can]', 'cream [1 cup]', 'chicken [1 lb] to the pan'],
      'li:nth-child(4)': ['remaining butter, the parmesan [½ cup]', 'spinach [2 cups]'],
    },
  },
  'pancakes-generic.html': {
    expect: {
      'li:nth-child(1)': ['flour [1½ cups]', 'baking powder [3½ tsp]', 'sugar [1 Tbsp]', 'salt [¼ tsp]',
        'milk [1¼ cups]', 'egg [1 large]', 'melted butter [3 Tbsp]'],
      'li:nth-child(2)': ['lightly oiled griddle'],
    },
  },
  'not-a-recipe.html': { pills: 0, noUi: true },
  'top-ten-list.html': { pills: 0, noUi: true },
  'katu-leadins.html': {
    expect: {
      '#d1': ['pinch of the sugar and', 'milk [1 cup (240ml)]', 'yeast [2¼ tsp (1/4-ounce envelope/7g)]'],
      '#d2': ['flour [4 cups (480g)]', 'sugar [⅔ cup (133g)]', 'salt [1 tsp]', 'butter [6 Tbsp (85g)]',
        'eggs [2 large]', 'vanilla extract [1 Tbsp]', 'orange zest [1 Tbsp]', 'yeast mixture'],
      '#f1': ['butter [½ cup (113g)]', 'brown sugar [1 cup (200g)]', 'cinnamon [2 Tbsp]', 'pecans [1 cup (115g)]'],
      '#g1': ['powdered sugar [2 cups (240g)]', 'orange juice [3 Tbsp]', 'vanilla [1 tsp]'],
    },
    scaled2: { '#d1': ['yeast [4½ tsp (½-ounce envelope/14g)]'] },
  },
  'katu-headings.html': {
    expect: {
      '#d1': ['milk [1 cup (240ml)]', 'yeast [2¼ tsp (1/4-ounce envelope/7g)]'],
      '#d2': ['flour [4 cups (480g)]', 'sugar [⅔ cup (133g)]', 'salt [1 tsp]', 'butter [6 Tbsp (85g)]',
        'eggs [2 large]', 'vanilla [1 Tbsp]', 'orange zest [1 Tbsp]', 'yeast mixture'],
      '#f1': ['butter [½ cup (113g)]', 'brown sugar [1 cup (200g)]', 'cinnamon [2 Tbsp]', 'pecans [1 cup (115g)]'],
      '#g1': ['powdered sugar [2 cups (240g)]', 'orange juice [3 Tbsp]', 'vanilla [1 tsp]'],
    },
    scaled2: { '#d1': ['yeast [4½ tsp (½-ounce envelope/14g)]'] },
  },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
let failures = 0;
const fail = (m) => { failures++; console.log('  ✗ ' + m); };

const stepText = (page, sel) => page.$eval(sel, (el) => {
  const c = el.cloneNode(true);
  c.querySelectorAll('.ia-pill').forEach((p) => p.replaceWith(' [' + p.textContent + ']'));
  return c.textContent.replace(/\s+/g, ' ').replace(/ \[/g, ' [').trim();
});

for (const [file, c] of Object.entries(cases)) {
  console.log('\n== ' + file);
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(dir, 'fixtures', file));
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(200);
  const pillCount = await page.$$eval('.ia-pill', (p) => p.length);
  const ui = await page.$('#inline-amounts-ui');
  if (c.noUi && ui) fail('panel shown on a non-recipe page');
  if (c.pills != null && pillCount !== c.pills) fail(`expected ${c.pills} pills, got ${pillCount}`);
  for (const [sel, wants] of Object.entries(c.expect || {})) {
    const scope = file.includes('wprm') ? '.wprm-recipe-instructions > ' : file.includes('pancakes') ? '.step-list > ' : '';
    const t = await stepText(page, scope + sel);
    console.log('  ' + sel + ': ' + t);
    for (const w of wants) if (!t.includes(w)) fail(`${sel} missing "${w}"`);
  }
  if (shots && pillCount) {
    await page.locator('.tasty-recipes-instructions, .wprm-recipe-instructions, .step-list, #d1').first().scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -80));
    await page.screenshot({ path: path.join(dir, '../dist', file.replace('.html', '.png')) });
  }
  if (c.scaled2) {
    await page.evaluate(() => document.querySelector('#inline-amounts-ui').shadowRoot.querySelector('.row button[data-f="2"]').click());
    for (const [sel, wants] of Object.entries(c.scaled2)) {
      const t = await stepText(page, sel);
      for (const w of wants) if (!t.includes(w)) fail(`2× ${sel} missing "${w}"`);
    }
    console.log('  2× scaling checked');
    if (shots) {
      await page.evaluate(() => document.querySelector('#inline-amounts-ui').shadowRoot.querySelector('.fab').click());
      await page.screenshot({ path: path.join(dir, '../dist', 'panel-2x.png') });
    }
  }
  await page.close();
}
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
