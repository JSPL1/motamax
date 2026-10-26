'use strict';
/*
 * Motamax website + enquiry portal server.
 *   - Serves the static website (whitelisted folders/pages only)
 *   - Public:  POST /api/enquiries
 *   - Staff:   /api/auth/*, /api/enquiries/*, /api/stats, /api/users, /api/settings/mail
 *
 * Env: PORT, NODE_ENV, SESSION_SECRET (required in production), DATABASE_URL (optional, Postgres),
 *      ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME (creates the first admin when no users exist).
 */
const path = require('path');
const fs = require('fs');

// minimal .env loader for local runs (no dependency)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const express = require('express');
const createStore = require('./store');
const sec = require('./security');
const mailer = require('./mailer');
const media = require('./media');

const ROOT = path.join(__dirname, '..');
const PROD = process.env.NODE_ENV === 'production';
const SESSION_TTL = 1000 * 60 * 60 * 12; // 12 hours
const COOKIE = 'mmx_session';

const STATUSES = ['new', 'contacted', 'follow_up', 'site_visit', 'quoted', 'won', 'lost'];
const CLOSED = new Set(['won', 'lost']);
const TYPES = {
  quote: 'Request a quotation', survey: 'Free site survey', callback: 'Call-back request',
  support: 'AMC / service support', brochure: 'Brochure request', partner: 'Vendor / partner', general: 'General enquiry',
};

const store = createStore();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

/* ---------------- security headers ---------------- */
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  if (PROD && req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

/* ---------------- static website (whitelist) ---------------- */
const PAGES = new Set(['index', 'about', 'services', 'industries', 'stories', 'clients', 'work', 'contact', 'login']);
// admin-uploaded replacement images / brochure are served in place of the originals
app.use(media.serveOverrides);
app.use('/assets', express.static(path.join(ROOT, 'assets'), { maxAge: 0, etag: true }));
for (const dir of ['css', 'js']) app.use('/' + dir, express.static(path.join(ROOT, dir), { maxAge: '7d' }));
app.use('/brochure', express.static(path.join(ROOT, 'brochure'), { maxAge: 0, index: 'brochure.html' }));
app.use('/portal', express.static(path.join(ROOT, 'portal'), { maxAge: 0 }));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(ROOT, 'favicon.ico'), { maxAge: '7d' }));
app.get('/:page.html', (req, res, next) => (PAGES.has(req.params.page) ? res.sendFile(path.join(ROOT, req.params.page + '.html')) : next()));
app.get('/brochure', (req, res) => res.redirect('/assets/Motamax-Company-Profile.pdf'));

/* ---------------- api plumbing ---------------- */
app.use('/api', express.json({ limit: '64kb' }));

// CSRF guard: state-changing API calls must be JSON and same-origin
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path === '/media' && req.method === 'PUT') {
    // binary upload: require an explicit same-origin Origin header instead of a JSON body
    try { if (new URL(req.get('origin') || '').host === req.get('host')) return next(); } catch { /* fall through */ }
    return res.status(403).json({ error: 'Cross-origin upload blocked' });
  }
  if (!req.is('application/json')) return res.status(415).json({ error: 'JSON body required' });
  const origin = req.get('origin');
  if (origin) {
    const host = req.get('host');
    try { if (new URL(origin).host !== host) return res.status(403).json({ error: 'Cross-origin request blocked' }); } catch { return res.status(403).json({ error: 'Bad origin' }); }
  }
  next();
});

const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const setSession = (res, token, maxAge) => res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge, path: '/' });

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, message) => Object.assign(new Error(message), { status });

async function currentUser(req) {
  const s = sec.readSession(cookies(req)[COOKIE]);
  if (!s) return null;
  const u = await store.get('users', s.uid);
  return u && u.active ? u : null;
}
const requireUser = wrap(async (req, res, next) => {
  const u = await currentUser(req);
  if (!u) throw fail(401, 'Please log in');
  req.user = u; next();
});
const requireAdmin = (req, res, next) => (req.user?.role === 'admin' ? next() : next(fail(403, 'Admins only')));
const publicUser = (u) => ({ id: u.id, name: u.name, username: u.username || '', email: u.email || '', suspendedAt: u.suspendedAt || null, phone: u.phone || '', role: u.role, active: u.active, superAdmin: Boolean(u.superAdmin), createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null });

/* simple in-memory rate limiter */
function limiter(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip; const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Too many requests. Please try again a little later.' });
    arr.push(now); hits.set(key, arr); next();
  };
}

