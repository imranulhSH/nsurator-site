// The subpages (2026-11-09): support (+ terms, open source), credits, privacy and the guides, generated as static pages
// into src/home/ in Chinese and English. These checks keep every old address the app, the homepage and search engines
// use working: ?lang, the saved language, ?doc=, #terms / #oss / #s2, the legacy #privacy and #guide, and the guide URLs.
const assert = require('node:assert/strict');
const { readFileSync, existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const HOME = join(__dirname, '../src/home');
const read = (p) => readFileSync(join(HOME, p), 'utf8');
const scripts = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const GUIDES = ['index', 'build-your-library', 'connect-sources', 'organize-and-deduplicate', 'watch-and-resume', 'make-a-collection', 'every-screen', 'connect-ai-tools', 'backup-and-move'];
const guidePath = (g, lang) => 'guides/' + (lang === 'en' ? 'en/' : '') + (g === 'index' ? 'index.html' : g + '.html');

// run a page's first (language) script
function boot(page, { query = '', hash = '', saved = null, blocked = false } = {}) {
  const storage = new Map(saved === null ? [] : [['nsurator-site-lang', saved]]);
  const replaced = [];
  const ctx = {
    URLSearchParams,
    location: { search: query, hash, replace: (to) => replaced.push(to) },
    localStorage: {
      getItem(k) { if (blocked) throw Error('blocked'); return storage.get(k) ?? null; },
      setItem(k, v) { if (blocked) throw Error('blocked'); storage.set(k, v); },
    },
    document: { documentElement: { dataset: {} } },
  };
  vm.runInNewContext(scripts(read(page))[0], ctx);
  return { replaced, storage };
}

for (const [zh, en] of [['support.html', 'en/support.html'], ['credits.html', 'en/credits.html'], ...GUIDES.map((g) => [guidePath(g, 'zh'), guidePath(g, 'en')])]) {
  test(`${zh} ↔ ${en}: ?lang wins and is saved, the saved choice applies otherwise, query and hash travel along`, () => {
    const toEn = '/' + en.replace(/index\.html$/, '');
    const toZh = '/' + zh.replace(/index\.html$/, '');
    assert.deepEqual(boot(zh, { query: '?lang=en&from=app', hash: '#s2' }).replaced, [toEn + '?lang=en&from=app#s2']);
    assert.deepEqual(boot(en, { query: '?lang=zh', saved: 'en' }).replaced, [toZh + '?lang=zh']);
    assert.equal(boot(zh, { query: '?lang=en' }).storage.get('nsurator-site-lang'), 'en');
    assert.deepEqual(boot(zh, { saved: 'en' }).replaced, [toEn]);
    assert.deepEqual(boot(zh, { saved: 'zh' }).replaced, []);
    assert.deepEqual(boot(en, { query: '?lang=fr' }).replaced, []);
    assert.deepEqual(boot(zh, { blocked: true }).replaced, []);
    assert.deepEqual(boot(zh, { query: '?lang=en', blocked: true }).replaced, [toEn + '?lang=en']);
    assert.match(read(zh), /<html lang="zh-CN">/);
    assert.match(read(en), /<html lang="en">/);
  });
}

// ---- the support page router: one page per language holds support, terms and open source
function route(page, { query = '', hash = '' } = {}) {
  const html = read(page);
  const docs = [...html.matchAll(/<div data-doc="([a-z]+)" id="([a-z]+)"[^>]*data-title="([^"]*)"/g)].map((m) => ({ doc: m[1], title: m[3], hidden: true }));
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const state = { replaced: null, scrolled: [], title: '' };
  const el = (d) => ({ hidden: d.hidden, getAttribute: (a) => (a === 'data-doc' ? d.doc : a === 'data-title' ? d.title : null), set hiddenSet(v) { d.hidden = v; } });
  const document = {
    set title(t) { state.title = t; }, get title() { return state.title; },
    querySelectorAll(sel) {
      if (sel === '[data-doc]') return docs.map((d) => new Proxy(d, { get: (t, k) => (k === 'getAttribute' ? (a) => (a === 'data-doc' ? t.doc : t.title) : t[k]), set: (t, k, v) => { t[k] = v; return true; } }));
      return [];
    },
    getElementById(id) {
      if (!ids.has(id)) return null;
      const d = docs.find((x) => x.doc === id);
      return { getAttribute: (a) => (a === 'data-title' && d ? d.title : null), scrollIntoView: () => state.scrolled.push(id) };
    },
    addEventListener() {},
  };
  const ctx = { URLSearchParams, document, history: { pushState() {} }, window: { addEventListener() {}, scrollTo() {} },
    location: { search: query, hash, replace: (to) => { state.replaced = to; } } };
  const router = scripts(html).find((s) => s.includes('var DOCS='));
  vm.runInNewContext(router, ctx);
  return { shown: docs.filter((d) => !d.hidden).map((d) => d.doc), ...state };
}

for (const [page, lang] of [['support.html', 'zh'], ['en/support.html', 'en']]) {
  test(`${page}: ?doc and #doc pick the document, #sN scrolls inside it, the title follows`, () => {
    assert.deepEqual(route(page).shown, ['support']);
    assert.deepEqual(route(page, { query: '?doc=terms' }).shown, ['terms']);
    assert.deepEqual(route(page, { hash: '#oss' }).shown, ['oss']);
    const deep = route(page, { query: '?lang=' + lang + '&doc=terms', hash: '#s2' });
    assert.deepEqual(deep.shown, ['terms']);
    assert.deepEqual(deep.scrolled, ['terms-s2']);
    assert.notEqual(route(page, { hash: '#terms' }).title, route(page).title);
    assert.deepEqual(route(page, { query: '?doc=missing', hash: '#missing' }).shown, ['support']);
  });
  test(`${page}: the legacy #privacy and #guide addresses move to the privacy policy and the guides`, () => {
    const anchor = lang === 'zh' ? '#zh-hans' : '#english';
    assert.equal(route(page, { query: '?from=app&lang=' + lang, hash: '#privacy' }).replaced, '/privacy.html?from=app&lang=' + lang + anchor);
    assert.equal(route(page, { query: '?lang=' + lang + '&doc=privacy', hash: '#s2' }).replaced, '/privacy.html?lang=' + lang + '&doc=privacy' + anchor);
    assert.equal(route(page, { hash: '#guide' }).replaced, lang === 'zh' ? '/guides/' : '/guides/en/');
  });
}

test('privacy.html: one policy, both languages, the anchors the app and the homepage use, one contact address', () => {
  const html = read('privacy.html');
  assert.ok(html.includes('id="zh-hans"') && html.includes('id="english"'));
  assert.ok(html.includes('support@nsurator.com'));
  assert.equal(html.includes('852310683@qq.com'), false);
  for (const lang of ['zh', 'en']) {
    const home = read(lang === 'zh' ? 'nsuve/index.html' : 'nsuve/en/index.html');
    assert.ok(home.includes('href="/privacy.html?lang=' + lang + (lang === 'zh' ? '#zh-hans' : '#english') + '"'), 'homepage privacy link for ' + lang);
  }
});

test('every guide exists in both languages, links its other language, and the old guide addresses still open', () => {
  for (const g of GUIDES) for (const lang of ['zh', 'en']) assert.ok(existsSync(join(HOME, guidePath(g, lang))), guidePath(g, lang));
  for (const old of ['build-your-library', 'organize-and-deduplicate', 'watch-and-resume', 'make-a-collection', 'connect-ai-tools', 'backup-and-move']) assert.ok(existsSync(join(HOME, 'guides', old + '.html')));
  assert.ok(read('guides/credits.html').includes("location.replace('/credits.html'"));
  const zh = read('guides/build-your-library.html');
  assert.ok(zh.includes('href="/guides/en/build-your-library.html?lang=en"'));
});

test('no page loads an external script, and no Chinese page ships the 斯科墨韵榜书 font file', () => {
  const pages = ['support.html', 'en/support.html', 'credits.html', 'en/credits.html', 'privacy.html', ...GUIDES.flatMap((g) => [guidePath(g, 'zh'), guidePath(g, 'en')])];
  for (const p of pages) {
    const html = read(p);
    assert.equal(/<script[^>]+src=/.test(html), false, p);
    assert.equal(/@font-face\{font-family:(?!Figtree;|'851 GBai Marker')/.test(html), false, p + ': unexpected web font');
  }
  assert.deepEqual(readdirSync(join(HOME, 'home-assets/fonts')).filter((f) => /sike|斯科/i.test(f) && !/NOTICE/.test(f)), []);
});
