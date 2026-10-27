"""
Motamax website + enquiry portal — Python/Flask edition for cPanel "Setup Python App" (Passenger).
Same API as server/server.js (Node), so the website and portal front-ends work unchanged.

Env: DATA_DIR, SESSION_SECRET (optional; generated into DATA_DIR/.secret otherwise),
     MYSQL_HOST/MYSQL_DATABASE/MYSQL_USER/MYSQL_PASSWORD (optional MySQL store),
     ADMIN_NAME / ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD (admin created at start-up if missing).
"""
import csv
import io
import mimetypes
import os
import re
import threading
import time
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse

from .config import ROOT, ACME_WEBROOT, load_dotenv

load_dotenv()

from flask import Flask, request, jsonify, send_file, send_from_directory, redirect, abort, make_response  # noqa: E402
from werkzeug.security import safe_join  # noqa: E402

from . import security as sec  # noqa: E402
from . import activity, geoip, mailer, media  # noqa: E402
from .store import create_store  # noqa: E402

PROD = os.environ.get('NODE_ENV') == 'production' or os.environ.get('APP_ENV') == 'production'
SESSION_TTL = 1000 * 60 * 60 * 12
COOKIE = 'mmx_session'
STATUSES = ['new', 'contacted', 'follow_up', 'site_visit', 'quoted', 'won', 'lost']
CLOSED = {'won', 'lost'}
TYPES = {
    'quote': 'Request a quotation', 'survey': 'Free site survey', 'callback': 'Call-back request',
    'support': 'AMC / service support', 'brochure': 'Brochure request', 'partner': 'Vendor / partner', 'general': 'General enquiry',
}
PAGES = {'index', 'about', 'services', 'industries', 'stories', 'clients', 'work', 'contact', 'login'}

# some hosts lack these in their mime tables; nosniff would then block the images
mimetypes.add_type('image/webp', '.webp')
mimetypes.add_type('image/x-icon', '.ico')
mimetypes.add_type('application/manifest+json', '.webmanifest')

store = create_store()
store.init()
app = Flask(__name__, static_folder=None)
app.config['MAX_CONTENT_LENGTH'] = 26 * 1024 * 1024


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status, self.message = status, message


def now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def parse_iso(s):
    return datetime.fromisoformat(str(s).replace('Z', '+00:00'))


def clean(v, n=200):
    return re.sub(r'[\x00-\x1f\x7f]', ' ', str(v if v is not None else '')).strip()[:n]


def clean_multiline(v, n=4000):
    return re.sub(r'[\x00-\x09\x0b-\x1f\x7f]', ' ', str(v if v is not None else '')).strip()[:n]


