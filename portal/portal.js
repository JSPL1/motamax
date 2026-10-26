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
      ...(isAdmin() ? [['#/all', 'p-list', 'All enquiries'], ['#/users', 'p-users', 'Team'], ['#/mail', 'p-mail', 'Mail settings']] : []),
      ['#/account', 'p-key', 'My account'],
    ];
    $('#nav').innerHTML = items.map(([h, i, t, c]) => `<a href="${h}" data-route="${h}">${icon(i)}<span>${t}</span>${c ? `<b class="p-count">${c}</b>` : ''}</a>`).join('');
    highlightNav();
    $('#me').innerHTML = `<span class="p-avatar">${esc(initials(ME.name))}</span><div><b>${esc(ME.name)}</b><small>${ME.role === 'admin' ? 'Administrator' : 'Tele-caller'}</small></div><button class="p-icon" id="logout" title="Log out" aria-label="Log out">${icon('p-out')}</button>`;
    $('#logout').addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); location.href = '/login.html'; });
  }
  function highlightNav() {
    const base = '#/' + (location.hash.replace(/^#\//, '').split('/')[0] || 'dashboard');
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === base || (base === '#/enquiry' && a.dataset.route === '#/mine')));
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
    destroyCharts(); highlightNav();
    const [name, arg] = location.hash.replace(/^#\//, '').split('/');
    view.innerHTML = '<div class="p-spin center"></div>';
    try {
      switch (name || 'dashboard') {
        case 'dashboard': return await viewDashboard();
        case 'pool': return await viewList('pool');
        case 'mine': return await viewList('mine');
        case 'all': return isAdmin() ? await viewList('all') : (location.hash = '#/dashboard');
        case 'enquiry': return await viewEnquiry(arg);
        case 'users': return isAdmin() ? await viewUsers() : (location.hash = '#/dashboard');
        case 'mail': return isAdmin() ? await viewMail() : (location.hash = '#/dashboard');
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
            <div class="p-compose-foot"><small class="p-muted">Sent from the company mailbox with your name in the signature; replies come to ${esc(ME.email)}.</small><button class="p-btn p-btn-primary" id="sendBtn" ${MAIL.configured ? '' : 'disabled'}>${icon('p-mail')}<span>Send email</span></button></div>
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
    const { users } = await api('/users'); USERS = users;
    view.innerHTML = `
      <div class="p-card">
        <div class="p-card-head"><h3>Team members</h3><button class="p-btn p-btn-primary" id="addUser">${icon('p-plus')}<span>Add member</span></button></div>
        <div class="p-table-wrap"><table class="p-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead><tbody>
        ${users.map((u) => `<tr><td><span class="p-avatar sm">${esc(initials(u.name))}</span> ${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role === 'admin' ? 'Admin' : 'Tele-caller'}</td><td>${u.active ? '<span class="p-badge" style="--bc:#22B45A">Active</span>' : '<span class="p-badge" style="--bc:#888">Inactive</span>'}</td><td>${u.lastLoginAt ? ago(u.lastLoginAt) : '—'}</td>
          <td class="p-actions-cell"><button class="p-btn sm" data-edit="${u.id}">Edit</button></td></tr>`).join('')}
        </tbody></table></div>
      </div>`;
    const form = (u = {}) => `<h2>${u.id ? 'Edit member' : 'Add team member'}</h2>
      <form id="uForm" class="p-form">
        <div class="p-form-row"><label>Name*<input name="name" value="${esc(u.name || '')}" required></label><label>Phone<input name="phone" value="${esc(u.phone || '')}"></label></div>
        <div class="p-form-row"><label>Email*<input name="email" type="email" value="${esc(u.email || '')}" ${u.id ? 'disabled' : 'required'}></label>
          <label>Role<select name="role"><option value="telecaller" ${u.role !== 'admin' ? 'selected' : ''}>Tele-caller</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select></label></div>
        <label class="p-block">${u.id ? 'New password (leave empty to keep)' : 'Password* (min 8 characters)'}<input name="password" type="password" autocomplete="new-password" ${u.id ? '' : 'required minlength="8"'}></label>
        ${u.id ? `<label class="p-check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Active (can log in)</label>` : ''}
        <button class="p-btn p-btn-primary" type="submit">${u.id ? 'Save changes' : 'Add member'}</button>
      </form>`;
    const bind = (u) => $('#uForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target));
      try {
        if (u?.id) { const body = { name: d.name, phone: d.phone, role: d.role, active: Boolean(d.active) }; if (d.password) body.password = d.password; await api('/users/' + u.id, { method: 'PATCH', body }); }
        else await api('/users', { method: 'POST', body: d });
        closeModal(); toast('Saved'); USERS = []; route();
      } catch (err) { toast(err.message, 'err'); }
    });
    $('#addUser').addEventListener('click', () => { openModal(form()); bind(); });
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => { const u = users.find((x) => x.id === b.dataset.edit); openModal(form(u)); bind(u); }));
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
      <div class="p-owner"><span class="p-avatar">${esc(initials(ME.name))}</span><div><b>${esc(ME.name)}</b><small>${esc(ME.email)} · ${ME.role === 'admin' ? 'Administrator' : 'Tele-caller'}</small></div></div>
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
    syncTheme(); renderNav(); refreshCounts();
    if (!location.hash) location.hash = isAdmin() ? '#/dashboard' : '#/pool';
    route();
    setInterval(refreshCounts, 60000);
  })();
})();
