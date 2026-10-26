'use strict';
/*
 * Replaceable website media.
 * Admins upload a new file for a "slot" (an existing asset path such as assets/site/e1.jpg).
 * Uploads are kept in <DATA_DIR>/media/<slot path> and served instead of the original,
 * so the repository files stay untouched and "Restore original" just deletes the override.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');

const SITE_LABELS = {
  e1: 'Substation structure', e2: 'Pole-mounted transformer', e3: 'Overhead line work', e4: 'Transformer installation',
  e5: 'Site electrical works', e6: 'Street lighting pole', e7: 'Electrical control panel', e8: 'Distribution panel',
  i1: 'Fibre splice enclosure', i2: 'Aerial cabling', i3: 'Biometric / access terminal', i4: 'Site survey',
  i5: 'Solar-powered CCTV', i6: 'Weighbridge automation layout', i7: 'CCTV monitoring station', i8: 'Pole-mounted cameras',
  i9: 'Smart switch panel', i10: 'Tower installation', i11: 'Network rack', i12: 'Wall-mounted network equipment',
  i13: 'Network cabinet', i14: 'Cable tray routing', i15: 'Site corridor works', i16: 'Excavation',
  i17: 'Trenching', i18: 'Road corridor route', i19: 'Drilling site', i20: 'HDD rig',
};
const pretty = (s) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function registry() {
  const slots = [
    { path: 'assets/motamax-logo.png', group: 'brand', label: 'Website logo', kind: 'image', usedIn: 'Menu, footer, login, emails' },
    { path: 'brochure/motamax-logo@4x.png', group: 'brand', label: 'Brochure logo (print)', kind: 'image', usedIn: 'Every brochure page' },
    { path: 'assets/badges/badge-1.webp', group: 'brand', label: 'Badge 1 — services emblem', kind: 'image', usedIn: 'Floating brand badge (position set in Site settings)' },
    { path: 'assets/badges/badge-2.webp', group: 'brand', label: 'Badge 2 — solution architect', kind: 'image', usedIn: 'Floating brand badge (position set in Site settings)' },
    { path: 'assets/icons/mark.png', group: 'brand', label: 'Logo mark (loader & favicon art)', kind: 'image', usedIn: 'Page loading animation' },
    { path: 'assets/icons/icon-32.png', group: 'brand', label: 'Browser tab icon (32×32)', kind: 'image', usedIn: 'Browser tab (favicon)' },
    { path: 'assets/icons/icon-192.png', group: 'brand', label: 'App icon (192×192)', kind: 'image', usedIn: 'Android home screen, bookmarks' },
    { path: 'assets/icons/icon-512.png', group: 'brand', label: 'App icon (512×512)', kind: 'image', usedIn: 'Install / splash icon' },
    { path: 'assets/icons/apple-touch-icon.png', group: 'brand', label: 'iPhone home-screen icon (180×180)', kind: 'image', usedIn: 'iOS home screen' },
    { path: 'assets/Motamax-Company-Profile.pdf', group: 'brochure', label: 'Company profile (PDF)', kind: 'pdf', usedIn: 'Download buttons, brochure emails' },
  ];
  const list = (dir) => (fs.existsSync(path.join(ROOT, dir)) ? fs.readdirSync(path.join(ROOT, dir)) : []);
  list('assets/site').filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .forEach((f) => { const id = f.replace(/\.\w+$/, ''); slots.push({ path: `assets/site/${f}`, group: 'site', label: SITE_LABELS[id] || pretty(id), kind: 'image', usedIn: id.startsWith('e') ? 'Gallery · Electrical' : 'Gallery, stories, brochure' }); });
  list('assets/clients').filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort()
    .forEach((f) => slots.push({ path: `assets/clients/${f}`, group: 'clients', label: pretty(f.replace(/\.\w+$/, '')), kind: 'image', usedIn: 'Client logos (site + brochure)' }));
  return slots;
}

/* Identify a file by its first bytes; never trust the uploaded name or header. */
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

/* Read pixel size from PNG / JPEG / WebP headers (no image library needed). */
function dimensions(buf, type) {
  try {
    if (type === 'image/png') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (type === 'image/webp') {
      const chunk = buf.slice(12, 16).toString('ascii');
      if (chunk === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (chunk === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
    }
    if (type === 'image/jpeg') {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1]; const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        i += 2 + len;
      }
    }
  } catch { /* unreadable header */ }
  return null;
}

const overridePath = (slot) => path.join(MEDIA_DIR, slot);
const findSlot = (p) => registry().find((s) => s.path === String(p || '').replace(/^\/+/, ''));

function describe(slot) {
  const over = overridePath(slot.path);
  const file = fs.existsSync(over) ? over : path.join(ROOT, slot.path);
  let size = 0, dims = null, updatedAt = null;
  if (fs.existsSync(file)) {
    const st = fs.statSync(file); size = st.size; updatedAt = st.mtime.toISOString();
    if (slot.kind === 'image') {
      const fd = fs.openSync(file, 'r'); const head = Buffer.alloc(Math.min(size, 256 * 1024)); fs.readSync(fd, head, 0, head.length, 0); fs.closeSync(fd);
      dims = dimensions(head, sniff(head));
    }
  }
  return { ...slot, overridden: fs.existsSync(over), size, width: dims?.w || null, height: dims?.h || null, updatedAt };
}

function save(slot, buf) {
  const type = sniff(buf);
  if (slot.kind === 'pdf' && type !== 'application/pdf') throw Object.assign(new Error('Please upload a PDF file.'), { status: 400 });
  if (slot.kind === 'image' && !['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw Object.assign(new Error('Please upload a JPG, PNG or WebP image.'), { status: 400 });
  const dest = overridePath(slot.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.uploading';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
  return describe(slot);
}

function restore(slot) {
  const over = overridePath(slot.path);
  if (fs.existsSync(over)) fs.unlinkSync(over);
  return describe(slot);
}

/* Express middleware: serve an uploaded replacement in place of the original file. */
function serveOverrides(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let rel;
  try { rel = decodeURIComponent(req.path).replace(/^\/+/, ''); } catch { return next(); }
  if (!/^(assets|brochure)\//.test(rel) || rel.includes('..')) return next();
  const over = overridePath(rel);
  if (!over.startsWith(MEDIA_DIR) || !fs.existsSync(over)) return next();
  const fd = fs.openSync(over, 'r'); const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
  const type = sniff(head);
  if (!type) return next();
  res.set('Cache-Control', 'no-cache');
  res.type(type);
  res.sendFile(over, { lastModified: true, etag: true });
}

/* Override-aware absolute path for server-side use (e.g. email attachments). */
const resolveFile = (rel) => (fs.existsSync(overridePath(rel)) ? overridePath(rel) : path.join(ROOT, rel));

module.exports = { registry, findSlot, describe, save, restore, serveOverrides, resolveFile, MEDIA_DIR };
