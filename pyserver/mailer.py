"""SMTP sending (with optional IMAP copy to Sent) using only the standard library."""
import html
import imaplib
import os
import smtplib
import ssl
import time
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from . import media
from .security import encrypt, decrypt

DEFAULTS = {
    'smtp': {'host': '', 'port': 587, 'secure': False, 'user': '', 'pass': '', 'fromName': 'Motamax India', 'fromEmail': '', 'replyTo': ''},
    'imap': {'enabled': False, 'host': '', 'port': 993, 'secure': True, 'user': '', 'pass': '', 'sentFolder': 'Sent'},
    'autoBrochure': True,
}


class MailError(Exception):
    def __init__(self, msg, status=502):
        super().__init__(msg)
        self.status = status


def load_settings(store):
    doc = store.get('settings', 'mail') or {}
    return {
        'smtp': {**DEFAULTS['smtp'], **(doc.get('smtp') or {})},
        'imap': {**DEFAULTS['imap'], **(doc.get('imap') or {})},
        'autoBrochure': doc.get('autoBrochure', DEFAULTS['autoBrochure']),
    }


def is_configured(s):
    m = s['smtp']
    return bool(m['host'] and m['user'] and m['pass'] and (m['fromEmail'] or m['user']))


def public_settings(s):
    def strip(o):
        r = {k: v for k, v in o.items() if k != 'pass'}
        r['hasPassword'] = bool(o.get('pass'))
        return r
    return {'smtp': strip(s['smtp']), 'imap': strip(s['imap']), 'autoBrochure': s['autoBrochure'], 'configured': is_configured(s)}


def save_settings(store, data):
    cur = load_settings(store)
    smtp, imap = dict(cur['smtp']), dict(cur['imap'])
    for k in ('host', 'port', 'secure', 'user', 'fromName', 'fromEmail', 'replyTo'):
        if k in (data.get('smtp') or {}):
            smtp[k] = data['smtp'][k]
    for k in ('enabled', 'host', 'port', 'secure', 'user', 'sentFolder'):
        if k in (data.get('imap') or {}):
            imap[k] = data['imap'][k]
    if (data.get('smtp') or {}).get('pass'):
        smtp['pass'] = encrypt(data['smtp']['pass'])
    if (data.get('imap') or {}).get('pass'):
        imap['pass'] = encrypt(data['imap']['pass'])
    try:
        smtp['port'] = int(smtp['port']) or 587
    except (TypeError, ValueError):
        smtp['port'] = 587
    try:
        imap['port'] = int(imap['port']) or 993
    except (TypeError, ValueError):
        imap['port'] = 993
    smtp['secure'] = bool(smtp['secure'])
    imap['secure'] = bool(imap['secure'])
    imap['enabled'] = bool(imap['enabled'])
    doc = {'id': 'mail', 'smtp': smtp, 'imap': imap, 'autoBrochure': data.get('autoBrochure', cur['autoBrochure'])}
    if store.get('settings', 'mail'):
        store.update('settings', 'mail', lambda _: doc)
    else:
        store.insert('settings', doc)
    return load_settings(store)


def render_html(body, sender_name):
    paras = ''.join(f'<p style="margin:0 0 14px">{html.escape(p).replace(chr(10), "<br>")}</p>' for p in body.split('\n\n'))
    sig = (html.escape(sender_name) + '<br>') if sender_name else ''
    return f"""<!doctype html><html><body style="margin:0;background:#EEF2F8;font-family:Segoe UI,Arial,sans-serif;color:#0B1030">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#23246E;padding:18px 24px"><img src="cid:mmx-logo" alt="Motamax India" height="44" style="background:#fff;border-radius:22px;padding:4px 12px;display:block"></td></tr>
<tr><td style="height:4px;background:#1A9BD7"></td></tr>
<tr><td style="padding:28px 28px 8px;font-size:15px;line-height:1.6">{paras}</td></tr>
<tr><td style="padding:0 28px 24px;font-size:14px;color:#3D4766">{sig}<b>Motamax India Private Limited</b><br>
Plot No-199(P)202/611, Gajapati Nagar, Bhubaneswar, Odisha – 751005<br>
+91 99380 41356 · <a href="mailto:info@motamaxindia.com" style="color:#1A9BD7">info@motamaxindia.com</a> · <a href="https://www.motamaxindia.com" style="color:#1A9BD7">www.motamaxindia.com</a></td></tr>
<tr><td style="background:#F4F6FB;padding:14px 28px;font-size:12px;color:#6B7591">Solution Architecture · Automation · Infrastructure Development — ISO 9001:2015 · MSME · DPIIT #startupindia</td></tr>
</table></td></tr></table></body></html>"""