const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
const cleanMultiline = (v, max = 4000) => String(v ?? '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim().slice(0, max);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const cleanUsername = (v) => String(v ?? '').trim().toLowerCase();
const isUsername = (v) => /^[a-z0-9][a-z0-9._-]{2,31}$/.test(v);
const now = () => new Date().toISOString();

/* ---------------- public: enquiries ---------------- */
app.post('/api/enquiries', limiter(8, 10 * 60 * 1000), wrap(async (req, res) => {
  const b = req.body || {};
  if (b.company_website) return res.json({ ok: true, ref: 'MMX' }); // honeypot: silently accept bots
  const type = TYPES[b.type] ? b.type : 'general';
  const e = {
    name: clean(b.name, 120), org: clean(b.org, 160), email: clean(b.email, 160).toLowerCase(), phone: clean(b.phone, 40),
    city: clean(b.city, 80), interest: clean(b.interest, 160), preferredTime: clean(b.preferredTime, 80),
    message: cleanMultiline(b.message, 4000), source: clean(b.source, 120),
  };
  if (!e.name) throw fail(400, 'Please enter your name.');
  if (!e.phone && !e.email) throw fail(400, 'Please enter a phone number or email so we can reach you.');
  if (e.email && !isEmail(e.email)) throw fail(400, 'Please enter a valid email address.');
  if (type === 'brochure' && !e.email) throw fail(400, 'Please enter your email to receive the brochure.');

  const created = await createEnquiry({ ...e, type }, { id: null, name: 'Website' }, 'website');

  // brochure requests are answered automatically when email is configured
  if (type === 'brochure') {
    const s = await mailer.loadSettings(store);
    if (s.autoBrochure && mailer.isConfigured(s)) {
      const subject = 'Motamax India — Company Profile';
      const text = `Dear ${e.name},\n\nThank you for your interest in Motamax India. Please find our company profile attached.\n\nWe deliver end-to-end Solution Architecture, Automation and Infrastructure Development — from requirement analysis to commissioning and maintenance.\n\nOur team will be glad to discuss your requirement. Simply reply to this email or call +91 99380 41356.\n\nWarm regards,`;
      mailer.send(store, { to: e.email, subject, text, attachBrochure: true })
        .then((r) => logEmail(created.id, { by: null, byName: 'Auto-reply', to: e.email, subject, attachBrochure: true, ok: true, savedToSent: r.savedToSent }))
        .catch((err) => logEmail(created.id, { by: null, byName: 'Auto-reply', to: e.email, subject, attachBrochure: true, ok: false, error: err.message }));
    }
  }
  res.status(201).json({ ok: true, ref: created.ref });
}));

async function createEnquiry(e, actor, channel) {
  const seq = await store.nextSeq('enquiry');
  const yy = String(new Date().getFullYear()).slice(2);
  const doc = {
    id: sec.newId(), ref: `MMX-${yy}-${String(seq).padStart(4, '0')}`,
    ...e, typeLabel: TYPES[e.type], channel,
    status: 'new', priority: 'normal', assigneeId: null, assigneeName: null, claimedAt: null,
    followUpAt: null, firstContactAt: null, createdAt: now(), updatedAt: now(),
    history: [{ at: now(), by: actor.id, byName: actor.name, action: 'created', note: channel === 'website' ? `Submitted from ${e.source || 'website'}` : 'Added by staff' }],
    emails: [],
  };
  return store.insert('enquiries', doc);
}

async function logEmail(id, entry) {
  await store.update('enquiries', id, (d) => {
    d.emails = d.emails || [];
    d.emails.push({ at: now(), ...entry });
    d.history.push({ at: now(), by: entry.by, byName: entry.byName, action: entry.ok ? 'email_sent' : 'email_failed', note: `${entry.subject} → ${entry.to}${entry.attachBrochure ? ' (brochure attached)' : ''}${entry.error ? ' — ' + entry.error : ''}` });
    d.updatedAt = now();
    return d;
  });
}

/* ---------------- auth ---------------- */
app.post('/api/auth/login', limiter(10, 5 * 60 * 1000), wrap(async (req, res) => {
  const login = clean(req.body?.login ?? req.body?.email, 160).toLowerCase();
  const password = String(req.body?.password || '');
  const users = await store.all('users');
  const u = login && users.find((x) => x.email === login || x.username === login);
  if (!u || !sec.verifyPassword(password, u.passHash)) throw fail(401, 'Incorrect username/email or password.');
  if (!u.active) throw fail(403, 'This account is suspended. Please contact your administrator.');
  await store.update('users', u.id, (d) => { d.lastLoginAt = now(); return d; });
  const ttl = req.body?.remember ? SESSION_TTL * 14 : SESSION_TTL;
  setSession(res, sec.signSession({ uid: u.id }, ttl), ttl);
  res.json({ user: publicUser(u) });
}));
app.post('/api/auth/logout', (req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });
app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }));
app.post('/api/auth/password', requireUser, wrap(async (req, res) => {
  const { current, next } = req.body || {};
  if (!sec.verifyPassword(current, req.user.passHash)) throw fail(400, 'Current password is incorrect.');
  if (String(next || '').length < 8) throw fail(400, 'New password must be at least 8 characters.');
  await store.update('users', req.user.id, (d) => { d.passHash = sec.hashPassword(next); return d; });
  res.json({ ok: true });
}));

