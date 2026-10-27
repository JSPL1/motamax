/* Motamax — site-wide settings: brand badges, social links, visitor counter, loader settings cache */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var LOGO = 'assets/motamax-logo.png';
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var isLogin = page === 'login.html';
  var fmt = function (n) { return Number(n || 0).toLocaleString('en-IN'); };

  function cache(site) { try { localStorage.setItem('mmx-site', JSON.stringify({ loader: site.loader, badges: site.badges, social: site.social, showVisitors: site.showVisitors })); } catch (e) { /* storage unavailable */ } }
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
    var footerCount = 0;
    (badges || []).forEach(function (b) {
      if (!b.enabled || b.position === 'hidden') return;
      var pos = b.position;
      if (pos === 'hero' || pos === 'banner' || pos === 'cta') return; // retired spots, also in older cached settings
      var host = null;
      if (pos === 'contact') host = $('.enq-side');
      if (pos === 'footer' || !host && pos === 'contact') { pos = 'footer'; host = $('.footer-inner > div'); }
      if (pos === 'float-left' || pos === 'float-right') host = document.body;
      if (!host) return;
      var el = badgeEl(b);
      el.className = el.className.replace(/pos-[\w-]+/, 'pos-' + pos);
      if (pos === 'footer' && footerCount++) el.classList.add('second');
      host.appendChild(el);
    });
  }

  /* ---------- social media links ---------- */
  var attr = function (s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); };
  function socialLinks(list) {
    var SO = window.MMX_SOCIAL;
    return list.map(function (l) {
      var url = SO.safe(l.url);
      if (!url) return '';
      var n = SO.networks[l.network] || SO.networks.website;
      var ext = /^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : '';
      return '<a href="' + attr(url) + '"' + ext + ' aria-label="' + attr(l.label || n.name) + '" title="' + attr(l.label || n.name) + '" style="--sc:' + n.color + '">' + SO.icon(l.network) + '</a>';
    }).join('');
  }
  function placeSocial(social) {
    if (!social || !window.MMX_SOCIAL) return;
    var on = (social.links || []).filter(function (l) { return l.enabled; });
    document.querySelectorAll('.footer-inner .socials').forEach(function (box) {
      var footer = on.filter(function (l) { return l.footer; });
      box.innerHTML = socialLinks(footer);
      box.hidden = !footer.length;
    });
    var side = $('.enq-side');
    if (side) {
      var follow = $('.mmx-follow', side), cl = on.filter(function (l) { return l.contact; });
      if (!cl.length) { if (follow) follow.remove(); }
      else {
        if (!follow) { follow = document.createElement('div'); follow.className = 'ci glass mmx-follow'; side.appendChild(follow); }
        follow.innerHTML = '<div><small>Follow us</small><div class="socials">' + socialLinks(cl) + '</div></div>';
      }
    }
    // floating WhatsApp button + the contact page WhatsApp card use the chat number
    var chat = social.chat || {}, num = String(chat.number || '').replace(/\D/g, '');
    var wa = num ? 'https://wa.me/' + num + (chat.message ? '?text=' + encodeURIComponent(chat.message) : '') : null;
    var fab = $('.fab-wa');
    if (fab) { fab.hidden = !(chat.enabled && wa); if (wa) fab.href = wa; }
    document.querySelectorAll('.enq-side a[href^="https://wa.me/"]').forEach(function (a) {
      var card = a.closest('.ci');
      if (wa) a.href = wa;
      if (card) card.hidden = !wa;
    });
  }
  // the floating buttons are added by enquiry.js; re-apply once they exist
  var lastSocial = null;
  function applySocial(s) { lastSocial = s; placeSocial(s); }
  document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { placeSocial(lastSocial); }, 0); });

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
  if (c) { placeBadges(c.badges); applySocial(c.social); }

  fetch('/api/site', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (site) {
    if (!site) return;
    cache(site);
    placeBadges(site.badges);
    applySocial(site.social);
    // count this page view (unique visitors are tracked with a first-party cookie); always on, the counter is only shown when enabled
    var counted = fetch('/api/visit', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      // page + referrer + touch support (lets the server tell an iPad from a Mac)
      body: JSON.stringify({ page: location.pathname, ref: document.referrer, touch: navigator.maxTouchPoints || 0 }) })
      .then(function (r) { return r.ok ? r.json() : site.visitors; }, function () { return site.visitors; });
    if (!site.showVisitors) { var s = $('.mmx-visitors'); if (s) s.remove(); return; }
    return counted.then(showVisitors);
  }).catch(function () { /* static hosting without the API: nothing to show */ });
})();
