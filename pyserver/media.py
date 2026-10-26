"""Replaceable website media (admin uploads stored in DATA_DIR/media, served instead of originals)."""
import os
import re
import struct
from datetime import datetime, timezone

from .config import ROOT, MEDIA_DIR

SITE_LABELS = {
    'e1': 'Substation structure', 'e2': 'Pole-mounted transformer', 'e3': 'Overhead line work', 'e4': 'Transformer installation',
    'e5': 'Site electrical works', 'e6': 'Street lighting pole', 'e7': 'Electrical control panel', 'e8': 'Distribution panel',
    'i1': 'Fibre splice enclosure', 'i2': 'Aerial cabling', 'i3': 'Biometric / access terminal', 'i4': 'Site survey',
    'i5': 'Solar-powered CCTV', 'i6': 'Weighbridge automation layout', 'i7': 'CCTV monitoring station', 'i8': 'Pole-mounted cameras',
    'i9': 'Smart switch panel', 'i10': 'Tower installation', 'i11': 'Network rack', 'i12': 'Wall-mounted network equipment',
    'i13': 'Network cabinet', 'i14': 'Cable tray routing', 'i15': 'Site corridor works', 'i16': 'Excavation',
    'i17': 'Trenching', 'i18': 'Road corridor route', 'i19': 'Drilling site', 'i20': 'HDD rig',
}


def _pretty(s):
    return re.sub(r'\b\w', lambda m: m.group().upper(), re.sub(r'[-_]', ' ', s))


