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

function harness({ reducedMotion = false, count = 1, compact = false, types = [], observerAvailable = true, initiallyHidden = false, failure } = {}) {
  const observers = [];
  const calls = [];
  const activeAnimations = new Set();
  const elements = Array.from({ length: count }, (_, i) => ({
    dataset: { reveal: types[i] },
    hidden: false,
    style: { opacity: '1', transform: 'none' },
    animate(keyframes, options) {
      if (failure === 'animate') throw new Error('animation unavailable');
      const animation = {
        cancelCalls: 0,
        playCalls: 0,
        currentTime: null,
        playState: 'running',
        pause() {
          if (failure === 'pause') throw new Error('animation could not pause');
          this.playState = 'paused';
        },
        play() {
          if (failure === 'play') throw new Error('animation could not play');
          this.playCalls++;
          this.playState = 'running';
        },
        cancel() {
          this.cancelCalls++;
          this.playState = 'idle';
          activeAnimations.delete(this);
          this.oncancel?.();
        },
        finish() {
          this.playState = 'finished';
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
    observe(element) {
      if (failure === 'observe') throw new Error('observation unavailable');
      this.targets.add(element);
    }
    unobserve(element) { this.targets.delete(element); }
    disconnect() { this.targets.clear(); }
    enter(element) { this.callback([{ target: element, isIntersecting: true }]); }
  }
  const reduced = eventTarget({ matches: reducedMotion });
  const document = eventTarget({
    hidden: initiallyHidden,
    querySelector: () => null,
    querySelectorAll: selector => selector === '[data-reveal]' ? elements : [],
    getElementById: () => null,
  });
  const window = eventTarget(observerAvailable ? { IntersectionObserver } : {});
  vm.runInNewContext(source, {
    window, document, IntersectionObserver,
    matchMedia: query => query.includes('max-width') ? { matches: compact } : reduced,
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

test('the homepage connects its new feature blocks and player to the motion runtime', () => {
  const html = readFileSync(join(__dirname, '../src/index.html'), 'utf8');
  assert.match(html, /<h1[^>]*data-reveal="hero-title"/);
  assert.match(html, /<div[^>]*data-reveal="feature"/);
  assert.match(html, /<figure[^>]*data-reveal="screen"/);
  assert.match(html, /data-reveal="diagnostic"/);
  assert.ok(html.indexOf('__SITE_MOTION__') < html.indexOf('<x-dc>'),
    'motion must load before DC mounts the page');
});

test('mobile reduces travel while each entrance returns to the original layout', () => {
  const types = ['feature', 'screen', 'hero-title', 'diagnostic'];
  const desktop = harness({ count: types.length, types });
  const mobile = harness({ count: types.length, types, compact: true });
  for (const page of [desktop, mobile]) {
    page.mount();
    page.elements.forEach(page.enter);
    for (const call of page.calls) {
      assert.equal(call.keyframes.at(-1).opacity, 1);
      assert.equal(call.keyframes.at(-1).transform, 'translate3d(0, 0, 0) scale(1)');
      call.animation.finish();
    }
    page.assertUnderlyingContentVisible();
    assert.equal(page.activeAnimations.size, 0);
  }
  for (const index of [0, 1, 3]) {
    const distance = page => Number(page.calls[index].keyframes[0].transform.match(/, (\d+)px/)[1]);
    assert.ok(distance(mobile) < distance(desktop));
  }
});

test('before any intersection callback, every entrance holds its starting frame and plays without being recreated', () => {
  const page = harness({ count: 3, types: ['feature', 'screen', 'diagnostic'] });
  page.elements[1].dataset.revealDelay = '180';
  page.mount();
  page.mount();
  assert.equal(page.calls.length, 3);
  for (const call of page.calls) {
    assert.equal(call.animation.playState, 'paused');
    assert.equal(call.animation.currentTime, 0);
    assert.equal(call.keyframes[0].opacity, 0);
    assert.equal(call.options.fill, 'backwards', 'the first frame also covers any entrance delay');
    assert.equal(call.animation.playCalls, 0);
  }
  page.enter(page.elements[1]);
  assert.equal(page.calls.length, 3, 'scrolling must not recreate and reset the animation');
  assert.equal(page.calls[1].animation.playState, 'running');
  assert.equal(page.calls[1].animation.playCalls, 1);
  assert.equal(page.calls[0].animation.playState, 'paused');
  assert.equal(page.calls[2].animation.playState, 'paused');
});

for (const failure of ['animate', 'pause', 'observe', 'play']) {
  test(`a failure during ${failure} leaves all content visible`, () => {
    const page = harness({ count: 2, failure });
    page.mount();
    if (failure === 'play') page.elements.forEach(page.enter);
    page.mount();
    assert.equal(page.activeAnimations.size, 0);
    page.assertUnderlyingContentVisible();
  });
}

test('a page first mounted in the background stays static when it becomes visible', () => {
  const page = harness({ initiallyHidden: true });
  page.mount();
  page.document.hidden = false;
  page.document.dispatch('visibilitychange');
  page.mount();
  assert.equal(page.calls.length, 0);
  page.assertUnderlyingContentVisible();
});

test('without Web Animations the complete page stays visible', () => {
  const page = harness();
  delete page.elements[0].animate;
  page.mount();
  assert.equal(page.calls.length, 0);
  page.assertUnderlyingContentVisible();
});

test('without IntersectionObserver the complete page stays visible', () => {
  const page = harness({ count: 3, observerAvailable: false });
  page.mount();
  assert.equal(page.calls.length, 0);
  page.assertUnderlyingContentVisible();
});

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
  assert.equal(page.calls[0].animation.playCalls, 1);
  assert.equal(page.activeAnimations.size, 0);
  assert.ok(!['forwards', 'both'].includes(page.calls[0].options.fill),
    'finished animations must not retain an overriding visual state');
  page.assertUnderlyingContentVisible();
});

for (const reason of ['hidden tab', 'reduced motion enabled']) {
  test(`${reason} releases both pending and running entrances without replaying either`, () => {
    const page = harness({ count: 2 });
    page.mount();
    const observer = page.enter(page.elements[0]);
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
    observer.enter(page.elements[1]); // A queued callback cannot restart a canceled entrance.
    assert.equal(page.calls[1].animation.playCalls, 0);
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
