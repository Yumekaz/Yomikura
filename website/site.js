(() => {
  'use strict';
  const script = document.currentScript;
  const base = new URL('../', script ? script.src : location.href);
  const root = document.documentElement;
  const query = (selector) => document.querySelector(selector);
  const all = (selector) => [...document.querySelectorAll(selector)];
  const announcement = query('[data-announcement]');
  const announce = (text) => { if (announcement) announcement.textContent = text; };
  let palette = 'ember';
  let lastImageTrigger = null;
  const preferences = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} },
  };
  function setTheme(theme) {
    root.dataset.theme = theme === 'light' ? 'light' : 'dark';
    preferences.set('yomikura-site-theme', root.dataset.theme);
    all('[data-theme-toggle]').forEach((button) => button.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} appearance`));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#fbf7ee' : '#110f0d');
  }
  setTheme(preferences.get('yomikura-site-theme') || 'dark');
  all('[data-theme-toggle]').forEach((button) => button.addEventListener('click', () => { setTheme(root.dataset.theme === 'light' ? 'dark' : 'light'); selectPalette(palette, false); }));
  window.addEventListener('keydown', () => root.classList.add('keyboard'), { capture: true });
  window.addEventListener('pointerdown', () => root.classList.remove('keyboard'), { capture: true });

  const menu = query('[data-menu-toggle]');
  const mobileNavigation = query('#mobile-nav');
  function closeMenu() {
    if (!menu || !mobileNavigation) return;
    mobileNavigation.hidden = true; menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open navigation');
  }
  menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', `${open ? 'Close' : 'Open'} navigation`); mobileNavigation.hidden = !open;
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); } });

  // Keep real hash URLs and instant keyboard navigation; soften pointer scrolling only.
  all('a[href^="#"]').forEach((link) => link.addEventListener('click', (event) => {
    const target = query(link.getAttribute('href'));
    if (!target) return;
    closeMenu();
    if (event.detail > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches && !link.classList.contains('skip')) {
      event.preventDefault(); history.pushState(null, '', link.getAttribute('href')); target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }));

  const paletteDetails = {
    ember: { name: 'Ink & Ember', text: 'Warm ink, ivory pages and a spark of lantern light. A familiar place to come back to.' },
    sakura: { name: 'Sakura', text: 'Blossom, soft paper and a quiet touch of rose. Make a little room for a gentler day.' },
    forest: { name: 'Forest', text: 'Moss, sage and sunlit pages. A breath of forest calm, wherever your next chapter takes you.' },
    moonstone: { name: 'Moonstone', text: 'Evening ink and silver lavender. A little company for the chapters after midnight.' },
  };
  function selectPalette(value, shouldAnnounce = true) {
    if (!Object.hasOwn(paletteDetails, value)) return;
    palette = value;
    const details = paletteDetails[value];
    all('[data-palette]').forEach((button) => { const selected = button.dataset.palette === value; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
    const appearance = root.dataset.theme === 'light' ? '-light' : '';
    all('[data-library-preview],[data-palette-preview]').forEach((image) => { image.src = new URL(`assets/screens/library-${value}${appearance}.jpg`, base).href; image.alt = `The actual Yomikura library in the ${details.name} ${root.dataset.theme} color palette, with original illustrated demo stories.`; });
    const panel = query('#palette-story');
    panel?.setAttribute('aria-labelledby', `palette-${value}`);
    if (query('[data-palette-kicker]')) query('[data-palette-kicker]').textContent = details.name;
    if (query('[data-palette-copy]')) query('[data-palette-copy]').textContent = details.text;
    if (shouldAnnounce) announce(`${details.name} preview selected.`);
  }
  const paletteButtons = all('[data-palette]');
  paletteButtons.forEach((button, index) => {
    button.addEventListener('click', () => selectPalette(button.dataset.palette));
    button.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % paletteButtons.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + paletteButtons.length) % paletteButtons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = paletteButtons.length - 1;
      if (next !== undefined) { event.preventDefault(); const target = paletteButtons[next]; selectPalette(target.dataset.palette); target.focus(); }
    });
  });
  selectPalette(palette, false);

  const dialog = query('[data-screenshot-dialog]');
  const dialogImage = query('[data-dialog-image]');
  all('[data-enlarge]').forEach((button) => button.addEventListener('click', () => {
    if (!dialog?.showModal || !dialogImage) return;
    const isReader = button.dataset.enlarge === 'reader';
    const source = isReader ? query('.reader-screen img') : query('[data-library-preview]');
    if (!source) return;
    dialogImage.src = source.src; dialogImage.alt = source.alt; lastImageTrigger = button; dialog.showModal();
  }));
  query('[data-close-dialog]')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog?.addEventListener('close', () => lastImageTrigger?.focus());

  all('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(button.dataset.copy); const label = button.textContent; button.textContent = 'Copied'; announce('Folder location copied.'); setTimeout(() => { button.textContent = label; }, 1600); }
    catch { announce('Copy was unavailable. Select the displayed folder location to copy it.'); }
  }));

  const libraryForm = query('[data-library-form]');
  libraryForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = libraryForm.querySelector('input');
    const error = libraryForm.querySelector('[data-address-error]');
    let target;
    try { target = new URL(input.value.trim()); if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || /[\u0000-\u001f\u007f]/.test(input.value)) throw new Error(); }
    catch { error.textContent = 'Enter an HTTP or HTTPS library address without a username or password.'; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    input.removeAttribute('aria-invalid'); error.textContent = '';
    window.open(target.href, '_blank', 'noopener,noreferrer');
  });

  async function releases() {
    try {
      const response = await fetch(new URL('releases.json', base));
      if (!response.ok) return;
      const data = await response.json();
      const release = data.primary || data.beta || data.stable;
      if (!release) return;
      all('[data-release-version]').forEach((element) => { element.textContent = release.tag; });
      all('[data-release-kind]').forEach((element) => { element.textContent = release.prerelease ? 'Public beta' : 'Stable release'; });
      all('[data-release-link]').forEach((link) => { link.href = release.url; });
      all('[data-platform]').forEach((link) => { const asset = release.assets?.[link.dataset.platform]; if (asset) link.href = asset.url; });
      const userAgent = navigator.userAgent;
      const mobile = /Android|iPhone|iPad|Mobile/i.test(userAgent);
      const windows = !mobile && /Windows/i.test(userAgent);
      const linux = !mobile && /Linux|X11/i.test(userAgent) && !/aarch64|armv/i.test(userAgent);
      const platform = windows ? 'windows' : linux ? 'linux' : null;
      const asset = platform && release.assets?.[platform];
      all('[data-download-primary]').forEach((link) => {
        link.href = asset?.url || new URL('#get-started', base).href;
        const label = link.querySelector('[data-download-label]');
        if (label) label.textContent = asset ? windows ? 'Download for Windows' : 'Download for Linux x86_64' : 'Choose your desktop download';
      });
      all('[data-stable-link]').forEach((link) => { if (data.stable) { link.href = data.stable.url; link.textContent = `${release.prerelease ? 'Previous stable release' : 'Current stable release'} · ${data.stable.tag}`; } });
      all('[data-web-download]').forEach((link) => { if (data.web?.url) link.href = data.web.url; });
      all('[data-web-checksum]').forEach((link) => { if (data.web?.checksumUrl) link.href = data.web.checksumUrl; });
      all('[data-web-version]').forEach((element) => { element.textContent = data.web?.version ? `v${data.web.version.replace(/^v/, '')}` : release.tag; });
    } catch { /* Real release-page links remain usable if metadata cannot load. */ }
  }
  void releases();

  // No JavaScript is required to see the page; animation is a progressive enhancement.
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('js');
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), { threshold: .06, rootMargin: '0px 0px 60px 0px' });
    all('[data-reveal]').forEach((element) => observer.observe(element));
  }
})();
