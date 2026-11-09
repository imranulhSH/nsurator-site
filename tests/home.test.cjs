// The D homepage (2026-11-09): src/home/nsuve/index.html (zh) and src/home/nsuve/en/index.html (en), static pages that carry
// both the 1440 desktop comp and the phone column. These checks cover the parts that must not regress:
// the language choice shared with support / credits / privacy, the layout pick, and the links out of the page.
const assert = require('node:assert/strict');
const { readFileSync, existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const HOME = join(__dirname, '../src/home');
const PAGES = { zh: 'nsuve/index.html', en: 'nsuve/en/index.html' };
const read = (lang) => readFileSync(join(HOME, PAGES[lang]), 'utf8');
const headScript = (html) => html.match(/<head>[\s\S]*?<script>([\s\S]*?)<\/script>/)[1];

function boot(lang, { query = '', hash = '', saved = null, blocked = false, protocol = 'https:', width = 1440, height = 900 } = {}) {
  const storage = new Map(saved === null ? [] : [['nsurator-site-lang', saved]]);
  const replaced = [];
  const props = new Map();
  const documentElement = { dataset: {}, style: { setProperty: (k, v) => props.set(k, v) } };
  const context = {
    URLSearchParams,
    location: { search: query, hash, protocol, replace: (to) => replaced.push(to) },
    localStorage: {
      getItem(k) { if (blocked) throw Error('blocked'); return storage.get(k) ?? null; },
      setItem(k, v) { if (blocked) throw Error('blocked'); storage.set(k, v); },
    },
    document: { documentElement },
    window: { innerWidth: width, innerHeight: height },
  };
  context.window.window = context.window;
  vm.runInNewContext(headScript(read(lang)), { ...context, innerWidth: width, innerHeight: height });
  return { storage, replaced, layout: documentElement.dataset.layout, zoom: props.get('--wpz') };
}

for (const lang of ['zh', 'en']) {
  const other = lang === 'zh' ? 'en' : 'zh';
  const otherPath = other === 'en' ? '/nsuve/en/' : '/nsuve/';

  test(`${lang} homepage: ?lang wins over a saved choice, is saved, and moves to the other page when it differs`, () => {
    const same = boot(lang, { query: '?lang=' + lang, saved: other });
    assert.deepEqual(same.replaced, []);
    assert.equal(same.storage.get('nsurator-site-lang'), lang);
    const moved = boot(lang, { query: '?lang=' + other + '&from=app', hash: '#pricing', saved: lang });
    assert.deepEqual(moved.replaced, [otherPath + '?lang=' + other + '&from=app#pricing']);
    assert.equal(moved.storage.get('nsurator-site-lang'), other);
  });

  test(`${lang} homepage: no or invalid ?lang keeps the saved choice, else stays put`, () => {
    for (const query of ['', '?lang=fr', '?lang=']) {
      assert.deepEqual(boot(lang, { query, saved: lang }).replaced, []);
      assert.deepEqual(boot(lang, { query, saved: other }).replaced, [otherPath + query]);
      assert.deepEqual(boot(lang, { query }).replaced, []);
    }
  });

  test(`${lang} homepage: blocked storage never throws and never redirects on its own`, () => {
    assert.deepEqual(boot(lang, { blocked: true }).replaced, []);
    assert.deepEqual(boot(lang, { query: '?lang=' + other, blocked: true }).replaced, [otherPath + '?lang=' + other]);
  });

  test(`${lang} homepage: the comp shows when it fits at 62 % or more, else the phone column`, () => {
    assert.equal(boot(lang, { width: 1440, height: 900 }).layout, 'desktop');
    assert.equal(boot(lang, { width: 1280, height: 720 }).layout, 'desktop');
    assert.equal(boot(lang, { width: 1180, height: 820 }).layout, 'desktop');
    assert.equal(boot(lang, { width: 820, height: 1180 }).layout, 'phone');
    assert.equal(boot(lang, { width: 390, height: 844 }).layout, 'phone');
    assert.equal(boot(lang, { width: 1440, height: 500 }).layout, 'phone');
  });

  test(`${lang} homepage: links out go to the shared pages in the same language`, () => {
    const html = read(lang);
    const privacy = lang === 'zh' ? '/privacy.html?lang=zh#zh-hans' : '/privacy.html?lang=en#english';
    for (const href of [privacy, '/support.html?lang=' + lang, '/credits.html?lang=' + lang, '/support.html?lang=' + lang + '&amp;doc=oss', '/support.html?lang=' + lang + '&amp;doc=terms', lang === 'zh' ? '/guides/' : '/guides/en/']) {
      assert.ok(html.includes('href="' + href + '"'), lang + ' homepage links to ' + href);
    }
    assert.ok(html.includes('href="https://apps.apple.com/app/id6763750134?mt=12"'), 'App Store link');
    assert.ok(html.includes('href="/nsuve/?lang=zh"') && html.includes('href="/nsuve/en/?lang=en"'), 'language switch');
    assert.equal(/<script[^>]+src=/.test(html), false, 'no external scripts');
    assert.match(html, new RegExp('<html lang="' + (lang === 'zh' ? 'zh-CN' : 'en') + '"'));
  });

  test(`${lang} homepage: every /home-assets/ file it names is in src/home`, () => {
    const html = read(lang);
    const refs = new Set([...html.matchAll(/\/home-assets\/([A-Za-z0-9._\/-]+\.(?:jpg|png|webp|svg|ttf|woff2))/g)].map((m) => m[1]));
    assert.ok(refs.size > 20);
    for (const r of refs) assert.ok(existsSync(join(HOME, 'home-assets', r)), 'missing home-assets/' + r);
  });
}

// The old addresses keep working: / and /en/ move to /nsuve/ and /nsuve/en/ before anything renders, keeping ?lang and #.
for (const [page, to] of [['index.html', '/nsuve/'], ['en/index.html', '/nsuve/en/']]) {
  test(`${page} redirects to ${to} with the query and fragment`, () => {
    const html = readFileSync(join(HOME, page), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const moved = [];
    vm.runInNewContext(script, { location: { search: '?lang=en&from=app', hash: '#pricing', replace: (u) => moved.push(u) } });
    assert.deepEqual(moved, [to + '?lang=en&from=app#pricing']);
    assert.ok(html.includes('<meta http-equiv="refresh" content="0; url=' + to + '">'), 'refresh fallback without JavaScript');
    assert.ok(html.includes('<link rel="canonical" href="https://nsurator.com' + to + '">'));
  });
}

// 2026-11-09 (owner): headings in two faces. English: 851 GBai Marker, self-hosted (Basic Latin only).
// Chinese: 斯科墨韵榜书, whose free licence excludes embedding in web pages, so its font file never ships; the build
// draws each heading character as an inline SVG path and keeps the real text for screen readers and search.
const TITLE_CLASSES = ['wph-h', 'wp-h2', 'wp-act', 'wm-hero-h', 'wm-h2', 'wm-act'];
const FONTS = join(HOME, 'home-assets/fonts');
function headingText(html) {
  let out = '';
  const open = /<([a-z][a-z0-9]*)\b[^>]*\bclass="([^"]*)"[^>]*>/g;
  for (let m; (m = open.exec(html));) {
    if (!m[2].split(/\s+/).some((c) => TITLE_CLASSES.includes(c))) continue;
    const close = new RegExp('<(/?)' + m[1] + '\\b[^>]*>', 'g');
    close.lastIndex = open.lastIndex;
    let depth = 1, t;
    while (depth && (t = close.exec(html))) depth += t[1] ? -1 : 1;
    out += html.slice(open.lastIndex, t ? t.index : html.length).replace(/<[^>]+>/g, '');
  }
  return out;
}