/* ---------------- enquiries (staff) ---------------- */
const canSee = (u, e) => u.role === 'admin' || !e.assigneeId || e.assigneeId === u.id;
const canEdit = (u, e) => u.role === 'admin' || e.assigneeId === u.id;
const summary = (e) => {
  const { history, emails, ...rest } = e;
  return { ...rest, emailCount: (emails || []).length, lastActivityAt: history?.[history.length - 1]?.at || e.createdAt };
};

app.get('/api/enquiries', requireUser, wrap(async (req, res) => {
  const scope = req.query.scope || (req.user.role === 'admin' ? 'all' : 'mine');
  const q = clean(req.query.q, 80).toLowerCase();
  let list = (await store.all('enquiries')).filter((e) => canSee(req.user, e));
  if (scope === 'pool') list = list.filter((e) => !e.assigneeId && !CLOSED.has(e.status));
  if (scope === 'mine') list = list.filter((e) => e.assigneeId === req.user.id);
  if (req.query.status) list = list.filter((e) => e.status === req.query.status);
  if (req.query.type) list = list.filter((e) => e.type === req.query.type);
  if (req.query.assignee) list = list.filter((e) => (req.query.assignee === 'none' ? !e.assigneeId : e.assigneeId === req.query.assignee));
  if (q) list = list.filter((e) => [e.ref, e.name, e.org, e.email, e.phone, e.city, e.interest, e.message].join(' ').toLowerCase().includes(q));
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ enquiries: list.map(summary) });
}));

app.post('/api/enquiries/manual', requireUser, wrap(async (req, res) => {
  const b = req.body || {};
  const type = TYPES[b.type] ? b.type : 'general';
  const e = { name: clean(b.name, 120), org: clean(b.org, 160), email: clean(b.email, 160).toLowerCase(), phone: clean(b.phone, 40), city: clean(b.city, 80), interest: clean(b.interest, 160), preferredTime: clean(b.preferredTime, 80), message: cleanMultiline(b.message), source: clean(b.source || 'Phone / walk-in', 120), type };
  if (!e.name || (!e.phone && !e.email)) throw fail(400, 'Name and a phone or email are required.');
  let doc = await createEnquiry(e, req.user, 'manual');
  if (b.claim) doc = await claim(doc.id, req.user);
  res.status(201).json({ enquiry: doc });
}));

