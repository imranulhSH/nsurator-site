// The D homepage (2026-11-09): src/home/nsuve/index.html (zh) and src/home/nsuve/en/index.html (en), static pages that carry
// both the 1440 desktop comp and the phone column. These checks cover the parts that must not regress:
// the language choice shared with support / credits / privacy, the layout pick, and the links out of the page.
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
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
    for (const href of [privacy, '/support.html?lang=' + lang, '/credits.html?lang=' + lang, '/support.html?lang=' + lang + '&amp;doc=oss', '/support.html?lang=' + lang + '&amp;doc=terms', '/guides/']) {
      assert.ok(html.includes('href="' + href + '"'), lang + ' homepage links to ' + href);
    }
    assert.ok(html.includes('href="https://apps.apple.com/app/id6763750134?mt=12"'), 'App Store link');
    assert.ok(html.includes('href="/nsuve/?lang=zh"') && html.includes('href="/nsuve/en/?lang=en"'), 'language switch');
    assert.equal(/<script[^>]+src=/.test(html), false, 'no external scripts');
    assert.match(html, new RegExp('<html lang="' + (lang === 'zh' ? 'zh-CN' : 'en') + '"'));
  });

  test(`${lang} homepage: every /home-assets/ file it names is in src/home`, () => {
    const html = read(lang);
    const refs = new Set([...html.matchAll(/\/home-assets\/([A-Za-z0-9._\/-]+\.(?:jpg|png|webp|svg|ttf))/g)].map((m) => m[1]));
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
