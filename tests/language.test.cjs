const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function harness(page, { query = '', saved = null, storageBlocked = false, fragment = '#guide' } = {}) {
  const html = readFileSync(join(__dirname, '../src', page), 'utf8');
  const source = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
  let url = new URL(`https://www.nsurator.com.cn/${page}${query}${fragment}`);
  const document = { title: '', documentElement: {} };
  const storage = new Map(saved === null ? [] : [['nsurator-site-lang', saved]]);
  const context = {
    URL, URLSearchParams, document,
    location: { get href() { return url.href; }, get search() { return url.search; }, get hash() { return url.hash; } },
    history: { replaceState(_state, _unused, next) { url = new URL(next, url); } },
    localStorage: {
      getItem(k) { if (storageBlocked) throw Error('blocked'); return storage.get(k) ?? null; },
      setItem(k, v) { if (storageBlocked) throw Error('blocked'); storage.set(k, v); },
    },
    window: { addEventListener() {}, removeEventListener() {}, scrollTo() {} },
    DCLogic: class {
      props = {};
      setState(next) { Object.assign(this.state, next); this.syncTitle(); }
    },
  };
  const Component = vm.runInNewContext(source + '\nComponent', context);
  const component = new Component();
  component.componentDidMount();
  return { component, document, storage, url: () => url };
}

for (const page of ['index.html', 'support.html']) {
  test(`${page}: explicit language overrides a conflicting browser preference before first render`, () => {
    for (const lang of ['zh', 'en']) {
      const h = harness(page, { query: '?lang=' + lang, saved: lang === 'zh' ? 'en' : 'zh' });
      assert.equal(h.component.renderVals().lang, lang);
      assert.equal(h.document.documentElement.lang, lang === 'zh' ? 'zh-CN' : 'en');
      assert.equal(h.storage.get('nsurator-site-lang'), lang);
      if (page === 'support.html') assert.equal(h.component.state.page, 'guide');
    }
  });
  test(`${page}: missing or invalid language keeps saved preference and existing default`, () => {
    for (const query of ['', '?lang=fr', '?lang=']) {
      assert.equal(harness(page, { query, saved: 'en' }).component.renderVals().lang, 'en');
      assert.equal(harness(page, { query, saved: 'unexpected' }).component.renderVals().lang, 'zh');
    }
  });
  test(`${page}: blocked storage still supports deep links and manual switching with refresh`, () => {
    const h = harness(page, { query: '?from=app&lang=en', storageBlocked: true, fragment: '#oss' });
    assert.equal(h.component.renderVals().lang, 'en');
    h.component.setLang('zh');
    assert.equal(h.document.documentElement.lang, 'zh-CN');
    assert.equal(h.url().search, '?from=app&lang=zh');
    assert.equal(h.url().hash, '#oss');
    assert.equal(harness(page, { query: h.url().search, storageBlocked: true }).component.renderVals().lang, 'zh');
    h.component.setLang('unexpected');
    assert.equal(h.component.state.lang, 'zh');
  });
}
test('switching support tabs preserves the explicit language and other query parameters', () => {
  const h = harness('support.html', { query: '?from=app&lang=en' });
  h.component.go('privacy');
  assert.equal(h.url().search, '?from=app&lang=en');
  assert.equal(h.url().hash, '#privacy');
  assert.equal(h.document.title, 'Nsurator · Privacy Policy');
});
