/* Motamax page loader. Include as the FIRST element inside <body>.
   Settings come from the super admin (Site settings), cached in localStorage by site.js.
   Preview any combination with ?loader=<style>&logoAnim=<anim>&preview=1 */
(function () {
  'use strict';
  var STYLES = ['orbit', 'pulse', 'curtain', 'progress', 'ripple', 'flip', 'typewriter', 'tiles', 'particles', 'spotlight', 'zoom-nav'];
  var ANIMS = ['spin-in', 'bounce', 'flip-y', 'heartbeat', 'glow', 'swing', 'blur-in', 'float', 'shimmer', 'elastic'];
  var cfg = { style: 'zoom-nav', logoAnim: 'elastic', frequency: 'session', minMs: 1400 };
  try { var cached = JSON.parse(localStorage.getItem('mmx-site') || 'null'); if (cached && cached.loader) for (var k in cached.loader) cfg[k] = cached.loader[k]; } catch (e) { /* storage unavailable */ }
  var q = new URLSearchParams(location.search);
  var preview = q.get('preview') === '1';
  if (STYLES.indexOf(q.get('loader')) >= 0) cfg.style = q.get('loader');
  if (ANIMS.indexOf(q.get('logoAnim')) >= 0) cfg.logoAnim = q.get('logoAnim');

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var seen = false;
  try { seen = sessionStorage.getItem('mmx-loader-seen') === '1'; } catch (e) { /* ignore */ }
  if (!preview && (cfg.frequency === 'off' || reduced || (cfg.frequency === 'session' && seen))) return;
  try { sessionStorage.setItem('mmx-loader-seen', '1'); } catch (e) { /* ignore */ }

  var style = STYLES.indexOf(cfg.style) >= 0 ? cfg.style : 'zoom-nav';
  var anim = ANIMS.indexOf(cfg.logoAnim) >= 0 ? cfg.logoAnim : 'elastic';
  var root = document.documentElement;
  var transparentExit = style === 'curtain' || style === 'tiles' || style === 'zoom-nav';
  root.classList.add('mmx-loading');

  var logo = '<div class="ldr-logo la-' + anim + '"><img src="assets/motamax-logo.png" alt="Motamax India Private Limited"></div>';
  var caption = '<div class="ldr-caption"><b>Motamax India</b> · Solution Architecture · Automation · Infrastructure</div>';
  var extra = '', after = '';
  switch (style) {
    case 'orbit': extra = '<span class="ring r1"></span><span class="ring r2"></span><span class="ring r3"></span>'; break;
    case 'pulse': extra = '<span class="halo h1"></span><span class="halo h2"></span><span class="halo h3"></span><span class="halo h4"></span>'; break;
    case 'ripple': extra = '<span class="wave w1"></span><span class="wave w2"></span><span class="wave w3"></span><span class="wave w4"></span><span class="wave w5"></span>'; break;
    case 'progress': after = '<div class="bar"><span></span></div><div class="pct">0%</div>'; caption = ''; break;
    case 'flip': after = '<div class="reflect"></div>'; break;
    case 'typewriter': after = '<div class="typed"></div><div class="tag">Give us a chance to serve you</div>'; caption = ''; break;
    case 'spotlight': extra = ''; break;
  }
  var pre = '';
  if (style === 'curtain') pre = '<div class="panel l"></div><div class="panel r"></div>';
  if (style === 'tiles') { var t = ''; for (var i = 0; i < 48; i++) t += '<i style="--d:' + ((i % 8) * 0.03 + Math.floor(i / 8) * 0.04).toFixed(2) + 's"></i>'; pre = '<div class="grid">' + t + '</div>'; }
  if (style === 'particles') pre = '<canvas></canvas>';
  if (style === 'spotlight') pre = '<div class="beam"></div>';

  var el = document.createElement('div');
  el.id = 'mmx-loader';
  el.className = 'ls-' + style;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Loading Motamax India');
  el.innerHTML = pre + '<div class="ldr-stage">' + extra + logo + '</div>' + after + caption;
  if (style === 'progress' || style === 'typewriter' || style === 'flip') {
    el.innerHTML = pre + '<div><div class="ldr-stage">' + extra + logo + '</div>' + after + caption + '</div>';
  }
  (document.body || root).insertBefore(el, (document.body || root).firstChild);

  /* style-specific motion */
  var timers = [];
  if (style === 'progress') {
    var pct = 0, bar = el.querySelector('.bar span'), num = el.querySelector('.pct');
    timers.push(setInterval(function () { pct = Math.min(92, pct + Math.max(1, (92 - pct) * 0.08)); bar.style.width = pct + '%'; num.textContent = Math.round(pct) + '%'; }, 80));
  }
  if (style === 'typewriter') {
    var text = 'MOTAMAX INDIA', n = 0, typed = el.querySelector('.typed');
    timers.push(setInterval(function () { if (n <= text.length) typed.textContent = text.slice(0, n++); else el.querySelector('.tag').classList.add('on'); }, 85));
  }
  if (style === 'particles') {
    var cv = el.querySelector('canvas'), ctx = cv.getContext('2d'), W, H, P = [];
    var cols = ['#1A9BD7', '#8E5CF5', '#E3342F', '#FF9F0A', '#22B45A'];
    var size = function () { W = cv.width = innerWidth; H = cv.height = innerHeight; };
    size();
    for (var p = 0; p < 140; p++) P.push({ a: Math.random() * Math.PI * 2, r: Math.max(W, H) * (0.4 + Math.random() * 0.6), s: 0.004 + Math.random() * 0.01, c: cols[p % 5], z: 1 + Math.random() * 2.2 });
    var t0 = performance.now();
    var draw = function (now) {
      if (!el.isConnected) return;
      var k = Math.min(1, (now - t0) / 1600);
      ctx.fillStyle = 'rgba(7,10,28,.28)'; ctx.fillRect(0, 0, W, H);
      for (var i2 = 0; i2 < P.length; i2++) {
        var q2 = P[i2]; q2.a += q2.s; var target = Math.min(W, H) * 0.32; q2.r += (target - q2.r) * 0.035 * (0.4 + k);
        ctx.beginPath(); ctx.arc(W / 2 + Math.cos(q2.a) * q2.r, H / 2 + Math.sin(q2.a) * q2.r * 0.75, q2.z, 0, 6.283); ctx.fillStyle = q2.c; ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  /* finish when the page has loaded (and at least minMs has passed), never later than 6 s */
  var started = Date.now(), finished = false;
  var minMs = Math.max(600, Math.min(6000, +cfg.minMs || 1400)) + (preview ? 1200 : 0);
  function finish() {
    if (finished) return; finished = true;
    timers.forEach(function (x) { clearInterval(x); });
    if (style === 'progress') { el.querySelector('.bar span').style.width = '100%'; el.querySelector('.pct').textContent = '100%'; }
    var exitDelay = style === 'progress' ? 300 : 0;
    setTimeout(function () {
      if (transparentExit) root.classList.remove('mmx-loading');
      if (style === 'zoom-nav') flyToNav();
      el.classList.add('leaving');
      var leaveMs = { curtain: 1050, tiles: 900, spotlight: 900, 'zoom-nav': 1400 }[style] || 0;
      setTimeout(function () {
        root.classList.remove('mmx-loading');
        el.classList.add('done');
        setTimeout(function () { el.remove(); document.dispatchEvent(new Event('mmx-loader-done')); }, 650);
      }, leaveMs);
    }, exitDelay);
  }
  // zoom-nav: the giant logo shrinks into the exact spot of the logo in the menu bar
  function flyToNav() {
    var target = document.querySelector('.nav .brand-logo') || document.querySelector('.login-card .brand-logo');
    var box = el.querySelector('.ldr-logo');
    if (!target || !box) return;
    var a = box.getBoundingClientRect(), b = target.getBoundingClientRect();
    box.classList.remove('la-' + anim); // stop the looping animation so the flight is clean
    var dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    box.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + (b.width / a.width) + ')';
    target.style.transition = 'opacity .3s ease'; target.style.opacity = '0';
    setTimeout(function () { target.style.opacity = '1'; }, 1000);
  }
  var ready = function () { var wait = Math.max(0, minMs - (Date.now() - started)); setTimeout(finish, wait); };
  if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready);
  setTimeout(finish, 6000 + (preview ? 1500 : 0));
  el.addEventListener('click', function () { if (Date.now() - started > 500) finish(); });
})();
