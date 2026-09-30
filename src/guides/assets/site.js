(() => {
  const search = document.querySelector('#guide-search');
  const filters = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('.guide-card')];
  let category = '全部';
  function updateResults() {
    const query = (search?.value || '').trim().toLocaleLowerCase();
    let count = 0;
    for (const card of cards) {
      const visible = (category === '全部' || card.dataset.category === category) && (!query || card.dataset.search.toLocaleLowerCase().includes(query));
      card.hidden = !visible;
      if (visible) count++;
    }
    const status = document.querySelector('.result-count');
    if (status) status.textContent = `${count} 篇攻略`;
    const empty = document.querySelector('.empty-results');
    if (empty) empty.hidden = count > 0;
  }
  filters.forEach(button => button.addEventListener('click', () => {
    category = button.dataset.filter;
    filters.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    updateResults();
  }));
  search?.addEventListener('input', updateResults);
  document.querySelector('.search-form')?.addEventListener('submit', event => event.preventDefault());
  document.querySelector('#reset-search')?.addEventListener('click', () => {
    search.value = '';
    category = '全部';
    filters.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === category)));
    updateResults();
    search.focus();
  });
  const progress = document.querySelector('.reading-progress');
  const sections = [...document.querySelectorAll('.article-section')];
  const tocLinks = [...document.querySelectorAll('.toc nav a')];
  let frame = 0;
  function updateReading() {
    frame = 0;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (progress) progress.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    let current = sections[0]?.id;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= 170) current = section.id;
    }
    for (const link of tocLinks) {
      if (link.hash === `#${current}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }
  if (progress) {
    addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(updateReading); }, {passive: true});
    addEventListener('resize', updateReading);
    updateReading();
  }
  const toc = document.querySelector('.toc details');
  if (toc && matchMedia('(max-width: 800px)').matches) toc.open = false;
  let toastTimer;
  function toast(message) {
    const box = document.querySelector('.toast');
    box.textContent = message;
    box.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('visible'), 2600);
  }
  document.querySelector('.copy-link')?.addEventListener('click', async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(location.href);
      else {
        const area = document.createElement('textarea');
        area.value = location.href;
        area.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.append(area); area.select();
        const copied = document.execCommand('copy'); area.remove();
        if (!copied) throw new Error('copy unavailable');
      }
      toast('文章链接已复制');
    } catch { toast('请复制浏览器地址栏中的链接'); }
  });
})();
