// ==UserScript==
// @name         Honeycomb
// @description  Puts ingredient amounts right inside recipe steps, so you stop scrolling up and down.
// @version      0.1.0
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;
  // Running a second time (e.g. tapping the bookmarklet again) just opens the panel.
  if (window.__inlineAmounts) {
    window.__inlineAmounts.togglePanel && window.__inlineAmounts.togglePanel();
    return;
  }

  // ---------------------------------------------------------------------------
  // Quantities
  // ---------------------------------------------------------------------------

  const FRACS = {
    '¼': 1 / 4, '½': 1 / 2, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8, '⅜': 3 / 8,
    '⅝': 5 / 8, '⅞': 7 / 8, '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6,
  };
  const FC = Object.keys(FRACS).join('');
  const SINGLE =
    `(?:\\d+\\s+(?:(?:and|&)\\s+)?\\d+\\s*\\/\\s*\\d+` + // 1 3/4, 1 and 3/4
    `|\\d+\\s*(?:(?:and|&)\\s+)?[${FC}]` + //              1¾, 1 ¾, 1 and ¾
    `|\\d+\\s*\\/\\s*\\d+` + //                      3/4
    `|\\d*\\.\\d+|\\d+|[${FC}])`; //                 .5, 2, ½
  const QTY_RE = new RegExp(`^\\s*(${SINGLE})(?:\\s*(?:-|–|—|to)\\s*(${SINGLE}))?`, 'i');

  function parseSingle(s) {
    s = s.trim();
    let m;
    if ((m = s.match(/^(\d+)\s+(?:(?:and|&)\s+)?(\d+)\s*\/\s*(\d+)$/))) return +m[1] + m[2] / m[3];
    if ((m = s.match(new RegExp(`^(\\d+)\\s*(?:(?:and|&)\\s+)?([${FC}])$`)))) return +m[1] + FRACS[m[2]];
    if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) return m[1] / m[2];
    if (FRACS[s] !== undefined) return FRACS[s];
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  const PRETTY = [
    [0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
    [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, ''],
  ];

  function fmt(n) {
    const whole = Math.floor(n + 1e-9);
    const frac = n - whole;
    let best = PRETTY[0];
    for (const p of PRETTY) if (Math.abs(p[0] - frac) < Math.abs(best[0] - frac)) best = p;
    if (Math.abs(best[0] - frac) > 0.04) return String(Math.round(n * 100) / 100);
    const w = whole + (best[0] === 1 ? 1 : 0);
    if (!best[1]) return String(w);
    return (w ? String(w) : '') + best[1];
  }

  // [pattern, singular, plural] — order matters (fl oz before oz, etc.)
  const UNIT_DEFS = [
    ['tablespoons?|tbsps?|tbs|tbl', 'Tbsp', 'Tbsp'],
    ['teaspoons?|tsps?', 'tsp', 'tsp'],
    ['cups?|c', 'cup', 'cups'],
    ['fluid\\s+ounces?|fl\\.?\\s*oz', 'fl oz', 'fl oz'],
    ['ounces?|oz', 'oz', 'oz'],
    ['pounds?|lbs?', 'lb', 'lb'],
    ['kilograms?|kg', 'kg', 'kg'],
    ['grams?|g', 'g', 'g'],
    ['milliliters?|millilitres?|ml', 'ml', 'ml'],
    ['liters?|litres?|l', 'L', 'L'],
    ['quarts?|qts?', 'qt', 'qt'],
    ['pints?|pts?', 'pint', 'pints'],
    ['gallons?|gal', 'gal', 'gal'],
    ['pinch(?:es)?', 'pinch', 'pinches'],
    ['dash(?:es)?', 'dash', 'dashes'],
    ['cloves?', 'clove', 'cloves'],
    ['cans?', 'can', 'cans'],
    ['jars?', 'jar', 'jars'],
    ['sticks?', 'stick', 'sticks'],
    ['packages?|pkgs?', 'package', 'packages'],
    ['slices?', 'slice', 'slices'],
    ['sprigs?', 'sprig', 'sprigs'],
    ['bunch(?:es)?', 'bunch', 'bunches'],
    ['heads?', 'head', 'heads'],
    ['stalks?', 'stalk', 'stalks'],
    ['handfuls?', 'handful', 'handfuls'],
    ['pieces?', 'piece', 'pieces'],
    ['sheets?', 'sheet', 'sheets'],
    ['envelopes?', 'envelope', 'envelopes'],
    ['drops?', 'drop', 'drops'],
  ].map(([src, s, p]) => ({ re: new RegExp(`^\\s*(?:${src})\\.?(?![a-z])`, 'i'), s, p }));

  function matchUnit(text) {
    for (const u of UNIT_DEFS) {
      const m = text.match(u.re);
      if (m) return { unit: u, len: m[0].length };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Ingredient names → phrases we look for in the steps
  // ---------------------------------------------------------------------------

  // Words that describe an ingredient but aren't how steps refer to it.
  const DESCRIPTORS = new Set((
    'packed firmly lightly light dark large small medium extra-large jumbo fresh freshly ground ' +
    'chopped diced minced sliced grated shredded melted softened cold warm hot room temperature ' +
    'canned store-bought storebought homemade finely roughly coarsely thinly whole boneless skinless ' +
    'peeled divided cubed crushed sifted toasted dried uncooked cooked raw frozen thawed beaten ' +
    'lukewarm unsweetened pure good quality organic kosher fine coarse extra-virgin virgin about ' +
    'approximately heaping scant level rounded generous plain halved quartered trimmed rinsed ' +
    'drained packed-light'
  ).split(/\s+/));

  // Too vague to match on their own ("powder" could be baking powder or garlic powder).
  const GENERIC = new Set(
    'powder soda sauce juice extract paste leaves seeds spice spices flakes mix stock'.split(' ')
  );

  // When "chicken" could mean the breasts or the broth, steps almost always say "broth" for the
  // broth, so a bare first word goes to the ingredient that isn't one of these.
  const SECONDARY_HEADS = new Set(
    'broth stock bouillon soup juice sauce paste powder extract oil seasoning fat drippings'.split(' ')
  );

  // First words that shouldn't stand in for the whole ingredient ("baking" ≠ baking soda).
  const WEAK_BLOCK = new Set((
    'baking all-purpose white black red green yellow orange sweet sour heavy brown granulated ' +
    'powdered confectioners confectioners\' self-rising bread sea table olive cream ice hot ' +
    'cold dry wet vegetable cooking ground pie'
  ).split(/\s+/));

  function cleanName(rest) {
    let s = rest.toLowerCase();
    s = s.replace(/\([^)]*\)/g, ' ');
    s = s.split(/[,;:]/)[0];
    s = s.split(/\s+(?:for|to|if|plus|such as|at)\s+/)[0];
    s = s.replace(/\*+/g, ' ');
    s = s.replace(/\b(?:to taste|for (?:serving|garnish|greasing|dusting|topping)|optional|plus more.*$|divided)\b/g, ' ');
    s = s.replace(/[^a-z0-9\-'\s\/&]/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }

  function parseIngredient(raw) {
    const s = String(raw).replace(/\s+/g, ' ').trim().replace(/^\(?(?:optional|for (?:the )?\w+)\)?\s*:\s*/i, '');
    const ing = { raw: s, q1: null, q2: null, pkg: null, mod: null, unit: null, size: null, metric: null, name: '' };
    const m = s.match(QTY_RE);
    let rest = s;
    if (m) {
      ing.q1 = parseSingle(m[1]);
      ing.q2 = m[2] ? parseSingle(m[2]) : null;
      rest = s.slice(m[0].length);
      let mm;
      // "1 (14-ounce) can": the parenthetical is a package size, not an amount to scale
      if ((mm = rest.match(/^\s*(\([^)]*\))/)) && matchUnit(rest.slice(mm[0].length))) {
        ing.pkg = mm[1];
        rest = rest.slice(mm[0].length);
      }
      if ((mm = rest.match(/^\s*(heaping|scant|level|rounded|generous)\b/i))) {
        ing.mod = mm[1].toLowerCase();
        rest = rest.slice(mm[0].length);
      }
      const u = matchUnit(rest);
      if (u) {
        ing.unit = u.unit;
        rest = rest.slice(u.len);
      } else if ((mm = rest.match(/^\s*(extra[- ]large|large|medium|small|jumbo)\b/i))) {
        ing.size = mm[1].toLowerCase();
        rest = rest.slice(mm[0].length);
      }
      // "1 and 3/4 cups (219g)": the parenthetical is the same amount in other units
      if ((mm = rest.match(/^\s*(\([^)]*\d[^)]*\))/))) {
        ing.metric = mm[1];
        rest = rest.slice(mm[0].length);
      }
      rest = rest.replace(/^\s*of\s+/i, '');
    }
    ing.name = cleanName(rest);
    return ing;
  }

  function scaleParen(p, f) {
    if (f === 1) return p;
    return p.replace(/(\d+)\s*\/\s*(\d+)|\d+(?:\.\d+)?/g, (n, a, b) => {
      if (b) return fmt((a / b) * f);
      const v = n * f;
      return String(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
    });
  }

  function amountText(ing, f) {
    if (ing.q1 == null) return null;
    const a = ing.q1 * f;
    const b = ing.q2 != null ? ing.q2 * f : null;
    let t = fmt(a) + (b != null ? '–' + fmt(b) : '');
    const top = b != null ? b : a;
    if (ing.mod) t += ' ' + ing.mod;
    if (ing.pkg) t += ' ' + ing.pkg;
    if (ing.unit) t += ' ' + (top > 1 ? ing.unit.p : ing.unit.s);
    if (ing.size) t += ' ' + ing.size;
    if (ing.metric) t += ' ' + scaleParen(ing.metric, f);
    return t;
  }

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function tokenRe(tok) {
    return esc(tok).replace(/\\?-/g, '[-\\s]?');
  }

  // Let the last word match singular or plural ("egg" ↔ "eggs", "berry" ↔ "berries").
  function flexRe(tok) {
    if (/ies$/.test(tok) && tok.length > 4) return tokenRe(tok.slice(0, -3)) + '(?:y|ies)';
    if (/(?:ches|shes|sses|xes|oes)$/.test(tok)) return tokenRe(tok.slice(0, -2)) + '(?:es)?';
    if (/[^s]s$/.test(tok) && tok.length > 3) return tokenRe(tok.slice(0, -1)) + 's?';
    if (/[^aeiou]y$/.test(tok)) return tokenRe(tok.slice(0, -1)) + '(?:y|ies)';
    if (/(?:ch|sh|x|o)$/.test(tok)) return tokenRe(tok) + '(?:es)?';
    return tokenRe(tok) + 's?';
  }

  function phraseRe(tokens) {
    const parts = tokens.map((t, i) => (i === tokens.length - 1 ? flexRe(t) : tokenRe(t)));
    return `(?<![\\w-])${parts.join('\\s+')}(?![\\w-])`;
  }

  // Build every phrase a step might use for each ingredient.
  // Strong phrases end in the ingredient's main noun ("brown sugar", "sugar").
  // Weak phrases are just its first word ("chicken" for "chicken breasts").
  function buildPhrases(ings) {
    const map = new Map();
    const add = (tokens, idx, strong) => {
      const key = (strong ? 'S:' : 'W:') + phraseRe(tokens);
      if (!map.has(key)) map.set(key, { re: new RegExp(phraseRe(tokens), 'gi'), ings: [], strong, words: tokens.length });
      const e = map.get(key);
      if (!e.ings.includes(idx)) e.ings.push(idx);
    };
    ings.forEach((ing, idx) => {
      if (ing.q1 == null || !ing.name) return;
      const alts = ing.name.split(/\s+(?:and\/or|or)\s+|\s*\/\s*/);
      for (const alt of alts) {
        const all = alt.split(/\s+/).filter((t) => t && !/^\d/.test(t));
        const tokens = all.filter((t) => !DESCRIPTORS.has(t));
        if (!tokens.length) continue;
        // Full wording too, so "coarse sugar" in a step beats a bare "sugar".
        if (all.length > tokens.length && all[all.length - 1] === tokens[tokens.length - 1]) {
          for (let i = 0; i < all.length - 1; i++) {
            if (all.length - i > tokens.length) add(all.slice(i), idx, true);
          }
        }
        for (let i = 0; i < tokens.length; i++) {
          const suffix = tokens.slice(i);
          if (suffix.length === 1 && GENERIC.has(suffix[0]) && tokens.length > 1) continue;
          add(suffix, idx, true);
        }
        const first = tokens[0];
        ing.head = tokens[tokens.length - 1];
        if (tokens.length > 1 && first.length >= 4 && !WEAK_BLOCK.has(first) && !GENERIC.has(first)) {
          add([first], idx, false);
        }
      }
    });
    return [...map.values()];
  }

  // ---------------------------------------------------------------------------
  // Finding the recipe and its steps on the page
  // ---------------------------------------------------------------------------

  const decoder = document.createElement('textarea');
  function decode(s) {
    decoder.innerHTML = String(s);
    return decoder.value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function isRecipe(o) {
    const t = o && o['@type'];
    return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
  }

  function searchRecipe(node, depth) {
    if (!node || typeof node !== 'object' || depth > 8) return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const r = searchRecipe(n, depth + 1);
        if (r) return r;
      }
      return null;
    }
    if (isRecipe(node)) return node;
    for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) {
      const r = searchRecipe(node[k], depth + 1);
      if (r) return r;
    }
    return null;
  }

  function findRecipe() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try {
        data = JSON.parse(s.textContent);
      } catch (e) {
        try {
          data = JSON.parse(s.textContent.replace(/[\u0000-\u001f]+/g, ' '));
        } catch (e2) {
          continue;
        }
      }
      const r = searchRecipe(data, 0);
      if (r) return r;
    }
    return null;
  }

  function flattenSteps(ins, out) {
    if (!ins) return out;
    if (typeof ins === 'string') {
      ins.split(/\n+/).forEach((t) => t.trim() && out.push(decode(t)));
    } else if (Array.isArray(ins)) {
      ins.forEach((i) => flattenSteps(i, out));
    } else if (typeof ins === 'object') {
      if (ins.itemListElement) flattenSteps(ins.itemListElement, out);
      else if (ins.text || ins.name) out.push(decode(ins.text || ins.name));
    }
    return out;
  }

  const STEP_SELECTORS = [
    '.wprm-recipe-instruction-text',
    '.tasty-recipes-instructions li',
    '.tasty-recipes-instructions-body li',
    '.mv-create-instructions li',
    '.recipe-instructions li',
    '.recipe-directions li',
    '.recipe-method li',
    '.instructions li',
    '.directions li',
    '[itemprop="recipeInstructions"] li',
    '.zrdn-instruction',
    '.wpzoom-rcb-direction',
    '.ERSInstructions li',
    '.mntl-sc-block-group--LI',
  ];

  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

  function findStepElements(steps) {
    const found = new Set();
    for (const sel of STEP_SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach((el) => found.add(el));
      } catch (e) { /* ignore bad selector */ }
    }

    // Also look for any element whose text matches a step from the recipe data.
    const fps = [];
    for (const step of steps) {
      const n = norm(step);
      if (n.length < 20) continue;
      fps.push(n.slice(0, 50));
      if (n.length > 90) fps.push(n.slice(30, 80));
    }
    if (fps.length) {
      const cands = document.body.querySelectorAll('li, p, div, span, td');
      const hits = [];
      for (const el of cands) {
        if (el.closest('#inline-amounts-ui')) continue;
        const t = el.textContent;
        if (!t || t.length > 4000) continue;
        const n = norm(t);
        if (fps.some((fp) => n.includes(fp))) hits.push(el);
      }
      // Keep only the deepest match (the step itself, not its container).
      const hitSet = new Set(hits);
      for (const el of hits) {
        let deeper = false;
        for (const other of hits) {
          if (other !== el && el.contains(other)) { deeper = true; break; }
        }
        if (!deeper && hitSet.has(el)) found.add(el);
      }
    }

    // Drop elements nested inside other step elements so nothing is annotated twice.
    const list = [...found];
    return list.filter((el) => !list.some((o) => o !== el && o.contains(el)));
  }

  // ---------------------------------------------------------------------------
  // Putting amounts into the steps
  // ---------------------------------------------------------------------------

  const PART_RE = /\b(half|one[- ]half|½|1\/2|a third|one[- ]third|⅓|1\/3|a quarter|one[- ]quarter|¼|1\/4|two[- ]thirds|⅔|2\/3|three[- ]quarters|¾|3\/4)\s+(?:of\s+)?(?:the\s+)?(?:\w+\s+)?$/i;
  const PART_VALUE = {
    half: 1 / 2, 'one half': 1 / 2, 'one-half': 1 / 2, '½': 1 / 2, '1/2': 1 / 2,
    'a third': 1 / 3, 'one third': 1 / 3, 'one-third': 1 / 3, '⅓': 1 / 3, '1/3': 1 / 3,
    'a quarter': 1 / 4, 'one quarter': 1 / 4, 'one-quarter': 1 / 4, '¼': 1 / 4, '1/4': 1 / 4,
    'two thirds': 2 / 3, 'two-thirds': 2 / 3, '⅔': 2 / 3, '2/3': 2 / 3,
    'three quarters': 3 / 4, 'three-quarters': 3 / 4, '¾': 3 / 4, '3/4': 3 / 4,
  };
  const REST_RE = /\b(?:remaining|rest of(?:\s+the)?|leftover|reserved)\s+(?:\w+\s+)?$/i;

  function textNodesOf(el) {
    const nodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || p.closest('.ia-pill, script, style, noscript, button, input, textarea')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  // Returns [{end, ings: [idx...], part}] for one step's text.
  function matchStep(text, phrases, ings, section) {
    const cands = [];
    for (const ph of phrases) {
      ph.re.lastIndex = 0;
      let m;
      while ((m = ph.re.exec(text))) {
        cands.push({ s: m.index, e: m.index + m[0].length, ph });
        if (m[0].length === 0) ph.re.lastIndex++;
      }
    }
    // Longest phrase wins ("brown sugar" beats "sugar"); strong beats weak.
    cands.sort((a, b) => (b.e - b.s) - (a.e - a.s) || (b.ph.strong - a.ph.strong) || a.s - b.s);
    const chosen = [];
    for (const c of cands) {
      if (chosen.some((t) => c.s < t.e && t.s < c.e)) continue;
      chosen.push(c);
    }
    chosen.sort((a, b) => a.s - b.s);

    const used = new Set();
    const out = [];
    for (const c of chosen) {
      let idxs = c.ph.ings.filter((i) => ings[i].q1 != null);
      if (!idxs.length) continue;
      // In the "filling" step, "butter" means the filling's butter.
      if (idxs.length > 1 && section && section.size) {
        const same = idxs.filter((i) => sameSection(ings[i].section, section));
        if (same.length) idxs = same;
      }
      if (idxs.length > 1 && !c.ph.strong) {
        const main = idxs.filter((i) => !SECONDARY_HEADS.has(ings[i].head));
        if (main.length === 1) idxs = main;
      }
      if (idxs.length > 1) {
        const fresh = idxs.filter((i) => !used.has(i));
        if (fresh.length) idxs = fresh;
      }
      // Still more than one candidate (e.g. two cheeses and the step says "cheese"): don't guess.
      if (idxs.length > 1) continue;
      if (idxs.every((i) => used.has(i))) continue;
      idxs.forEach((i) => used.add(i));
      const before = text.slice(Math.max(0, c.s - 30), c.s);
      if (REST_RE.test(before)) continue; // "the remaining butter": amount isn't the full one
      if (/\b(?:pinch|dash|splash|bit|little|some)\s+of\s+(?:the\s+)?$/i.test(before)) continue;
      if (/^\s+mixture\b/i.test(text.slice(c.e, c.e + 10))) continue; // "the yeast mixture"
      let part = 1;
      const pm = before.match(PART_RE);
      if (pm) part = PART_VALUE[pm[1].toLowerCase()] || 1;
      out.push({ end: c.e, ings: idxs, part });
    }
    return out;
  }

  function annotate(el, phrases, ings, pills, section) {
    const nodes = textNodesOf(el);
    if (!nodes.length) return 0;
    let text = '';
    const spans = [];
    for (const n of nodes) {
      spans.push({ n, start: text.length });
      text += n.nodeValue;
    }
    const hits = matchStep(text, phrases, ings, section);
    // Insert from the end so earlier offsets stay valid.
    for (const h of hits.slice().reverse()) {
      let span = null;
      for (const sp of spans) {
        if (h.end > sp.start && h.end <= sp.start + sp.n.nodeValue.length) span = sp;
      }
      if (!span) continue;
      const local = h.end - span.start;
      if (local < span.n.nodeValue.length) span.n.splitText(local);
      const pill = document.createElement('span');
      pill.className = 'ia-pill';
      pills.push({ el: pill, ings: h.ings, part: h.part });
      // Don't put the pill inside a link; put it right after.
      const link = span.n.parentElement && span.n.parentElement.closest('a');
      const anchor = link && el.contains(link) && local === span.n.nodeValue.length ? link : span.n;
      anchor.after(pill);
    }
    return hits.length;
  }

  // ---------------------------------------------------------------------------
  // Sections ("For the dough", "Make the filling:")
  // ---------------------------------------------------------------------------

  const SECTION_STOP = new Set(
    'for the to make prepare assemble a an and of your instructions ingredients directions method step steps optional recipe'.split(' ')
  );

  function sectionWords(text) {
    const words = String(text || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/);
    return new Set(words.filter((w) => w.length > 2 && !SECTION_STOP.has(w)));
  }

  function sameSection(a, b) {
    if (!a || !b) return false;
    for (const w of a) if (b.has(w)) return true;
    return false;
  }

  function isHeadingLike(el) {
    if (el.closest('#inline-amounts-ui, li')) return false;
    const t = el.textContent.replace(/\s+/g, ' ').trim();
    if (t.length < 3 || t.length > 60 || QTY_RE.test(t)) return false;
    if (/^H[1-6]$/.test(el.tagName)) return true;
    if (/:$/.test(t)) return true;
    if (/[A-Z]/.test(t) && t === t.toUpperCase()) return true;
    const strong = el.querySelector('strong, b');
    return !!strong && strong.textContent.trim() === t;
  }

  let headingCache = null;
  function headings() {
    if (!headingCache) {
      headingCache = [...document.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, strong, b, dt')].filter(isHeadingLike);
    }
    return headingCache;
  }

  const FOLLOWS = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  // The closest heading above `el` (and below `after`, if given).
  function headingBefore(el, after) {
    let best = null;
    for (const h of headings()) {
      if (h.contains(el) || el.contains(h)) continue;
      if (!FOLLOWS(h, el)) break;
      if (after && !FOLLOWS(after, h)) continue;
      best = h;
    }
    return best;
  }

  // "Make the filling: In a bowl…" → {filling}
  function leadInSection(el) {
    const m = el.textContent.trim().match(/^(?:step\s*\d+[:.]?\s*)?([a-z][a-z\s&'-]{2,40}?):/i);
    return m ? sectionWords(m[1]) : null;
  }

  function stepSection(el, lastIngredientEl) {
    const lead = leadInSection(el);
    if (lead && lead.size) return lead;
    const h = headingBefore(el, lastIngredientEl);
    return h ? sectionWords(h.textContent) : null;
  }

  // Find where each ingredient sits on the page and which heading it's under.
  function locateIngredients(ings) {
    const lis = [...document.body.querySelectorAll('li')];
    let last = null;
    for (const ing of ings) {
      const fp = norm(ing.raw).slice(0, 24);
      if (fp.length < 6) continue;
      const el = lis.find((li) => norm(li.textContent).includes(fp));
      if (!el) continue;
      if (!last || FOLLOWS(last, el)) last = el;
      const h = headingBefore(el);
      if (h) ing.section = sectionWords(h.textContent);
    }
    return last;
  }

  // ---------------------------------------------------------------------------
  // Fallback for pages without recipe data (news sites, newsletters, small blogs)
  // ---------------------------------------------------------------------------

  function lowestCommonAncestor(els) {
    let a = els[0];
    while (a && !els.every((e) => a.contains(e))) a = a.parentElement;
    return a || document.body;
  }

  function findRecipeInText() {
    const lines = [];
    for (const el of document.body.querySelectorAll('li, p')) {
      if (el.closest('#inline-amounts-ui') || el.querySelector('li, p')) continue;
      const t = el.textContent.replace(/\s+/g, ' ').trim();
      if (t.length < 3 || t.length > 160 || !QTY_RE.test(t)) continue;
      if (/^\s*\d+\s*[.)]\s/.test(t)) continue; // "1. Preheat the oven"
      const ing = parseIngredient(t);
      if (!ing.name || /^[°º]/.test(ing.name)) continue;
      if (!ing.unit && !ing.size && ing.name.split(' ').length > 5) continue;
      lines.push({ el, ing });
    }
    if (lines.length < 3) return null;

    const lastIng = lines[lines.length - 1].el;
    for (const l of lines) {
      const h = headingBefore(l.el);
      if (h) l.ing.section = sectionWords(h.textContent);
    }

    let box = lowestCommonAncestor(lines.map((l) => l.el));
    if (/^(UL|OL)$/.test(box.tagName)) {
      box = box.closest('article, main, [class*="article"], [class*="story"], [class*="body"], [class*="content"]') ||
        (box.parentElement && box.parentElement.parentElement) || document.body;
    }
    const lineEls = new Set(lines.map((l) => l.el));
    const steps = [...box.querySelectorAll('li, p')].filter((el) =>
      FOLLOWS(lastIng, el) && !lineEls.has(el) && !el.querySelector('li, p') &&
      !el.closest('#inline-amounts-ui') && el.textContent.trim().length >= 25
    ).slice(0, 60);
    if (!steps.length) return null;
    return { ings: lines.map((l) => l.ing), stepEls: steps, lastIng };
  }

  // ---------------------------------------------------------------------------
  // Settings and the floating panel
  // ---------------------------------------------------------------------------

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('inline-amounts:' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('inline-amounts:' + k, JSON.stringify(v));
      } catch (e) { /* storage blocked: settings just won't stick */ }
    },
  };

  const STYLE = `
    .ia-pill {
      display: inline-block !important;
      margin: 0 .05em 0 .3em !important;
      padding: .05em .45em !important;
      border-radius: .7em !important;
      background: #e2f0e5 !important;
      color: #1d5a35 !important;
      font: 600 .8em/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      letter-spacing: 0 !important;
      text-transform: none !important;
      white-space: nowrap !important;
      vertical-align: .08em !important;
      border: none !important;
    }
    html.ia-off .ia-pill { display: none !important; }
  `;

  const PANEL_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .fab {
      position: fixed; right: 14px; bottom: calc(env(safe-area-inset-bottom, 0px) + 84px);
      z-index: 2147483647; border: none; border-radius: 22px; padding: 10px 14px;
      background: #1d5a35; color: #fff; font-size: 15px; font-weight: 600;
      box-shadow: 0 4px 14px rgba(0,0,0,.25); cursor: pointer;
    }
    .panel {
      position: fixed; right: 14px; bottom: calc(env(safe-area-inset-bottom, 0px) + 136px);
      z-index: 2147483647; width: 260px; border-radius: 16px; padding: 14px;
      background: #fff; color: #1b1b1b; box-shadow: 0 8px 28px rgba(0,0,0,.28);
      font-size: 14px; display: none;
    }
    .panel.open { display: block; }
    h2 { margin: 0 0 4px; font-size: 16px; }
    .status { color: #555; margin: 0 0 12px; font-size: 13px; }
    .label { font-size: 12px; color: #555; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .04em; }
    .row { display: flex; gap: 6px; margin-bottom: 12px; }
    .row button {
      flex: 1; padding: 9px 0; border-radius: 10px; border: 1px solid #cfd8d2;
      background: #f4f7f5; color: #1b1b1b; font-size: 15px; font-weight: 600; cursor: pointer;
    }
    .row button.on { background: #1d5a35; border-color: #1d5a35; color: #fff; }
    .toggle {
      width: 100%; padding: 10px; border-radius: 10px; border: 1px solid #cfd8d2;
      background: #fff; color: #1b1b1b; font-size: 14px; font-weight: 600; cursor: pointer;
    }
    @media (prefers-color-scheme: dark) {
      .panel { background: #1f2421; color: #eee; }
      .status, .label { color: #aab3ad; }
      .row button { background: #2b322e; border-color: #3a443e; color: #eee; }
      .toggle { background: #2b322e; border-color: #3a443e; color: #eee; }
    }
  `;

  const SCALES = [0.5, 1, 2, 3];
  const scaleLabel = (f) => (f === 0.5 ? '½×' : f + '×');

  function run() {
    headingCache = null;
    const recipe = findRecipe();
    let ings, els, lastIng;
    if (recipe) {
      ings = [].concat(recipe.recipeIngredient || recipe.ingredients || []).map((r) => parseIngredient(decode(r)));
      els = findStepElements(flattenSteps(recipe.recipeInstructions, []));
      lastIng = locateIngredients(ings);
    } else {
      const found = findRecipeInText();
      if (!found) return false;
      ({ ings, stepEls: els, lastIng } = found);
    }
    if (!els.length) return false;

    const phrases = buildPhrases(ings);
    const pills = [];
    let stepsWithAmounts = 0;
    els.sort((a, b) => (FOLLOWS(a, b) ? -1 : 1));
    let section = null;
    for (const el of els) {
      // A step without its own label belongs to the section of the step before it.
      const own = stepSection(el, lastIng);
      if (own && own.size) section = own;
      if (annotate(el, phrases, ings, pills, section)) stepsWithAmounts++;
    }
    // Without recipe data we're guessing it's a recipe; stay hidden unless something matched.
    if (!recipe && !pills.length) return false;

    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    const scaleKey = 'scale:' + location.host + location.pathname;
    let scale = store.get(scaleKey, 1);
    let off = store.get('off', false);

    function render() {
      for (const p of pills) {
        const parts = p.ings.map((i) => amountText(ings[i], scale * p.part)).filter(Boolean);
        p.el.textContent = parts.join(' / ');
      }
      document.documentElement.classList.toggle('ia-off', off);
      fab.textContent = off ? 'Amounts off' : `Amounts · ${scaleLabel(scale)}`;
      scaleRow.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.f === scale));
      toggle.textContent = off ? 'Show amounts in steps' : 'Hide amounts in steps';
    }

    const host = document.createElement('div');
    host.id = 'inline-amounts-ui';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>${PANEL_CSS}</style>
      <button class="fab" type="button"></button>
      <div class="panel" role="dialog" aria-label="Honeycomb">
        <h2>Honeycomb</h2>
        <p class="status"></p>
        <p class="label">Scale recipe</p>
        <div class="row"></div>
        <button class="toggle" type="button"></button>
      </div>`;
    const fab = root.querySelector('.fab');
    const panel = root.querySelector('.panel');
    const scaleRow = root.querySelector('.row');
    const toggle = root.querySelector('.toggle');
    root.querySelector('.status').textContent =
      `Added ${pills.length} amount${pills.length === 1 ? '' : 's'} across ${stepsWithAmounts} step${stepsWithAmounts === 1 ? '' : 's'}.`;
    for (const f of SCALES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.f = f;
      b.textContent = scaleLabel(f);
      b.addEventListener('click', () => {
        scale = f;
        store.set(scaleKey, f);
        render();
      });
      scaleRow.appendChild(b);
    }
    fab.addEventListener('click', () => panel.classList.toggle('open'));
    toggle.addEventListener('click', () => {
      off = !off;
      store.set('off', off);
      render();
    });
    document.body.appendChild(host);
    render();

    window.__inlineAmounts.togglePanel = () => panel.classList.toggle('open');
    window.__inlineAmounts.result = { ingredients: ings, steps: els.length, pills: pills.length };
    return true;
  }

  window.__inlineAmounts = { parseIngredient, amountText, buildPhrases, matchStep, fmt };

  // Some sites build the recipe card after the page loads, so try a couple more times.
  if (!run()) {
    for (const ms of [1500, 4000, 8000]) {
      setTimeout(() => window.__inlineAmounts.result || run(), ms);
    }
  }
})();