test('en homepage: the headings use 851 GBai Marker, preloaded, and need nothing beyond Basic Latin', () => {
  const html = read('en');
  assert.ok(html.includes('<link rel="preload" href="/home-assets/fonts/851GBaiMarker-latin.woff2" as="font" type="font/woff2" crossorigin>'));
  assert.ok(html.includes(`@font-face{font-family:'851 GBai Marker';src:url("/home-assets/fonts/851GBaiMarker-latin.woff2") format("woff2")`));
  assert.ok(html.includes(TITLE_CLASSES.map((c) => '.' + c).join(',') + "{font-family:'851 GBai Marker',Caprasimo"), 'the rule names every heading class');
  const text = headingText(html);
  assert.ok(text.length > 100, 'found the headings');
  assert.deepEqual([...new Set(text)].filter((ch) => !/[\u0020-\u007e\s]/.test(ch)), []);
  for (const f of ['851GBaiMarker-latin.woff2', '851GBaiMarker-NOTICE.txt']) assert.ok(existsSync(join(FONTS, f)), f);
});

test('zh homepage: no heading web font, and the 斯科墨韵榜书 file never ships', () => {
  const html = read('zh');
  assert.equal(html.includes('851GBaiMarker'), false);
  assert.equal(/@font-face\{font-family:'?(?!Caprasimo|Figtree)/.test(html), false, 'only Caprasimo and Figtree are web fonts');
  assert.deepEqual(readdirSync(FONTS).filter((f) => /\.(ttf|otf|woff2?)$/.test(f) && !/^(Caprasimo|Figtree|851GBaiMarker)/.test(f)), []);
});

const zhDrawn = read('zh').includes('class="zg"');
test('zh homepage: every drawn heading character has its outline, and the text is still there', { skip: !zhDrawn && 'zh headings are not drawn yet' }, () => {
  const html = read('zh');
  const defs = new Set([...html.matchAll(/<path id="(zg-[0-9a-f]+)"/g)].map((m) => m[1]));
  const uses = new Set([...html.matchAll(/<use href="#(zg-[0-9a-f]+)"\/>/g)].map((m) => m[1]));
  assert.ok(uses.size > 30);
  assert.deepEqual([...uses].filter((u) => !defs.has(u)), []);
  const hidden = [...html.matchAll(/<span class="zh-vh">([^<]*)<\/span>/g)].map((m) => m[1]).join('');
  for (const ch of new Set(headingText(html).replace(/\s/g, ''))) if (/[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/.test(ch)) assert.ok(hidden.includes(ch), 'text kept for ' + ch);
});

// 2026-11-09 (owner): once the Nsuve mark lands in the corner, the desktop nav becomes one frosted bar, as on the phone.
for (const lang of ['zh', 'en']) {
  test(`${lang} homepage: the desktop nav carries the frosted bar, switched on when the mark lands`, () => {
    const html = read(lang);
    assert.ok(html.includes('<div class="wps-bar" aria-hidden="true"></div>'));
    assert.ok(html.includes(".wp-site .wp-nav.wps-solid .wps-bar{opacity:1}"));
    assert.ok(html.includes("bar.classList.toggle('wps-solid', landed)"));
  });
}