def is_email(e):
    return bool(re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$', e or ''))


def clean_username(v):
    return str(v or '').strip().lower()


def is_username(v):
    return bool(re.match(r'^[a-z0-9][a-z0-9._-]{2,31}$', v or ''))


def body():
    return request.get_json(silent=True) or {}


def public_user(u):
    return {'id': u['id'], 'name': u['name'], 'username': u.get('username') or '', 'email': u.get('email') or '',
            'suspendedAt': u.get('suspendedAt'), 'phone': u.get('phone') or '', 'role': u['role'], 'active': u['active'],
            'superAdmin': bool(u.get('superAdmin')),
            'createdAt': u.get('createdAt'), 'lastLoginAt': u.get('lastLoginAt')}


# ---------------- request hooks ----------------
@app.after_request
def headers(resp):
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    resp.headers['X-Frame-Options'] = 'SAMEORIGIN'
    if os.environ.get('FORCE_HTTPS') == '1' and (request.is_secure or request.headers.get('X-Forwarded-Proto') == 'https'):
        resp.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return resp


def same_origin():
    origin = request.headers.get('Origin')
    if not origin:
        return None
    try:
        return urlparse(origin).netloc == request.host
    except Exception:
        return False


@app.before_request
def force_https():
    # FORCE_HTTPS=1 on the live host: send http:// visitors to https:// (but keep Let's Encrypt challenges on http)
    if os.environ.get('FORCE_HTTPS') != '1' or request.path.startswith('/.well-known/acme-challenge/'):
        return None
    proto = request.headers.get('X-Forwarded-Proto', request.scheme)
    if proto == 'https' or request.is_secure:
        return None
    return redirect(request.url.replace('http://', 'https://', 1), code=301)


@app.before_request
def csrf_guard():
    if not request.path.startswith('/api') or request.method in ('GET', 'HEAD', 'OPTIONS'):
        return None
    if request.path == '/api/media' and request.method == 'PUT':
        return None if same_origin() is True else (jsonify(error='Cross-origin upload blocked'), 403)
    if not request.is_json:
        return jsonify(error='JSON body required'), 415
    if same_origin() is False:
        return jsonify(error='Cross-origin request blocked'), 403
    return None


@app.errorhandler(ApiError)
def api_error(e):
    return jsonify(error=e.message), e.status


@app.errorhandler(mailer.MailError)
def mail_error(e):
    return jsonify(error=str(e)), e.status


@app.errorhandler(media.MediaError)
def media_error(e):
    return jsonify(error=str(e)), 400


@app.errorhandler(413)
def too_big(e):
    return jsonify(error='File is too large (max 25 MB).'), 413


@app.errorhandler(Exception)
def unexpected(e):
    from werkzeug.exceptions import HTTPException
    if isinstance(e, HTTPException):
        if request.path.startswith('/api'):
            return jsonify(error=e.description or 'Error'), e.code
        if e.code == 404:
            return send_file(os.path.join(ROOT, 'index.html')), 404
        return e
    app.logger.exception(e)
    if request.path.startswith('/api'):
        return jsonify(error='Something went wrong'), 500
    return 'Something went wrong', 500


# ---------------- auth helpers ----------------
_rl_lock = threading.Lock()
_rl_hits = {}


def rate_limit(key, max_hits, window_s):
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()
    k = f'{key}:{ip}'
    t = time.time()
    with _rl_lock:
        hits = [h for h in _rl_hits.get(k, []) if t - h < window_s]
        if len(hits) >= max_hits:
            raise ApiError(429, 'Too many requests. Please try again a little later.')
        hits.append(t)
        _rl_hits[k] = hits


def current_user():
    s = sec.read_session(request.cookies.get(COOKIE))
    if not s:
        return None
    u = store.get('users', s.get('uid'))
    if not u or not u.get('active'):
        return None
    activity.touch_seen(store, u)
    return u


def require_user():
    u = current_user()
    if not u:
        raise ApiError(401, 'Please log in')
    return u


def require_admin():
    u = require_user()
    if u['role'] != 'admin':
        raise ApiError(403, 'Admins only')
    return u


# ---------------- static website ----------------
def send_static(folder, sub, max_age=0):
    """Serve ROOT/<folder>/<sub>, confined to that folder (rejects '..', backslashes, absolute paths)."""
    sub = str(sub or '')
    parts = sub.replace('\\', '/').split('/')
    if '\\' in sub or any(p in ('..', '') for p in parts) or sub.startswith('/'):
        abort(404)
    rel = f'{folder}/{sub}' if folder else sub
    over = media.override_for_request(rel)
    if over:
        resp = send_file(over[0], mimetype=over[1], conditional=True, max_age=0)
        resp.headers['Cache-Control'] = 'no-cache'
        return resp
    base = os.path.join(ROOT, folder) if folder else ROOT
    full = safe_join(base, sub)
    if not full or not os.path.isfile(full) or not os.path.abspath(full).startswith(os.path.abspath(base) + os.sep):
        abort(404)
    resp = send_file(full, conditional=True, max_age=max_age)
    if not max_age:
        resp.headers['Cache-Control'] = 'no-cache'
    return resp


@app.route('/')
def home():
    return send_static('', 'index.html')


@app.route('/favicon.ico')
def favicon():
    return send_static('', 'favicon.ico', 7 * 86400)


@app.route('/<page>.html')
def page(page):
    if page not in PAGES:
        abort(404)
    return send_static('', page + '.html')


@app.route('/assets/<path:p>')
def assets(p):
    return send_static('assets', p)


@app.route('/css/<path:p>')
def css(p):
    return send_static('css', p, 7 * 86400)


@app.route('/js/<path:p>')
def js(p):
    return send_static('js', p, 7 * 86400)


@app.route('/portal/')
@app.route('/portal/<path:p>')
def portal(p='index.html'):
    return send_static('portal', p)


@app.route('/portal')
def portal_redirect():
    return redirect('/portal/')


@app.route('/brochure')
def brochure_pdf():
    return redirect('/assets/Motamax-Company-Profile.pdf')


@app.route('/brochure/')
@app.route('/brochure/<path:p>')
def brochure(p='brochure.html'):
    return send_static('brochure', p)


@app.route('/.well-known/acme-challenge/<token>')
def acme(token):
    # Let's Encrypt renewals (acme.sh webroot) — keeps auto-renewal working while the app serves the domain
    if not re.match(r'^[A-Za-z0-9_-]+$', token):
        abort(404)
    return send_from_directory(os.path.join(ACME_WEBROOT, '.well-known', 'acme-challenge'), token, mimetype='text/plain')


# ---------------- public enquiries ----------------
def create_enquiry(e, actor, channel):
    seq = store.next_seq('enquiry')
    yy = str(datetime.now().year)[2:]
    doc = {
        'id': sec.new_id(), 'ref': f'MMX-{yy}-{seq:04d}', **e, 'typeLabel': TYPES[e['type']], 'channel': channel,
        'status': 'new', 'priority': 'normal', 'assigneeId': None, 'assigneeName': None, 'claimedAt': None,
        'followUpAt': None, 'firstContactAt': None, 'createdAt': now(), 'updatedAt': now(),
        'history': [{'at': now(), 'by': actor.get('id'), 'byName': actor['name'], 'action': 'created',
                     'note': f"Submitted from {e.get('source') or 'website'}" if channel == 'website' else 'Added by staff'}],
        'emails': [],
    }
    return store.insert('enquiries', doc)


def log_email(eid, entry):
    def fn(d):
        d.setdefault('emails', []).append({'at': now(), **entry})
        note = f"{entry['subject']} → {entry['to']}" + (' (brochure attached)' if entry.get('attachBrochure') else '') + (f" — {entry['error']}" if entry.get('error') else '')
        d['history'].append({'at': now(), 'by': entry.get('by'), 'byName': entry.get('byName'), 'action': 'email_sent' if entry.get('ok') else 'email_failed', 'note': note})
        d['updatedAt'] = now()
        return d
    store.update('enquiries', eid, fn)


@app.post('/api/enquiries')
def public_enquiry():
    rate_limit('enq', 8, 600)
    b = body()
    if b.get('company_website'):
        return jsonify(ok=True, ref='MMX')
    t = b.get('type') if b.get('type') in TYPES else 'general'
    e = {'name': clean(b.get('name'), 120), 'org': clean(b.get('org'), 160), 'email': clean(b.get('email'), 160).lower(),
         'phone': clean(b.get('phone'), 40), 'city': clean(b.get('city'), 80), 'interest': clean(b.get('interest'), 160),
         'preferredTime': clean(b.get('preferredTime'), 80), 'message': clean_multiline(b.get('message')), 'source': clean(b.get('source'), 120)}
    e['visitorId'] = (request.cookies.get('mmx_vid') or '')[:10]  # links website visits to this enquiry
    if not e['name']:
        raise ApiError(400, 'Please enter your name.')
    if not e['phone'] and not e['email']:
        raise ApiError(400, 'Please enter a phone number or email so we can reach you.')
    if e['email'] and not is_email(e['email']):
        raise ApiError(400, 'Please enter a valid email address.')
    if t == 'brochure' and not e['email']:
        raise ApiError(400, 'Please enter your email to receive the brochure.')
    created = create_enquiry({**e, 'type': t}, {'id': None, 'name': 'Website'}, 'website')
    if t == 'brochure':
        s = mailer.load_settings(store)
        if s['autoBrochure'] and mailer.is_configured(s):
            subject = 'Motamax India — Company Profile'
            text = (f"Dear {e['name']},\n\nThank you for your interest in Motamax India. Please find our company profile attached.\n\n"
                    "We deliver end-to-end Solution Architecture, Automation and Infrastructure Development — from requirement analysis to commissioning and maintenance.\n\n"
                    "Our team will be glad to discuss your requirement. Simply reply to this email or call +91 99380 41356.\n\nWarm regards,")

            def bg():
                try:
                    r = mailer.send(store, e['email'], subject, text, attach_brochure=True)
                    log_email(created['id'], {'by': None, 'byName': 'Auto-reply', 'to': e['email'], 'subject': subject, 'attachBrochure': True, 'ok': True, 'savedToSent': r['savedToSent']})
                except Exception as ex:  # noqa: BLE001
                    log_email(created['id'], {'by': None, 'byName': 'Auto-reply', 'to': e['email'], 'subject': subject, 'attachBrochure': True, 'ok': False, 'error': str(ex)})
            threading.Thread(target=bg, daemon=True).start()
    return jsonify(ok=True, ref=created['ref']), 201


# ---------------- auth ----------------
@app.post('/api/auth/login')
def login():
    rate_limit('login', 10, 300)
    b = body()
    login_id = clean(b.get('login', b.get('email')), 160).lower()
    users = store.all('users')
    u = next((x for x in users if login_id and (x.get('email') == login_id or x.get('username') == login_id)), None)
    if not u or not sec.verify_password(str(b.get('password') or ''), u.get('passHash')):
        activity.record_login(store, request, u, login_id, False, 'Wrong password' if u else 'Unknown user')
        raise ApiError(401, 'Incorrect username/email or password.')
    if not u.get('active'):
        activity.record_login(store, request, u, login_id, False, 'Account suspended')
        raise ApiError(403, 'This account is suspended. Please contact your administrator.')
    activity.record_login(store, request, u, login_id, True)
    ttl = SESSION_TTL * 14 if b.get('remember') else SESSION_TTL
    resp = make_response(jsonify(user=public_user(u)))
    resp.set_cookie(COOKIE, sec.sign_session({'uid': u['id']}, ttl), max_age=ttl // 1000, httponly=True, samesite='Lax',
                    secure=request.is_secure or request.headers.get('X-Forwarded-Proto') == 'https', path='/')
    return resp


@app.post('/api/auth/logout')
def logout():
    resp = make_response(jsonify(ok=True))
    resp.delete_cookie(COOKIE, path='/')
    return resp


@app.get('/api/auth/me')
def me():
    return jsonify(user=public_user(require_user()))


@app.post('/api/auth/password')
def change_password():
    u = require_user()
    b = body()
    if not sec.verify_password(str(b.get('current') or ''), u.get('passHash')):
        raise ApiError(400, 'Current password is incorrect.')
    if len(str(b.get('next') or '')) < 8:
        raise ApiError(400, 'New password must be at least 8 characters.')
    store.update('users', u['id'], lambda d: {**d, 'passHash': sec.hash_password(b['next'])})
    return jsonify(ok=True)


# ---------------- enquiries (staff) ----------------
def can_see(u, e):
    return u['role'] == 'admin' or not e.get('assigneeId') or e.get('assigneeId') == u['id']


def can_edit(u, e):
    return u['role'] == 'admin' or e.get('assigneeId') == u['id']


def summary(e):
    r = {k: v for k, v in e.items() if k not in ('history', 'emails')}
    r['emailCount'] = len(e.get('emails') or [])
    r['lastActivityAt'] = (e.get('history') or [{}])[-1].get('at', e['createdAt'])
    return r


@app.get('/api/enquiries')
def list_enquiries():
    u = require_user()
    scope = request.args.get('scope') or ('all' if u['role'] == 'admin' else 'mine')
    q = clean(request.args.get('q'), 80).lower()
    lst = [e for e in store.all('enquiries') if can_see(u, e)]
    if scope == 'pool':
        lst = [e for e in lst if not e.get('assigneeId') and e['status'] not in CLOSED]
    if scope == 'mine':
        lst = [e for e in lst if e.get('assigneeId') == u['id']]
    st, ty, asg = request.args.get('status'), request.args.get('type'), request.args.get('assignee')
    if st:
        lst = [e for e in lst if e['status'] == st]
    if ty:
        lst = [e for e in lst if e['type'] == ty]
    if asg == 'none':
        lst = [e for e in lst if not e.get('assigneeId')]
    elif asg:
        lst = [e for e in lst if e.get('assigneeId') == asg]
    if q:
        lst = [e for e in lst if q in ' '.join(str(e.get(k) or '') for k in ('ref', 'name', 'org', 'email', 'phone', 'city', 'interest', 'message')).lower()]
    lst.sort(key=lambda e: e['createdAt'], reverse=True)
    return jsonify(enquiries=[summary(e) for e in lst])


@app.post('/api/enquiries/manual')
def manual_enquiry():
    u = require_user()
    b = body()
    t = b.get('type') if b.get('type') in TYPES else 'general'
    e = {'name': clean(b.get('name'), 120), 'org': clean(b.get('org'), 160), 'email': clean(b.get('email'), 160).lower(), 'phone': clean(b.get('phone'), 40),
         'city': clean(b.get('city'), 80), 'interest': clean(b.get('interest'), 160), 'preferredTime': clean(b.get('preferredTime'), 80),
         'message': clean_multiline(b.get('message')), 'source': clean(b.get('source') or 'Phone / walk-in', 120), 'type': t}
    if not e['name'] or (not e['phone'] and not e['email']):
        raise ApiError(400, 'Name and a phone or email are required.')
    doc = create_enquiry(e, u, 'manual')
    if b.get('claim'):
        doc = claim(doc['id'], u)
    return jsonify(enquiry=doc), 201


@app.get('/api/enquiries/export.csv')
def export_csv():
    require_admin()
    lst = sorted(store.all('enquiries'), key=lambda e: e['createdAt'])
    cols = ['ref', 'createdAt', 'typeLabel', 'status', 'assigneeName', 'claimedAt', 'name', 'org', 'phone', 'email', 'city', 'interest', 'preferredTime', 'followUpAt', 'source', 'message']

    def safe(v):
        s = '' if v is None else str(v)
        return "'" + s if re.match(r'^[=+\-@]', s) else s
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for e in lst:
        w.writerow([safe(e.get(c)) for c in cols])
    resp = make_response('﻿' + buf.getvalue())
    resp.headers['Content-Type'] = 'text/csv; charset=utf-8'
    resp.headers['Content-Disposition'] = f'attachment; filename="motamax-enquiries-{datetime.now().strftime("%Y-%m-%d")}.csv"'
    return resp


@app.get('/api/enquiries/<eid>')
def get_enquiry(eid):
    u = require_user()
    e = store.get('enquiries', eid)
    if not e or not can_see(u, e):
        raise ApiError(404, 'Enquiry not found')
    return jsonify(enquiry=e)


def claim(eid, u):
    conflict = {}

    def fn(d):
        if d.get('assigneeId') and d['assigneeId'] != u['id']:
            conflict['by'] = d.get('assigneeName')
            return None
        if d.get('assigneeId') == u['id']:
            return d
        d.update(assigneeId=u['id'], assigneeName=u['name'], claimedAt=now(), updatedAt=now())
        d['history'].append({'at': now(), 'by': u['id'], 'byName': u['name'], 'action': 'claimed', 'note': f"Taken into {u['name']}'s bucket"})
        return d
    doc = store.update('enquiries', eid, fn)
    if conflict:
        raise ApiError(409, f"Already taken by {conflict['by']}.")
    if not doc:
        raise ApiError(404, 'Enquiry not found')
    return doc


@app.post('/api/enquiries/<eid>/claim')
def claim_route(eid):
    return jsonify(enquiry=claim(eid, require_user()))


@app.post('/api/enquiries/<eid>/release')
def release(eid):
    u = require_user()
    denied = {}

    def fn(d):
        if not can_edit(u, d):
            denied['x'] = True
            return None
        if not d.get('assigneeId'):
            return d
        d['history'].append({'at': now(), 'by': u['id'], 'byName': u['name'], 'action': 'released', 'note': f"Returned to open pool from {d['assigneeName']}'s bucket"})
        d.update(assigneeId=None, assigneeName=None, claimedAt=None, updatedAt=now())
        return d
    doc = store.update('enquiries', eid, fn)
    if denied:
        raise ApiError(403, 'Only the owner or an admin can release this enquiry.')
    if not doc:
        raise ApiError(404, 'Enquiry not found')
    return jsonify(enquiry=doc)


@app.post('/api/enquiries/<eid>/assign')
def assign(eid):
    u = require_admin()
    target = store.get('users', str(body().get('userId') or ''))
    if not target or not target.get('active'):
        raise ApiError(400, 'Choose an active user.')

    def fn(d):
        was = f" (was {d['assigneeName']})" if d.get('assigneeName') else ''
        d['history'].append({'at': now(), 'by': u['id'], 'byName': u['name'], 'action': 'assigned', 'note': f"Assigned to {target['name']}{was}"})
        d.update(assigneeId=target['id'], assigneeName=target['name'], claimedAt=now(), updatedAt=now())
        return d
    doc = store.update('enquiries', eid, fn)
    if not doc:
        raise ApiError(404, 'Enquiry not found')
    return jsonify(enquiry=doc)


@app.patch('/api/enquiries/<eid>')
def update_enquiry(eid):
    u = require_user()
    b = body()
    denied = {}

    def fn(d):
        if not can_edit(u, d):
            denied['x'] = True
            return None
        note = clean_multiline(b.get('note'), 2000)
        entry = {'at': now(), 'by': u['id'], 'byName': u['name'], 'action': 'updated'}
        if b.get('status') in STATUSES and b['status'] != d['status']:
            entry.update(action='status', **{'from': d['status'], 'to': b['status']})
            if not d.get('firstContactAt') and b['status'] != 'new':
                d['firstContactAt'] = now()
            d['status'] = b['status']
        if 'followUpAt' in b:
            d['followUpAt'] = parse_iso(b['followUpAt']).astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z') if b['followUpAt'] else None
        if b.get('priority') in ('low', 'normal', 'high'):
            d['priority'] = b['priority']
        if note:
            entry['note'] = note
        if entry['action'] == 'updated' and not note and 'followUpAt' not in b and not b.get('priority'):
            return d
        if b.get('followUpAt'):
            ist = parse_iso(b['followUpAt']).astimezone(timezone(timedelta(hours=5, minutes=30)))
            entry['note'] = ' · '.join(x for x in [entry.get('note'), 'Follow-up on ' + ist.strftime('%d %b %Y, %I:%M %p')] if x)
        d['history'].append(entry)
        d['updatedAt'] = now()
        return d
    doc = store.update('enquiries', eid, fn)
    if denied:
        raise ApiError(403, 'Take this enquiry into your bucket before updating it.')
    if not doc:
        raise ApiError(404, 'Enquiry not found')
    return jsonify(enquiry=doc)


@app.delete('/api/enquiries/<eid>')
def delete_enquiry(eid):
    require_admin()
    store.remove('enquiries', eid)
    return jsonify(ok=True)


@app.post('/api/enquiries/<eid>/email')
def email_enquiry(eid):
    u = require_user()
    e = store.get('enquiries', eid)
    if not e or not can_see(u, e):
        raise ApiError(404, 'Enquiry not found')
    if not can_edit(u, e):
        raise ApiError(403, 'Take this enquiry into your bucket before emailing.')
    b = body()
    to = clean(b.get('to') or e.get('email'), 160)
    subject = clean(b.get('subject'), 200)
    text = clean_multiline(b.get('body'), 8000)
    attach = bool(b.get('attachBrochure'))
    if not is_email(to):
        raise ApiError(400, 'This enquiry has no valid email address.')
    if not subject or not text:
        raise ApiError(400, 'Subject and message are required.')
    try:
        r = mailer.send(store, to, subject, text, attach_brochure=attach, sender_name=u['name'], reply_to=u.get('email') or None)
    except mailer.MailError as ex:
        if ex.status == 400:
            raise
        log_email(e['id'], {'by': u['id'], 'byName': u['name'], 'to': to, 'subject': subject, 'attachBrochure': attach, 'ok': False, 'error': str(ex)})
        raise ApiError(502, 'Email could not be sent: ' + str(ex))
    log_email(e['id'], {'by': u['id'], 'byName': u['name'], 'to': to, 'subject': subject, 'attachBrochure': attach, 'ok': True, 'savedToSent': r['savedToSent']})
    if e['status'] == 'new':
        def fn(d):
            d['status'] = 'contacted'
            d['firstContactAt'] = d.get('firstContactAt') or now()
            d['history'].append({'at': now(), 'by': u['id'], 'byName': u['name'], 'action': 'status', 'from': 'new', 'to': 'contacted', 'note': 'Auto-updated after email'})
            return d
        store.update('enquiries', e['id'], fn)
    return jsonify(ok=True, savedToSent=r['savedToSent'], imapError=r['imapError'], enquiry=store.get('enquiries', e['id']))


# ---------------- stats ----------------
def build_stats(lst, users):
    by_status = {s: 0 for s in STATUSES}
    by_type = {t: 0 for t in TYPES}
    for e in lst:
        by_status[e['status']] = by_status.get(e['status'], 0) + 1
        by_type[e['type']] = by_type.get(e['type'], 0) + 1
    won, lost = by_status['won'], by_status['lost']
    days = 30
    start = datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
    trend = [{'date': (start + timedelta(days=i)).strftime('%Y-%m-%d'), 'created': 0, 'won': 0} for i in range(days)]

    def idx(iso):
        return int((parse_iso(iso) - start).total_seconds() // 86400)
    for e in lst:
        i = idx(e['createdAt'])
        if 0 <= i < days:
            trend[i]['created'] += 1
        w = next((h for h in e.get('history', []) if h.get('action') == 'status' and h.get('to') == 'won'), None)
        if w:
            j = idx(w['at'])
            if 0 <= j < days:
                trend[j]['won'] += 1
    nowdt = datetime.now(timezone.utc)

    def due(e):
        return e.get('followUpAt') and e['status'] not in CLOSED and parse_iso(e['followUpAt']) <= nowdt
    by_user = []
    for u in users:
        mine = [e for e in lst if e.get('assigneeId') == u['id']]
        if u['role'] != 'telecaller' and not mine:
            continue
        st = {s: sum(1 for e in mine if e['status'] == s) for s in STATUSES}
        resp = [(parse_iso(e['firstContactAt']) - parse_iso(e['claimedAt'])).total_seconds() / 3600 for e in mine if e.get('firstContactAt') and e.get('claimedAt')]
        resp = [h for h in resp if h >= 0]
        closed = st['won'] + st['lost']
        by_user.append({'id': u['id'], 'name': u['name'], 'role': u['role'], 'active': u['active'], 'total': len(mine), 'open': len(mine) - closed, 'byStatus': st,
                        'conversion': round(st['won'] / closed * 100) if closed else None,
                        'avgFirstResponseHrs': round(sum(resp) / len(resp), 1) if resp else None, 'followUpsDue': sum(1 for e in mine if due(e))})
    recent = []
    for e in lst:
        for h in e.get('history', []):
            if h.get('action') in ('claimed', 'assigned', 'released', 'status'):
                recent.append({**h, 'ref': e['ref'], 'enquiryId': e['id'], 'name': e['name'], 'currentStatus': e['status'], 'assigneeName': e.get('assigneeName')})
    recent.sort(key=lambda h: h['at'], reverse=True)
    return {
        'totals': {'total': len(lst), 'unassigned': sum(1 for e in lst if not e.get('assigneeId') and e['status'] not in CLOSED),
                   'inProgress': sum(1 for e in lst if e.get('assigneeId') and e['status'] not in CLOSED), 'won': won, 'lost': lost,
                   'conversion': round(won / (won + lost) * 100) if won + lost else None, 'followUpsDue': sum(1 for e in lst if due(e))},
        'byStatus': by_status, 'byType': by_type, 'typeLabels': TYPES, 'trend': trend, 'byUser': by_user, 'recent': recent[:20],
    }


@app.get('/api/stats')
def stats():
    u = require_user()
    all_e = store.all('enquiries')
    if u['role'] == 'admin':
        return jsonify(build_stats(all_e, store.all('users')))
    s = build_stats([e for e in all_e if e.get('assigneeId') == u['id']], [u])
    s['totals']['unassigned'] = sum(1 for e in all_e if not e.get('assigneeId') and e['status'] not in CLOSED)
    return jsonify(s)


@app.get('/api/meta')
def meta():
    require_user()
    return jsonify(statuses=STATUSES, types=TYPES)


# ---------------- users ----------------
@app.get('/api/users')
def list_users():
    u = require_user()
    users = sorted(store.all('users'), key=lambda x: x['name'].lower())
    if u['role'] == 'admin':
        return jsonify(users=[public_user(x) for x in users])
    return jsonify(users=[{'id': x['id'], 'name': x['name'], 'role': x['role']} for x in users if x.get('active')])


def can_manage(actor, target):
    """Super admin: anyone. Admin: tele-callers only. The super admin account can only be managed by itself."""
    if target.get('superAdmin'):
        return actor['id'] == target['id']
    if actor.get('superAdmin'):
        return True
    return target['role'] == 'telecaller' or actor['id'] == target['id']


def release_open_enquiries(user_doc, actor, reason):
    released = 0
    for e in store.all('enquiries'):
        if e.get('assigneeId') != user_doc['id'] or e['status'] in CLOSED:
            continue

        def rel(d):
            d['history'].append({'at': now(), 'by': actor['id'], 'byName': actor['name'], 'action': 'released', 'note': f"Returned to open pool - {user_doc['name']} {reason}"})
            d.update(assigneeId=None, assigneeName=None, claimedAt=None, updatedAt=now())
            return d
        store.update('enquiries', e['id'], rel)
        released += 1
    return released


@app.post('/api/users')
def create_user():
    actor = require_admin()
    b = body()
    email = clean(b.get('email'), 160).lower()
    username = clean_username(b.get('username'))
    if not clean(b.get('name')):
        raise ApiError(400, 'Name is required.')
    if not username and not email:
        raise ApiError(400, 'Give the user a username or an email to log in with.')
    if username and not is_username(username):
        raise ApiError(400, 'Username: 3-32 characters, letters, numbers, dot, dash or underscore.')
    if email and not is_email(email):
        raise ApiError(400, 'Please enter a valid email address.')
    if len(str(b.get('password') or '')) < 8:
        raise ApiError(400, 'Password must be at least 8 characters.')
    if b.get('role') == 'admin' and not actor.get('superAdmin'):
        raise ApiError(403, 'Only the super admin can create admin accounts.')
    allu = store.all('users')
    if username and any(x.get('username') == username or x.get('email') == username for x in allu):
        raise ApiError(409, 'This username is already taken.')
    if email and any(x.get('email') == email or x.get('username') == email for x in allu):
        raise ApiError(409, 'A user with this email already exists.')
    u = {'id': sec.new_id(), 'name': clean(b['name'], 120), 'username': username, 'email': email, 'phone': clean(b.get('phone'), 40),
         'role': 'admin' if b.get('role') == 'admin' else 'telecaller', 'active': True, 'passHash': sec.hash_password(b['password']), 'createdAt': now()}
    store.insert('users', u)
    return jsonify(user=public_user(u)), 201


@app.patch('/api/users/<uid>')
def update_user(uid):
    admin = require_admin()
    b = body()
    target = store.get('users', uid)
    if not target:
        raise ApiError(404, 'User not found')
    if not can_manage(admin, target):
        raise ApiError(403, 'The super admin account can only be changed by the super admin.' if target.get('superAdmin') else 'Only the super admin can manage admin accounts.')
    if target.get('superAdmin') and (b.get('active') is False or (b.get('role') and b['role'] != 'admin')):
        raise ApiError(400, 'The super admin cannot be suspended or demoted.')
    if uid == admin['id'] and (b.get('active') is False or (b.get('role') and b['role'] != 'admin')):
        raise ApiError(400, 'You cannot deactivate or demote your own account.')
    if b.get('role') == 'admin' and target['role'] != 'admin' and not admin.get('superAdmin'):
        raise ApiError(403, 'Only the super admin can make someone an admin.')
    if b.get('password') is not None and len(str(b['password'])) < 8:
        raise ApiError(400, 'Password must be at least 8 characters.')
    lc = lambda v: clean(v, 160).lower()  # noqa: E731
    if b.get('email') and not is_email(lc(b['email'])):
        raise ApiError(400, 'Please enter a valid email address.')
    if b.get('username') and not is_username(clean_username(b['username'])):
        raise ApiError(400, 'Username: 3-32 characters, letters, numbers, dot, dash or underscore.')
    others = [x for x in store.all('users') if x['id'] != uid]
    if b.get('username') and any(x.get('username') == clean_username(b['username']) or x.get('email') == clean_username(b['username']) for x in others):
        raise ApiError(409, 'This username is already taken.')
    if b.get('email') and any(x.get('email') == lc(b['email']) or x.get('username') == lc(b['email']) for x in others):
        raise ApiError(409, 'A user with this email already exists.')

    def fn(u):
        if b.get('name'):
            u['name'] = clean(b['name'], 120)
        if 'phone' in b:
            u['phone'] = clean(b['phone'], 40)
        if 'username' in b:
            u['username'] = clean_username(b['username'])
        if 'email' in b:
            u['email'] = lc(b['email'])
        if not u.get('username') and not u.get('email'):
            return None
        if b.get('role') in ('admin', 'telecaller') and not u.get('superAdmin'):
            u['role'] = b['role']
        if isinstance(b.get('active'), bool) and b['active'] != u['active'] and not u.get('superAdmin'):
            u['active'] = b['active']
            u['suspendedAt'] = None if b['active'] else now()
            u['suspendedBy'] = None if b['active'] else admin['name']
        if b.get('password'):
            u['passHash'] = sec.hash_password(b['password'])
        return u
    doc = store.update('users', uid, fn)
    if not doc:
        raise ApiError(400, 'The user would be left without a username or email.')
    released = release_open_enquiries(doc, admin, 'was suspended') if b.get('active') is False and b.get('releaseOpen') else 0
    return jsonify(user=public_user(doc), released=released)


@app.delete('/api/users/<uid>')
def delete_user(uid):
    actor = require_admin()
    if not actor.get('superAdmin'):
        raise ApiError(403, 'Only the super admin can delete users.')
    target = store.get('users', uid)
    if not target:
        raise ApiError(404, 'User not found')
    if target.get('superAdmin') or uid == actor['id']:
        raise ApiError(400, 'The super admin account cannot be deleted.')
    released = release_open_enquiries(target, actor, 'was deleted')
    store.remove('users', uid)
    return jsonify(ok=True, released=released)


# ---------------- media ----------------
@app.get('/api/media')
def list_media():
    require_admin()
    return jsonify(slots=[media.describe(s) for s in media.registry()])


@app.put('/api/media')
def upload_media():
    require_admin()
    slot = media.find_slot(request.args.get('path'))
    if not slot:
        raise ApiError(404, 'Unknown media item')
    data = request.get_data(cache=False)
    if not data:
        raise ApiError(400, 'Empty file')
    return jsonify(slot=media.save(slot, data))


@app.delete('/api/media')
def restore_media():
    require_admin()
    slot = media.find_slot(request.args.get('path'))
    if not slot:
        raise ApiError(404, 'Unknown media item')
    return jsonify(slot=media.restore(slot))


# ---------------- site settings (loader, badges) + visitor counter ----------------
LOADER_STYLES = ['orbit', 'pulse', 'curtain', 'progress', 'ripple', 'flip', 'typewriter', 'tiles', 'particles', 'spotlight', 'zoom-nav']
LOGO_ANIMS = ['spin-in', 'bounce', 'flip-y', 'heartbeat', 'glow', 'swing', 'blur-in', 'float', 'shimmer', 'elastic']
FREQUENCIES = ['always', 'session', 'off']
BADGE_POSITIONS = ['footer', 'contact', 'float-left', 'float-right', 'hidden']
# retired spots (home hero, page banners, the CTA band) now mean hidden
LEGACY_POSITIONS = {'hero': 'hidden', 'banner': 'hidden', 'cta': 'hidden'}
DEFAULT_SITE = {
    'loader': {'style': 'zoom-nav', 'logoAnim': 'elastic', 'frequency': 'session', 'minMs': 1400},
    'badges': [
        {'id': 'badge-1', 'label': 'Services emblem (gold)', 'position': 'hidden', 'source': 'badge', 'enabled': True},
        {'id': 'badge-2', 'label': 'Solution Architect badge', 'position': 'footer', 'source': 'badge', 'enabled': True},
    ],
    'showVisitors': True,
}


def load_site():
    doc = store.get('settings', 'site') or {}
    loader = {**DEFAULT_SITE['loader'], **(doc.get('loader') or {})}
    saved = {b['id']: b for b in (doc.get('badges') or []) if isinstance(b, dict) and b.get('id')}
    badges = [{**b, **{k: v for k, v in saved.get(b['id'], {}).items() if k in ('position', 'source', 'enabled')}} for b in DEFAULT_SITE['badges']]
    for b in badges:
        b['position'] = LEGACY_POSITIONS.get(b['position'], b['position'])
    return {'loader': loader, 'badges': badges, 'showVisitors': doc.get('showVisitors', DEFAULT_SITE['showVisitors'])}


# ---------- social media links (super admin) ----------
SOCIAL_NETWORKS = ['facebook', 'x', 'instagram', 'linkedin', 'youtube', 'whatsapp', 'telegram', 'pinterest', 'threads', 'maps', 'email', 'phone', 'website']
DEFAULT_SOCIAL = {
    'links': [
        {'id': 'facebook', 'network': 'facebook', 'url': 'https://www.facebook.com/', 'label': 'Facebook — Motamax India', 'enabled': True, 'footer': True, 'contact': True},
        {'id': 'x', 'network': 'x', 'url': 'https://x.com/Motamax_bbsr', 'label': 'X — @Motamax_bbsr', 'enabled': True, 'footer': True, 'contact': True},
        {'id': 'whatsapp', 'network': 'whatsapp', 'url': 'https://wa.me/919938041356', 'label': 'WhatsApp', 'enabled': True, 'footer': True, 'contact': True},
    ],
    'chat': {'enabled': True, 'number': '919938041356', 'message': 'Hello Motamax, I have an enquiry.'},
}
SOCIAL_URL = re.compile(r'^(https?://[^\s<>\x22\x27`]+\.[^\s<>\x22\x27`]+|mailto:[^\s<>\x22\x27`@]+@[^\s<>\x22\x27`]+|tel:\+?[\d-]{6,20})$', re.I)


def social_url(network, raw):
    s = str(raw or '').strip()
    digits = re.sub(r'\D', '', s)
    if network == 'email' and '@' in s and not s.lower().startswith('mailto:'):
        s = 'mailto:' + s
    elif network == 'phone' and not s.lower().startswith('tel:') and 6 <= len(digits) <= 15:
        s = 'tel:+' + ('91' + digits if len(digits) == 10 else digits)
    elif network == 'whatsapp' and re.fullmatch(r'[\d\s+()-]{8,}', s):
        s = 'https://wa.me/' + ('91' + digits if len(digits) == 10 else digits)
    elif s and not re.match(r'^[a-z][a-z0-9+.-]*:', s, re.I):
        s = 'https://' + s.lstrip('/')
    return s if len(s) <= 500 and SOCIAL_URL.match(s) else None


def load_social():
    doc = store.get('settings', 'social')
    if not doc:
        return {k: (list(v) if isinstance(v, list) else dict(v)) for k, v in DEFAULT_SOCIAL.items()}
    return {'links': doc.get('links') or [], 'chat': {**DEFAULT_SOCIAL['chat'], **(doc.get('chat') or {})}}


@app.put('/api/social')
def put_social():
    u = require_admin()
    if not u.get('superAdmin'):
        raise ApiError(403, 'Only the super admin can change social media links.')
    b = body()
    links, seen = [], set()
    for i, x in enumerate((b.get('links') or [])[:30]):
        if not isinstance(x, dict):
            continue
        network = x.get('network') if x.get('network') in SOCIAL_NETWORKS else 'website'
        url = social_url(network, x.get('url'))
        if not url:
            raise ApiError(400, f'Link {i + 1}: enter a valid address (https://…, an email or a phone number).')
        lid = re.sub(r'[^a-zA-Z0-9_-]', '', str(x.get('id') or ''))[:24]
        if not lid or lid in seen:
            lid = sec.new_id()[:12]
        seen.add(lid)
        links.append({'id': lid, 'network': network, 'url': url, 'label': clean(x.get('label'), 60),
                      'enabled': bool(x.get('enabled', True)), 'footer': bool(x.get('footer', True)), 'contact': bool(x.get('contact', True))})
    c = b.get('chat') or {}
    number = re.sub(r'\D', '', str(c.get('number') or ''))
    if len(number) == 10:
        number = '91' + number
    if c.get('enabled') and not 8 <= len(number) <= 15:
        raise ApiError(400, 'Floating chat button: enter a WhatsApp number with country code.')
    doc = {'id': 'social', 'links': links,
           'chat': {'enabled': bool(c.get('enabled')), 'number': number, 'message': clean(c.get('message'), 200)}}
    if store.get('settings', 'social'):
        store.update('settings', 'social', lambda _: doc)
    else:
        store.insert('settings', doc)
    return jsonify(load_social())


def visitor_counts():
    v = store.get('settings', 'visitors') or {}
    today = datetime.now().strftime('%Y-%m-%d')
    return {'total': v.get('unique', 0), 'pageviews': v.get('pageviews', 0), 'today': (v.get('days') or {}).get(today, 0)}


@app.get('/api/site')
def get_site():
    s = load_site()
    resp = jsonify({**s, 'social': load_social(), 'visitors': visitor_counts() if s['showVisitors'] else None,
                    'options': {'styles': LOADER_STYLES, 'logoAnims': LOGO_ANIMS, 'frequencies': FREQUENCIES, 'positions': BADGE_POSITIONS}})
    resp.headers['Cache-Control'] = 'no-cache'
    return resp


@app.put('/api/site')
def put_site():
    u = require_admin()
    if not u.get('superAdmin'):
        raise ApiError(403, 'Only the super admin can change site appearance.')
    b = body()
    cur = load_site()
    loader = dict(cur['loader'])
    lb = b.get('loader') or {}
    if lb.get('style') in LOADER_STYLES:
        loader['style'] = lb['style']
    if lb.get('logoAnim') in LOGO_ANIMS:
        loader['logoAnim'] = lb['logoAnim']
    if lb.get('frequency') in FREQUENCIES:
        loader['frequency'] = lb['frequency']
    if 'minMs' in lb:
        try:
            loader['minMs'] = max(600, min(6000, int(lb['minMs'])))
        except (TypeError, ValueError):
            pass
    badges = []
    incoming = {x.get('id'): x for x in (b.get('badges') or []) if isinstance(x, dict)}
    for bd in cur['badges']:
        nb = dict(bd)
        x = incoming.get(bd['id'], {})
        if x.get('position') in BADGE_POSITIONS:
            nb['position'] = x['position']
        if x.get('source') in ('badge', 'logo'):
            nb['source'] = x['source']
        if isinstance(x.get('enabled'), bool):
            nb['enabled'] = x['enabled']
        badges.append(nb)
    doc = {'id': 'site', 'loader': loader, 'badges': [{k: v for k, v in x.items() if k in ('id', 'position', 'source', 'enabled')} for x in badges],
           'showVisitors': bool(b.get('showVisitors', cur['showVisitors']))}
    if store.get('settings', 'site'):
        store.update('settings', 'site', lambda _: doc)
    else:
        store.insert('settings', doc)
    return jsonify(load_site())


BOT_RE = re.compile(r'bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python-requests', re.I)


@app.post('/api/visit')
def visit():
    rate_limit('visit', 60, 60)
    ua = request.headers.get('User-Agent', '')
    if not ua or BOT_RE.search(ua):
        return jsonify(visitor_counts())
    new_visitor = not request.cookies.get('mmx_vid')
    today = datetime.now().strftime('%Y-%m-%d')

    def bump(d):
        d['pageviews'] = d.get('pageviews', 0) + 1
        if new_visitor:
            d['unique'] = d.get('unique', 0) + 1
            days = d.setdefault('days', {})
            days[today] = days.get(today, 0) + 1
            for k in sorted(days)[:-90]:  # keep 90 days
                days.pop(k, None)
        return d
    if not store.get('settings', 'visitors'):
        try:
            store.insert('settings', {'id': 'visitors', 'unique': 0, 'pageviews': 0, 'days': {}})
        except Exception:  # noqa: BLE001 - created concurrently
            pass
    store.update('settings', 'visitors', bump)
    vid = request.cookies.get('mmx_vid') or sec.new_id()
    activity.record_visit(store, request, vid, new_visitor, body(), current_user())
    resp = make_response(jsonify(visitor_counts()))
    if new_visitor:
        resp.set_cookie('mmx_vid', vid, max_age=60 * 60 * 24 * 365, httponly=True, samesite='Lax',
                        secure=request.is_secure or request.headers.get('X-Forwarded-Proto') == 'https', path='/')
    return resp


# ---------------- activity (admins) ----------------
@app.get('/api/activity')
def get_activity():
    require_admin()
    seen_cut = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(timespec='seconds').replace('+00:00', 'Z')
    users = []
    for u in sorted(store.all('users'), key=lambda x: x.get('lastSeenAt') or x.get('lastLoginAt') or '', reverse=True):
        users.append({**public_user(u), 'lastLogin': u.get('lastLogin'), 'lastSeenAt': u.get('lastSeenAt'),
                      'loginCount': u.get('loginCount', 0), 'online': (u.get('lastSeenAt') or '') >= seen_cut})
    logins = (store.get('settings', 'loginlog') or {}).get('events') or []
    visits = (store.get('settings', 'visitlog') or {}).get('visits') or []
    # name each visitor where we know who it is: an enquiry sent from that browser
    known = {}
    for e in sorted(store.all('enquiries'), key=lambda x: x.get('createdAt') or ''):
        if e.get('visitorId'):
            known[e['visitorId']] = {'name': e.get('name') or '', 'enquiryId': e['id'], 'ref': e.get('ref'), 'org': e.get('org') or ''}
    counts = {}
    for v in visits:
        counts[v.get('vid')] = counts.get(v.get('vid'), 0) + 1
    recent = []
    for v in visits[-400:][::-1]:
        x = dict(v)
        x['views'] = counts.get(v.get('vid'), 1)
        if not x.get('name') and v.get('vid') in known:
            x.update({'name': known[v['vid']]['name'], 'enquiry': known[v['vid']]})
        recent.append(x)
    resp = jsonify(users=users, logins=logins[-300:][::-1], visits=recent, summary=activity.summary(visits), geo=os.path.exists(geoip.GEO_FILE))
    resp.headers['Cache-Control'] = 'no-store'
    return resp


# ---------------- mail settings ----------------
@app.get('/api/settings/mail')
def get_mail():
    u = require_user()
    s = mailer.load_settings(store)
    if u['role'] != 'admin':
        return jsonify(configured=mailer.is_configured(s))
    return jsonify(mailer.public_settings(s))


@app.put('/api/settings/mail')
def put_mail():
    require_admin()
    return jsonify(mailer.public_settings(mailer.save_settings(store, body())))


@app.post('/api/settings/mail/test')
def test_mail():
    u = require_admin()
    v = mailer.verify(store)
    to = clean(body().get('to') or u.get('email'), 160)
    sent = mailer.send(store, to, 'Motamax portal — test email', 'This is a test email from the Motamax enquiry portal.\n\nIf you can read this, SMTP is working.', sender_name=u['name']) if is_email(to) else None
    return jsonify(ok=True, **v, sentTo=to if sent else None, savedToSent=bool(sent and sent['savedToSent']), imapError=sent['imapError'] if sent else None)


@app.route('/api/<path:_>', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def api_404(_):
    raise ApiError(404, 'Not found')


# ---------------- start-up ----------------
def bootstrap_admin():
    users = store.all('users')
    username = clean_username(os.environ.get('ADMIN_USERNAME'))
    email = (os.environ.get('ADMIN_EMAIL') or '').strip().lower()
    password = os.environ.get('ADMIN_PASSWORD')
    if (username or email) and not password:
        existing = next((u for u in users if (username and u.get('username') == username) or (email and u.get('email') == email)), None)
        if existing and not existing.get('superAdmin'):
            store.update('users', existing['id'], lambda d: {**d, 'superAdmin': True, 'role': 'admin', 'active': True, 'suspendedAt': None})
    if (not username and not email) or not password:
        if not users:
            app.logger.warning('No users yet. Set ADMIN_USERNAME (or ADMIN_EMAIL) and ADMIN_PASSWORD to create the first admin account.')
        return
    existing = next((u for u in users if (username and u.get('username') == username) or (email and u.get('email') == email)), None)
    if existing:
        # the environment-defined admin is always the super admin (never changes the password)
        if not existing.get('superAdmin') or existing['role'] != 'admin' or not existing.get('active'):
            store.update('users', existing['id'], lambda d: {**d, 'superAdmin': True, 'role': 'admin', 'active': True, 'suspendedAt': None})
        return
    store.insert('users', {'id': sec.new_id(), 'name': os.environ.get('ADMIN_NAME') or 'Administrator', 'username': username, 'email': email,
                           'phone': '', 'role': 'admin', 'superAdmin': True, 'active': True, 'passHash': sec.hash_password(password), 'createdAt': now()})


bootstrap_admin()

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.environ.get('PORT', '5520')), debug=False)
