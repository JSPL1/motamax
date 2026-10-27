'use strict';
/*
 * IP -> location from a local DB-IP "city lite" database (MaxMind MMDB format); mirrors pyserver/geoip.py.
 * File: DATA_DIR/geo/dbip-city-lite.mmdb. Without it lookups return null. IP geolocation by DB-IP (https://db-ip.com), CC BY 4.0.
 */
const fs = require('fs');
const net = require('net');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const GEO_FILE = path.join(DATA_DIR, 'geo', 'dbip-city-lite.mmdb');
const META = Buffer.from('abcdef4d61784d696e642e636f6d', 'hex');

class Reader {
  constructor(file) {
    this.buf = fs.readFileSync(file);
    this.mtime = fs.statSync(file).mtimeMs;
    const start = this.buf.lastIndexOf(META);
    if (start < 0) throw new Error('not an MMDB file');
    const ms = start + META.length;
    [this.meta] = this.decode(ms, ms);
    this.nodes = this.meta.node_count; this.rs = this.meta.record_size;
    this.nodeBytes = (this.rs * 2) / 8;
    this.dataStart = this.nodes * this.nodeBytes + 16;
    this.v4Start = 0;
    if (this.meta.ip_version === 6) { let n = 0; for (let i = 0; i < 96 && n < this.nodes; i++) n = this.record(n, 0); this.v4Start = n; }
  }

  record(node, bit) {
    const b = this.buf; const o = node * this.nodeBytes;
    if (this.rs === 24) return b.readUIntBE(o + bit * 3, 3);
    if (this.rs === 28) return bit === 0 ? ((b[o + 3] & 0xf0) << 20) | b.readUIntBE(o, 3) : ((b[o + 3] & 0x0f) << 24) | b.readUIntBE(o + 4, 3);
    return b.readUInt32BE(o + bit * 4);
  }

  lookup(ip) {
    let bytes;
    if (net.isIPv4(ip)) bytes = ip.split('.').map(Number);
    else {
      const [head, tail = ''] = ip.split('::');
      const h = head ? head.split(':') : []; const t = tail ? tail.split(':') : [];
      const groups = [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
      bytes = groups.flatMap((g) => { const v = parseInt(g || '0', 16); return [v >> 8, v & 255]; });
    }
    let node = bytes.length === 4 ? this.v4Start : 0;
    for (let i = 0; i < bytes.length * 8 && node < this.nodes; i++) node = this.record(node, (bytes[i >> 3] >> (7 - (i & 7))) & 1);
    if (node <= this.nodes) return null; // == node_count means "no data"
    return this.decode(node - this.nodes - 16 + this.dataStart, this.dataStart)[0];
  }

  size(off, s) {
    const b = this.buf;
    if (s < 29) return [s, off];
    if (s === 29) return [29 + b[off], off + 1];
    if (s === 30) return [285 + b.readUInt16BE(off), off + 2];
    return [65821 + b.readUIntBE(off, 3), off + 3];
  }

  decode(off, base) {
    const b = this.buf; const ctrl = b[off++]; let type = ctrl >> 5;
    if (type === 1) { // pointer
      const ss = (ctrl >> 3) & 3; const v = ctrl & 7; let p;
      if (ss === 0) { p = (v << 8) | b[off]; off += 1; }
      else if (ss === 1) { p = ((v << 16) | b.readUInt16BE(off)) + 2048; off += 2; }
      else if (ss === 2) { p = (v * 0x1000000 + b.readUIntBE(off, 3)) + 526336; off += 3; }
      else { p = b.readUInt32BE(off); off += 4; }
      return [this.decode(base + p, base)[0], off];
    }
    if (type === 0) type = 7 + b[off++];
    let size; [size, off] = this.size(off, ctrl & 0x1f);
    switch (type) {
      case 2: return [b.toString('utf8', off, off + size), off + size];
      case 7: { const o = {}; for (let i = 0; i < size; i++) { let k; [k, off] = this.decode(off, base); [o[k], off] = this.decode(off, base); } return [o, off]; }
      case 11: { const a = []; for (let i = 0; i < size; i++) { let v; [v, off] = this.decode(off, base); a.push(v); } return [a, off]; }
      case 5: case 6: case 9: case 10: { let n = 0; for (let i = 0; i < size; i++) n = n * 256 + b[off + i]; return [n, off + size]; }
      case 8: return [size === 4 ? b.readInt32BE(off) : (size ? b.readUIntBE(off, size) : 0), off + size];
      case 3: return [b.readDoubleBE(off), off + 8];
      case 15: return [b.readFloatBE(off), off + 4];
      case 14: return [Boolean(size), off];
      case 4: return [b.subarray(off, off + size), off + size];
      default: return [null, off];
    }
  }
}

let reader = null;
function getReader() {
  let mtime;
  try { mtime = fs.statSync(GEO_FILE).mtimeMs; } catch { return null; }
  if (!reader || reader.mtime !== mtime) { try { reader = new Reader(GEO_FILE); } catch { reader = null; } } // reopen after the monthly refresh
  return reader;
}

const PRIVATE = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd]|fe80)/i;
function locate(ip) {
  if (!net.isIP(ip || '') || PRIVATE.test(ip)) return null;
  let rec;
  try { const r = getReader(); rec = r ? r.lookup(ip) : null; } catch { return null; }
  if (!rec) return null;
  const en = (x) => ((x || {}).names || {}).en || '';
  const out = { city: en(rec.city).slice(0, 60), region: en((rec.subdivisions || [{}])[0]).slice(0, 60), country: en(rec.country).slice(0, 60), cc: ((rec.country || {}).iso_code || '').slice(0, 2) };
  return Object.values(out).some(Boolean) ? out : null;
}

module.exports = { locate, GEO_FILE };
