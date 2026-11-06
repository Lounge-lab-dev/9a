/* Qanounak – frontend prototype. No backend, no real AI: analysis + result are MOCK. */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) gsap.globalTimeline.timeScale(50);

  let stream = null;
  let W = null;                                   // working canvas (current image)
  let box = { x: .06, y: .06, w: .88, h: .88 };   // crop box (fractions of displayed image)
  let cur = 'home', busy = false, running = false;

  /* ---------- masked word reveal: each word slides up from behind its own mask ---------- */
  function split(el) {
    if (el._words) return el._words;
    const words = [], frag = document.createDocumentFragment();
    const wrap = node => {
      const w = document.createElement('span'), i = document.createElement('span');
      w.className = 'w'; i.appendChild(node); w.appendChild(i); words.push(i); return w;
    };
    [...el.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        n.textContent.split(/(\s+)/).forEach(t => {
          if (!t) return;
          frag.appendChild(/^\s+$/.test(t) ? document.createTextNode(' ') : wrap(document.createTextNode(t)));
        });
      } else if (n.nodeType === 1 && n.hasAttribute('data-keep')) frag.appendChild(wrap(n)); // LTR chunk stays one unit
      else frag.appendChild(n);
    });
    el.textContent = ''; el.appendChild(frag);
    return (el._words = words);
  }
  function revealWords(el, vars = {}) {
    const w = split(el);
    gsap.set(w, { yPercent: 118 });
    gsap.set(el, { autoAlpha: 1 });
    return gsap.to(w, { yPercent: 0, duration: .85, ease: 'power4.out', stagger: .075, ...vars });
  }

  /* ---------- page transitions (GSAP: transform/opacity only, no layout animation) ---------- */
  function enter(name) {
    const v = $('#' + name);
    if (name === 'crop') {
      gsap.fromTo('.crop-area', { autoAlpha: 0, scale: .94 }, { autoAlpha: 1, scale: 1, duration: .55, ease: 'power3.out', clearProps: 'transform' });
      gsap.fromTo('.sheet', { yPercent: 100 }, { yPercent: 0, duration: .6, ease: 'power3.out', clearProps: 'transform' });
      return;
    }
    gsap.set(v, { clearProps: 'opacity,transform' });
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    v.querySelectorAll('[data-split]').forEach((el, i) => tl.add(revealWords(el), i ? .55 : .05));
    if (name === 'home') {
      tl.fromTo('#stage', { autoAlpha: 0, y: 34 }, { autoAlpha: 1, y: 0, duration: .8, clearProps: 'transform' }, .12)
        .fromTo('#pick', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: .7, clearProps: 'transform' }, .28)
        // the camera tab rises from underneath the grey box (the box covers it until it slides out)
        .fromTo('#tab', { autoAlpha: 1, yPercent: 102 }, { yPercent: 0, duration: .95, ease: 'power4.out', clearProps: 'transform' }, .65);
    } else {
      tl.fromTo(v.querySelectorAll('[data-a]'), { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: .65, stagger: .09, clearProps: 'transform' }, .1);
      if (name === 'analysis') tl.from('.extract', { y: 16, duration: .4, clearProps: 'transform' }, .3);
    }
  }
  function go(name, done) {
    if (name === cur || busy) return;
    busy = true;
    const out = $('#' + cur);
    gsap.to(out, {
      autoAlpha: 0, y: cur === 'crop' ? 30 : -12, duration: .28, ease: 'power2.inOut', onComplete() {
        out.hidden = true; gsap.set(out, { clearProps: 'opacity,visibility,transform' });
        cur = name;
        $('#' + name).hidden = false;
        $('#nav').hidden = name === 'crop';
        document.body.style.overflow = ['home', 'crop', 'analysis'].includes(name) ? 'hidden' : '';
        window.scrollTo(0, 0);
        enter(name);
        busy = false;
        done?.();
      }
    });
  }

  /* ---------- nav menu overlay (tap outside or ✕ to exit) ---------- */
  const overlay = $('#overlay'), drawer = $('#drawer'), scrim = $('#scrim');
  let menuTl = null, linkBusy = false;
  function openMenu() {
    if (!overlay.hidden) return;
    menuTl?.kill();
    $$('.links a').forEach(a => a.classList.toggle('on', a.dataset.link === (cur === 'about' ? 'about' : 'home')));
    gsap.set(scrim, { opacity: 0 });
    gsap.set(drawer, { yPercent: -101 });
    gsap.set('.lm > span', { yPercent: 118 });
    overlay.hidden = false;
    $('#menuBtn').setAttribute('aria-expanded', true);
    menuTl = gsap.timeline()
      .to(scrim, { opacity: 1, duration: .45, ease: 'power1.out' }, 0)                 // only the dim layer fades; the menu never does
      .to(drawer, { yPercent: 0, duration: .75, ease: 'power4.out' }, 0)              // the menu itself rolls down, no fade
      .to('.lm > span', { yPercent: 0, duration: .75, ease: 'power4.out', stagger: .09 }, .3); // links rise out of masks
  }
  function closeMenu(after) {
    if (overlay.hidden) return after?.();
    menuTl?.kill();
    $('#menuBtn').setAttribute('aria-expanded', false);
    menuTl = gsap.timeline({
      onComplete() { overlay.hidden = true; gsap.set([scrim, drawer, '.lm > span'], { clearProps: 'all' }); after?.(); }
    })
      .to(drawer, { yPercent: -101, duration: .6, ease: 'power3.inOut' }, 0)          // rolls up, no fade
      .to(scrim, { opacity: 0, duration: .5, ease: 'power1.in' }, .1);
  }
  $('#menuBtn').onclick = openMenu;
  $('#closeMenu').onclick = () => closeMenu();
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target === scrim) closeMenu(); });
  document.addEventListener('keydown', e => e.key === 'Escape' && closeMenu());

  /* theme switch (light / dark) */
  const root = document.documentElement, sw = $('#themeSwitch');
  const syncSwitch = () => sw.setAttribute('aria-checked', root.dataset.theme === 'dark');
  syncSwitch();
  sw.onclick = () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('qn-theme', root.dataset.theme); } catch (e) {}
    syncSwitch();
  };

  /* data-go links: menu items, brand, buttons.
     Menu links first play the indicator expand/contract, then the menu rolls up, then the page changes. */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-go]');
    if (!t) return;
    e.preventDefault();
    const target = t.dataset.go;
    const run = () => target === 'new' ? resetAll() : go(target);
    if (t.closest('.links')) {
      if (linkBusy) return;
      linkBusy = true;
      const prev = $$('.links a').find(a => a.classList.contains('on'));
      if (prev === t) {                                   // same page: pulse the indicator
        gsap.fromTo(t.querySelector('i'), { width: 52 }, { width: 96, duration: .3, ease: 'power2.out', yoyo: true, repeat: 1, clearProps: 'width' });
      } else { prev?.classList.remove('on'); t.classList.add('on'); }   // CSS: old one contracts, new one expands
      gsap.delayedCall(.85, () => { linkBusy = false; closeMenu(run); });
    } else closeMenu(run);
  });
  function resetAll() { W = null; $('#file').value = ''; showPanel('idle'); go('home'); }

  /* ---------- home stage: camera ---------- */
  function showPanel(name) {
    ['idle', 'cam'].forEach(p => $('#p-' + p).hidden = p !== name);
    if (name !== 'cam') stopCam();
    if (name !== 'idle') setMsg('');
  }
  let msgTimer;
  function setMsg(t) {                                   // small red toast pill at the bottom of the grey box
    const m = $('#msg');
    clearTimeout(msgTimer); gsap.killTweensOf(m);
    if (!t) { m.hidden = true; return; }
    m.querySelector('span').textContent = t; m.hidden = false;
    gsap.fromTo(m, { scale: .7, y: 16, autoAlpha: 0 }, { scale: 1, y: 0, autoAlpha: 1, duration: .5, ease: 'back.out(1.7)' });
    msgTimer = setTimeout(() => gsap.to(m, { scale: .85, y: 10, autoAlpha: 0, duration: .3, ease: 'power2.in', onComplete() { m.hidden = true; } }), 4500);
  }
  async function openCam() {
    if (!navigator.mediaDevices?.getUserMedia) return setMsg('متصفحك لا يدعم الكاميرا');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      $('#video').srcObject = stream;
      showPanel('cam');
    } catch (e) {
      const msgs = {
        NotAllowedError: 'تم رفض إذن الكاميرا',
        NotFoundError: 'لا توجد كاميرا في جهازك',
        NotReadableError: 'الكاميرا مستخدمة في تطبيق آخر'
      };
      showPanel('idle');
      setMsg(msgs[e.name] || 'تعذّر تشغيل الكاميرا');
    }
  }
  function stopCam() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    $('#video').srcObject = null;
  }
  $('#openCam').onclick = openCam;
  $('#closeCam').onclick = () => showPanel('idle');
  $('#toUpload').onclick = () => { showPanel('idle'); $('#file').click(); };
  $('#capture').onclick = () => {
    const v = $('#video');
    if (!v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    setWork(c);
  };

  /* ---------- upload (button, input, drag & drop) ---------- */
  const OK = ['image/jpeg', 'image/png', 'image/webp'];
  function handleFile(f) {
    if (!f) return;
    if (!OK.includes(f.type)) { showPanel('idle'); return setMsg('الصيغة غير مدعومة، استخدم JPG أو PNG أو WEBP'); }
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      setWork(c);
    };
    img.onerror = () => { showPanel('idle'); setMsg('تعذّر قراءة الصورة'); };
    img.src = url;
  }
  $('#pick').onclick = $('#replace').onclick = () => $('#file').click();
  $('#file').onchange = e => { handleFile(e.target.files[0]); e.target.value = ''; };
  $('#retake').onclick = () => go('home', () => { showPanel('idle'); openCam(); });
  const stage = $('#stage');
  ['dragenter', 'dragover'].forEach(ev => stage.addEventListener(ev, e => { e.preventDefault(); stage.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(ev => stage.addEventListener(ev, e => { e.preventDefault(); stage.classList.remove('dragging'); }));
  stage.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());

  /* ---------- crop screen ---------- */
  function setWork(c) {
    W = c; stopCam(); draw();
    if (cur !== 'crop') go('crop', () => showPanel('idle')); else enter('crop');
  }
  function draw() {
    const v = $('#view');
    v.width = W.width; v.height = W.height;
    v.getContext('2d').drawImage(W, 0, 0);
    box = { x: .06, y: .06, w: .88, h: .88 };
    paintBox();
  }
  function paintBox() {
    const s = $('#cbox').style;
    s.left = box.x * 100 + '%'; s.top = box.y * 100 + '%';
    s.width = box.w * 100 + '%'; s.height = box.h * 100 + '%';
  }
  $('#rotate').onclick = () => {
    const c = document.createElement('canvas');
    c.width = W.height; c.height = W.width;
    const x = c.getContext('2d');
    x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(W, 0, 0);
    W = c; draw();
  };
  function cropNow() {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W.width * box.w));
    c.height = Math.max(1, Math.round(W.height * box.h));
    c.getContext('2d').drawImage(W, W.width * box.x, W.height * box.y, W.width * box.w, W.height * box.h, 0, 0, c.width, c.height);
    W = c; draw();
  }
  $('#applyCrop').onclick = cropNow;
  (() => { // drag the box to move it, drag a corner to resize
    const el = $('#cbox'), frame = $('#frame'), MIN = .12;
    let mode = null, start = null, b0 = null;
    el.addEventListener('pointerdown', e => {
      mode = e.target.dataset.h || 'move';
      start = { x: e.clientX, y: e.clientY }; b0 = { ...box };
      el.setPointerCapture(e.pointerId); e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      if (!mode) return;
      const r = frame.getBoundingClientRect();
      const dx = (e.clientX - start.x) / r.width, dy = (e.clientY - start.y) / r.height;
      let { x, y, w, h } = b0;
      if (mode === 'move') { x = Math.min(1 - w, Math.max(0, x + dx)); y = Math.min(1 - h, Math.max(0, y + dy)); }
      else {
        if (mode.includes('l')) { const nx = Math.min(x + w - MIN, Math.max(0, x + dx)); w += x - nx; x = nx; }
        if (mode.includes('r')) w = Math.min(1 - x, Math.max(MIN, w + dx));
        if (mode.includes('t')) { const ny = Math.min(y + h - MIN, Math.max(0, y + dy)); h += y - ny; y = ny; }
        if (mode.includes('b')) h = Math.min(1 - y, Math.max(MIN, h + dy));
      }
      box = { x, y, w, h }; paintBox();
    });
    ['pointerup', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => mode = null));
  })();

  /* ---------- MOCK analysis (no real AI; the extracted question is a fixed sample) ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const setProgress = n => { $('#fill').style.width = n + '%'; $('.track').setAttribute('aria-valuenow', n); };
  $('#analyze').onclick = async () => {
    if (!W || running) return;
    running = true;
    cropNow();                                    // the crop box you see is what gets analysed
    const url = W.toDataURL('image/jpeg', .85);
    $('#thumb').src = url; $('#resThumb').src = url;
    const steps = $$('#steps li'), ex = $('#extract');
    steps.forEach(s => s.className = ''); ex.classList.remove('show'); setProgress(0);
    go('analysis');
    await sleep(1000);
    steps[0].className = 'on'; setProgress(20);
    await sleep(1300);
    steps[0].className = 'done'; setProgress(50);
    ex.classList.add('show');                     // simulated "question extraction"
    await sleep(900);
    steps[1].className = 'on'; setProgress(75);
    await sleep(1500);                            // simulated "law matching"
    steps[1].className = 'done'; setProgress(100);
    await sleep(900);
    go('result');
    running = false;
  };

  /* ---------- first load: wait for the fonts first so the layout never shifts mid-animation ---------- */
  document.body.style.overflow = 'hidden';
  const fonts = Promise.all(['500', '600', '700'].map(w => document.fonts.load(w + ' 1rem Plex')));
  Promise.race([fonts, sleep(1500)]).then(() => {
    gsap.fromTo('#nav', { y: -34, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .75, ease: 'power3.out', clearProps: 'transform' });
    enter('home');
  });
})();