app.get('/api/enquiries/export.csv', requireUser, requireAdmin, wrap(async (req, res) => {
  const list = (await store.all('enquiries')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const cols = ['ref', 'createdAt', 'typeLabel', 'status', 'assigneeName', 'claimedAt', 'name', 'org', 'phone', 'email', 'city', 'interest', 'preferredTime', 'followUpAt', 'source', 'message'];
  const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  // neutralise spreadsheet formulas
  const safe = (v) => { const s = String(v ?? ''); return /^[=+\-@]/.test(s) ? "'" + s : s; };
  const csv = [cols.join(','), ...list.map((e) => cols.map((c) => cell(safe(e[c]))).join(','))].join('\n');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="motamax-enquiries-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + csv);
}));

app.get('/api/enquiries/:id', requireUser, wrap(async (req, res) => {
  const e = await store.get('enquiries', req.params.id);
  if (!e || !canSee(req.user, e)) throw fail(404, 'Enquiry not found');
  res.json({ enquiry: e });
}));

async function claim(id, user) {
  let conflict = null;
  const doc = await store.update('enquiries', id, (d) => {
    if (d.assigneeId && d.assigneeId !== user.id) { conflict = d.assigneeName; return null; }
    if (d.assigneeId === user.id) return d;
    d.assigneeId = user.id; d.assigneeName = user.name; d.claimedAt = now(); d.updatedAt = now();
    d.history.push({ at: now(), by: user.id, byName: user.name, action: 'claimed', note: `Taken into ${user.name}'s bucket` });
    return d;
  });
  if (conflict) throw fail(409, `Already taken by ${conflict}.`);
  if (!doc) throw fail(404, 'Enquiry not found');
  return doc;
}

app.post('/api/enquiries/:id/claim', requireUser, wrap(async (req, res) => res.json({ enquiry: await claim(req.params.id, req.user) })));

app.post('/api/enquiries/:id/release', requireUser, wrap(async (req, res) => {
  let denied = false;
  const doc = await store.update('enquiries', req.params.id, (d) => {
    if (!canEdit(req.user, d)) { denied = true; return null; }
    if (!d.assigneeId) return d;
    d.history.push({ at: now(), by: req.user.id, byName: req.user.name, action: 'released', note: `Returned to open pool from ${d.assigneeName}'s bucket` });
    d.assigneeId = null; d.assigneeName = null; d.claimedAt = null; d.updatedAt = now();
    return d;
  });
  if (denied) throw fail(403, 'Only the owner or an admin can release this enquiry.');
  if (!doc) throw fail(404, 'Enquiry not found');
  res.json({ enquiry: doc });
}));

app.post('/api/enquiries/:id/assign', requireUser, requireAdmin, wrap(async (req, res) => {
  const target = await store.get('users', String(req.body?.userId || ''));
  if (!target || !target.active) throw fail(400, 'Choose an active user.');
  const doc = await store.update('enquiries', req.params.id, (d) => {
    d.history.push({ at: now(), by: req.user.id, byName: req.user.name, action: 'assigned', note: `Assigned to ${target.name}${d.assigneeName ? ` (was ${d.assigneeName})` : ''}` });
    d.assigneeId = target.id; d.assigneeName = target.name; d.claimedAt = now(); d.updatedAt = now();
    return d;
  });
  if (!doc) throw fail(404, 'Enquiry not found');
  res.json({ enquiry: doc });
}));

app.patch('/api/enquiries/:id', requireUser, wrap(async (req, res) => {
  const b = req.body || {};
  let denied = false;
  const doc = await store.update('enquiries', req.params.id, (d) => {
    if (!canEdit(req.user, d)) { denied = true; return null; }
    const note = cleanMultiline(b.note, 2000);
    const entry = { at: now(), by: req.user.id, byName: req.user.name, action: 'updated' };
    if (b.status && STATUSES.includes(b.status) && b.status !== d.status) {
      entry.action = 'status'; entry.from = d.status; entry.to = b.status;
      if (!d.firstContactAt && b.status !== 'new') d.firstContactAt = now();
      d.status = b.status;
    }
    if (b.followUpAt !== undefined) d.followUpAt = b.followUpAt ? new Date(b.followUpAt).toISOString() : null;
    if (b.priority && ['low', 'normal', 'high'].includes(b.priority)) d.priority = b.priority;
    if (note) entry.note = note;
    if (entry.action === 'updated' && !note && b.followUpAt === undefined && !b.priority) return d;
    if (b.followUpAt) entry.note = [entry.note, `Follow-up on ${new Date(b.followUpAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}`].filter(Boolean).join(' · ');
    d.history.push(entry); d.updatedAt = now();
    return d;
  });
  if (denied) throw fail(403, 'Take this enquiry into your bucket before updating it.');
  if (!doc) throw fail(404, 'Enquiry not found');
  res.json({ enquiry: doc });
}));

app.delete('/api/enquiries/:id', requireUser, requireAdmin, wrap(async (req, res) => {
  await store.remove('enquiries', req.params.id); res.json({ ok: true });
}));

app.post('/api/enquiries/:id/email', requireUser, wrap(async (req, res) => {
  const e = await store.get('enquiries', req.params.id);
  if (!e || !canSee(req.user, e)) throw fail(404, 'Enquiry not found');
  if (!canEdit(req.user, e)) throw fail(403, 'Take this enquiry into your bucket before emailing.');
  const to = clean(req.body?.to || e.email, 160);
  const subject = clean(req.body?.subject, 200);
  const text = cleanMultiline(req.body?.body, 8000);
  if (!isEmail(to)) throw fail(400, 'This enquiry has no valid email address.');
  if (!subject || !text) throw fail(400, 'Subject and message are required.');
  try {
    const r = await mailer.send(store, { to, subject, text, attachBrochure: Boolean(req.body?.attachBrochure), senderName: req.user.name, replyTo: req.user.email });
    await logEmail(e.id, { by: req.user.id, byName: req.user.name, to, subject, attachBrochure: Boolean(req.body?.attachBrochure), ok: true, savedToSent: r.savedToSent });
    if (e.status === 'new' && canEdit(req.user, e)) {
      await store.update('enquiries', e.id, (d) => { d.status = 'contacted'; d.firstContactAt ||= now(); d.history.push({ at: now(), by: req.user.id, byName: req.user.name, action: 'status', from: 'new', to: 'contacted', note: 'Auto-updated after email' }); return d; });
    }
    res.json({ ok: true, savedToSent: r.savedToSent, imapError: r.imapError, enquiry: await store.get('enquiries', e.id) });
  } catch (err) {
    if (err.status) throw err;
    await logEmail(e.id, { by: req.user.id, byName: req.user.name, to, subject, attachBrochure: Boolean(req.body?.attachBrochure), ok: false, error: err.message });
    throw fail(502, 'Email could not be sent: ' + err.message);
  }
}));

/* ---------------- stats ---------------- */
function buildStats(list, users) {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  const byType = Object.fromEntries(Object.keys(TYPES).map((t) => [t, 0]));
  for (const e of list) { byStatus[e.status] = (byStatus[e.status] || 0) + 1; byType[e.type] = (byType[e.type] || 0) + 1; }
  const won = byStatus.won, lost = byStatus.lost;
  const days = 30; const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
  const trend = Array.from({ length: days }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return { date: d.toISOString().slice(0, 10), created: 0, won: 0 }; });
  const idx = (iso) => Math.floor((new Date(iso) - start) / 86400000);
  for (const e of list) {
    const i = idx(e.createdAt); if (i >= 0 && i < days) trend[i].created++;
    const w = e.history?.find((h) => h.action === 'status' && h.to === 'won');
    if (w) { const j = idx(w.at); if (j >= 0 && j < days) trend[j].won++; }
  }
  const byUser = users.filter((u) => u.role === 'telecaller' || list.some((e) => e.assigneeId === u.id)).map((u) => {
    const mine = list.filter((e) => e.assigneeId === u.id);
    const st = Object.fromEntries(STATUSES.map((s) => [s, mine.filter((e) => e.status === s).length]));
    const resp = mine.filter((e) => e.firstContactAt && e.claimedAt).map((e) => (new Date(e.firstContactAt) - new Date(e.claimedAt)) / 3600000).filter((h) => h >= 0);
    const closed = st.won + st.lost;
    return { id: u.id, name: u.name, role: u.role, active: u.active, total: mine.length, open: mine.length - closed, byStatus: st, conversion: closed ? Math.round((st.won / closed) * 100) : null, avgFirstResponseHrs: resp.length ? +(resp.reduce((a, b) => a + b, 0) / resp.length).toFixed(1) : null, followUpsDue: mine.filter((e) => e.followUpAt && !CLOSED.has(e.status) && new Date(e.followUpAt) <= new Date()).length };
  });
  const recent = list.flatMap((e) => (e.history || []).filter((h) => ['claimed', 'assigned', 'released', 'status'].includes(h.action)).map((h) => ({ ...h, ref: e.ref, enquiryId: e.id, name: e.name, currentStatus: e.status, assigneeName: e.assigneeName })))
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
  return {
    totals: { total: list.length, unassigned: list.filter((e) => !e.assigneeId && !CLOSED.has(e.status)).length, inProgress: list.filter((e) => e.assigneeId && !CLOSED.has(e.status)).length, won, lost, conversion: won + lost ? Math.round((won / (won + lost)) * 100) : null, followUpsDue: list.filter((e) => e.followUpAt && !CLOSED.has(e.status) && new Date(e.followUpAt) <= new Date()).length },
    byStatus, byType, typeLabels: TYPES, trend, byUser, recent,
  };
}

