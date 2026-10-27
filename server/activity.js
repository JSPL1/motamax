'use strict';
/* Login and website-visit activity: device/browser detection, client IP, capped logs and a summary (mirrors pyserver/activity.py). */
const net = require('net');
const geoip = require('./geoip');

const LOGIN_CAP = 1000; const VISIT_CAP = 5000; const VISIT_DAYS = 30;
const SEEN_EVERY_MS = 120 * 1000;
const iso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

function parseUa(ua = '', touch = 0) {
  const ver = (re) => { const m = ua.match(re); return m ? ' ' + m[1] : ''; };
  let browser;
  if (/Edg(A|iOS)?\//.test(ua)) browser = 'Edge' + ver(/Edg(?:A|iOS)?\/(\d+)/);
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera' + ver(/OPR\/(\d+)/);
  else if (ua.includes('SamsungBrowser/')) browser = 'Samsung Internet' + ver(/SamsungBrowser\/(\d+)/);
  else if (ua.includes('UCBrowser/')) browser = 'UC Browser';
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = 'Firefox' + ver(/(?:Firefox|FxiOS)\/(\d+)/);
  else if (ua.includes('CriOS/')) browser = 'Chrome' + ver(/CriOS\/(\d+)/);
  else if (ua.includes('Chrome/')) browser = 'Chrome' + ver(/Chrome\/(\d+)/);
  else if (ua.includes('Safari/') && ua.includes('Version/')) browser = 'Safari' + ver(/Version\/(\d+)/);
  else if (/MSIE|Trident\//.test(ua)) browser = 'Internet Explorer';
  else browser = 'Other';

  const macTouch = ua.includes('Macintosh') && Number(touch) > 1; // iPads ask for the desktop site and look like a Mac
  let os;
  if (ua.includes('iPad') || macTouch) os = 'iPadOS' + ver(/OS (\d+)_/);
  else if (/iPhone|iPod/.test(ua)) os = 'iOS' + ver(/OS (\d+)_/);
  else if (ua.includes('Android')) os = 'Android' + ver(/Android (\d+)/);
  else if (ua.includes('Windows')) { const nt = (ua.match(/Windows NT (\d+\.\d+)/) || [])[1]; os = { '10.0': 'Windows 10/11', 6.3: 'Windows 8.1', 6.2: 'Windows 8', 6.1: 'Windows 7' }[nt] || 'Windows'; }
  else if (ua.includes('CrOS')) os = 'ChromeOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else os = 'Other';

  let device = 'Desktop';
  if (ua.includes('iPad') || macTouch || ua.includes('Tablet') || (ua.includes('Android') && !ua.includes('Mobile'))) device = 'Tablet';
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) device = 'Mobile';
  return { browser, os, device };
}

// Chrome hides the real OS version and phone model in its user agent; the page sends them as client hints
function applyHints(info, b = {}) {
  const model = String(b.model || '').replace(/[^A-Za-z0-9 ._()+-]/g, '').slice(0, 40).trim();
  const pv = String(b.osv || ''); const m = pv.match(/^(\d+)/);
  if (m) {
    const major = Number(m[1]);
    if (info.os.startsWith('Android')) info.os = `Android ${major}`;
    else if (info.os.startsWith('Windows')) info.os = major >= 13 ? 'Windows 11' : 'Windows 10';
    else if (info.os === 'macOS' && major >= 10) info.os = `macOS ${major}`;
  }
  if (model) info.model = model;
  return info;
}

// X-Forwarded-For is only trusted when the direct peer is a local proxy
function clientIp(req) {
  let peer = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  const local = net.isIP(peer) && (/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(peer) || peer === '::1' || /^f[cd]/i.test(peer));
  if (local) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (fwd.length) peer = fwd[fwd.length - 1];
  }
  return peer.slice(0, 45);
}

async function append(store, docId, key, entry, cap, maxDays) {
  if (!(await store.get('settings', docId))) await store.insert('settings', { id: docId, [key]: [] }).catch(() => {});
  await store.update('settings', docId, (d) => {
    let items = [...(d[key] || []), entry];
    if (maxDays) { const cut = iso(new Date(Date.now() - maxDays * 864e5)); items = items.filter((x) => (x.at || '') >= cut); }
    d[key] = items.slice(-cap);
    return d;
  });
}

