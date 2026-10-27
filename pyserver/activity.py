"""Login and website-visit activity: device/browser detection, client IP, capped logs and a summary."""
import ipaddress
import re
from collections import Counter
from datetime import datetime, timedelta, timezone

from . import geoip

LOGIN_CAP, VISIT_CAP, VISIT_DAYS = 1000, 5000, 30
SEEN_EVERY_S = 120  # how often "last active" is written for a signed-in user


def parse_ua(ua, touch=0):
    """-> {'browser': 'Chrome 129', 'os': 'Android 14', 'device': 'Mobile' | 'Tablet' | 'Desktop'}"""
    ua = ua or ''

    def ver(pattern):
        m = re.search(pattern, ua)
        return (' ' + m.group(1)) if m else ''
    if 'Edg/' in ua or 'EdgA/' in ua or 'EdgiOS/' in ua:
        browser = 'Edge' + ver(r'Edg(?:A|iOS)?/(\d+)')
    elif 'OPR/' in ua or 'Opera' in ua:
        browser = 'Opera' + ver(r'OPR/(\d+)')
    elif 'SamsungBrowser/' in ua:
        browser = 'Samsung Internet' + ver(r'SamsungBrowser/(\d+)')
    elif 'UCBrowser/' in ua:
        browser = 'UC Browser'
    elif 'Firefox/' in ua or 'FxiOS/' in ua:
        browser = 'Firefox' + ver(r'(?:Firefox|FxiOS)/(\d+)')
    elif 'CriOS/' in ua:
        browser = 'Chrome' + ver(r'CriOS/(\d+)')
    elif 'Chrome/' in ua:
        browser = 'Chrome' + ver(r'Chrome/(\d+)')
    elif 'Safari/' in ua and 'Version/' in ua:
        browser = 'Safari' + ver(r'Version/(\d+)')
    elif 'MSIE' in ua or 'Trident/' in ua:
        browser = 'Internet Explorer'
    else:
        browser = 'Other'

    mac_touch = 'Macintosh' in ua and int(touch or 0) > 1  # iPads ask for the desktop site and look like a Mac
    if 'iPad' in ua or mac_touch:
        os_name = 'iPadOS' + ver(r'OS (\d+)_')
    elif 'iPhone' in ua or 'iPod' in ua:
        os_name = 'iOS' + ver(r'OS (\d+)_')
    elif 'Android' in ua:
        os_name = 'Android' + ver(r'Android (\d+)')
    elif 'Windows' in ua:
        nt = re.search(r'Windows NT (\d+\.\d+)', ua)
        os_name = {'10.0': 'Windows 10/11', '6.3': 'Windows 8.1', '6.2': 'Windows 8', '6.1': 'Windows 7'}.get(nt.group(1) if nt else '', 'Windows')
    elif 'CrOS' in ua:
        os_name = 'ChromeOS'
    elif 'Mac OS X' in ua or 'Macintosh' in ua:
        os_name = 'macOS'
    elif 'Linux' in ua:
        os_name = 'Linux'
    else:
        os_name = 'Other'

    if 'iPad' in ua or mac_touch or 'Tablet' in ua or ('Android' in ua and 'Mobile' not in ua):
        device = 'Tablet'
    elif re.search(r'Mobi|iPhone|iPod|Android', ua):
        device = 'Mobile'
    else:
        device = 'Desktop'
    return {'browser': browser, 'os': os_name, 'device': device}


def apply_hints(info, b):
    """Chrome hides the real OS version and phone model in its user agent; the page sends them as client hints."""
    model = re.sub(r'[^A-Za-z0-9 ._()+-]', '', str(b.get('model') or ''))[:40].strip()
    pv = str(b.get('osv') or '')
    m = re.match(r'(\d+)', pv)
    if m:
        major = int(m.group(1))
        if info['os'].startswith('Android'):
            info['os'] = f'Android {major}'
        elif info['os'].startswith('Windows') and pv:
            info['os'] = 'Windows 11' if major >= 13 else 'Windows 10'
        elif info['os'] == 'macOS' and major >= 10:
            info['os'] = f'macOS {major}'
    if model:
        info['model'] = model
    return info


def client_ip(request):
    """The visitor's address. X-Forwarded-For is only trusted when the direct peer is a local proxy."""
    peer = request.remote_addr or ''
    try:
        local = ipaddress.ip_address(peer).is_private or ipaddress.ip_address(peer).is_loopback
    except ValueError:
        local = False
    if local:
        fwd = [p.strip() for p in request.headers.get('X-Forwarded-For', '').split(',') if p.strip()]
        if fwd:
            return fwd[-1][:45]
    return peer[:45]


def _now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def _append(store, doc_id, key, entry, cap, max_days=None):
    if not store.get('settings', doc_id):
        try:
            store.insert('settings', {'id': doc_id, key: []})
        except Exception:  # noqa: BLE001 - created concurrently
            pass

    def add(d):
        items = (d.get(key) or []) + [entry]
        if max_days:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=max_days)).isoformat(timespec='seconds').replace('+00:00', 'Z')
            items = [x for x in items if x.get('at', '') >= cutoff]
        d[key] = items[-cap:]
        return d
    store.update('settings', doc_id, add)