app.get('/api/stats', requireUser, wrap(async (req, res) => {
  const all = await store.all('enquiries');
  const users = await store.all('users');
  if (req.user.role === 'admin') return res.json(buildStats(all, users));
  const mine = all.filter((e) => e.assigneeId === req.user.id);
  const s = buildStats(mine, [req.user]);
  s.totals.unassigned = all.filter((e) => !e.assigneeId && !CLOSED.has(e.status)).length;
  res.json(s);
}));

app.get('/api/meta', requireUser, (req, res) => res.json({ statuses: STATUSES, types: TYPES }));

/* ---------------- users (admin) ---------------- */
app.get('/api/users', requireUser, wrap(async (req, res) => {
  const users = (await store.all('users')).sort((a, b) => a.name.localeCompare(b.name));
  // telecallers see only names (for display); admins get full records
  res.json({ users: req.user.role === 'admin' ? users.map(publicUser) : users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, role: u.role })) });
}));
// Super admin: anyone. Admin: tele-callers only. The super admin account can only be managed by itself.
const canManage = (actor, target) => {
  if (target.superAdmin) return actor.id === target.id;
  if (actor.superAdmin) return true;
  return target.role === 'telecaller' || actor.id === target.id;
};
async function releaseOpenEnquiries(userDoc, actor, reason) {
  let released = 0;
  for (const e of await store.all('enquiries')) {
    if (e.assigneeId !== userDoc.id || CLOSED.has(e.status)) continue;
    await store.update('enquiries', e.id, (d) => {
      d.history.push({ at: now(), by: actor.id, byName: actor.name, action: 'released', note: `Returned to open pool - ${userDoc.name} ${reason}` });
      d.assigneeId = null; d.assigneeName = null; d.claimedAt = null; d.updatedAt = now();
      return d;
    });
    released++;
  }
  return released;
}

