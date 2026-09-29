/* Native scrolling, with short, one-time compositor animations. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new WeakSet();
  const animations = new Set();
  const pending = new Map();
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
      const animation = pending.get(element);
      if (!animation) continue;
      pending.delete(element);
      // Play the already-applied starting frame; never reset visible content
      // inside this asynchronous observer callback.
      if (reduced.matches || document.hidden) animation.cancel();
      else {
        try { animation.play(); } catch { animation.cancel(); }
      }
    }
  }

  function mountReveals() {
    document.querySelectorAll('[data-reveal]').forEach(element => {
      if (seen.has(element)) return;
      seen.add(element);
      // Static content is the fallback, including a page mounted in a hidden tab.
      if (reduced.matches || document.hidden || !element.animate || !('IntersectionObserver' in window)) return;
      const compact = matchMedia('(max-width: 820px)').matches;
      const kind = element.dataset.reveal;
      const isFeature = kind === 'feature';
      const isScreen = kind === 'screen';
      const distance = isFeature ? (compact ? 40 : 88)
        : isScreen ? (compact ? 28 : 64)
        : kind === 'diagnostic' ? (compact ? 24 : 48)
        : kind === 'hero-title' ? 32 : 24;
      const scale = isScreen ? (compact ? 0.985 : 0.965) : 1;
      const delay = Math.max(0, Math.min(180, Number(element.dataset.revealDelay) || 0));
      let animation;
      try {
        revealObserver ||= new IntersectionObserver(reveal, { threshold: 0, rootMargin: '0px' });
        animation = element.animate(
          [{ opacity: 0, transform: `translate3d(0, ${distance}px, 0) scale(${scale})` },
           { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }],
          {
            duration: isScreen ? 1050 : isFeature ? 900 : kind === 'hero-title' ? 800 : 620,
            delay,
            // Let the entire card gather pace and settle, rather than spending
            // almost all of a fast ease-out entrance in its final position.
            easing: isFeature ? 'cubic-bezier(.455, .03, .515, .955)' : 'cubic-bezier(.22, 1, .36, 1)',
            fill: 'backwards'
          }
        );
        // Called synchronously from React's commit lifecycle, before paint.
        // Backwards fill also holds the first frame during a stagger delay.
        animation.pause();
        animation.currentTime = 0;
        animations.add(animation);
        pending.set(element, animation);
        const release = () => {
          animations.delete(animation);
          pending.delete(element);
        };
        animation.onfinish = release;
        animation.oncancel = release;
        revealObserver.observe(element);
      } catch {
        // A partial setup must never leave content transparent or paused.
        pending.delete(element);
        animations.delete(animation);
        animation?.cancel();
      }
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
      pending.clear();
      revealObserver?.disconnect();
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