def _smtp(s):
    m = s['smtp']
    ctx = ssl.create_default_context()
    if m['secure']:
        server = smtplib.SMTP_SSL(m['host'], int(m['port']), context=ctx, timeout=30)
    else:
        server = smtplib.SMTP(m['host'], int(m['port']), timeout=30)
        server.ehlo()
        if server.has_extn('starttls'):
            server.starttls(context=ctx)
            server.ehlo()
    server.login(m['user'], decrypt(m['pass']))
    return server


def _imap(s):
    i = s['imap']
    user = i['user'] or s['smtp']['user']
    pw = decrypt(i['pass']) or decrypt(s['smtp']['pass'])
    client = imaplib.IMAP4_SSL(i['host'], int(i['port'])) if i['secure'] else imaplib.IMAP4(i['host'], int(i['port']))
    client.login(user, pw)
    return client


def send(store, to, subject, text, attach_brochure=False, sender_name=None, reply_to=None):
    s = load_settings(store)
    if not is_configured(s):
        raise MailError('Email is not set up yet. Ask an admin to add SMTP details in Mail settings.', 400)
    m = s['smtp']
    msg = EmailMessage()
    msg['From'] = formataddr((m['fromName'] or 'Motamax India', m['fromEmail'] or m['user']))
    msg['To'] = to
    msg['Subject'] = subject
    msg['Message-ID'] = make_msgid(domain=(m['fromEmail'] or m['user']).split('@')[-1])
    if reply_to or m['replyTo']:
        msg['Reply-To'] = reply_to or m['replyTo']
    msg.set_content(text)
    msg.add_alternative(render_html(text, sender_name), subtype='html')
    with open(media.resolve_file('assets/motamax-logo.png'), 'rb') as f:
        msg.get_payload()[1].add_related(f.read(), 'image', 'png', cid='<mmx-logo>', filename='motamax-logo.png')
    if attach_brochure:
        p = media.resolve_file('assets/Motamax-Company-Profile.pdf')
        if os.path.exists(p):
            with open(p, 'rb') as f:
                msg.add_attachment(f.read(), maintype='application', subtype='pdf', filename='Motamax-Company-Profile.pdf')
    try:
        server = _smtp(s)
        try:
            server.send_message(msg)
        finally:
            try:
                server.quit()
            except Exception:
                pass
    except MailError:
        raise
    except Exception as e:
        raise MailError(str(e))
    saved, imap_error = False, None
    if s['imap']['enabled'] and s['imap']['host']:
        try:
            client = _imap(s)
            try:
                client.append(s['imap']['sentFolder'] or 'Sent', '\\Seen', imaplib.Time2Internaldate(time.time()), msg.as_bytes())
                saved = True
            finally:
                client.logout()
        except Exception as e:
            imap_error = str(e)
    return {'messageId': msg['Message-ID'], 'savedToSent': saved, 'imapError': imap_error}


def verify(store):
    s = load_settings(store)
    if not is_configured(s):
        raise MailError('Fill in SMTP host, username and password first.', 400)
    try:
        server = _smtp(s)
        server.quit()
    except Exception as e:
        raise MailError(str(e))
    imap = None
    if s['imap']['enabled'] and s['imap']['host']:
        try:
            client = _imap(s)
            typ, folders = client.list()
            client.logout()
            imap = {'folders': [f.decode(errors='replace') for f in folders or []]}
        except Exception as e:
            raise MailError('IMAP: ' + str(e))
    return {'smtp': 'ok', 'imap': imap}