app.post('/api/users', requireUser, requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  const email = clean(b.email, 160).toLowerCase();
  const username = cleanUsername(b.username);
  if (!clean(b.name)) throw fail(400, 'Name is required.');
  if (!username && !email) throw fail(400, 'Give the user a username or an email to log in with.');
  if (username && !isUsername(username)) throw fail(400, 'Username: 3-32 characters, letters, numbers, dot, dash or underscore.');
  if (email && !isEmail(email)) throw fail(400, 'Please enter a valid email address.');
  if (String(b.password || '').length < 8) throw fail(400, 'Password must be at least 8 characters.');
  if (b.role === 'admin' && !req.user.superAdmin) throw fail(403, 'Only the super admin can create admin accounts.');
  const all = await store.all('users');
  if (username && all.some((u) => u.username === username || u.email === username)) throw fail(409, 'This username is already taken.');
  if (email && all.some((u) => u.email === email || u.username === email)) throw fail(409, 'A user with this email already exists.');
  const u = { id: sec.newId(), name: clean(b.name, 120), username, email, phone: clean(b.phone, 40), role: b.role === 'admin' ? 'admin' : 'telecaller', active: true, passHash: sec.hashPassword(b.password), createdAt: now() };
  await store.insert('users', u);
  res.status(201).json({ user: publicUser(u) });
}));
app.patch('/api/users/:id', requireUser, requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  const target = await store.get('users', req.params.id);
  if (!target) throw fail(404, 'User not found');
  if (!canManage(req.user, target)) throw fail(403, target.superAdmin ? 'The super admin account can only be changed by the super admin.' : 'Only the super admin can manage admin accounts.');
  if (target.superAdmin && (b.active === false || (b.role && b.role !== 'admin'))) throw fail(400, 'The super admin cannot be suspended or demoted.');
  if (req.params.id === req.user.id && (b.active === false || (b.role && b.role !== 'admin'))) throw fail(400, 'You cannot deactivate or demote your own account.');
  if (b.role === 'admin' && target.role !== 'admin' && !req.user.superAdmin) throw fail(403, 'Only the super admin can make someone an admin.');
  if (b.password !== undefined && String(b.password).length < 8) throw fail(400, 'Password must be at least 8 characters.');
  const lc = (v) => clean(v, 160).toLowerCase();
  if (b.email && !isEmail(lc(b.email))) throw fail(400, 'Please enter a valid email address.');
  if (b.username && !isUsername(cleanUsername(b.username))) throw fail(400, 'Username: 3-32 characters, letters, numbers, dot, dash or underscore.');
  const others = (await store.all('users')).filter((u) => u.id !== req.params.id);
  if (b.username && others.some((u) => u.username === cleanUsername(b.username) || u.email === cleanUsername(b.username))) throw fail(409, 'This username is already taken.');
  if (b.email && others.some((u) => u.email === lc(b.email) || u.username === lc(b.email))) throw fail(409, 'A user with this email already exists.');
  const doc = await store.update('users', req.params.id, (u) => {
    if (b.name) u.name = clean(b.name, 120);
    if (b.phone !== undefined) u.phone = clean(b.phone, 40);
    if (b.username !== undefined) u.username = cleanUsername(b.username);
    if (b.email !== undefined) u.email = lc(b.email);
    if (!u.username && !u.email) return null;
    if (b.role && ['admin', 'telecaller'].includes(b.role) && !u.superAdmin) u.role = b.role;
    if (typeof b.active === 'boolean' && b.active !== u.active && !u.superAdmin) {
      u.active = b.active;
      u.suspendedAt = b.active ? null : now();
      u.suspendedBy = b.active ? null : req.user.name;
    }
    if (b.password) u.passHash = sec.hashPassword(b.password);
    return u;
  });
  if (!doc) throw fail(400, 'The user would be left without a username or email.');
  const released = b.active === false && b.releaseOpen ? await releaseOpenEnquiries(doc, req.user, 'was suspended') : 0;
  res.json({ user: publicUser(doc), released });
}));
app.delete('/api/users/:id', requireUser, requireAdmin, wrap(async (req, res) => {
  if (!req.user.superAdmin) throw fail(403, 'Only the super admin can delete users.');
  const target = await store.get('users', req.params.id);
  if (!target) throw fail(404, 'User not found');
  if (target.superAdmin || target.id === req.user.id) throw fail(400, 'The super admin account cannot be deleted.');
  const released = await releaseOpenEnquiries(target, req.user, 'was deleted');
  await store.remove('users', target.id);
  res.json({ ok: true, released });
}));