async function recordLogin(store, req, user, login, ok, reason = '') {
  const ip = clientIp(req);
  const info = { at: iso(), ip, geo: geoip.locate(ip), ...parseUa(req.get('user-agent') || '') };
  await append(store, 'loginlog', 'events', { ...info, ok, reason, login: String(login).slice(0, 80), userId: user ? user.id : null, name: user ? user.name : '' }, LOGIN_CAP);
  if (user && ok) await store.update('users', user.id, (d) => ({ ...d, lastLoginAt: info.at, lastSeenAt: info.at, lastLogin: info, loginCount: (d.loginCount || 0) + 1 }));
}

async function touchSeen(store, user) {
  const last = Date.parse(user.lastSeenAt || '');
  if (!last || Date.now() - last >= SEEN_EVERY_MS) await store.update('users', user.id, (d) => ({ ...d, lastSeenAt: iso() }));
}

async function recordVisit(store, req, vid, isNew, b = {}, user = null) {
  let page = String(b.page || '/').slice(0, 80);
  if (!/^\/[A-Za-z0-9._/-]*$/.test(page) || page === '/') page = '/index.html';
  const m = String(b.ref || '').match(/^https?:\/\/([^/:?#]+)/);
  let ref = m ? m[1].toLowerCase().slice(0, 80) : '';
  if (ref && ref.endsWith(String(req.hostname || '').toLowerCase())) ref = ''; // moving between our own pages
  const ip = clientIp(req);
  const entry = {
    at: iso(), vid: String(vid || '').slice(0, 10), new: Boolean(isNew), ip, geo: geoip.locate(ip),
    ...applyHints(parseUa(req.get('user-agent') || '', Number(b.touch) || 0), b), page, ref,
    lang: String(b.lang || '').replace(/[^A-Za-z-]/g, '').slice(0, 12),
    tz: String(b.tz || '').replace(/[^A-Za-z0-9_/+-]/g, '').slice(0, 40),
    scr: String(b.scr || '').replace(/[^0-9x]/g, '').slice(0, 12),
  };
  if (user) { entry.userId = user.id; entry.name = user.name; } // one of our own team browsing the site while signed in
  await append(store, 'visitlog', 'visits', entry, VISIT_CAP, VISIT_DAYS);
}

function summary(visits, tzOffsetMin = 330) {
  const shift = tzOffsetMin * 60000;
  const day = (at) => { const t = Date.parse(at || ''); return Number.isNaN(t) ? '' : new Date(t + shift).toISOString().slice(0, 10); };
  const today = new Date(Date.now() + shift).toISOString().slice(0, 10);
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() + shift - (13 - i) * 864e5).toISOString().slice(0, 10));
  const perDay = Object.fromEntries(days.map((d) => [d, { views: 0, people: new Set() }]));
  for (const v of visits) { const d = perDay[day(v.at)]; if (d) { d.views += 1; d.people.add(v.vid || v.ip); } }
  const todays = visits.filter((v) => day(v.at) === today);
  // versions are dropped so "Chrome 129" and "Chrome 130" count together
  const top = (key, n = 6) => {
    const c = new Map();
    for (const v of visits) { const k = String(v[key] || 'Unknown').replace(/ [\d./]+$/, ''); c.set(k, (c.get(k) || 0) + 1); }
    return [...c].sort((a, b) => b[1] - a[1]).slice(0, n);
  };
  const count = (list) => { const c = new Map(); for (const k of list) c.set(k, (c.get(k) || 0) + 1); return [...c].sort((a, b) => b[1] - a[1]).slice(0, 6); };
  const refs = new Map(); for (const v of visits) if (v.ref) refs.set(v.ref, (refs.get(v.ref) || 0) + 1);
  return {
    views30: visits.length, people30: new Set(visits.map((v) => v.vid || v.ip)).size,
    viewsToday: todays.length, peopleToday: new Set(todays.map((v) => v.vid || v.ip)).size,
    devices: top('device', 3), browsers: top('browser'), os: top('os'), pages: top('page'),
    places: count(visits.map((v) => [v.geo?.city, v.geo?.region].filter(Boolean).join(', ')).filter(Boolean)),
    countries: count(visits.map((v) => v.geo?.country).filter(Boolean)),
    refs: [...refs].sort((a, b) => b[1] - a[1]).slice(0, 5),
    days: days.map((d) => ({ day: d, views: perDay[d].views, people: perDay[d].people.size })),
  };
}

module.exports = { parseUa, clientIp, recordLogin, touchSeen, recordVisit, summary };
