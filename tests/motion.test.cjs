const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../src/motion.js'), 'utf8');

function eventTarget(extra = {}) {
  const listeners = new Map();
  return Object.assign(extra, {
    addEventListener(name, listener) {
      const handlers = listeners.get(name) || [];
      handlers.push(listener);
      listeners.set(name, handlers);
    },
    dispatch(name) {
      for (const listener of listeners.get(name) || []) listener();
    },
  });
}

function harness({ reducedMotion = false, count = 1 } = {}) {
  const observers = [];
  const calls = [];
  const activeAnimations = new Set();
  const elements = Array.from({ length: count }, () => ({
    dataset: {},
    hidden: false,
    style: { opacity: '1', transform: 'none' },
    animate(keyframes, options) {
      const animation = {
        cancelCalls: 0,
        cancel() {
          this.cancelCalls++;
          activeAnimations.delete(this);
          this.oncancel?.();
        },
        finish() {
          activeAnimations.delete(this);
          this.onfinish?.();
        },
      };
      calls.push({ element: this, keyframes, options, animation });
      activeAnimations.add(animation);
      return animation;
    },
  }));
  class IntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
      observers.push(this);
    }
    observe(element) { this.targets.add(element); }
    unobserve(element) { this.targets.delete(element); }
    disconnect() { this.targets.clear(); }
    enter(element) { this.callback([{ target: element, isIntersecting: true }]); }
  }
  const reduced = eventTarget({ matches: reducedMotion });
  const document = eventTarget({
    hidden: false,
    querySelector: () => null,
    querySelectorAll: selector => selector === '[data-reveal]' ? elements : [],
    getElementById: () => null,
  });
  const window = eventTarget({ IntersectionObserver });
  vm.runInNewContext(source, {
    window, document, IntersectionObserver,
    matchMedia: () => reduced,
    innerHeight: 800,
    setTimeout, clearTimeout,
  }, { filename: 'motion.js' });

  function enter(element) {
    const observer = observers.find(item => item.targets.has(element));
    assert.ok(observer, 'the reveal element is observed');
    observer.enter(element);
    return observer;
  }
  function assertUnderlyingContentVisible() {
    for (const element of elements) {
      assert.equal(element.hidden, false);
      assert.deepEqual(element.style, { opacity: '1', transform: 'none' });
    }
  }
  return {
    mount: () => window.NsuratorMotion.mount(),
    elements, calls, activeAnimations, document, reduced,
    enter, assertUnderlyingContentVisible,
  };
}

test('reduced motion leaves content visible without an entrance animation', () => {
  const page = harness({ reducedMotion: true });
  page.mount();
  page.mount();
  assert.equal(page.calls.length, 0);
  assert.equal(page.activeAnimations.size, 0);
  page.assertUnderlyingContentVisible();
});

test('repeated mounts and queued intersection notifications reveal an element only once', () => {
  const page = harness();
  const element = page.elements[0];
  page.mount();
  page.mount();
  const observer = page.enter(element);
  // A queued observer callback can arrive after unobserve().
  observer.enter(element);
  page.calls[0].animation.finish();
  page.mount();
  observer.enter(element);
  assert.equal(page.calls.length, 1);
  assert.equal(page.activeAnimations.size, 0);
  assert.ok(!['forwards', 'both'].includes(page.calls[0].options.fill),
    'finished animations must not retain an overriding visual state');
  page.assertUnderlyingContentVisible();
});

for (const reason of ['hidden tab', 'reduced motion enabled']) {
  test(`${reason} cancels all running entrance animations and exposes the underlying content`, () => {
    const page = harness({ count: 2 });
    page.mount();
    page.elements.forEach(page.enter);
    assert.equal(page.activeAnimations.size, 2);

    const interrupt = () => {
      if (reason === 'hidden tab') {
        page.document.hidden = true;
        page.document.dispatch('visibilitychange');
      } else {
        page.reduced.matches = true;
        page.reduced.dispatch('change');
      }
    };
    interrupt();
    interrupt();
    assert.equal(page.activeAnimations.size, 0);
    assert.ok(page.calls.every(call => call.animation.cancelCalls === 1));
    page.assertUnderlyingContentVisible();

    // Returning to the tab or re-enabling motion must not replay old entrances.
    page.document.hidden = false;
    page.reduced.matches = false;
    page.document.dispatch('visibilitychange');
    page.reduced.dispatch('change');
    page.mount();
    assert.equal(page.calls.length, 2);
    assert.equal(page.activeAnimations.size, 0);
    page.assertUnderlyingContentVisible();
  });
}
