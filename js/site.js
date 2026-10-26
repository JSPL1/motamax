/* Motamax — site-wide settings: brand badges, visitor counter, loader settings cache */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var LOGO = 'assets/motamax-logo.png';
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var isLogin = page === 'login.html';
  var fmt = function (n) { return Number(n || 0).toLocaleString('en-IN'); };

  function cache(site) { try { localStorage.setItem('mmx-site', JSON.stringify({ loader: site.loader, badges: site.badges, showVisitors: site.showVisitors })); } catch (e) { /* storage unavailable */ } }
  function cached() { try { return JSON.parse(localStorage.getItem('mmx-site') || 'null'); } catch (e) { return null; } }

  /* ---------- brand badges ---------- */
  function badgeEl(b) {
    var src = b.source === 'logo' ? LOGO : 'assets/badges/' + b.id + '.webp';
    var d = document.createElement('button');
    d.type = 'button';
    d.className = 'mmx-badge pos-' + b.position + (b.source === 'logo' ? ' is-logo' : '');
    d.setAttribute('aria-label', 'View Motamax badge');
    d.innerHTML = '<img src="' + src + '" alt="Motamax India" loading="lazy" decoding="async">';
    d.addEventListener('click', function () { zoom(src); });
    return d;
  }
  function zoom(src) {
    var m = document.createElement('div');
    m.className = 'mmx-badge-view';
    m.innerHTML = '<img src="' + src + '" alt="Motamax India"><button type="button" aria-label="Close">×</button>';
    m.addEventListener('click', function () { m.classList.remove('open'); setTimeout(function () { m.remove(); }, 300); });
    document.body.appendChild(m);
    requestAnimationFrame(function () { m.classList.add('open'); });
  }
  function placeBadges(badges) {
    document.querySelectorAll('.mmx-badge').forEach(function (n) { n.remove(); });
    if (isLogin) return;
    (badges || []).forEach(function (b) {
      if (!b.enabled || b.position === 'hidden') return;
      var host = null, pos = b.position;
      if (pos === 'banner') host = $('.page-hero-inner') || $('.hero .hero-grid > div');
      if (pos === 'hero') host = $('.hero .hero-grid > div') || $('.page-hero-inner');
      if (pos === 'footer') host = $('.footer-inner > div');
      if (pos === 'contact') host = $('.enq-side') || $('.footer-inner > div');
      if (pos === 'float-left' || pos === 'float-right') host = document.body;
      if (!host) return;
      var el = badgeEl(b);
      if (pos === 'banner' && !$('.page-hero-inner')) el.className = el.className.replace('pos-banner', 'pos-hero');
      host.appendChild(el);
    });
  }

  /* ---------- visitor counter ---------- */
  function showVisitors(v) {
    if (!v) return;
    var html = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
      '<b>' + fmt(v.total) + '</b> visitors · <b>' + fmt(v.today) + '</b> today';
    var spot = $('.mmx-visitors');
    if (!spot) {
      spot = document.createElement('span');
      spot.className = 'mmx-visitors';
      var host = $('.footer-bottom') || $('.login-foot');
      if (!host) return;
      if (isLogin) { host.appendChild(document.createElement('br')); }
      host.appendChild(spot);
    }
    spot.innerHTML = html;
  }

  var c = cached();
  if (c) placeBadges(c.badges);

  fetch('/api/site', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (site) {
    if (!site) return;
    cache(site);
    placeBadges(site.badges);
    if (!site.showVisitors) { var s = $('.mmx-visitors'); if (s) s.remove(); return; }
    // count this page view (unique visitors are tracked with a first-party cookie)
    return fetch('/api/visit', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.ok ? r.json() : site.visitors; }).then(showVisitors, function () { showVisitors(site.visitors); });
  }).catch(function () { /* static hosting without the API: nothing to show */ });
})();
