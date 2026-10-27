/* Motamax enquiry portal (vanilla JS, hash routing) */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id) => `<svg><use href="#${id}"/></svg>`;

  const STATUS = {
    new: { label: 'New', color: '#1A9BD7' }, contacted: { label: 'Contacted', color: '#8E5CF5' },
    follow_up: { label: 'Follow-up', color: '#FF9F0A' }, site_visit: { label: 'Site visit', color: '#14B8A6' },
    quoted: { label: 'Quotation sent', color: '#4F46E5' }, won: { label: 'Won', color: '#22B45A' }, lost: { label: 'Lost', color: '#E3342F' },
  };
  const TYPE_LABEL = { quote: 'Quotation', survey: 'Site survey', callback: 'Call-back', support: 'AMC / support', brochure: 'Brochure', partner: 'Vendor / partner', general: 'General' };
  const ACTION_LABEL = { created: 'Enquiry received', claimed: 'Taken into bucket', released: 'Returned to pool', assigned: 'Assigned', status: 'Status changed', updated: 'Note added', email_sent: 'Email sent', email_failed: 'Email failed' };

  let ME = null; let MAIL = { configured: false }; const charts = [];

  /* ---------------- api ---------------- */
  async function api(path, opts = {}) {
    const r = await fetch('/api' + path, {
      method: opts.method || 'GET', credentials: 'same-origin',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (r.status === 401) { location.href = '/login.html?next=' + encodeURIComponent('/portal/' + location.hash); throw new Error('Signed out'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
    return j;
  }

  /* ---------------- ui helpers ---------------- */
  const toastEl = $('#toast'); let toastT;
  function toast(msg, kind = 'ok') { toastEl.textContent = msg; toastEl.className = 'p-toast show ' + kind; clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 3800); }
  const badge = (s) => `<span class="p-badge" style="--bc:${STATUS[s]?.color || '#888'}">${esc(STATUS[s]?.label || s)}</span>`;
  const fmtDate = (iso, withTime = true) => iso ? new Date(iso).toLocaleString('en-IN', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }) : '—';
  const ago = (iso) => { if (!iso) return '—'; const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; const d = Math.round(h / 24); return d < 30 ? d + ' d ago' : fmtDate(iso, false); };
  const isAdmin = () => ME?.role === 'admin';
  const isSuper = () => Boolean(ME?.superAdmin);
  const roleLabel = (u) => (u.superAdmin ? 'Super admin' : u.role === 'admin' ? 'Admin' : 'Tele-caller');
  // mirrors the server rule: super admin manages anyone; admins manage tele-callers; the super admin account only itself
  const canManage = (u) => (u.superAdmin ? u.id === ME.id : isSuper() || u.role === 'telecaller' || u.id === ME.id);
  const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const due = (e) => e.followUpAt && !['won', 'lost'].includes(e.status) && new Date(e.followUpAt) <= new Date();
  const waLink = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return d ? 'https://wa.me/' + (d.length === 10 ? '91' + d : d) : null; };

  const modal = $('#modal'); const modalBody = $('#modalBody');
  function openModal(html) { modalBody.innerHTML = html; modal.classList.add('open'); setTimeout(() => $('input, select, textarea', modalBody)?.focus(), 50); }
  function closeModal() { modal.classList.remove('open'); }
  $('.p-close', modal).addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  function destroyCharts() { while (charts.length) charts.pop().destroy(); }
  function chartDefaults() {
    if (!window.Chart) return;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
    Chart.defaults.color = dark ? '#C3C9E4' : '#3D4766';
    Chart.defaults.borderColor = dark ? 'rgba(255,255,255,.08)' : 'rgba(11,16,48,.08)';
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
  }

  /* ---------------- shell ---------------- */
  function renderNav(counts = {}) {
    const items = [
      ['#/dashboard', 'p-dash', 'Dashboard'],
      ['#/pool', 'p-inbox', 'Open pool', counts.pool],
      ['#/mine', 'p-bucket', 'My bucket', counts.mine],
      ...(isAdmin() ? [['#/all', 'p-list', 'All enquiries'], ['#/users', 'p-users', 'Team'], ['#/activity', 'p-activity', 'Activity'], ['#/media', 'p-image', 'Media'], ...(isSuper() ? [['#/site', 'p-sliders', 'Site settings'], ['#/social', 'p-share', 'Social media']] : []), ['#/mail', 'p-mail', 'Mail settings']] : []),
      ['#/account', 'p-key', 'My account'],
    ];
    $('#nav').innerHTML = items.map(([h, i, t, c]) => `<a href="${h}" data-route="${h}">${icon(i)}<span>${t}</span>${c ? `<b class="p-count">${c}</b>` : ''}</a>`).join('');
    highlightNav();
    $('#me').innerHTML = `<span class="p-avatar">${esc(initials(ME.name))}</span><div><b>${esc(ME.name)}</b><small>${ME.superAdmin ? 'Super admin' : ME.role === 'admin' ? 'Administrator' : 'Tele-caller'}</small></div><button class="p-icon" id="logout" title="Log out" aria-label="Log out">${icon('p-out')}</button>`;
    $('#logout').addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); location.href = '/login.html'; });
  }
  function highlightNav() {
    const base = '#/' + (location.hash.replace(/^#\//, '').split('?')[0].split('/')[0] || 'dashboard');
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === base || (base === '#/enquiry' && a.dataset.route === '#/mine')));
  }
  async function refreshTraffic() {
    try {
      const s = await api('/site');
      const v = s.visitors;
      const host = $('#traffic');
      if (!v) { host.innerHTML = ''; return; }
      const n = (x) => Number(x || 0).toLocaleString('en-IN');
      host.innerHTML = `<small>Website traffic</small>
        <div class="p-tr" style="--tc:#1A9BD7"><span>Unique visitors</span><b>${n(v.total)}</b></div>
        <div class="p-tr" style="--tc:#22B45A"><span>Visitors today</span><b>${n(v.today)}</b></div>
        <div class="p-tr" style="--tc:#8E5CF5"><span>Page views</span><b>${n(v.pageviews)}</b></div>`;
    } catch { /* ignore */ }
  }
  async function refreshCounts() {
    try {
      const [pool, mine] = await Promise.all([api('/enquiries?scope=pool'), api('/enquiries?scope=mine')]);
      const open = mine.enquiries.filter((e) => !['won', 'lost'].includes(e.status)).length;
      renderNav({ pool: pool.enquiries.length || '', mine: open || '' });
    } catch { /* ignore */ }
  }

  const syncTheme = () => { const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches); $('#themeBtn').innerHTML = icon(dark ? 'p-sun' : 'p-moon'); };
  $('#themeBtn').addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
    try { localStorage.setItem('mmx-theme', dark ? 'light' : 'dark'); } catch { /* storage unavailable */ }
    syncTheme(); route();
  });
  $('#burger').addEventListener('click', () => $('#side').classList.toggle('open'));
  $('#nav').addEventListener('click', () => $('#side').classList.remove('open'));
  $('#newEnquiry').addEventListener('click', () => newEnquiryModal());

  /* ---------------- router ---------------- */
  const view = $('#view');
  const setTitle = (t) => { $('#pageTitle').textContent = t; document.title = t + ' | Motamax Portal'; };
  async function route() {
    if (SKIP_ROUTE) { SKIP_ROUTE = false; highlightNav(); return; }
    if (SOCIAL_DIRTY) {
      // stay on the page with the edits intact
      if (!confirm('You have unsaved social media changes. Leave without saving?')) { SKIP_ROUTE = true; location.hash = '#/social'; return; }
      SOCIAL_DIRTY = false;
    }
    destroyCharts(); highlightNav();
    const [name, arg] = location.hash.replace(/^#\//, '').split('?')[0].split('/');
    view.innerHTML = '<div class="p-spin center"></div>';
    try {
      switch (name || 'dashboard') {
        case 'dashboard': return await viewDashboard();
        case 'pool': return await viewList('pool');
        case 'mine': return await viewList('mine');
        case 'all': return isAdmin() ? await viewList('all') : (location.hash = '#/dashboard');
        case 'enquiry': return await viewEnquiry(arg);
        case 'users': return isAdmin() ? await viewUsers() : (location.hash = '#/dashboard');
        case 'activity': return isAdmin() ? await viewActivity() : (location.hash = '#/dashboard');
        case 'mail': return isAdmin() ? await viewMail() : (location.hash = '#/dashboard');
        case 'media': return isAdmin() ? await viewMedia() : (location.hash = '#/dashboard');
        case 'site': return isAdmin() ? await viewSite() : (location.hash = '#/dashboard');
        case 'social': return isSuper() ? await viewSocial() : (location.hash = '#/dashboard');
        case 'account': return viewAccount();
        default: location.hash = '#/dashboard';
      }
    } catch (e) { view.innerHTML = `<div class="p-card p-empty">${esc(e.message)}</div>`; }
  }
  addEventListener('hashchange', route);

  /* ---------------- dashboard ---------------- */
  async function viewDashboard() {
    setTitle(isAdmin() ? 'Dashboard' : 'My dashboard');
    const [s, dueList] = await Promise.all([api('/stats'), api('/enquiries?scope=mine')]);
    const t = s.totals;
    const kpis = isAdmin()
      ? [['Total enquiries', t.total, '#1A9BD7'], ['In open pool', t.unassigned, '#FF9F0A'], ['In progress', t.inProgress, '#8E5CF5'], ['Won', t.won, '#22B45A'], ['Conversion', t.conversion == null ? '—' : t.conversion + '%', '#4F46E5'], ['Follow-ups due', t.followUpsDue, '#E3342F']]
      : [['My enquiries', t.total, '#1A9BD7'], ['Open pool', t.unassigned, '#FF9F0A'], ['In progress', t.inProgress, '#8E5CF5'], ['Won', t.won, '#22B45A'], ['My conversion', t.conversion == null ? '—' : t.conversion + '%', '#4F46E5'], ['Follow-ups due', t.followUpsDue, '#E3342F']];
    const dueItems = dueList.enquiries.filter(due).sort((a, b) => a.followUpAt.localeCompare(b.followUpAt));
    view.innerHTML = `
      <div class="p-kpis">${kpis.map(([l, v, c], i) => `<div class="p-kpi" style="--kc:${c};--i:${i}"><small>${l}</small><b>${esc(v)}</b><i></i></div>`).join('')}</div>
      ${dueItems.length ? `<div class="p-card p-due"><h3>${icon('p-clock')} Follow-ups due (${dueItems.length})</h3>${dueItems.slice(0, 6).map((e) => `<a href="#/enquiry/${e.id}" class="p-due-row"><b>${esc(e.ref)}</b><span>${esc(e.name)}${e.org ? ' · ' + esc(e.org) : ''}</span>${badge(e.status)}<em>${fmtDate(e.followUpAt)}</em></a>`).join('')}</div>` : ''}
      <div class="p-grid">
        <div class="p-card"><h3>Enquiries by status</h3><div class="p-chart sm"><canvas id="cStatus"></canvas></div></div>
        <div class="p-card"><h3>Last 30 days</h3><div class="p-chart sm"><canvas id="cTrend"></canvas></div></div>
        ${isAdmin() ? `<div class="p-card span2"><h3>Tele-caller performance <small>enquiries in each person's bucket, by status</small></h3><div class="p-chart"><canvas id="cTeam"></canvas></div></div>` : ''}
        <div class="p-card"><h3>Enquiry types</h3><div class="p-chart sm"><canvas id="cType"></canvas></div></div>
        <div class="p-card"><h3>${isAdmin() ? 'Who took what — latest activity' : 'My latest activity'}</h3><div class="p-activity">${s.recent.length ? s.recent.slice(0, 10).map((h) => `
          <a href="#/enquiry/${h.enquiryId}" class="p-act"><span class="p-avatar sm">${esc(initials(h.byName))}</span>
          <div><b>${esc(h.byName || 'System')}</b> ${h.action === 'status' ? `moved <b>${esc(h.ref)}</b> to ${badge(h.to)}` : `${esc((ACTION_LABEL[h.action] || h.action).toLowerCase())} <b>${esc(h.ref)}</b>`}<small>${esc(h.name)} · ${ago(h.at)}</small></div></a>`).join('') : '<p class="p-muted">No activity yet.</p>'}</div></div>
      </div>
      ${isAdmin() ? `<div class="p-card"><h3>Team leaderboard</h3><div class="p-table-wrap"><table class="p-table"><thead><tr><th>Tele-caller</th><th>Taken</th><th>Open</th><th>Follow-up due</th><th>Won</th><th>Lost</th><th>Conversion</th><th>Avg. first response</th></tr></thead><tbody>
        ${s.byUser.length ? s.byUser.sort((a, b) => b.total - a.total).map((u) => `<tr><td><span class="p-avatar sm">${esc(initials(u.name))}</span> ${esc(u.name)}${u.active ? '' : ' <small class="p-muted">(inactive)</small>'}</td><td>${u.total}</td><td>${u.open}</td><td>${u.followUpsDue ? `<b class="p-warn">${u.followUpsDue}</b>` : 0}</td><td>${u.byStatus.won}</td><td>${u.byStatus.lost}</td><td>${u.conversion == null ? '—' : `<div class="p-bar"><span style="width:${u.conversion}%"></span></div>${u.conversion}%`}</td><td>${u.avgFirstResponseHrs == null ? '—' : u.avgFirstResponseHrs + ' h'}</td></tr>`).join('') : '<tr><td colspan="8" class="p-muted">Add tele-callers under Team to see their performance.</td></tr>'}
      </tbody></table></div></div>` : ''}`;

    if (!window.Chart) return;
    chartDefaults();
    const statusKeys = Object.keys(STATUS);
    charts.push(new Chart($('#cStatus'), { type: 'doughnut', data: { labels: statusKeys.map((k) => STATUS[k].label), datasets: [{ data: statusKeys.map((k) => s.byStatus[k] || 0), backgroundColor: statusKeys.map((k) => STATUS[k].color), borderWidth: 0, hoverOffset: 8 }] }, options: { cutout: '64%', plugins: { legend: { position: 'right' } }, maintainAspectRatio: false } }));
    charts.push(new Chart($('#cTrend'), { type: 'line', data: { labels: s.trend.map((d) => d.date.slice(5)), datasets: [
      { label: 'New enquiries', data: s.trend.map((d) => d.created), borderColor: '#1A9BD7', backgroundColor: 'rgba(26,155,215,.15)', fill: true, tension: .35, pointRadius: 0 },
      { label: 'Won', data: s.trend.map((d) => d.won), borderColor: '#22B45A', backgroundColor: 'rgba(34,180,90,.12)', fill: true, tension: .35, pointRadius: 0 }] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { ticks: { maxTicksLimit: 8 } } } } }));
    const typeKeys = Object.keys(s.byType);
    charts.push(new Chart($('#cType'), { type: 'bar', data: { labels: typeKeys.map((k) => TYPE_LABEL[k] || k), datasets: [{ data: typeKeys.map((k) => s.byType[k]), backgroundColor: ['#23246E', '#1A9BD7', '#22B45A', '#E3342F', '#FF9F0A', '#8E5CF5', '#14B8A6'], borderRadius: 8 }] }, options: { maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } } }));
    if (isAdmin() && $('#cTeam')) {
      const users = s.byUser;
      charts.push(new Chart($('#cTeam'), { type: 'bar', data: { labels: users.map((u) => u.name), datasets: statusKeys.map((k) => ({ label: STATUS[k].label, data: users.map((u) => u.byStatus[k]), backgroundColor: STATUS[k].color, borderRadius: 4 })) },
        options: { maintainAspectRatio: false, indexAxis: 'y', scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' } } } }));
    }
  }

  /* ---------------- lists ---------------- */
  let USERS = [];
  async function viewList(scope) {
    setTitle({ pool: 'Open pool', mine: 'My bucket', all: 'All enquiries' }[scope]);
    if (isAdmin() && !USERS.length) USERS = (await api('/users')).users;
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    view.innerHTML = `
      <div class="p-card p-filters">
        <input type="search" id="fq" placeholder="Search name, company, phone, ref…" value="${esc(params.get('q') || '')}">
        <select id="fs"><option value="">All statuses</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
        <select id="ft"><option value="">All types</option>${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        ${scope === 'all' ? `<select id="fa"><option value="">Everyone</option><option value="none">Unassigned</option>${USERS.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>` : ''}
        ${isAdmin() ? `<a class="p-btn" href="/api/enquiries/export.csv">${icon('p-download')}<span>Export CSV</span></a>` : ''}
      </div>
      ${scope === 'pool' ? '<p class="p-hint">Enquiries nobody has taken yet. <b>Take</b> one to move it into your bucket — the admin can see who took each enquiry.</p>' : ''}
      <div id="listHost"><div class="p-spin center"></div></div>`;
    const load = async () => {
      const q = new URLSearchParams({ scope });
      if ($('#fq').value) q.set('q', $('#fq').value);
      if ($('#fs').value) q.set('status', $('#fs').value);
      if ($('#ft').value) q.set('type', $('#ft').value);
      if ($('#fa')?.value) q.set('assignee', $('#fa').value);
      const { enquiries } = await api('/enquiries?' + q);
      renderRows(enquiries, scope);
    };
    let t; $('#fq').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
    ['#fs', '#ft', '#fa'].forEach((s) => $(s)?.addEventListener('change', load));
    await load();
  }

  function renderRows(list, scope) {
    const host = $('#listHost');
    if (!list.length) { host.innerHTML = `<div class="p-card p-empty">${scope === 'pool' ? '🎉 The open pool is empty — every enquiry has an owner.' : scope === 'mine' ? 'Your bucket is empty. Take enquiries from the <a href="#/pool">open pool</a>.' : 'No enquiries match.'}</div>`; return; }
    host.innerHTML = `<div class="p-rows">${list.map((e) => `
      <div class="p-row${due(e) ? ' is-due' : ''}" data-id="${e.id}">
        <a class="p-row-main" href="#/enquiry/${e.id}">
          <span class="p-type t-${e.type}">${esc(TYPE_LABEL[e.type] || e.type)}</span>
          <div class="p-row-who"><b>${esc(e.name)}</b><small>${esc([e.org, e.city].filter(Boolean).join(' · ') || e.phone || e.email)}</small></div>
          <div class="p-row-meta"><small>${esc(e.ref)}</small><small>${ago(e.createdAt)}</small></div>
          ${badge(e.status)}
          <div class="p-row-owner">${e.assigneeName ? `<span class="p-avatar sm" title="${esc(e.assigneeName)}">${esc(initials(e.assigneeName))}</span><small>${esc(e.assigneeName)}</small>` : '<small class="p-muted">Unassigned</small>'}</div>
          ${e.followUpAt && !['won', 'lost'].includes(e.status) ? `<small class="p-fu${due(e) ? ' due' : ''}">${icon('p-clock')}${fmtDate(e.followUpAt)}</small>` : '<span></span>'}
        </a>
        <div class="p-row-actions">
          ${e.phone ? `<a class="p-icon sm" href="tel:${esc(e.phone)}" title="Call">${icon('p-phone')}</a>` : ''}
          ${!e.assigneeId ? `<button class="p-btn p-btn-primary sm" data-claim="${e.id}">Take</button>` : ''}
        </div>
      </div>`).join('')}</div>`;
    $$('[data-claim]', host).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await api(`/enquiries/${b.dataset.claim}/claim`, { method: 'POST', body: {} }); toast('Moved to your bucket'); refreshCounts(); location.hash = '#/enquiry/' + b.dataset.claim; }
      catch (err) { toast(err.message, 'err'); b.disabled = false; route(); }
    }));
  }

  /* ---------------- enquiry detail ---------------- */
  const TEMPLATES = {
    brochure: { label: 'Send brochure', subject: 'Motamax India — Company Profile', attach: true,
      body: 'Dear {name},\n\nThank you for your interest in Motamax India. As discussed, please find our company profile attached.\n\nWe deliver end-to-end Solution Architecture, Automation and Infrastructure Development — IT & networking, CCTV & security, telecom & OFC, electrical (HT & LT), solar and more — from requirement analysis to commissioning and maintenance.\n\nI would be glad to arrange a call or a free site survey at your convenience.\n\nWarm regards,' },
    thanks: { label: 'Thank you for your enquiry', subject: 'Your enquiry {ref} — Motamax India',
      body: 'Dear {name},\n\nThank you for contacting Motamax India. Your enquiry reference is {ref}.\n\nI will be your point of contact. Could you please share a convenient time for a short call so we can understand your requirement in detail?\n\nWarm regards,' },
    survey: { label: 'Site survey confirmation', subject: 'Site survey — {ref}',
      body: 'Dear {name},\n\nThank you for your time today. This is to confirm our site survey for your requirement.\n\nDate & time: \nLocation: {city}\n\nOur engineer will assess the site and share a solution proposal after the visit.\n\nWarm regards,' },
    quote: { label: 'Quotation follow-up', subject: 'Quotation follow-up — {ref}',
      body: 'Dear {name},\n\nI hope you have had a chance to review our quotation. Please let me know if you have any questions or need any changes to the scope.\n\nWe would be happy to schedule a meeting to take this forward.\n\nWarm regards,' },
    blank: { label: 'Blank email', subject: '', body: 'Dear {name},\n\n\n\nWarm regards,' },
  };
  const fill = (tpl, e) => tpl.replace(/\{(\w+)\}/g, (_, k) => ({ name: e.name, ref: e.ref, city: e.city || '', org: e.org || '' }[k] ?? ''));

  async function viewEnquiry(id) {
    const [{ enquiry: e }, mail] = await Promise.all([api('/enquiries/' + id), api('/settings/mail')]);
    MAIL = mail;
    if (isAdmin() && !USERS.length) USERS = (await api('/users')).users;
    setTitle(e.ref);
    const mineOrAdmin = isAdmin() || e.assigneeId === ME.id;
    const wa = waLink(e.phone);
    const field = (k, v) => v ? `<div class="p-kv"><small>${k}</small><b>${esc(v)}</b></div>` : '';
    view.innerHTML = `
      <a class="p-back" href="${e.assigneeId === ME.id ? '#/mine' : isAdmin() ? '#/all' : '#/pool'}">${icon('p-back')} Back</a>
      <div class="p-detail">
        <div class="p-col">
          <div class="p-card p-hero">
            <div class="p-hero-top"><span class="p-type t-${e.type}">${esc(TYPE_LABEL[e.type] || e.type)}</span>${badge(e.status)}${e.priority === 'high' ? '<span class="p-badge" style="--bc:#E3342F">High priority</span>' : ''}</div>
            <h2>${esc(e.name)}</h2>
            <p class="p-muted">${esc([e.org, e.city].filter(Boolean).join(' · '))}</p>
            <div class="p-quick">
              ${e.phone ? `<a class="p-btn" href="tel:${esc(e.phone)}">${icon('p-phone')}<span>${esc(e.phone)}</span></a>` : ''}
              ${wa ? `<a class="p-btn p-wa" href="${wa}" target="_blank" rel="noopener">${icon('p-wa')}<span>WhatsApp</span></a>` : ''}
              ${e.email ? `<a class="p-btn" href="mailto:${esc(e.email)}">${icon('p-mail')}<span>${esc(e.email)}</span></a>` : ''}
            </div>
            <div class="p-kvs">${field('Reference', e.ref)}${field('Received', fmtDate(e.createdAt))}${field('Area of interest', e.interest)}${field('Preferred time', e.preferredTime)}${field('Source', e.source)}${field('Channel', e.channel === 'manual' ? 'Added by staff' : 'Website')}</div>
            ${e.message ? `<div class="p-msg"><small>Message</small><p>${esc(e.message)}</p></div>` : ''}
          </div>

          <div class="p-card">
            <h3>Owner</h3>
            <div class="p-owner">
              ${e.assigneeName ? `<span class="p-avatar">${esc(initials(e.assigneeName))}</span><div><b>${esc(e.assigneeName)}</b><small>Taken ${ago(e.claimedAt)}</small></div>` : '<div><b>Unassigned</b><small>In the open pool</small></div>'}
              <div class="p-owner-actions">
                ${!e.assigneeId ? `<button class="p-btn p-btn-primary" id="claimBtn">${icon('p-bucket')}<span>Take into my bucket</span></button>` : ''}
                ${e.assigneeId && mineOrAdmin ? `<button class="p-btn" id="releaseBtn">Return to pool</button>` : ''}
                ${isAdmin() ? `<select id="assignSel"><option value="">Assign to…</option>${USERS.filter((u) => u.active).map((u) => `<option value="${u.id}" ${u.id === e.assigneeId ? 'disabled' : ''}>${esc(u.name)}${u.role === 'admin' ? ' (admin)' : ''}</option>`).join('')}</select>` : ''}
              </div>
            </div>
          </div>

          ${mineOrAdmin ? `
          <div class="p-card">
            <h3>Update status</h3>
            <div class="p-status-pick" id="statusPick">${Object.entries(STATUS).map(([k, v]) => `<button type="button" data-s="${k}" class="${k === e.status ? 'on' : ''}" style="--bc:${v.color}">${v.label}</button>`).join('')}</div>
            <div class="p-form-row">
              <label>Next follow-up<input type="datetime-local" id="fuAt" value="${e.followUpAt ? new Date(new Date(e.followUpAt) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}"></label>
              <label>Priority<select id="prio">${['low', 'normal', 'high'].map((p) => `<option ${p === e.priority ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
            </div>
            <label class="p-block">Call notes<textarea id="note" rows="3" placeholder="What was discussed, next steps…"></textarea></label>
            <button class="p-btn p-btn-primary" id="saveBtn">Save update</button>
          </div>` : `<div class="p-card p-hint">Take this enquiry into your bucket to update its status and email the customer.</div>`}
        </div>

        <div class="p-col">
          ${mineOrAdmin ? `
          <div class="p-card p-compose">
            <h3>${icon('p-mail')} Email the customer</h3>
            ${!MAIL.configured ? `<div class="p-alert">Email is not set up yet. ${isAdmin() ? '<a href="#/mail">Add SMTP details in Mail settings</a>.' : 'Ask an admin to add SMTP details in Mail settings.'}</div>` : ''}
            <div class="p-form-row">
              <label>To<input id="mTo" type="email" value="${esc(e.email)}" placeholder="customer@example.com"></label>
              <label>Template<select id="mTpl">${Object.entries(TEMPLATES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
            </div>
            <label class="p-block">Subject<input id="mSubj"></label>
            <label class="p-block">Message<textarea id="mBody" rows="9"></textarea></label>
            <label class="p-check"><input type="checkbox" id="mAttach"> Attach company brochure (PDF)</label>
            <div class="p-compose-foot"><small class="p-muted">Sent from the company mailbox with your name in the signature${ME.email ? `; replies come to ${esc(ME.email)}` : ''}.</small><button class="p-btn p-btn-primary" id="sendBtn" ${MAIL.configured ? '' : 'disabled'}>${icon('p-mail')}<span>Send email</span></button></div>
          </div>` : ''}

          <div class="p-card">
            <h3>Timeline</h3>
            <ol class="p-timeline">${e.history.slice().reverse().map((h) => `
              <li class="a-${h.action}"><span class="dot"></span><div>
                <b>${esc(ACTION_LABEL[h.action] || h.action)}</b>${h.action === 'status' ? ` ${badge(h.from)} → ${badge(h.to)}` : ''}
                ${h.note ? `<p>${esc(h.note)}</p>` : ''}<small>${esc(h.byName || 'System')} · ${fmtDate(h.at)}</small></div></li>`).join('')}</ol>
          </div>
        </div>
      </div>`;

    $('#claimBtn')?.addEventListener('click', async () => { try { await api(`/enquiries/${id}/claim`, { method: 'POST', body: {} }); toast('Moved to your bucket'); refreshCounts(); route(); } catch (err) { toast(err.message, 'err'); route(); } });
    $('#releaseBtn')?.addEventListener('click', async () => { if (!confirm('Return this enquiry to the open pool?')) return; try { await api(`/enquiries/${id}/release`, { method: 'POST', body: {} }); toast('Returned to the open pool'); refreshCounts(); route(); } catch (err) { toast(err.message, 'err'); } });
    $('#assignSel')?.addEventListener('change', async (ev) => { if (!ev.target.value) return; try { await api(`/enquiries/${id}/assign`, { method: 'POST', body: { userId: ev.target.value } }); toast('Assigned'); refreshCounts(); route(); } catch (err) { toast(err.message, 'err'); } });

    let picked = e.status;
    $$('#statusPick button').forEach((b) => b.addEventListener('click', () => { picked = b.dataset.s; $$('#statusPick button').forEach((x) => x.classList.toggle('on', x === b)); }));
    $('#saveBtn')?.addEventListener('click', async () => {
      const body = { status: picked, note: $('#note').value, priority: $('#prio').value, followUpAt: $('#fuAt').value ? new Date($('#fuAt').value).toISOString() : null };
      try { await api('/enquiries/' + id, { method: 'PATCH', body }); toast('Saved'); refreshCounts(); route(); } catch (err) { toast(err.message, 'err'); }
    });

    const applyTpl = () => { const t = TEMPLATES[$('#mTpl').value]; $('#mSubj').value = fill(t.subject, e); $('#mBody').value = fill(t.body, e); $('#mAttach').checked = Boolean(t.attach); };
    if ($('#mTpl')) { $('#mTpl').value = e.type === 'brochure' ? 'brochure' : e.status === 'new' ? 'thanks' : e.type === 'survey' ? 'survey' : e.status === 'quoted' ? 'quote' : 'brochure'; applyTpl(); $('#mTpl').addEventListener('change', applyTpl); }
    $('#sendBtn')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget; btn.disabled = true; btn.classList.add('loading');
      try {
        const r = await api(`/enquiries/${id}/email`, { method: 'POST', body: { to: $('#mTo').value, subject: $('#mSubj').value, body: $('#mBody').value, attachBrochure: $('#mAttach').checked } });
        toast(r.savedToSent ? 'Email sent and saved to Sent folder' : r.imapError ? 'Email sent (could not save to Sent: ' + r.imapError + ')' : 'Email sent');
        route();
      } catch (err) { toast(err.message, 'err'); btn.disabled = false; btn.classList.remove('loading'); }
    });
  }

  /* ---------------- new enquiry (phone / walk-in) ---------------- */
  function newEnquiryModal() {
    openModal(`<h2>New enquiry</h2><p class="p-muted">Log a phone call or walk-in enquiry.</p>
      <form id="neForm" class="p-form">
        <div class="p-form-row"><label>Name*<input name="name" required></label><label>Organisation<input name="org"></label></div>
        <div class="p-form-row"><label>Phone<input name="phone" type="tel"></label><label>Email<input name="email" type="email"></label></div>
        <div class="p-form-row"><label>City<input name="city"></label><label>Type<select name="type">${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${k === 'general' ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
        <label class="p-block">Area of interest<input name="interest"></label>
        <label class="p-block">Notes<textarea name="message" rows="3"></textarea></label>
        <label class="p-check"><input type="checkbox" name="claim" checked> Put it straight into my bucket</label>
        <button class="p-btn p-btn-primary" type="submit">Create enquiry</button>
      </form>`);
    $('#neForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target)); d.claim = Boolean(d.claim);
      try { const { enquiry } = await api('/enquiries/manual', { method: 'POST', body: d }); closeModal(); toast('Enquiry ' + enquiry.ref + ' created'); refreshCounts(); location.hash = '#/enquiry/' + enquiry.id; }
      catch (err) { toast(err.message, 'err'); }
    });
  }

  /* ---------------- team (admin) ---------------- */
  async function viewUsers() {
    setTitle('Team');
    const [{ users }, stats] = await Promise.all([api('/users'), api('/stats')]);
    USERS = users;
    const openOf = (id) => stats.byUser.find((u) => u.id === id)?.open || 0;
    const active = users.filter((u) => u.active).length;
    view.innerHTML = `
      <div class="p-kpis" style="grid-template-columns:repeat(3,1fr)">
        <div class="p-kpi" style="--kc:#1A9BD7;--i:0"><small>Team members</small><b>${users.length}</b><i></i></div>
        <div class="p-kpi" style="--kc:#22B45A;--i:1"><small>Active</small><b>${active}</b><i></i></div>
        <div class="p-kpi" style="--kc:#E3342F;--i:2"><small>Suspended</small><b>${users.length - active}</b><i></i></div>
      </div>
      <div class="p-card">
        <div class="p-card-head"><h3>Team members</h3><button class="p-btn p-btn-primary" id="addUser">${icon('p-plus')}<span>Create user</span></button></div>
        <div class="p-table-wrap"><table class="p-table p-team"><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Open enquiries</th><th>Last login</th><th></th></tr></thead><tbody>
        ${users.map((u) => `<tr class="${u.active ? '' : 'is-suspended'}"><td><span class="p-avatar sm">${esc(initials(u.name))}</span> ${esc(u.name)}${u.id === ME.id ? ' <small class="p-muted">(you)</small>' : ''}</td>
          <td>${u.username ? esc(u.username) : '<span class="p-muted">—</span>'}</td><td>${u.email ? esc(u.email) : '<span class="p-muted">—</span>'}</td>
          <td>${u.superAdmin ? '<span class="p-badge" style="--bc:#8E5CF5">★ Super admin</span>' : u.role === 'admin' ? 'Admin' : 'Tele-caller'}</td>
          <td>${u.active ? '<span class="p-badge" style="--bc:#22B45A">Active</span>' : `<span class="p-badge" style="--bc:#E3342F">Suspended</span>${u.suspendedAt ? `<br><small class="p-muted">${fmtDate(u.suspendedAt, false)}</small>` : ''}`}</td>
          <td>${openOf(u.id)}</td><td>${u.lastLoginAt ? ago(u.lastLoginAt) : '—'}</td>
          <td class="p-actions-cell">${canManage(u) ? `<button class="p-btn sm" data-edit="${u.id}">Edit</button>` : '<small class="p-muted">Protected</small>'}
            ${u.id === ME.id || u.superAdmin || !canManage(u) ? '' : u.active ? `<button class="p-btn sm p-btn-danger" data-suspend="${u.id}">Suspend</button>` : `<button class="p-btn sm p-btn-ok" data-activate="${u.id}">Reactivate</button>`}
            ${isSuper() && !u.superAdmin && u.id !== ME.id ? `<button class="p-btn sm p-btn-ghost-danger" data-delete="${u.id}">Delete</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="p-hint" style="margin-top:12px">Suspended users cannot log in and are signed out immediately; their history is kept and they can be reactivated. ${isSuper() ? 'As <b>super admin</b> you can manage and delete any user. Your own account is protected and cannot be suspended or deleted.' : 'Admins manage tele-callers. Admin accounts and the super admin are managed by the super admin.'}</p>
      </div>`;
    const form = (u = {}) => `<h2>${u.id ? 'Edit user' : 'Create user'}</h2>
      <p class="p-muted">Users can log in with their username or their email.</p>
      <form id="uForm" class="p-form">
        <div class="p-form-row"><label>Full name*<input name="name" value="${esc(u.name || '')}" required></label><label>Phone<input name="phone" value="${esc(u.phone || '')}"></label></div>
        <div class="p-form-row"><label>Username<input name="username" value="${esc(u.username || '')}" autocomplete="off" placeholder="e.g. rashmi" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}"></label>
          <label>Email<input name="email" type="email" value="${esc(u.email || '')}" autocomplete="off"></label></div>
        <div class="p-form-row"><label>Role<select name="role" ${u.id === ME.id || u.superAdmin ? 'disabled' : ''}>${u.superAdmin ? '<option>Super admin</option>' : `<option value="telecaller" ${u.role !== 'admin' ? 'selected' : ''}>Tele-caller</option>${isSuper() || u.role === 'admin' ? `<option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>` : ''}`}</select></label>
          <label>${u.id ? 'New password <small>(leave empty to keep)</small>' : 'Password* <small>(min 8 characters)</small>'}<input name="password" type="password" autocomplete="new-password" ${u.id ? '' : 'required minlength="8"'}></label></div>
        <button class="p-btn p-btn-primary" type="submit">${u.id ? 'Save changes' : 'Create user'}</button>
      </form>`;
    const bind = (u) => $('#uForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target));
      if (!d.username && !d.email) { toast('Give the user a username or an email.', 'err'); return; }
      try {
        if (u?.id) {
          const body = { name: d.name, phone: d.phone, username: d.username, email: d.email };
          if (u.id !== ME.id && !u.superAdmin) body.role = d.role;
          if (d.password) body.password = d.password;
          await api('/users/' + u.id, { method: 'PATCH', body });
        } else await api('/users', { method: 'POST', body: d });
        closeModal(); toast(u?.id ? 'User updated' : 'User created'); USERS = []; route();
      } catch (err) { toast(err.message, 'err'); }
    });
    $('#addUser').addEventListener('click', () => { openModal(form()); bind(); });
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => { const u = users.find((x) => x.id === b.dataset.edit); openModal(form(u)); bind(u); }));
    $$('[data-suspend]').forEach((b) => b.addEventListener('click', () => {
      const u = users.find((x) => x.id === b.dataset.suspend); const open = openOf(u.id);
      openModal(`<h2>Suspend ${esc(u.name)}?</h2>
        <p class="p-muted">They will be signed out and cannot log in until reactivated. Their enquiry history is kept.</p>
        ${open ? `<label class="p-check" style="margin-top:14px"><input type="checkbox" id="relOpen" checked> Return their ${open} open ${open === 1 ? 'enquiry' : 'enquiries'} to the open pool</label>` : ''}
        <div style="display:flex;gap:10px;margin-top:18px"><button class="p-btn p-btn-danger" id="doSuspend">Suspend user</button><button class="p-btn" id="cancelSuspend">Cancel</button></div>`);
      $('#cancelSuspend').addEventListener('click', closeModal);
      $('#doSuspend').addEventListener('click', async () => {
        try {
          const r = await api('/users/' + u.id, { method: 'PATCH', body: { active: false, releaseOpen: Boolean($('#relOpen')?.checked) } });
          closeModal(); toast(`${u.name} suspended${r.released ? ` · ${r.released} enquiries returned to the pool` : ''}`); refreshCounts(); route();
        } catch (err) { toast(err.message, 'err'); }
      });
    }));
    $$('[data-activate]').forEach((b) => b.addEventListener('click', async () => {
      const u = users.find((x) => x.id === b.dataset.activate);
      try { await api('/users/' + u.id, { method: 'PATCH', body: { active: true } }); toast(`${u.name} reactivated`); route(); } catch (err) { toast(err.message, 'err'); }
    }));
    $$('[data-delete]').forEach((b) => b.addEventListener('click', () => {
      const u = users.find((x) => x.id === b.dataset.delete); const open = openOf(u.id);
      openModal(`<h2>Delete ${esc(u.name)}?</h2>
        <p class="p-muted">This permanently removes the account. ${open ? `Their ${open} open ${open === 1 ? 'enquiry goes' : 'enquiries go'} back to the open pool. ` : ''}Enquiry history and notes they wrote are kept. If you may need the account again, <b>Suspend</b> instead.</p>
        <label class="p-block" style="margin-top:14px">Type <b>${esc(u.name)}</b> to confirm<input id="delConfirm" autocomplete="off"></label>
        <div style="display:flex;gap:10px;margin-top:6px"><button class="p-btn p-btn-danger" id="doDelete" disabled>Delete permanently</button><button class="p-btn" id="cancelDelete">Cancel</button></div>`);
      $('#delConfirm').addEventListener('input', (e) => { $('#doDelete').disabled = e.target.value.trim() !== u.name; });
      $('#cancelDelete').addEventListener('click', closeModal);
      $('#doDelete').addEventListener('click', async () => {
        try { const r = await api('/users/' + u.id, { method: 'DELETE', body: {} }); closeModal(); toast(`${u.name} deleted${r.released ? ` · ${r.released} enquiries returned to the pool` : ''}`); USERS = []; refreshCounts(); route(); }
        catch (err) { toast(err.message, 'err'); }
      });
    }));
  }

  /* ---------------- media (admin) ---------------- */
  async function viewMedia() {
    setTitle('Media');
    const { slots } = await api('/media');
    const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab') || 'site';
    const GROUPS = [['site', 'Site photos'], ['clients', 'Client logos'], ['brand', 'Logo & icons'], ['brochure', 'Brochure']];
    const quality = (s) => {
      if (s.kind !== 'image' || !s.width) return '';
      // tab / home-screen icons have a fixed size, so only show it
      if (/assets\/icons\/(icon-|apple-)/.test(s.path)) return `<span class="p-badge" style="--bc:#8E5CF5">${s.width}×${s.height}</span>`;
      const need = s.group === 'site' ? [1200, 1920] : [500, 1000];
      const [label, color] = s.width >= need[1] ? ['HD', '#22B45A'] : s.width >= need[0] ? ['Good', '#1A9BD7'] : ['Low-res', '#E3342F'];
      return `<span class="p-badge" style="--bc:${color}">${label} · ${s.width}×${s.height}</span>`;
    };
    const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
    const low = slots.filter((s) => s.kind === 'image' && s.width && s.width < (s.group === 'site' ? 1200 : 500)).length;
    const card = (s) => `
      <div class="p-media" data-path="${esc(s.path)}">
        <div class="p-media-img ${s.group === 'clients' || s.group === 'brand' ? 'contain' : ''}">${s.kind === 'pdf'
          ? `<div class="p-pdf">PDF<small>${kb(s.size)}</small></div>`
          : `<img src="/${esc(s.path)}?t=${encodeURIComponent(s.updatedAt || '')}" alt="${esc(s.label)}" loading="lazy">`}
          ${s.overridden ? '<span class="p-media-flag">Replaced</span>' : ''}</div>
        <div class="p-media-body"><b>${esc(s.label)}</b><small>${esc(s.usedIn)}</small>${quality(s)}</div>
        <div class="p-media-actions">
          <label class="p-btn p-btn-primary sm">Replace<input type="file" accept="${s.kind === 'pdf' ? 'application/pdf' : 'image/jpeg,image/png,image/webp'}" hidden></label>
          ${s.overridden ? '<button class="p-btn sm" data-restore>Restore original</button>' : ''}
        </div>
      </div>`;
    view.innerHTML = `
      <div class="p-card p-media-intro">
        <div><h3>Replace website &amp; brochure images</h3>
          <p class="p-muted">Upload a sharper photo or logo for any slot — it replaces the image everywhere it is used (website, galleries, stories, brochure). Originals are kept; use <b>Restore original</b> to undo.
          Recommended: photos at least <b>1920 px</b> wide (JPG), logos as <b>PNG</b> at least 1000 px wide.</p></div>
        ${low ? `<div class="p-alert" style="margin:0">${low} images are low resolution — replacing them will make the site look sharper.</div>` : ''}
      </div>
      <div class="p-tabs">${GROUPS.map(([k, l]) => `<a href="#/media?tab=${k}" class="${k === tab ? 'on' : ''}">${l} <small>${slots.filter((s) => s.group === k).length}</small></a>`).join('')}</div>
      ${tab === 'brochure' ? `
        <div class="p-card p-brochure">
          <div><h3>Company brochure</h3>
            <ol class="p-steps">
              <li>Replace photos, client logos or the brochure logo in the other tabs.</li>
              <li>Open the <b>brochure designer</b> — it always uses the current images.</li>
              <li>Click <b>Print / Save as PDF</b> (Margins: None, Background graphics: on) and save the PDF.</li>
              <li>Upload that PDF below. Website downloads and brochure emails use it immediately.</li>
            </ol>
            <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="p-btn p-btn-primary" href="/brochure/brochure.html" target="_blank" rel="noopener">Open brochure designer</a><a class="p-btn" href="/assets/Motamax-Company-Profile.pdf" target="_blank" rel="noopener">${icon('p-download')}<span>Current PDF</span></a></div>
          </div>
        </div>` : ''}
      <div class="p-media-grid">${slots.filter((s) => s.group === tab).map(card).join('')}</div>`;

    $$('.p-media').forEach((el) => {
      const p = el.dataset.path;
      $('input[type=file]', el).addEventListener('change', async (ev) => {
        const file = ev.target.files[0]; if (!file) return;
        if (file.size > 25 * 1024 * 1024) { toast('File is larger than 25 MB', 'err'); return; }
        el.classList.add('busy');
        try {
          const r = await fetch('/api/media?path=' + encodeURIComponent(p), { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || 'Upload failed');
          toast('Replaced — live on the website now'); route();
        } catch (err) { toast(err.message, 'err'); el.classList.remove('busy'); }
      });
      $('[data-restore]', el)?.addEventListener('click', async () => {
        if (!confirm('Restore the original file for this slot?')) return;
        try { await api('/media?path=' + encodeURIComponent(p), { method: 'DELETE', body: {} }); toast('Original restored'); route(); } catch (err) { toast(err.message, 'err'); }
      });
    });
  }

  /* ---------------- site settings (super admin) ---------------- */
  const LOADER_INFO = {
    orbit: ['Orbit', 'Coloured satellites circle the logo'], pulse: ['Pulse halo', 'Logo-shaped halos breathe outwards'],
    curtain: ['Curtain reveal', 'Two panels split open to show the page'], progress: ['Progress bar', 'Logo with a 5-colour loading bar and %'],
    ripple: ['Ripple', '5-colour rings ripple from the centre'], flip: ['3D flip card', 'Logo card spins in 3D with a reflection'],
    typewriter: ['Typewriter', '“MOTAMAX INDIA” types itself under the logo'], tiles: ['Tile wall', 'A wall of tiles flips away to reveal the site'],
    particles: ['Particle swirl', 'Hundreds of coloured particles swirl into orbit'], spotlight: ['Spotlight iris', 'Moving spotlight, then an iris-out reveal'],
    'zoom-nav': ['Zoom to menu ★', 'Giant logo animates, then flies into its place in the menu bar'],
  };
  const ANIM_INFO = {
    'spin-in': 'Spin-in', bounce: 'Bounce drop', 'flip-y': '3D flip', heartbeat: 'Heartbeat', glow: '5-colour glow',
    swing: 'Pendulum swing', 'blur-in': 'Blur to focus', float: 'Floating', shimmer: 'Shimmer sweep', elastic: 'Elastic pop',
  };
  const POS_INFO = { footer: 'Footer', contact: 'Contact page (side panel)', 'float-left': 'Floating — bottom left', 'float-right': 'Floating — right side', hidden: 'Hidden' };

  async function viewSite() {
    setTitle('Site settings');
    if (!isSuper()) { view.innerHTML = '<div class="p-card p-empty">Only the super admin can change the site appearance.</div>'; return; }
    const s = await api('/site');
    const L = s.loader;
    const preview = (style, anim) => `/?loader=${encodeURIComponent(style)}&logoAnim=${encodeURIComponent(anim)}&preview=1`;
    view.innerHTML = `

      <div class="p-card">
        <div class="p-card-head"><h3>Page loading animation</h3><a class="p-btn" id="pvBtn" target="_blank" rel="noopener" href="${preview(L.style, L.logoAnim)}">Preview selection ↗</a></div>
        <p class="p-muted" style="margin:0 0 14px">Shown when the website opens. Pick a style and a logo animation — every combination works. Click a card's ▶ to preview it.</p>
        <div class="p-choice-grid" id="styleGrid">${Object.entries(LOADER_INFO).map(([k, [t, d]]) => `
          <label class="p-choice ${k === L.style ? 'on' : ''}"><input type="radio" name="style" value="${k}" ${k === L.style ? 'checked' : ''}>
            <b>${t}</b><small>${d}</small><a class="p-choice-pv" href="${preview(k, L.logoAnim)}" target="_blank" rel="noopener" title="Preview">▶</a></label>`).join('')}</div>
        <h3 style="margin-top:22px">Logo animation</h3>
        <div class="p-chips" id="animGrid">${Object.entries(ANIM_INFO).map(([k, t]) => `<label class="p-chip ${k === L.logoAnim ? 'on' : ''}"><input type="radio" name="logoAnim" value="${k}" ${k === L.logoAnim ? 'checked' : ''}>${t}</label>`).join('')}</div>
        <div class="p-form-row" style="margin-top:18px">
          <label>Show the loader<select id="freq">
            <option value="session" ${L.frequency === 'session' ? 'selected' : ''}>Once per visit (recommended)</option>
            <option value="always" ${L.frequency === 'always' ? 'selected' : ''}>Every page open / refresh</option>
            <option value="off" ${L.frequency === 'off' ? 'selected' : ''}>Off</option></select></label>
          <label>Minimum duration <small>(${(L.minMs / 1000).toFixed(1)} s)</small><input id="minMs" type="range" min="600" max="4000" step="100" value="${L.minMs}"></label>
        </div>
      </div>

      <div class="p-card">
        <h3>Brand badges</h3>
        <p class="p-muted" style="margin:0 0 14px">Choose where each badge appears, or show the original company logo in its place. Replace the artwork itself on the <a href="#/media?tab=brand">Media</a> page.</p>
        <div class="p-badge-grid">${s.badges.map((b) => `
          <div class="p-badge-card" data-id="${b.id}">
            <div class="p-badge-img"><img src="/${b.source === 'logo' ? 'assets/motamax-logo.png' : 'assets/badges/' + b.id + '.webp'}?t=${Date.now()}" alt=""></div>
            <div class="p-badge-body"><b>${esc(b.label)}</b>
              <label class="p-check"><input type="checkbox" data-k="enabled" ${b.enabled ? 'checked' : ''}> Show on the website</label>
              <label class="p-block">Position<select data-k="position">${s.options.positions.map((p) => `<option value="${p}" ${p === b.position ? 'selected' : ''}>${POS_INFO[p] || p}</option>`).join('')}</select></label>
              <label class="p-block">Image<select data-k="source"><option value="badge" ${b.source === 'badge' ? 'selected' : ''}>This badge</option><option value="logo" ${b.source === 'logo' ? 'selected' : ''}>Original company logo</option></select></label>
            </div>
          </div>`).join('')}</div>
      </div>

      <div class="p-card">
        <h3>Visitor counter</h3>
        <label class="p-check"><input type="checkbox" id="showVisitors" ${s.showVisitors ? 'checked' : ''}> Show “visitors / today” in the website footer and on the login page</label>
        <p class="p-muted" style="margin:0;font-size:13px">Live numbers are always shown in the left sidebar.</p>
      </div>
      <div style="display:flex;justify-content:flex-end"><button class="p-btn p-btn-primary" id="saveSite">Save site settings</button></div>`;

    const cur = () => ({ style: $('input[name=style]:checked').value, anim: $('input[name=logoAnim]:checked').value });
    const sync = () => {
      const { style, anim } = cur();
      $$('#styleGrid .p-choice').forEach((c) => { c.classList.toggle('on', $('input', c).checked); $('.p-choice-pv', c).href = preview($('input', c).value, anim); });
      $$('#animGrid .p-chip').forEach((c) => c.classList.toggle('on', $('input', c).checked));
      $('#pvBtn').href = preview(style, anim);
    };
    $$('input[name=style], input[name=logoAnim]').forEach((i) => i.addEventListener('change', sync));
    $('#minMs').addEventListener('input', (e) => { e.target.previousElementSibling.textContent = `(${(e.target.value / 1000).toFixed(1)} s)`; });
    $$('.p-badge-card select[data-k=source]').forEach((sel) => sel.addEventListener('change', () => {
      const card = sel.closest('.p-badge-card');
      $('img', card).src = sel.value === 'logo' ? '/assets/motamax-logo.png' : `/assets/badges/${card.dataset.id}.webp?t=${Date.now()}`;
    }));
    $('#saveSite').addEventListener('click', async () => {
      const { style, anim } = cur();
      const body = {
        loader: { style, logoAnim: anim, frequency: $('#freq').value, minMs: +$('#minMs').value },
        badges: $$('.p-badge-card').map((c) => ({ id: c.dataset.id, enabled: $('[data-k=enabled]', c).checked, position: $('[data-k=position]', c).value, source: $('[data-k=source]', c).value })),
        showVisitors: $('#showVisitors').checked,
      };
      try {
        const saved = await api('/site', { method: 'PUT', body });
        try { localStorage.setItem('mmx-site', JSON.stringify({ loader: saved.loader, badges: saved.badges, showVisitors: saved.showVisitors })); sessionStorage.removeItem('mmx-loader-seen'); } catch { /* storage unavailable */ }
        toast('Site settings saved — visitors see them on their next visit');
      } catch (err) { toast(err.message, 'err'); }
    });
  }

  /* ---------------- activity: team logins + website visitors (admins) ---------------- */
  const DEVICE_ICON = { Mobile: 'p-phone', Tablet: 'p-tablet', Desktop: 'p-desktop' };
  const DEVICE_COLOR = { Mobile: '#1A9BD7', Tablet: '#8E5CF5', Desktop: '#22B45A' };
  const PAGE_NAME = { '/': 'Home', '/index.html': 'Home', '/about.html': 'About', '/services.html': 'Services', '/industries.html': 'Industries',
    '/stories.html': 'Success stories', '/clients.html': 'Clients', '/work.html': 'Our work', '/contact.html': 'Contact', '/login.html': 'Login' };
  const pageName = (p) => PAGE_NAME[p] || p;
  const device = (d) => `<span class="p-dev" style="--dc:${DEVICE_COLOR[d.device] || '#8E5CF5'}">${icon(DEVICE_ICON[d.device] || 'p-desktop')}<span><b>${esc(d.device || '—')}</b><small>${esc(d.os || '')}</small></span></span>`;
  const when = (iso) => `<span class="p-when"><b>${esc(ago(iso))}</b><small>${esc(fmtDate(iso))}</small></span>`;
  const ip = (v) => v ? `<code class="p-ip">${esc(v)}</code>` : '<span class="p-muted">—</span>';
  let ACT_TIMER = null;

  async function viewActivity() {
    setTitle('Activity');
    clearInterval(ACT_TIMER);
    const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab') || 'team';
    const a = await api('/activity');
    const S = a.summary;
    const failed = a.logins.filter((l) => !l.ok).length;
    const TABS = [['team', 'Team', a.users.length], ['logins', 'Login history', a.logins.length], ['visitors', 'Website visitors', S.peopleToday + ' today']];
    view.innerHTML = `
      <div class="p-act-head">
        <div class="p-tabs">${TABS.map(([k, l, n]) => `<a href="#/activity?tab=${k}" class="${k === tab ? 'on' : ''}">${l} <small>${n}</small></a>`).join('')}</div>
        <span class="p-muted p-act-upd">Updated ${new Date().toLocaleTimeString('en-IN', { timeStyle: 'short' })} · refreshes every minute</span>
      </div>
      <div id="actBody"></div>`;
    const body = $('#actBody');

    if (tab === 'team') {
      const online = a.users.filter((u) => u.online).length;
      body.innerHTML = `
        <p class="p-muted p-act-note">${online ? `<b class="p-live">●</b> ${online} online now · ` : ''}Who signed in to this portal, when, from which IP address and on which device.</p>
        <div class="p-act-grid">${a.users.map((u) => {
          const L = u.lastLogin;
          return `<div class="p-card p-person ${u.active ? '' : 'off'}">
            <div class="p-person-top">
              <span class="p-avatar lg">${esc(initials(u.name))}${u.online ? '<i class="p-online" title="Online now"></i>' : ''}</span>
              <div><b>${esc(u.name)}</b><small>${esc(roleLabel(u))}${u.active ? '' : ' · <span style="color:#E3342F">Suspended</span>'}</small></div>
              <span class="p-status ${u.online ? 'on' : ''}">${u.online ? 'Online now' : (u.lastSeenAt || u.lastLoginAt) ? 'Active ' + esc(ago(u.lastSeenAt || u.lastLoginAt)) : 'Never logged in'}</span>
            </div>
            ${u.lastLoginAt ? `<dl class="p-facts">
              <dt>Last login</dt><dd>${when(u.lastLoginAt)}</dd>
              <dt>IP address</dt><dd>${ip(L?.ip)}</dd>
              <dt>Device</dt><dd>${L ? device(L) : '<span class="p-muted">Shown after their next login</span>'}</dd>
              <dt>Browser</dt><dd>${esc(L?.browser || '—')}</dd>
              <dt>Total logins</dt><dd><b>${u.loginCount || (u.lastLoginAt ? '1+' : 0)}</b></dd>
            </dl>` : '<div class="p-empty" style="padding:18px 0 6px">Has not logged in yet</div>'}
          </div>`;
        }).join('')}</div>`;
    }

    if (tab === 'logins') {
      body.innerHTML = `
        <div class="p-card">
          <div class="p-act-filters">
            <div class="p-chips" id="lgF">
              <label class="p-chip on"><input type="radio" name="lgf" value="all" checked>All <small>${a.logins.length}</small></label>
              <label class="p-chip"><input type="radio" name="lgf" value="ok">Successful <small>${a.logins.length - failed}</small></label>
              <label class="p-chip"><input type="radio" name="lgf" value="fail">Failed <small>${failed}</small></label>
            </div>
            <input class="p-act-search" id="lgQ" type="search" placeholder="Search name, IP, browser…">
          </div>
          <div class="p-table-wrap"><table class="p-table p-act-table">
            <thead><tr><th>When</th><th>User</th><th>Result</th><th>IP address</th><th>Device</th><th>Browser</th></tr></thead>
            <tbody id="lgRows"></tbody></table></div>
          <p class="p-muted p-act-foot">The latest ${a.logins.length} login attempts are kept (up to 1,000).</p>
        </div>`;
      const draw = () => {
        const f = $('input[name=lgf]:checked').value; const q = $('#lgQ').value.trim().toLowerCase();
        const rows = a.logins.filter((l) => (f === 'all' || (f === 'ok') === l.ok) && (!q || [l.name, l.login, l.ip, l.browser, l.os, l.device].join(' ').toLowerCase().includes(q)));
        $('#lgRows').innerHTML = rows.map((l) => `<tr>
          <td data-l="When">${when(l.at)}</td>
          <td data-l="User"><b>${esc(l.name || l.login || '—')}</b>${l.name && l.login && l.login !== l.name.toLowerCase() ? `<small class="p-sub">${esc(l.login)}</small>` : ''}</td>
          <td data-l="Result">${l.ok ? '<span class="p-res ok">✓ Signed in</span>' : `<span class="p-res bad">✕ ${esc(l.reason || 'Failed')}</span>`}</td>
          <td data-l="IP address">${ip(l.ip)}</td>
          <td data-l="Device">${device(l)}</td>
          <td data-l="Browser">${esc(l.browser || '—')}</td></tr>`).join('') || '<tr><td colspan="6" class="p-empty">No login attempts match.</td></tr>';
      };
      $('#lgF').addEventListener('change', (ev) => { $$('#lgF .p-chip').forEach((c) => c.classList.toggle('on', c.contains(ev.target) && ev.target.checked)); draw(); });
      $('#lgQ').addEventListener('input', draw);
      draw();
    }

    if (tab === 'visitors') {
      const total = S.devices.reduce((n, [, c]) => n + c, 0) || 1;
      const bars = (title, rows, colorOf, nameOf = (k) => k) => {
        const max = Math.max(1, ...rows.map(([, c]) => c));
        return `<div class="p-card p-break"><h3>${title}</h3>${rows.length ? rows.map(([k, c]) => `
          <div class="p-hbar"><span>${esc(nameOf(k))}</span><b>${c}</b><i><em style="width:${(c / max) * 100}%;background:${colorOf(k)}"></em></i></div>`).join('') : '<p class="p-muted">No data yet</p>'}</div>`;
      };
      const PAL = ['#1A9BD7', '#22B45A', '#8E5CF5', '#FF9F0A', '#E3342F', '#14B8A6'];
      const pal = (rows) => { const m = Object.fromEntries(rows.map(([k], i) => [k, PAL[i % PAL.length]])); return (k) => m[k]; };
      body.innerHTML = `
        <div class="p-kpis p-act-kpis">
          ${[['Visitors today', S.peopleToday, '#1A9BD7'], ['Page views today', S.viewsToday, '#22B45A'], ['Visitors · 30 days', S.people30, '#8E5CF5'], ['Page views · 30 days', S.views30, '#FF9F0A']]
            .map(([l, v, c], i) => `<div class="p-kpi" style="--kc:${c};--i:${i}"><small>${l}</small><b>${Number(v).toLocaleString('en-IN')}</b><i></i></div>`).join('')}
        </div>
        <div class="p-act-two">
          <div class="p-card"><h3>Last 14 days</h3><div style="height:230px"><canvas id="cVisits"></canvas></div></div>
          <div class="p-card p-devices"><h3>What visitors use</h3>
            ${['Mobile', 'Desktop', 'Tablet'].map((d) => { const c = (S.devices.find(([k]) => k === d) || [, 0])[1]; return `
              <div class="p-devrow" style="--dc:${DEVICE_COLOR[d]}">${icon(DEVICE_ICON[d])}<span>${d}</span><b>${Math.round((c / total) * 100)}%</b><small>${c} views</small><i><em style="width:${(c / total) * 100}%"></em></i></div>`; }).join('')}
          </div>
        </div>
        <div class="p-act-three">
          ${bars('Browsers', S.browsers, pal(S.browsers))}
          ${bars('Operating systems', S.os, pal(S.os))}
          ${bars('Most visited pages', S.pages, () => '#5B6CFF', pageName)}
        </div>
        ${S.refs.length ? bars('Where visitors came from', S.refs, () => '#14B8A6') : ''}
        <div class="p-card">
          <div class="p-act-filters">
            <h3 style="margin:0">Recent visits</h3>
            <div class="p-chips" id="vF">${['All', 'Mobile', 'Tablet', 'Desktop'].map((d, i) => `<label class="p-chip ${i ? '' : 'on'}"><input type="radio" name="vf" value="${d}" ${i ? '' : 'checked'}>${d}</label>`).join('')}</div>
            <input class="p-act-search" id="vQ" type="search" placeholder="Search IP, page, browser…">
          </div>
          <div class="p-table-wrap"><table class="p-table p-act-table">
            <thead><tr><th>When</th><th>Visitor</th><th>Page</th><th>IP address</th><th>Device</th><th>Browser</th><th>Came from</th></tr></thead>
            <tbody id="vRows"></tbody></table></div>
          <p class="p-muted p-act-foot">Visits from the last 30 days are kept; search engines and bots are not counted.</p>
        </div>`;
      const draw = () => {
        const f = $('input[name=vf]:checked').value; const q = $('#vQ').value.trim().toLowerCase();
        const rows = a.visits.filter((v) => (f === 'All' || v.device === f) && (!q || [v.ip, v.page, pageName(v.page), v.browser, v.os, v.ref].join(' ').toLowerCase().includes(q))).slice(0, 200);
        $('#vRows').innerHTML = rows.map((v) => `<tr>
          <td data-l="When">${when(v.at)}</td>
          <td data-l="Visitor">${v.new ? '<span class="p-res new">New visitor</span>' : '<span class="p-res ret">Returning</span>'}</td>
          <td data-l="Page"><b>${esc(pageName(v.page))}</b></td>
          <td data-l="IP address">${ip(v.ip)}</td>
          <td data-l="Device">${device(v)}</td>
          <td data-l="Browser">${esc(v.browser || '—')}</td>
          <td data-l="Came from">${v.ref ? esc(v.ref) : '<span class="p-muted">Direct</span>'}</td></tr>`).join('') || '<tr><td colspan="7" class="p-empty">No visits match.</td></tr>';
      };
      $('#vF').addEventListener('change', (ev) => { $$('#vF .p-chip').forEach((c) => c.classList.toggle('on', c.contains(ev.target) && ev.target.checked)); draw(); });
      $('#vQ').addEventListener('input', draw);
      draw();
      charts.push(new Chart($('#cVisits'), { type: 'bar', data: { labels: S.days.map((d) => new Date(d.day + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })),
        datasets: [{ label: 'Visitors', data: S.days.map((d) => d.people), backgroundColor: '#1A9BD7', borderRadius: 6 }, { label: 'Page views', data: S.days.map((d) => d.views), backgroundColor: 'rgba(34,180,90,.55)', borderRadius: 6 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } }));
    }

    // keep the numbers fresh while this page is open (skipped while someone is typing a search)
    ACT_TIMER = setInterval(() => {
      if (!location.hash.startsWith('#/activity')) { clearInterval(ACT_TIMER); return; }
      if (document.activeElement?.matches('.p-act-search') || document.hidden) return;
      route();
    }, 60000);
  }

  /* ---------------- social media links (super admin) ---------------- */
  var SOCIAL_DIRTY = false, SKIP_ROUTE = false; // var: route() may run before this line is reached
  addEventListener('beforeunload', (ev) => { if (SOCIAL_DIRTY) { ev.preventDefault(); ev.returnValue = ''; } });
  // mirrors the server's clean-up so the preview and "Test" use the final address
  function socialUrl(network, raw) {
    let s = String(raw || '').trim();
    const d = s.replace(/\D/g, ''); const intl = (x) => (x.length === 10 ? '91' + x : x);
    if (network === 'email' && s.includes('@') && !/^mailto:/i.test(s)) s = 'mailto:' + s;
    else if (network === 'phone' && !/^tel:/i.test(s) && d.length >= 6 && d.length <= 15) s = 'tel:+' + intl(d);
    else if (network === 'whatsapp' && /^[\d\s+()-]{8,}$/.test(s)) s = 'https://wa.me/' + intl(d);
    else if (s && !/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    return s.length <= 500 && /^(https?:\/\/[^\s<>"'`]+\.[^\s<>"'`]+|mailto:[^\s<>"'`@]+@[^\s<>"'`]+|tel:\+?[\d-]{6,20})$/i.test(s) ? s : null;
  }
  async function viewSocial() {
    setTitle('Social media');
    const SO = window.MMX_SOCIAL;
    if (!SO) { view.innerHTML = '<div class="p-card p-empty">Could not load the social icons. Refresh the page.</div>'; return; }
    const s = await api('/site');
    let links = (s.social?.links || []).map((l) => ({ ...l }));
    let chat = { ...(s.social?.chat || {}) };
    let saved = JSON.stringify({ links, chat });
    const uid = () => 'l' + Math.random().toString(36).slice(2, 9);
    const netOptions = (sel) => SO.order.map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(SO.networks[k].name)}</option>`).join('');

    view.innerHTML = `
      <div class="p-soc-bar p-card">
        <div><b>Social media links</b><small class="p-muted">Shown as icons in the website footer and on the Contact page. Changes go live when you save.</small></div>
        <span class="p-soc-dirty" id="socDirty" hidden>Unsaved changes</span>
        <button class="p-btn" id="socUndo" disabled>Discard changes</button>
        <button class="p-btn p-btn-primary" id="socSave" disabled>Save changes</button>
      </div>
      <div class="p-soc-grid">
        <div class="p-card">
          <div class="p-card-head"><h3>Links <small class="p-muted" id="socCount"></small></h3><button class="p-btn p-btn-primary" id="socAdd">+ Add link</button></div>
          <p class="p-muted" style="margin:0 0 12px;font-size:13px">Paste an address and the network is picked automatically. Drag ⠿ or use ↑ ↓ to change the order.</p>
          <div id="socList" class="p-soc-list"></div>
          <div class="p-soc-quick"><small class="p-muted">Quick add:</small><span id="socQuick"></span></div>
        </div>
        <div>
          <div class="p-card">
            <h3>Live preview</h3>
            <small class="p-muted">Website footer</small>
            <div class="p-soc-preview" id="pvFooter"></div>
            <small class="p-muted">Contact page · “Follow us”</small>
            <div class="p-soc-preview light" id="pvContact"></div>
          </div>
          <div class="p-card">
            <h3>Floating WhatsApp chat button</h3>
            <p class="p-muted" style="margin:0 0 12px;font-size:13px">The green chat bubble at the bottom-right of every page, and the WhatsApp card on the Contact page.</p>
            <label class="p-check"><input type="checkbox" id="chatOn" ${chat.enabled ? 'checked' : ''}> Show the floating chat button</label>
            <label class="p-block">WhatsApp number (with country code)<input id="chatNum" inputmode="tel" placeholder="91 99380 41356" value="${esc(chat.number || '')}"></label>
            <label class="p-block">Pre-filled message<input id="chatMsg" maxlength="200" placeholder="Hello Motamax, I have an enquiry." value="${esc(chat.message || '')}"></label>
            <a class="p-btn sm" id="chatTest" target="_blank" rel="noopener">Test chat ↗</a>
          </div>
        </div>
      </div>`;

    const dirty = () => {
      SOCIAL_DIRTY = JSON.stringify({ links, chat }) !== saved;
      $('#socDirty').hidden = !SOCIAL_DIRTY; $('#socSave').disabled = !SOCIAL_DIRTY; $('#socUndo').disabled = !SOCIAL_DIRTY;
    };
    const preview = () => {
      const row = (place) => links.filter((l) => l.enabled && l[place] && socialUrl(l.network, l.url))
        .map((l) => `<span style="--sc:${SO.networks[l.network]?.color || '#8E5CF5'}" title="${esc(l.label || SO.networks[l.network]?.name)}">${SO.icon(l.network)}</span>`).join('') || '<em>Nothing shown here</em>';
      $('#pvFooter').innerHTML = row('footer'); $('#pvContact').innerHTML = row('contact');
      const n = String(chat.number || '').replace(/\D/g, '');
      const t = $('#chatTest');
      if (n.length >= 8) { t.href = 'https://wa.me/' + (n.length === 10 ? '91' + n : n) + (chat.message ? '?text=' + encodeURIComponent(chat.message) : ''); t.classList.remove('disabled'); }
      else { t.removeAttribute('href'); t.classList.add('disabled'); }
      $('#socCount').textContent = `· ${links.filter((l) => l.enabled).length} shown of ${links.length}`;
    };
    const rowHtml = (l, i) => {
      const n = SO.networks[l.network] || SO.networks.website;
      const url = socialUrl(l.network, l.url);
      return `<div class="p-soc-row ${l.enabled ? '' : 'off'}" draggable="true" data-i="${i}" style="--sc:${n.color}">
        <span class="p-soc-handle" title="Drag to reorder">⠿</span>
        <span class="p-soc-ico">${SO.icon(l.network, 20)}</span>
        <div class="p-soc-fields">
          <div class="p-soc-line">
            <select data-k="network" aria-label="Network">${netOptions(l.network)}</select>
            <input data-k="url" value="${esc(l.url)}" placeholder="${esc(n.hint)}" aria-label="Address" class="${l.url && !url ? 'bad' : ''}">
          </div>
          <div class="p-soc-line">
            <input data-k="label" value="${esc(l.label || '')}" maxlength="60" placeholder="Tooltip text (optional), e.g. ${esc(n.name)} — Motamax India" aria-label="Tooltip">
          </div>
          ${l.url && !url ? '<small class="p-soc-err">Enter a full address like https://…, an email or a phone number.</small>' : ''}
          <div class="p-soc-line opts">
            <label><input type="checkbox" data-k="enabled" ${l.enabled ? 'checked' : ''}> Visible</label>
            <label><input type="checkbox" data-k="footer" ${l.footer ? 'checked' : ''}> Footer</label>
            <label><input type="checkbox" data-k="contact" ${l.contact ? 'checked' : ''}> Contact page</label>
            <span class="sp"></span>
            <button class="p-btn sm" data-act="up" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
            <button class="p-btn sm" data-act="down" ${i === links.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
            ${url ? `<a class="p-btn sm" href="${esc(url)}" target="_blank" rel="noopener" title="Open this link">Test ↗</a>` : ''}
            <button class="p-btn sm" data-act="dup" title="Duplicate">Copy</button>
            <button class="p-btn sm p-btn-ghost-danger" data-act="del">Remove</button>
          </div>
        </div>
      </div>`;
    };
    const render = () => {
      $('#socList').innerHTML = links.length ? links.map(rowHtml).join('') : '<div class="p-empty" style="padding:26px">No links yet — click “+ Add link”. The footer icons are hidden while the list is empty.</div>';
      $('#socQuick').innerHTML = SO.order.filter((k) => k !== 'website' && !links.some((l) => l.network === k))
        .map((k) => `<button class="p-soc-chip" data-add="${k}" style="--sc:${SO.networks[k].color}" title="Add ${esc(SO.networks[k].name)}">${SO.icon(k, 15)}<span>${esc(SO.networks[k].name)}</span></button>`).join('') || '<small class="p-muted">every network is added</small>';
      preview(); dirty();
    };
    const add = (network = 'website') => {
      links.push({ id: uid(), network, url: '', label: '', enabled: true, footer: true, contact: true, auto: network === 'website' });
      render();
      const rows = $$('.p-soc-row'); const last = rows[rows.length - 1];
      last?.scrollIntoView({ block: 'center', behavior: 'smooth' }); $('[data-k=url]', last)?.focus();
    };

    const list = $('#socList');
    list.addEventListener('input', (ev) => {
      const row = ev.target.closest('.p-soc-row'); if (!row) return;
      const l = links[+row.dataset.i]; const k = ev.target.dataset.k;
      if (k === 'url' || k === 'label') l[k] = ev.target.value;
      if (k === 'url' && l.auto) {
        const g = SO.detect(l.url);
        if (g && g !== l.network) {
          l.network = g; const pos = ev.target.selectionStart; render();
          const inp = $(`.p-soc-row[data-i="${row.dataset.i}"] [data-k=url]`); inp.focus(); inp.setSelectionRange(pos, pos); return;
        }
      }
      if (k === 'url') ev.target.classList.toggle('bad', Boolean(l.url) && !socialUrl(l.network, l.url));
      preview(); dirty();
    });
    list.addEventListener('change', (ev) => {
      const row = ev.target.closest('.p-soc-row'); if (!row) return;
      const l = links[+row.dataset.i]; const k = ev.target.dataset.k;
      if (k === 'network') { l.network = ev.target.value; l.auto = false; }
      else if (['enabled', 'footer', 'contact'].includes(k)) l[k] = ev.target.checked;
      else return; // text fields update live; re-rendering on blur would swallow the next click
      render();
    });
    list.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]'); if (!b) return;
      const i = +b.closest('.p-soc-row').dataset.i;
      if (b.dataset.act === 'up' && i > 0) [links[i - 1], links[i]] = [links[i], links[i - 1]];
      if (b.dataset.act === 'down' && i < links.length - 1) [links[i + 1], links[i]] = [links[i], links[i + 1]];
      if (b.dataset.act === 'dup') links.splice(i + 1, 0, { ...links[i], id: uid() });
      if (b.dataset.act === 'del') {
        const n = SO.networks[links[i].network]?.name || 'this link';
        if (!confirm(`Remove ${n}${links[i].url ? ' (' + links[i].url + ')' : ''}?\nNothing changes on the website until you save.`)) return;
        links.splice(i, 1);
      }
      render();
    });
    // drag and drop reordering (by the row, not while typing in a field)
    let dragFrom = null;
    list.addEventListener('dragstart', (ev) => {
      const r = ev.target.closest?.('.p-soc-row');
      if (!r || /INPUT|SELECT/.test(ev.target.tagName)) { ev.preventDefault(); return; }
      dragFrom = +r.dataset.i; r.classList.add('dragging'); ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', '');
    });
    list.addEventListener('dragover', (ev) => {
      if (dragFrom === null) return; ev.preventDefault();
      const over = ev.target.closest('.p-soc-row'); $$('.p-soc-row', list).forEach((r) => r.classList.toggle('drop', r === over));
    });
    list.addEventListener('drop', (ev) => {
      ev.preventDefault(); const r = ev.target.closest('.p-soc-row');
      if (r && dragFrom !== null) { const [m] = links.splice(dragFrom, 1); links.splice(+r.dataset.i, 0, m); }
      dragFrom = null; render();
    });
    list.addEventListener('dragend', () => { dragFrom = null; $$('.p-soc-row', list).forEach((r) => r.classList.remove('dragging', 'drop')); });

    $('#socAdd').addEventListener('click', () => add());
    $('#socQuick').addEventListener('click', (ev) => { const b = ev.target.closest('[data-add]'); if (b) add(b.dataset.add); });
    $('#chatOn').addEventListener('change', (ev) => { chat.enabled = ev.target.checked; preview(); dirty(); });
    $('#chatNum').addEventListener('input', (ev) => { chat.number = ev.target.value; preview(); dirty(); });
    $('#chatMsg').addEventListener('input', (ev) => { chat.message = ev.target.value; preview(); dirty(); });
    $('#socUndo').addEventListener('click', () => {
      ({ links, chat } = JSON.parse(saved));
      $('#chatOn').checked = Boolean(chat.enabled); $('#chatNum').value = chat.number || ''; $('#chatMsg').value = chat.message || '';
      render(); toast('Changes discarded');
    });
    $('#socSave').addEventListener('click', async () => {
      const bad = links.findIndex((l) => !socialUrl(l.network, l.url));
      if (bad >= 0) { toast(`Link ${bad + 1}: enter a valid address before saving`, 'err'); $$('.p-soc-row')[bad]?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      const btn = $('#socSave'); btn.classList.add('loading'); btn.disabled = true;
      try {
        const r = await api('/social', { method: 'PUT', body: { links: links.map(({ auto, ...l }) => l), chat } });
        links = r.links.map((l) => ({ ...l })); chat = { ...r.chat }; saved = JSON.stringify({ links, chat });
        $('#chatNum').value = chat.number || '';
        try { const c = JSON.parse(localStorage.getItem('mmx-site') || '{}'); c.social = r; localStorage.setItem('mmx-site', JSON.stringify(c)); } catch { /* storage unavailable */ }
        render(); toast('Social links saved — live on the website now');
      } catch (err) { toast(err.message, 'err'); dirty(); }
      btn.classList.remove('loading');
    });
    render();
  }

  /* ---------------- mail settings (admin) ---------------- */
  async function viewMail() {
    setTitle('Mail settings');
    const s = await api('/settings/mail');
    view.innerHTML = `
      <form id="mailForm" class="p-mail-grid">
        <div class="p-card">
          <h3>${icon('p-mail')} Outgoing mail (SMTP)</h3>
          <p class="p-muted">Used to email customers and send the brochure from the portal. Use the company mailbox (e.g. info@motamaxindia.com).</p>
          <div class="p-form-row"><label>SMTP host<input name="smtp.host" value="${esc(s.smtp.host)}" placeholder="smtp.gmail.com / smtp.office365.com / mail.yourdomain.com"></label><label>Port<input name="smtp.port" type="number" value="${esc(s.smtp.port)}"></label></div>
          <label class="p-check"><input type="checkbox" name="smtp.secure" ${s.smtp.secure ? 'checked' : ''}> Use SSL/TLS (port 465). Leave off for STARTTLS on 587.</label>
          <div class="p-form-row"><label>Username<input name="smtp.user" value="${esc(s.smtp.user)}" autocomplete="off"></label><label>Password${s.smtp.hasPassword ? ' <small>(saved — leave empty to keep)</small>' : ''}<input name="smtp.pass" type="password" autocomplete="new-password"></label></div>
          <div class="p-form-row"><label>From name<input name="smtp.fromName" value="${esc(s.smtp.fromName)}"></label><label>From email<input name="smtp.fromEmail" type="email" value="${esc(s.smtp.fromEmail)}" placeholder="info@motamaxindia.com"></label></div>
          <label class="p-block">Reply-to (optional — defaults to the sender's own email)<input name="smtp.replyTo" type="email" value="${esc(s.smtp.replyTo)}"></label>
        </div>
        <div class="p-card">
          <h3>${icon('p-inbox')} Save sent mail (IMAP)</h3>
          <p class="p-muted">Optional. Saves a copy of every email sent from the portal in the mailbox's Sent folder, so it appears in Outlook / Gmail too.</p>
          <label class="p-check"><input type="checkbox" name="imap.enabled" ${s.imap.enabled ? 'checked' : ''}> Save a copy to the Sent folder</label>
          <div class="p-form-row"><label>IMAP host<input name="imap.host" value="${esc(s.imap.host)}" placeholder="imap.gmail.com / outlook.office365.com"></label><label>Port<input name="imap.port" type="number" value="${esc(s.imap.port)}"></label></div>
          <label class="p-check"><input type="checkbox" name="imap.secure" ${s.imap.secure ? 'checked' : ''}> Use SSL/TLS (port 993)</label>
          <div class="p-form-row"><label>Username <small>(blank = SMTP username)</small><input name="imap.user" value="${esc(s.imap.user)}" autocomplete="off"></label><label>Password${s.imap.hasPassword ? ' <small>(saved)</small>' : ' <small>(blank = SMTP password)</small>'}<input name="imap.pass" type="password" autocomplete="new-password"></label></div>
          <label class="p-block">Sent folder name<input name="imap.sentFolder" value="${esc(s.imap.sentFolder)}" placeholder="Sent / Sent Items / [Gmail]/Sent Mail"></label>
          <h3 style="margin-top:22px">Automatic replies</h3>
          <label class="p-check"><input type="checkbox" name="autoBrochure" ${s.autoBrochure ? 'checked' : ''}> Email the brochure automatically when a visitor chooses "Get our brochure" on the website</label>
        </div>
        <div class="p-card span2 p-mail-actions">
          <div><b>Status:</b> ${s.configured ? '<span class="p-badge" style="--bc:#22B45A">Configured</span>' : '<span class="p-badge" style="--bc:#FF9F0A">Not configured</span>'}</div>
          <div class="p-form-row tight"><input id="testTo" type="email" value="${esc(ME.email)}" aria-label="Send test to"><button type="button" class="p-btn" id="testBtn">Save &amp; send test</button><button class="p-btn p-btn-primary" type="submit">Save settings</button></div>
        </div>
      </form>`;
    const collect = () => {
      const f = $('#mailForm'); const out = { smtp: {}, imap: {} };
      $$('input[name]', f).forEach((i) => {
        const [grp, key] = i.name.includes('.') ? i.name.split('.') : [null, i.name];
        const val = i.type === 'checkbox' ? i.checked : i.value.trim();
        if (grp) { if (key === 'pass' && !val) return; out[grp][key] = val; } else out[key] = val;
      });
      return out;
    };
    $('#mailForm').addEventListener('submit', async (ev) => { ev.preventDefault(); try { await api('/settings/mail', { method: 'PUT', body: collect() }); toast('Mail settings saved'); route(); } catch (err) { toast(err.message, 'err'); } });
    $('#testBtn').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Testing…';
      try {
        await api('/settings/mail', { method: 'PUT', body: collect() });
        const r = await api('/settings/mail/test', { method: 'POST', body: { to: $('#testTo').value } });
        toast(`SMTP OK${r.sentTo ? ' — test sent to ' + r.sentTo : ''}${r.imap ? ' · IMAP OK' : ''}${r.imapError ? ' · Sent-folder copy failed: ' + r.imapError : ''}`);
      } catch (err) { toast(err.message, 'err'); }
      b.disabled = false; b.textContent = 'Save & send test';
    });
  }

  /* ---------------- account ---------------- */
  function viewAccount() {
    setTitle('My account');
    view.innerHTML = `<div class="p-card" style="max-width:560px">
      <div class="p-owner"><span class="p-avatar">${esc(initials(ME.name))}</span><div><b>${esc(ME.name)}</b><small>${esc([ME.username && '@' + ME.username, ME.email].filter(Boolean).join(' · '))} · ${roleLabel(ME)}</small></div></div>
      <h3 style="margin-top:22px">Change password</h3>
      <form id="pwForm" class="p-form"><label class="p-block">Current password<input name="current" type="password" autocomplete="current-password" required></label>
      <label class="p-block">New password (min 8 characters)<input name="next" type="password" autocomplete="new-password" minlength="8" required></label>
      <button class="p-btn p-btn-primary" type="submit">Update password</button></form></div>`;
    $('#pwForm').addEventListener('submit', async (ev) => { ev.preventDefault(); try { await api('/auth/password', { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) }); ev.target.reset(); toast('Password updated'); } catch (err) { toast(err.message, 'err'); } });
  }

  /* ---------------- boot ---------------- */
  (async () => {
    try { ME = (await api('/auth/me')).user; } catch (e) {
      if (e.message !== 'Signed out') $('#boot').innerHTML = '<div class="p-card p-empty" style="max-width:420px">The enquiry portal server is not reachable from this address. Please open the portal from the Motamax app server.</div>';
      return;
    }
    $('#boot').remove(); $('#shell').hidden = false;
    syncTheme(); renderNav(); refreshCounts(); refreshTraffic();
    if (!location.hash) location.hash = isAdmin() ? '#/dashboard' : '#/pool';
    route();
    setInterval(() => { refreshCounts(); refreshTraffic(); }, 60000);
  })();
})();
