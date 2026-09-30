const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function harness(page, { query = '', saved = null, storageBlocked = false, fragment = '#guide' } = {}) {
  const html = readFileSync(join(__dirname, '../src', page), 'utf8');
  const source = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
  let url = new URL(`https://www.nsurator.com.cn/${page}${query}${fragment}`);
  const listeners = new Map();
  const entries = [url.href];
  let entry = 0;
  const scrolls = [];
  const emit = (event) => { for (const listener of listeners.get(event) ?? []) listener(); };
  const replace = (next) => { url = new URL(next, url); entries[entry] = url.href; };
  const push = (next) => { url = new URL(next, url); entries.splice(++entry, Infinity, url.href); };
  const document = { title: '', documentElement: {}, getElementById: (id) => ({ scrollIntoView: () => scrolls.push(id) }) };
  const storage = new Map(saved === null ? [] : [['nsurator-site-lang', saved]]);
  const context = {
    URL, URLSearchParams, document,
    location: { get href() { return url.href; }, get search() { return url.search; }, get hash() { return url.hash; }, replace, assign: push },
    history: { replaceState(_state, _unused, next) { replace(next); }, pushState(_state, _unused, next) { push(next); } },
    localStorage: {
      getItem(k) { if (storageBlocked) throw Error('blocked'); return storage.get(k) ?? null; },
      setItem(k, v) { if (storageBlocked) throw Error('blocked'); storage.set(k, v); },
    },
    window: {
      addEventListener(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener); },
      removeEventListener(event, listener) { listeners.get(event)?.delete(listener); },
      scrollTo() {},
    },
    DCLogic: class {
      props = {};
      setState(next) { Object.assign(this.state, next); this.componentDidUpdate(this.props); }
    },
  };
  const Component = vm.runInNewContext(source + '\nComponent', context);
  const component = new Component();
  component.componentDidMount();
  return { component, document, storage, scrolls, listeners, emit, url: () => url,
    follow(next) { push(next); emit('hashchange'); },
    back() { assert.ok(entry > 0); url = new URL(entries[--entry]); emit('popstate'); },
    forward() { assert.ok(entry + 1 < entries.length); url = new URL(entries[++entry]); emit('popstate'); },
  };
}

for (const page of ['index.html', 'support.html', 'credits.html']) {
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
    assert.equal(h.url().searchParams.get('from'), 'app');
    assert.equal(h.url().searchParams.get('lang'), 'zh');
    assert.equal(h.url().hash, '#oss');
    assert.equal(harness(page, { query: h.url().search, storageBlocked: true }).component.renderVals().lang, 'zh');
    h.component.setLang('unexpected');
    assert.equal(h.component.state.lang, 'zh');
  });
}
test('switching support tabs preserves query parameters and browser navigation', () => {
  const h = harness('support.html', { query: '?from=app&lang=en' });
  h.component.go('terms');
  assert.equal(h.url().searchParams.get('from'), 'app');
  assert.equal(h.url().searchParams.get('lang'), 'en');
  assert.equal(h.url().searchParams.get('doc'), 'terms');
  assert.equal(h.url().hash, '#terms');
  assert.equal(h.document.title, 'Nsurator · Terms of Use');
  h.back();
  assert.equal(h.component.renderVals().head.title, 'User guide');
  h.forward();
  assert.equal(h.component.renderVals().head.title, 'Terms of Use');
});

for (const page of ['index.html', 'support.html', 'credits.html']) {
  test(`${page}: history restores URL language, content, title and selection`, () => {
    const h = harness(page, { query: '?lang=zh', fragment: page === 'support.html' ? '#guide' : '' });
    const chineseTitle = h.document.title;
    h.follow(page === 'support.html' ? '#s2' : '#faq');
    h.component.setLang('en');
    const englishTitle = h.document.title;
    assert.notEqual(englishTitle, chineseTitle);
    h.back();
    assert.equal(h.url().searchParams.get('lang'), 'zh');
    assert.equal(h.component.renderVals().lang, 'zh');
    assert.equal(h.document.documentElement.lang, 'zh-CN');
    assert.equal(h.document.title, chineseTitle);
    assert.equal(h.storage.get('nsurator-site-lang'), 'zh');
    h.forward();
    assert.equal(h.component.renderVals().lang, 'en');
    assert.equal(h.document.documentElement.lang, 'en');
    assert.equal(h.document.title, englishTitle);
    h.storage.set('nsurator-site-lang', 'zh');
    h.emit('pageshow');
    assert.equal(h.component.renderVals().lang, 'en');
    h.component.componentWillUnmount();
    assert.equal([...h.listeners.values()].reduce((count, set) => count + set.size, 0), 0);
  });
}

test('each support document keeps its identity and selected section on reload and language change', () => {
  for (const doc of ['guide', 'terms', 'oss']) {
    const h = harness('support.html', { query: '?lang=en', fragment: '#' + doc });
    const expected = h.component.renderVals();
    const section = expected.toc[1];
    h.follow(section.href);
    assert.equal(h.url().searchParams.get('doc'), doc);
    assert.equal(h.url().hash, '#s2');
    h.component.setLang('zh');
    const reloaded = harness('support.html', { query: h.url().search, fragment: h.url().hash });
    assert.equal(reloaded.component.state.page, doc);
    assert.equal(reloaded.component.renderVals().sections[1].id, 's2');
    assert.ok(reloaded.scrolls.includes('s2'));
    h.back();
    assert.equal(h.component.state.page, doc);
    h.forward();
    assert.equal(h.component.state.active, 's2');
  }
});

test('legacy document links override stale query routing and unknown documents fall back safely', () => {
  assert.equal(harness('support.html', { query: '?doc=terms', fragment: '#guide' }).component.state.page, 'guide');
  assert.equal(harness('support.html', { query: '?doc=missing', fragment: '#missing' }).component.state.page, 'support');
});

test('all privacy entry points use the single existing policy and appropriate language anchor', () => {
  for (const lang of ['zh', 'en']) {
    const hash = lang === 'zh' ? '#zh-hans' : '#english';
    const legacy = harness('support.html', { query: '?from=app&lang=' + lang, fragment: '#privacy' });
    assert.equal(legacy.url().pathname, '/privacy.html');
    assert.equal(legacy.url().hash, hash);
    assert.equal(legacy.url().searchParams.get('from'), 'app');
    const nested = harness('support.html', { query: '?lang=' + lang + '&doc=privacy', fragment: '#s2' });
    assert.equal(nested.url().pathname, '/privacy.html');
    assert.equal(nested.url().hash, hash);
    const h = harness('support.html', { query: '?lang=' + lang });
    const link = h.component.renderVals().groups[1].items[0];
    assert.equal(new URL(link.href, h.url()).pathname, '/privacy.html');
    h.component.go('privacy');
    assert.equal(h.url().pathname, '/privacy.html');
    assert.equal(h.url().hash, hash);
    const home = harness('index.html', { query: '?lang=' + lang });
    assert.equal(new URL(home.component.renderVals().privacyHref, home.url()).hash, hash);
  }
});
