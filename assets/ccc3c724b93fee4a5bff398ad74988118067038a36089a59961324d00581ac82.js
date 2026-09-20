/* Native scrolling, with short, one-time compositor animations. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new WeakSet();
  const animations = new Set();
  let revealObserver;
  let navigationObserver;
  let navigationTargets = [];
  let navigationHeight = 0;
  let headerObserver;

  function reveal(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target;
      revealObserver.unobserve(element);
      if (seen.has(element)) continue;
      seen.add(element);
      // The underlying content stays visible if animation is unavailable,
      // interrupted, or the page returns from a background tab.
      if (reduced.matches || !element.animate || document.hidden) continue;
      const delay = Math.min(140, Number(element.dataset.revealDelay) || 0);
      const animation = element.animate(
        [{ opacity: 0.12, transform: 'translate3d(0, 24px, 0)' },
         { opacity: 1, transform: 'translate3d(0, 0, 0)' }],
        { duration: 620, delay, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards' }
      );
      animations.add(animation);
      const release = () => animations.delete(animation);
      animation.onfinish = release;
      animation.oncancel = release;
    }
  }

  function mountReveals() {
    if (reduced.matches || !('IntersectionObserver' in window)) return;
    revealObserver ||= new IntersectionObserver(reveal, {
      threshold: 0, rootMargin: '0px 0px -48px 0px'
    });
    document.querySelectorAll('[data-reveal]').forEach(element => {
      if (!seen.has(element)) revealObserver.observe(element);
    });
  }

  function mountHeader() {
    const header = document.querySelector('[data-site-header]');
    if (!header || headerObserver) return;
    // A one-pixel sentinel avoids a scroll listener and repeated layout reads.
    const sentinel = document.createElement('span');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:24px;left:0;width:1px;height:1px;pointer-events:none';
    document.body.prepend(sentinel);
    if (!('IntersectionObserver' in window)) {
      header.dataset.scrolled = 'true';
      return;
    }
    headerObserver = new IntersectionObserver(([entry]) => {
      header.dataset.scrolled = String(entry.boundingClientRect.top < 0);
    });
    headerObserver.observe(sentinel);
  }

  function mountNavigation() {
    if (!('IntersectionObserver' in window)) return;
    const links = [...document.querySelectorAll('[data-section-link]')];
    const targets = links.map(link => document.getElementById(link.dataset.sectionLink));
    if (innerHeight === navigationHeight && targets.length === navigationTargets.length && targets.every((el, i) => el === navigationTargets[i])) return;
    navigationObserver?.disconnect();
    navigationTargets = targets;
    navigationHeight = innerHeight;
    const intersecting = new Set();
    navigationObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) intersecting.add(entry.target);
        else intersecting.delete(entry.target);
      }
      const active = targets.filter(el => intersecting.has(el)).at(-1);
      links.forEach((link, i) => {
        if (active && targets[i] === active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    // Vertical percentages in rootMargin resolve against width. Use pixels
    // so the reading band stays below the header on wide desktop screens.
    }, { rootMargin: `-110px 0px -${Math.max(0, innerHeight - 190)}px 0px`, threshold: 0 });
    targets.filter(Boolean).forEach(element => navigationObserver.observe(element));
  }

  function cancelMotion() {
    if (reduced.matches || document.hidden) {
      animations.forEach(animation => animation.cancel());
      animations.clear();
    }
  }
  reduced.addEventListener('change', cancelMotion);
  document.addEventListener('visibilitychange', cancelMotion);
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(mountNavigation, 120);
  }, { passive: true });
  window.NsuratorMotion = {
    mount() { mountHeader(); mountReveals(); mountNavigation(); }
  };
})();