def _natural(s):
    return [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', s)]


def registry():
    slots = [
        {'path': 'assets/motamax-logo.png', 'group': 'brand', 'label': 'Website logo', 'kind': 'image', 'usedIn': 'Menu, footer, login, emails'},
        {'path': 'brochure/motamax-logo@4x.png', 'group': 'brand', 'label': 'Brochure logo (print)', 'kind': 'image', 'usedIn': 'Every brochure page'},
        {'path': 'assets/badges/badge-1.webp', 'group': 'brand', 'label': 'Badge 1 — services emblem', 'kind': 'image', 'usedIn': 'Floating brand badge (position set in Site settings)'},
        {'path': 'assets/badges/badge-2.webp', 'group': 'brand', 'label': 'Badge 2 — solution architect', 'kind': 'image', 'usedIn': 'Floating brand badge (position set in Site settings)'},
        {'path': 'assets/icons/mark.png', 'group': 'brand', 'label': 'Logo mark (loader & favicon art)', 'kind': 'image', 'usedIn': 'Page loading animation'},
        {'path': 'assets/icons/icon-32.png', 'group': 'brand', 'label': 'Browser tab icon (32×32)', 'kind': 'image', 'usedIn': 'Browser tab (favicon)'},
        {'path': 'assets/icons/icon-192.png', 'group': 'brand', 'label': 'App icon (192×192)', 'kind': 'image', 'usedIn': 'Android home screen, bookmarks'},
        {'path': 'assets/icons/icon-512.png', 'group': 'brand', 'label': 'App icon (512×512)', 'kind': 'image', 'usedIn': 'Install / splash icon'},
        {'path': 'assets/icons/apple-touch-icon.png', 'group': 'brand', 'label': 'iPhone home-screen icon (180×180)', 'kind': 'image', 'usedIn': 'iOS home screen'},
        {'path': 'assets/Motamax-Company-Profile.pdf', 'group': 'brochure', 'label': 'Company profile (PDF)', 'kind': 'pdf', 'usedIn': 'Download buttons, brochure emails'},
    ]

    def listdir(d):
        p = os.path.join(ROOT, d)
        return os.listdir(p) if os.path.isdir(p) else []

    for f in sorted([f for f in listdir('assets/site') if re.search(r'\.(jpe?g|png|webp)$', f, re.I)], key=_natural):
        i = re.sub(r'\.\w+$', '', f)
        slots.append({'path': f'assets/site/{f}', 'group': 'site', 'label': SITE_LABELS.get(i, _pretty(i)), 'kind': 'image',
                      'usedIn': 'Gallery · Electrical' if i.startswith('e') else 'Gallery, stories, brochure'})
    for f in sorted([f for f in listdir('assets/clients') if re.search(r'\.(png|jpe?g|webp)$', f, re.I)]):
        slots.append({'path': f'assets/clients/{f}', 'group': 'clients', 'label': _pretty(re.sub(r'\.\w+$', '', f)), 'kind': 'image', 'usedIn': 'Client logos (site + brochure)'})
    return slots


def sniff(buf):
    if not buf or len(buf) < 12:
        return None
    if buf[:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    if buf[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if buf[:4] == b'RIFF' and buf[8:12] == b'WEBP':
        return 'image/webp'
    if buf[:5] == b'%PDF-':
        return 'application/pdf'
    return None


def dimensions(buf, kind):
    try:
        if kind == 'image/png':
            return struct.unpack('>II', buf[16:24])
        if kind == 'image/webp':
            chunk = buf[12:16]
            if chunk == b'VP8X':
                return 1 + int.from_bytes(buf[24:27], 'little'), 1 + int.from_bytes(buf[27:30], 'little')
            if chunk == b'VP8 ':
                return struct.unpack('<H', buf[26:28])[0] & 0x3fff, struct.unpack('<H', buf[28:30])[0] & 0x3fff
            if chunk == b'VP8L':
                b = struct.unpack('<I', buf[21:25])[0]
                return (b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1
        if kind == 'image/jpeg':
            i = 2
            while i < len(buf) - 9:
                if buf[i] != 0xff:
                    i += 1
                    continue
                marker = buf[i + 1]
                length = struct.unpack('>H', buf[i + 2:i + 4])[0]
                if 0xc0 <= marker <= 0xcf and marker not in (0xc4, 0xc8, 0xcc):
                    h, w = struct.unpack('>HH', buf[i + 5:i + 9])
                    return w, h
                i += 2 + length
    except Exception:
        pass
    return None


def override_path(rel):
    return os.path.join(MEDIA_DIR, *rel.split('/'))


def find_slot(p):
    p = str(p or '').lstrip('/')
    return next((s for s in registry() if s['path'] == p), None)


def resolve_file(rel):
    over = override_path(rel)
    return over if os.path.exists(over) else os.path.join(ROOT, *rel.split('/'))


def describe(slot):
    over = override_path(slot['path'])
    f = resolve_file(slot['path'])
    size, dims, updated = 0, None, None
    if os.path.exists(f):
        st = os.stat(f)
        size = st.st_size
        updated = datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        if slot['kind'] == 'image':
            with open(f, 'rb') as fh:
                head = fh.read(256 * 1024)
            dims = dimensions(head, sniff(head))
    return {**slot, 'overridden': os.path.exists(over), 'size': size,
            'width': dims[0] if dims else None, 'height': dims[1] if dims else None, 'updatedAt': updated}


class MediaError(Exception):
    pass


def save(slot, data: bytes):
    kind = sniff(data)
    if slot['kind'] == 'pdf' and kind != 'application/pdf':
        raise MediaError('Please upload a PDF file.')
    if slot['kind'] == 'image' and kind not in ('image/jpeg', 'image/png', 'image/webp'):
        raise MediaError('Please upload a JPG, PNG or WebP image.')
    dest = override_path(slot['path'])
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + '.uploading'
    with open(tmp, 'wb') as f:
        f.write(data)
    os.replace(tmp, dest)
    return describe(slot)


def restore(slot):
    over = override_path(slot['path'])
    if os.path.exists(over):
        os.remove(over)
    return describe(slot)


def override_for_request(rel):
    """Return (absolute path, mimetype) of an uploaded replacement for this URL path, else None."""
    if not re.match(r'^(assets|brochure)/', rel) or '..' in rel:
        return None
    over = override_path(rel)
    if not os.path.abspath(over).startswith(os.path.abspath(MEDIA_DIR)) or not os.path.exists(over):
        return None
    with open(over, 'rb') as f:
        kind = sniff(f.read(16))
    return (over, kind) if kind else None