/* ---------------- site settings (loader, badges) + visitor counter ---------------- */
const LOADER_STYLES = ['orbit', 'pulse', 'curtain', 'progress', 'ripple', 'flip', 'typewriter', 'tiles', 'particles', 'spotlight', 'zoom-nav'];
const LOGO_ANIMS = ['spin-in', 'bounce', 'flip-y', 'heartbeat', 'glow', 'swing', 'blur-in', 'float', 'shimmer', 'elastic'];
const FREQUENCIES = ['always', 'session', 'off'];
const BADGE_POSITIONS = ['hero', 'footer', 'float-left', 'float-right', 'banner', 'contact', 'hidden'];
const DEFAULT_SITE = {
  loader: { style: 'zoom-nav', logoAnim: 'elastic', frequency: 'session', minMs: 1400 },
  badges: [
    { id: 'badge-1', label: 'Services emblem (gold)', position: 'hero', source: 'badge', enabled: true },
    { id: 'badge-2', label: 'Solution Architect badge', position: 'footer', source: 'badge', enabled: true },
  ],
  showVisitors: true,
};
async function loadSite() {
  const doc = (await store.get('settings', 'site')) || {};
  const saved = Object.fromEntries((doc.badges || []).filter((b) => b && b.id).map((b) => [b.id, b]));
  const badges = DEFAULT_SITE.badges.map((b) => {
    const s = saved[b.id] || {};
    return { ...b, ...Object.fromEntries(Object.entries(s).filter(([k]) => ['position', 'source', 'enabled'].includes(k))) };
  });
  return { loader: { ...DEFAULT_SITE.loader, ...(doc.loader || {}) }, badges, showVisitors: doc.showVisitors ?? DEFAULT_SITE.showVisitors };
}
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
async function visitorCounts() {
  const v = (await store.get('settings', 'visitors')) || {};
  return { total: v.unique || 0, pageviews: v.pageviews || 0, today: (v.days || {})[todayKey()] || 0 };
}
app.get('/api/site', wrap(async (req, res) => {
  const s = await loadSite();
  res.set('Cache-Control', 'no-cache');
  res.json({ ...s, visitors: s.showVisitors ? await visitorCounts() : null, options: { styles: LOADER_STYLES, logoAnims: LOGO_ANIMS, frequencies: FREQUENCIES, positions: BADGE_POSITIONS } });
}));
app.put('/api/site', requireUser, requireAdmin, wrap(async (req, res) => {
  if (!req.user.superAdmin) throw fail(403, 'Only the super admin can change site appearance.');
  const b = req.body || {};
  const cur = await loadSite();
  const loader = { ...cur.loader };
  const lb = b.loader || {};
  if (LOADER_STYLES.includes(lb.style)) loader.style = lb.style;
  if (LOGO_ANIMS.includes(lb.logoAnim)) loader.logoAnim = lb.logoAnim;
  if (FREQUENCIES.includes(lb.frequency)) loader.frequency = lb.frequency;
  if (lb.minMs !== undefined && Number.isFinite(+lb.minMs)) loader.minMs = Math.max(600, Math.min(6000, Math.round(+lb.minMs)));
  const incoming = Object.fromEntries((b.badges || []).filter((x) => x && x.id).map((x) => [x.id, x]));
  const badges = cur.badges.map((bd) => {
    const x = incoming[bd.id] || {};
    return {
      id: bd.id,
      position: BADGE_POSITIONS.includes(x.position) ? x.position : bd.position,
      source: ['badge', 'logo'].includes(x.source) ? x.source : bd.source,
      enabled: typeof x.enabled === 'boolean' ? x.enabled : bd.enabled,
    };
  });
  const doc = { id: 'site', loader, badges, showVisitors: b.showVisitors !== undefined ? Boolean(b.showVisitors) : cur.showVisitors };
  if (await store.get('settings', 'site')) await store.update('settings', 'site', () => doc); else await store.insert('settings', doc);
  res.json(await loadSite());
}));
const BOT_RE = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python-requests/i;
app.post('/api/visit', limiter(60, 60 * 1000), wrap(async (req, res) => {
  const ua = req.get('user-agent') || '';
  if (!ua || BOT_RE.test(ua)) return res.json(await visitorCounts());
  const isNew = !cookies(req).mmx_vid;
  const day = todayKey();
  if (!(await store.get('settings', 'visitors'))) await store.insert('settings', { id: 'visitors', unique: 0, pageviews: 0, days: {} }).catch(() => {});
  await store.update('settings', 'visitors', (d) => {
    d.pageviews = (d.pageviews || 0) + 1;
    if (isNew) {
      d.unique = (d.unique || 0) + 1;
      d.days = d.days || {};
      d.days[day] = (d.days[day] || 0) + 1;
      for (const k of Object.keys(d.days).sort().slice(0, -90)) delete d.days[k];
    }
    return d;
  });
  if (isNew) res.cookie('mmx_vid', sec.newId(), { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 1000 * 60 * 60 * 24 * 365, path: '/' });
  res.json(await visitorCounts());
}));

