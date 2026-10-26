/* Motamax — public enquiry options, inline form, floating button and modal */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const INTERESTS = [
    'IT infrastructure & networking', 'CCTV, security & access control', 'Telecom, OFC & FTTx', 'Electrical works (HT & LT)',
    'Automation (weighbridge, switch, BPA)', 'AI & video analytics', 'AV, conferencing & displays', 'Data centre',
    'Solar & power backup', 'Walkie-talkie / critical comms', 'Construction site package', 'Other',
  ];

  // field keys: name, org, phone, email, city, interest, preferredTime, message
  const TYPES = [
    { key: 'quote', icon: 'i-file', color: 'bg-navy', title: 'Request a quotation', sub: 'Get pricing for a defined scope',
      cta: 'Request quotation', fields: ['name', 'org', 'phone', 'email', 'city', 'interest', 'message'], msg: 'Scope, quantities, site location and timeline' },
    { key: 'survey', icon: 'i-pin', color: 'bg-sky', title: 'Book a free site survey', sub: 'Our engineer visits your site',
      cta: 'Book site survey', fields: ['name', 'org', 'phone', 'email', 'city', 'interest', 'preferredTime', 'message'], msg: 'Site address and what needs to be assessed', timeLabel: 'Preferred visit date', timeType: 'date', cityLabel: 'Site location' },
    { key: 'callback', icon: 'i-phone', color: 'bg-green', title: 'Request a call-back', sub: 'We call you at a time that suits',
      cta: 'Call me back', fields: ['name', 'phone', 'interest', 'preferredTime'], timeLabel: 'Best time to call', timeType: 'slot' },
    { key: 'support', icon: 'i-shield', color: 'bg-red', title: 'AMC / service support', sub: 'Maintenance or an issue on site',
      cta: 'Raise support request', fields: ['name', 'org', 'phone', 'email', 'city', 'interest', 'message'], msg: 'Describe the system and the issue', interestLabel: 'System' },
    { key: 'brochure', icon: 'i-mail', color: 'bg-orange', title: 'Get our brochure', sub: 'Company profile sent to your inbox',
      cta: 'Email me the brochure', fields: ['name', 'email', 'org', 'phone'], emailRequired: true },
    { key: 'partner', icon: 'i-users', color: 'bg-purple', title: 'Vendor / partner', sub: 'OEMs, distributors, sub‑contractors',
      cta: 'Send partnership enquiry', fields: ['name', 'org', 'phone', 'email', 'interest', 'message'], msg: 'Your products / services and coverage area', interestLabel: 'Partnership type',
      interestOptions: ['OEM / manufacturer', 'Distributor', 'Sub-contractor', 'Service partner', 'Other'] },
  ];
  const byKey = Object.fromEntries(TYPES.map((t) => [t.key, t]));
  const icon = (id) => `<svg><use href="#${id}"/></svg>`;

  function fieldHtml(t, f, uid) {
    const id = `${uid}-${f}`;
    const req = (f === 'name') || (f === 'phone' && t.key === 'callback') || (f === 'email' && t.emailRequired);
    const star = req ? ' <i aria-hidden="true">*</i>' : '';
    switch (f) {
      case 'name': return `<div class="field"><label for="${id}">Full name${star}</label><input id="${id}" name="name" autocomplete="name" required maxlength="120"></div>`;
      case 'org': return `<div class="field"><label for="${id}">Organisation</label><input id="${id}" name="org" autocomplete="organization" maxlength="160"></div>`;
      case 'phone': return `<div class="field"><label for="${id}">Phone${star}</label><input id="${id}" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40"${req ? ' required' : ''}></div>`;
      case 'email': return `<div class="field"><label for="${id}">Email${star}</label><input id="${id}" name="email" type="email" autocomplete="email" maxlength="160"${req ? ' required' : ''}></div>`;
      case 'city': return `<div class="field"><label for="${id}">${t.cityLabel || 'City / location'}</label><input id="${id}" name="city" autocomplete="address-level2" maxlength="80"></div>`;
      case 'interest': {
        const opts = t.interestOptions || INTERESTS;
        return `<div class="field"><label for="${id}">${t.interestLabel || 'Area of interest'}</label><select id="${id}" name="interest">${opts.map((o) => `<option>${esc(o)}</option>`).join('')}</select></div>`;
      }
      case 'preferredTime':
        if (t.timeType === 'date') {
          const min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
          return `<div class="field"><label for="${id}">${t.timeLabel}</label><input id="${id}" name="preferredTime" type="date" min="${min}"></div>`;
        }
        return `<div class="field"><label for="${id}">${t.timeLabel}</label><select id="${id}" name="preferredTime"><option>As soon as possible</option><option>Morning (10am – 1pm)</option><option>Afternoon (1pm – 4pm)</option><option>Evening (4pm – 7pm)</option></select></div>`;
      case 'message': return `<div class="field full"><label for="${id}">Details</label><textarea id="${id}" name="message" maxlength="4000" placeholder="${esc(t.msg || '')}"></textarea></div>`;
    }
    return '';
  }

  let uidSeq = 0;
  function renderForm(host, typeKey, opts = {}) {
    const t = byKey[typeKey] || TYPES[0];
    const uid = 'enq' + (++uidSeq);
    host.innerHTML = `
      <form class="enq-form" novalidate data-type="${t.key}">
        <div class="enq-form-head">
          <span class="card-icon ${t.color}">${icon(t.icon)}</span>
          <div><h3>${esc(t.title)}</h3><p>${esc(t.sub)}</p></div>
        </div>
        ${opts.chips ? `<div class="enq-chips" role="tablist">${TYPES.map((x) => `<button type="button" role="tab" data-type="${x.key}" class="${x.key === t.key ? 'on' : ''}" aria-selected="${x.key === t.key}">${esc(x.title.replace('Request a ', '').replace('Book a free ', '').replace('Get our ', ''))}</button>`).join('')}</div>` : ''}
        <div class="enq-fields">${t.fields.map((f) => fieldHtml(t, f, uid)).join('')}</div>
        <input type="text" name="company_website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
        <p class="enq-error" role="alert" hidden></p>
        <button class="btn btn-primary enq-submit" type="submit"><span class="spinner"></span><span class="label">${esc(t.cta)}</span> <span aria-hidden="true">→</span></button>
        <p class="form-note">We reply within one business day. Prefer to talk? Call <a href="tel:+919938041356">+91 99380 41356</a>.</p>
      </form>`;
    const form = $('form', host);
    if (opts.chips) $$('.enq-chips button', form).forEach((b) => b.addEventListener('click', () => renderForm(host, b.dataset.type, opts)));
    form.addEventListener('submit', (e) => submit(e, form, t, host, opts));
    return form;
  }

  function showSuccess(host, t, ref, viaEmailApp) {
    host.innerHTML = `
      <div class="enq-success">
        <div class="tick"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></div>
        <h3>${viaEmailApp ? 'Almost done' : 'Thank you!'}</h3>
        <p>${viaEmailApp
          ? 'Your email app has opened with the details filled in — just press send.'
          : `Your enquiry <b>${esc(ref)}</b> has reached our team.${t.key === 'brochure' ? ' The brochure is on its way to your inbox.' : ' A member of our tele‑calling team will contact you shortly.'}`}</p>
        ${t.key === 'brochure' ? '<a class="btn btn-glass" href="assets/Motamax-Company-Profile.pdf" download>Download it now</a>' : ''}
        <button class="btn btn-glass enq-again" type="button">Send another enquiry</button>
      </div>`;
    $('.enq-again', host).addEventListener('click', () => renderForm(host, t.key, host._opts || {}));
  }

  async function submit(e, form, t, host, opts) {
    e.preventDefault();
    const err = $('.enq-error', form);
    const data = Object.fromEntries(new FormData(form));
    data.type = t.key;
    data.source = (document.title.split('|')[0] || '').trim() + ' page';
    const problem = !data.name?.trim() ? 'Please enter your name.'
      : (t.emailRequired && !/^\S+@\S+\.\S+$/.test(data.email || '')) ? 'Please enter a valid email address.'
      : (!data.phone?.trim() && !data.email?.trim()) ? 'Please add a phone number or email so we can reach you.'
      : (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) ? 'Please check the email address.' : '';
    if (problem) { err.textContent = problem; err.hidden = false; return; }
    err.hidden = true;
    const btn = $('.enq-submit', form); btn.disabled = true; btn.classList.add('loading');
    host._opts = opts;
    try {
      const r = await fetch('/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (r.status === 404 || r.status === 405 || r.status === 501) throw new Error('no-api');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { err.textContent = j.error || 'Something went wrong. Please try again.'; err.hidden = false; return; }
      showSuccess(host, t, j.ref, false);
    } catch (ex) {
      // Static hosting without the API: hand the enquiry to the visitor's email app instead
      const body = Object.entries({ Type: t.title, Name: data.name, Organisation: data.org, Phone: data.phone, Email: data.email, Location: data.city, Interest: data.interest, 'Preferred time': data.preferredTime, Details: data.message })
        .filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
      location.href = `mailto:info@motamaxindia.com?subject=${encodeURIComponent(t.title + ' — ' + (data.org || data.name))}&body=${encodeURIComponent(body)}`;
      showSuccess(host, t, '', true);
    } finally { btn.disabled = false; btn.classList.remove('loading'); }
  }

  /* ---------- contact page: option cards + inline form ---------- */
  const optionsHost = $('#enqOptions');
  const inline = $('#enquiryInline');
  const initialType = new URLSearchParams(location.search).get('type');
  if (optionsHost && inline) {
    optionsHost.innerHTML = TYPES.map((t, i) => `
      <button class="enq-option glass" role="tab" data-type="${t.key}" style="--d:${i * 0.06}s">
        <span class="card-icon ${t.color}">${icon(t.icon)}</span>
        <b>${esc(t.title)}</b><small>${esc(t.sub)}</small>
        <span class="pick" aria-hidden="true"></span>
      </button>`).join('');
    const select = (key, scroll) => {
      $$('.enq-option', optionsHost).forEach((b) => { const on = b.dataset.type === key; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      renderForm(inline, key);
      if (scroll && innerWidth < 1080) inline.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    $$('.enq-option', optionsHost).forEach((b) => b.addEventListener('click', () => select(b.dataset.type, true)));
    select(byKey[initialType] ? initialType : 'quote', false);
  }

  /* ---------- floating buttons + modal (every page) ---------- */
  const fab = document.createElement('div');
  fab.className = 'fab-wrap';
  fab.innerHTML = `
    <a class="fab fab-wa" href="https://wa.me/919938041356?text=Hello%20Motamax%2C%20I%20have%20an%20enquiry." target="_blank" rel="noopener" aria-label="Chat on WhatsApp">${icon('i-whatsapp')}</a>
    <button class="fab fab-main" type="button" aria-haspopup="dialog">${icon('i-mail')}<span>Enquire</span></button>`;
  document.body.appendChild(fab);

  const modal = document.createElement('div');
  modal.className = 'enq-modal';
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Send an enquiry');
  modal.innerHTML = `<div class="enq-dialog glass"><button class="enq-close" type="button" aria-label="Close">×</button><div class="enq-modal-body"></div></div>`;
  document.body.appendChild(modal);
  const body = $('.enq-modal-body', modal);
  let lastFocus = null;
  function openModal(type) {
    lastFocus = document.activeElement;
    renderForm(body, byKey[type] ? type : 'quote', { chips: true });
    modal.classList.add('open'); document.body.style.overflow = 'hidden';
    setTimeout(() => $('input:not(.hp), select, textarea', body)?.focus(), 60);
  }
  function closeModal() { modal.classList.remove('open'); document.body.style.overflow = ''; lastFocus?.focus?.(); }
  $('.fab-main', fab).addEventListener('click', () => openModal('quote'));
  $('.enq-close', modal).addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });
  // any element with data-enquire="type" opens the modal pre-set to that type
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-enquire]');
    if (!a) return;
    e.preventDefault();
    if (inline && optionsHost) { const b = $(`.enq-option[data-type="${a.dataset.enquire}"]`, optionsHost); if (b) { b.click(); inline.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; } }
    openModal(a.dataset.enquire);
  });
  // hide the floating button on the contact page where the form is already visible
  if (inline) fab.classList.add('on-contact');
})();