def record_login(store, request, user, login_id, ok, reason=''):
    ip = client_ip(request)
    info = {'at': _now(), 'ip': ip, 'geo': geoip.locate(ip), **parse_ua(request.headers.get('User-Agent', ''))}
    _append(store, 'loginlog', 'events', {**info, 'ok': ok, 'reason': reason, 'login': login_id[:80],
                                          'userId': user['id'] if user else None, 'name': user['name'] if user else ''}, LOGIN_CAP)
    if user and ok:
        store.update('users', user['id'], lambda d: {**d, 'lastLoginAt': info['at'], 'lastSeenAt': info['at'],
                                                     'lastLogin': info, 'loginCount': d.get('loginCount', 0) + 1})


def touch_seen(store, user):
    last = user.get('lastSeenAt') or ''
    try:
        fresh = last and (datetime.now(timezone.utc) - datetime.fromisoformat(last.replace('Z', '+00:00'))).total_seconds() < SEEN_EVERY_S
    except ValueError:
        fresh = False
    if not fresh:
        store.update('users', user['id'], lambda d: {**d, 'lastSeenAt': _now()})


def record_visit(store, request, vid, is_new, b, user=None):
    page = str(b.get('page') or '/')[:80]
    if not re.fullmatch(r'/[A-Za-z0-9._/-]*', page) or page == '/':
        page = '/index.html'
    ref = str(b.get('ref') or '')
    m = re.match(r'https?://([^/:?#]+)', ref)
    ref_host = m.group(1).lower()[:80] if m else ''
    if ref_host and ref_host.endswith(request.host.split(':')[0].lower()):
        ref_host = ''  # moving between our own pages
    try:
        touch = int(b.get('touch') or 0)
    except (TypeError, ValueError):
        touch = 0
    ip = client_ip(request)
    entry = {'at': _now(), 'vid': (vid or '')[:10], 'new': bool(is_new), 'ip': ip, 'geo': geoip.locate(ip),
             **apply_hints(parse_ua(request.headers.get('User-Agent', ''), touch), b), 'page': page, 'ref': ref_host,
             'lang': re.sub(r'[^A-Za-z-]', '', str(b.get('lang') or ''))[:12],
             'tz': re.sub(r'[^A-Za-z0-9_/+-]', '', str(b.get('tz') or ''))[:40],
             'scr': re.sub(r'[^0-9x]', '', str(b.get('scr') or ''))[:12]}
    if user:  # one of our own team browsing the site while signed in
        entry['userId'], entry['name'] = user['id'], user['name']
    _append(store, 'visitlog', 'visits', entry, VISIT_CAP, VISIT_DAYS)


def summary(visits, tz_offset_min=330):
    """Numbers for the last 30 days, with 'today' in Indian time by default."""
    shift = timedelta(minutes=tz_offset_min)

    def day(at):
        try:
            return (datetime.fromisoformat(at.replace('Z', '+00:00')) + shift).strftime('%Y-%m-%d')
        except ValueError:
            return ''
    today = (datetime.now(timezone.utc) + shift).strftime('%Y-%m-%d')
    days = [(datetime.now(timezone.utc) + shift - timedelta(days=i)).strftime('%Y-%m-%d') for i in range(13, -1, -1)]
    per_day = {d: {'views': 0, 'people': set()} for d in days}
    for v in visits:
        d = day(v.get('at', ''))
        if d in per_day:
            per_day[d]['views'] += 1
            per_day[d]['people'].add(v.get('vid') or v.get('ip'))
    todays = [v for v in visits if day(v.get('at', '')) == today]

    def top(key, n=6, rows=visits):
        # versions are dropped so "Chrome 129" and "Chrome 130" count together
        return [[k, c] for k, c in Counter(re.sub(r' [\d./]+$', '', v.get(key) or 'Unknown') for v in rows).most_common(n)]
    return {
        'views30': len(visits), 'people30': len({v.get('vid') or v.get('ip') for v in visits}),
        'viewsToday': len(todays), 'peopleToday': len({v.get('vid') or v.get('ip') for v in todays}),
        'devices': top('device', 3), 'browsers': top('browser', 6), 'os': top('os', 6), 'pages': top('page', 6),
        'places': [[k, c] for k, c in Counter(', '.join(x for x in ((v.get('geo') or {}).get('city'), (v.get('geo') or {}).get('region')) if x)
                                                for v in visits if v.get('geo')).most_common(6) if k],
        'countries': [[k, c] for k, c in Counter((v.get('geo') or {}).get('country') for v in visits if (v.get('geo') or {}).get('country')).most_common(6)],
        'refs': [[k, c] for k, c in Counter(v['ref'] for v in visits if v.get('ref')).most_common(5)],
        'days': [{'day': d, 'views': per_day[d]['views'], 'people': len(per_day[d]['people'])} for d in days],
    }