/* ---------------- media (admin) ---------------- */
app.get('/api/media', requireUser, requireAdmin, (req, res) => res.json({ slots: media.registry().map(media.describe) }));
app.put('/api/media', requireUser, requireAdmin, express.raw({ type: () => true, limit: '25mb' }), (req, res, next) => {
  try {
    const slot = media.findSlot(req.query.path);
    if (!slot) throw fail(404, 'Unknown media item');
    if (!req.body?.length) throw fail(400, 'Empty file');
    res.json({ slot: media.save(slot, req.body) });
  } catch (e) { next(e); }
});
app.delete('/api/media', requireUser, requireAdmin, (req, res, next) => {
  const slot = media.findSlot(req.query.path);
  if (!slot) return next(fail(404, 'Unknown media item'));
  res.json({ slot: media.restore(slot) });
});

/* ---------------- mail settings (admin) ---------------- */
app.get('/api/settings/mail', requireUser, wrap(async (req, res) => {
  const s = await mailer.loadSettings(store);
  if (req.user.role !== 'admin') return res.json({ configured: mailer.isConfigured(s) });
  res.json(mailer.publicSettings(s));
}));
app.put('/api/settings/mail', requireUser, requireAdmin, wrap(async (req, res) => res.json(mailer.publicSettings(await mailer.saveSettings(store, req.body || {})))));
app.post('/api/settings/mail/test', requireUser, requireAdmin, wrap(async (req, res) => {
  try {
    const v = await mailer.verify(store);
    const to = clean(req.body?.to || req.user.email, 160);
    let sent = null;
    if (isEmail(to)) sent = await mailer.send(store, { to, subject: 'Motamax portal — test email', text: `This is a test email from the Motamax enquiry portal.\n\nIf you can read this, SMTP is working.`, senderName: req.user.name });
    res.json({ ok: true, ...v, sentTo: sent ? to : null, savedToSent: sent?.savedToSent || false, imapError: sent?.imapError || null });
  } catch (e) { throw fail(e.status || 502, e.message); }
}));

/* ---------------- errors ---------------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  if (req.path.startsWith('/api')) return res.status(status).json({ error: status >= 500 && !err.status ? 'Something went wrong' : err.message });
  res.status(status).send(err.message);
});
app.use((req, res) => res.status(404).sendFile(path.join(ROOT, 'index.html')));

/* ---------------- start ---------------- */
/* Creates the admin account named in the environment if it doesn't exist yet.
   It never overwrites an existing account, so a password changed in the portal is kept. */
async function bootstrapAdmin() {
  const users = await store.all('users');
  const username = cleanUsername(process.env.ADMIN_USERNAME);
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  // the environment-defined admin is always the super admin (password is never overwritten)
  const existing = users.find((u) => (username && u.username === username) || (email && u.email === email));
  if (existing) {
    if (!existing.superAdmin || existing.role !== 'admin' || !existing.active) {
      await store.update('users', existing.id, (d) => ({ ...d, superAdmin: true, role: 'admin', active: true, suspendedAt: null }));
    }
    return;
  }
  if ((!username && !email) || !password) {
    if (!users.length) console.warn('[setup] No users yet. Set ADMIN_USERNAME (or ADMIN_EMAIL) and ADMIN_PASSWORD to create the first admin account.');
    return;
  }
  await store.insert('users', { id: sec.newId(), name: process.env.ADMIN_NAME || 'Administrator', username, email, phone: '', role: 'admin', superAdmin: true, active: true, passHash: sec.hashPassword(password), createdAt: now() });
  console.log(`[setup] Created admin account ${username || email}`);
}

(async () => {
  await store.init();
  await bootstrapAdmin();
  const port = Number(process.env.PORT) || 5510;
  app.listen(port, () => console.log(`Motamax server on http://localhost:${port} (store: ${store.kind})`));
})().catch((e) => { console.error(e); process.exit(1); });
