'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* Secret used to sign sessions and encrypt stored SMTP/IMAP passwords.
   Production must set SESSION_SECRET; locally a random one is kept in data/.secret. */
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production');
  }
  const file = path.join(__dirname, '..', 'data', '.secret');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'));
  return fs.readFileSync(file, 'utf8').trim();
}
const SECRET = loadSecret();
const ENC_KEY = crypto.createHash('sha256').update('mmx-enc:' + SECRET).digest();
const SIGN_KEY = crypto.createHash('sha256').update('mmx-sign:' + SECRET).digest();

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const hash = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
}

function signSession(payload, ttlMs) {
  const body = b64u(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }));
  const sig = b64u(crypto.createHmac('sha256', SIGN_KEY).update(body).digest());
  return `${body}.${sig}`;
}
function readSession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = b64u(crypto.createHmac('sha256', SIGN_KEY).update(body).digest());
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}

function encrypt(text) {
  if (text == null || text === '') return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `gcm$${b64u(iv)}$${b64u(c.getAuthTag())}$${b64u(enc)}`;
}
function decrypt(blob) {
  if (!blob || !blob.startsWith('gcm$')) return '';
  const [, iv, tag, data] = blob.split('$');
  const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

const newId = () => crypto.randomBytes(9).toString('base64url');

module.exports = { hashPassword, verifyPassword, signSession, readSession, encrypt, decrypt, newId };
