'use strict';
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { encrypt, decrypt } = require('./security');
const media = require('./media');

const ROOT = path.join(__dirname, '..');
// admin-uploaded replacements (Media page) take priority over the files in the repository
const BROCHURE = () => media.resolveFile('assets/Motamax-Company-Profile.pdf');
const LOGO = () => media.resolveFile('assets/motamax-logo.png');

const DEFAULTS = {
  smtp: { host: '', port: 587, secure: false, user: '', pass: '', fromName: 'Motamax India', fromEmail: '', replyTo: '' },
  imap: { enabled: false, host: '', port: 993, secure: true, user: '', pass: '', sentFolder: 'Sent' },
  autoBrochure: true,
};

async function loadSettings(store) {
  const doc = (await store.get('settings', 'mail')) || { id: 'mail' };
  return {
    smtp: { ...DEFAULTS.smtp, ...(doc.smtp || {}) },
    imap: { ...DEFAULTS.imap, ...(doc.imap || {}) },
    autoBrochure: doc.autoBrochure ?? DEFAULTS.autoBrochure,
  };
}

/* Public view: never return passwords, only whether one is stored. */
function publicSettings(s) {
  const strip = (o) => { const { pass, ...rest } = o; return { ...rest, hasPassword: Boolean(pass) }; };
  return { smtp: strip(s.smtp), imap: strip(s.imap), autoBrochure: s.autoBrochure, configured: isConfigured(s) };
}

/* Merge an update from the settings form. Empty password fields keep the stored password. */
async function saveSettings(store, input) {
  const cur = await loadSettings(store);
  const pick = (src, keys) => Object.fromEntries(keys.filter((k) => src && src[k] !== undefined).map((k) => [k, src[k]]));
  const smtp = { ...cur.smtp, ...pick(input.smtp, ['host', 'port', 'secure', 'user', 'fromName', 'fromEmail', 'replyTo']) };
  const imap = { ...cur.imap, ...pick(input.imap, ['enabled', 'host', 'port', 'secure', 'user', 'sentFolder']) };
  if (input.smtp?.pass) smtp.pass = encrypt(input.smtp.pass);
  if (input.imap?.pass) imap.pass = encrypt(input.imap.pass);
  smtp.port = Number(smtp.port) || 587; imap.port = Number(imap.port) || 993;
  smtp.secure = Boolean(smtp.secure); imap.secure = Boolean(imap.secure); imap.enabled = Boolean(imap.enabled);
  const doc = { id: 'mail', smtp, imap, autoBrochure: input.autoBrochure ?? cur.autoBrochure };
  if (await store.get('settings', 'mail')) await store.update('settings', 'mail', () => doc);
  else await store.insert('settings', doc);
  return loadSettings(store);
}

const isConfigured = (s) => Boolean(s.smtp.host && s.smtp.user && s.smtp.pass && (s.smtp.fromEmail || s.smtp.user));

function transportFor(s) {
  return nodemailer.createTransport({
    host: s.smtp.host, port: s.smtp.port, secure: s.smtp.secure,
    auth: { user: s.smtp.user, pass: decrypt(s.smtp.pass) },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
}

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Branded HTML wrapper; body is plain text written by the sender (line breaks preserved). */
function renderHtml(bodyText, senderName) {
  const paras = esc(bodyText).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#EEF2F8;font-family:Segoe UI,Arial,sans-serif;color:#0B1030">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F8;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#23246E;padding:18px 24px"><img src="cid:mmx-logo" alt="Motamax India" height="44" style="background:#fff;border-radius:22px;padding:4px 12px;display:block"></td></tr>
    <tr><td style="height:4px;background:linear-gradient(90deg,#1A9BD7,#8E5CF5,#E3342F,#FF9F0A,#22B45A)"></td></tr>
    <tr><td style="padding:28px 28px 8px;font-size:15px;line-height:1.6">${paras}</td></tr>
    <tr><td style="padding:0 28px 24px;font-size:14px;color:#3D4766">${senderName ? esc(senderName) + '<br>' : ''}<b>Motamax India Private Limited</b><br>
      Plot No-199(P)202/611, Gajapati Nagar, Bhubaneswar, Odisha – 751005<br>
      +91 99380 41356 · <a href="mailto:info@motamaxindia.com" style="color:#1A9BD7">info@motamaxindia.com</a> · <a href="https://www.motamaxindia.com" style="color:#1A9BD7">www.motamaxindia.com</a></td></tr>
    <tr><td style="background:#F4F6FB;padding:14px 28px;font-size:12px;color:#6B7591">Solution Architecture · Automation · Infrastructure Development — ISO 9001:2015 · MSME · DPIIT #startupindia</td></tr>
  </table></td></tr></table></body></html>`;
}

async function appendToSent(s, raw) {
  const { ImapFlow } = require('imapflow');
  const client = new ImapFlow({
    host: s.imap.host, port: s.imap.port, secure: s.imap.secure,
    auth: { user: s.imap.user || s.smtp.user, pass: decrypt(s.imap.pass) || decrypt(s.smtp.pass) },
    logger: false,
  });
  await client.connect();
  try { await client.append(s.imap.sentFolder || 'Sent', raw, ['\\Seen']); } finally { await client.logout().catch(() => {}); }
}

/**
 * Send an email using the stored SMTP settings.
 * Returns { messageId, savedToSent, imapError }.
 */
async function send(store, { to, subject, text, attachBrochure, senderName, replyTo }) {
  const s = await loadSettings(store);
  if (!isConfigured(s)) { const e = new Error('Email is not set up yet. Ask an admin to add SMTP details in Mail settings.'); e.status = 400; throw e; }
  const from = { name: s.smtp.fromName || 'Motamax India', address: s.smtp.fromEmail || s.smtp.user };
  const attachments = [{ filename: 'motamax-logo.png', path: LOGO(), cid: 'mmx-logo' }];
  if (attachBrochure && fs.existsSync(BROCHURE())) attachments.push({ filename: 'Motamax-Company-Profile.pdf', path: BROCHURE(), contentType: 'application/pdf' });
  const mail = { from, to, subject, text, html: renderHtml(text, senderName), attachments, replyTo: replyTo || s.smtp.replyTo || undefined };

  const info = await transportFor(s).sendMail(mail);
  let savedToSent = false, imapError = null;
  if (s.imap.enabled && s.imap.host) {
    try {
      const raw = await new MailComposer({ ...mail, messageId: info.messageId, date: new Date() }).compile().build();
      await appendToSent(s, raw);
      savedToSent = true;
    } catch (e) { imapError = e.message; }
  }
  return { messageId: info.messageId, savedToSent, imapError };
}

async function verify(store) {
  const s = await loadSettings(store);
  if (!isConfigured(s)) throw Object.assign(new Error('Fill in SMTP host, username and password first.'), { status: 400 });
  await transportFor(s).verify();
  let imap = null;
  if (s.imap.enabled && s.imap.host) {
    const { ImapFlow } = require('imapflow');
    const client = new ImapFlow({ host: s.imap.host, port: s.imap.port, secure: s.imap.secure, auth: { user: s.imap.user || s.smtp.user, pass: decrypt(s.imap.pass) || decrypt(s.smtp.pass) }, logger: false });
    await client.connect();
    const list = await client.list();
    await client.logout().catch(() => {});
    imap = { folders: list.map((f) => f.path) };
  }
  return { smtp: 'ok', imap };
}

module.exports = { loadSettings, publicSettings, saveSettings, isConfigured, send, verify, BROCHURE };
