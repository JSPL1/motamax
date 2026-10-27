"""IP -> location from a local DB-IP "city lite" database (MaxMind MMDB format). No visitor IP leaves the server.

The file lives at DATA_DIR/geo/dbip-city-lite.mmdb (refreshed monthly by a cron job). Without it lookups return None.
IP geolocation by DB-IP (https://db-ip.com), CC BY 4.0.
"""
import ipaddress
import mmap
import os
import struct
import threading

from .config import DATA_DIR

GEO_FILE = os.path.join(DATA_DIR, 'geo', 'dbip-city-lite.mmdb')
_META = b'\xab\xcd\xefMaxMind.com'


class _Reader:
    def __init__(self, path):
        self.fh = open(path, 'rb')
        self.buf = mmap.mmap(self.fh.fileno(), 0, access=mmap.ACCESS_READ)
        self.mtime = os.path.getmtime(path)
        start = self.buf.rfind(_META, max(0, len(self.buf) - 128 * 1024))
        if start < 0:
            raise ValueError('not an MMDB file')
        meta_start = start + len(_META)
        self.meta, _ = self._decode(meta_start, meta_start)
        self.nodes = self.meta['node_count']
        self.rs = self.meta['record_size']
        self.node_bytes = self.rs * 2 // 8
        self.data_start = self.nodes * self.node_bytes + 16
        self.v4_start = 0
        if self.meta.get('ip_version') == 6:  # IPv4 lives under ::/96
            n = 0
            for _ in range(96):
                if n >= self.nodes:
                    break
                n = self._record(n, 0)
            self.v4_start = n

    def _record(self, node, bit):
        b = self.buf
        o = node * self.node_bytes
        if self.rs == 24:
            o += bit * 3
            return int.from_bytes(b[o:o + 3], 'big')
        if self.rs == 28:
            if bit == 0:
                return ((b[o + 3] & 0xF0) << 20) | int.from_bytes(b[o:o + 3], 'big')
            return ((b[o + 3] & 0x0F) << 24) | int.from_bytes(b[o + 4:o + 7], 'big')
        o += bit * 4
        return int.from_bytes(b[o:o + 4], 'big')

    def lookup(self, ip):
        addr = ipaddress.ip_address(ip)
        if addr.version == 4:
            node, bits, packed = self.v4_start, 32, addr.packed
        else:
            node, bits, packed = 0, 128, addr.packed
        for i in range(bits):
            if node >= self.nodes:
                break
            node = self._record(node, (packed[i >> 3] >> (7 - (i & 7))) & 1)
        if node <= self.nodes:  # == node_count means "no data"
            return None
        off = (node - self.nodes) - 16 + self.data_start
        return self._decode(off, self.data_start)[0]

    def _size(self, off, size):
        b = self.buf
        if size < 29:
            return size, off
        if size == 29:
            return 29 + b[off], off + 1
        if size == 30:
            return 285 + int.from_bytes(b[off:off + 2], 'big'), off + 2
        return 65821 + int.from_bytes(b[off:off + 3], 'big'), off + 3

    def _decode(self, off, base):
        b = self.buf
        ctrl = b[off]
        off += 1
        typ = ctrl >> 5
        if typ == 1:  # pointer
            ss, v = (ctrl >> 3) & 3, ctrl & 7
            if ss == 0:
                p, off = (v << 8) | b[off], off + 1
            elif ss == 1:
                p, off = ((v << 16) | int.from_bytes(b[off:off + 2], 'big')) + 2048, off + 2
            elif ss == 2:
                p, off = ((v << 24) | int.from_bytes(b[off:off + 3], 'big')) + 526336, off + 3
            else:
                p, off = int.from_bytes(b[off:off + 4], 'big'), off + 4
            return self._decode(base + p, base)[0], off
        if typ == 0:
            typ, off = 7 + b[off], off + 1
        size, off = self._size(off, ctrl & 0x1F)
        if typ == 2:
            return b[off:off + size].decode('utf-8', 'replace'), off + size
        if typ == 7:
            out = {}
            for _ in range(size):
                k, off = self._decode(off, base)
                out[k], off = self._decode(off, base)
            return out, off
        if typ == 11:
            out = []
            for _ in range(size):
                v, off = self._decode(off, base)
                out.append(v)
            return out, off
        if typ in (5, 6, 9, 10):
            return int.from_bytes(b[off:off + size], 'big'), off + size
        if typ == 8:
            return int.from_bytes(b[off:off + size], 'big', signed=size == 4), off + size
        if typ == 3:
            return struct.unpack('>d', b[off:off + 8])[0], off + 8
        if typ == 15:
            return struct.unpack('>f', b[off:off + 4])[0], off + 4
        if typ == 14:
            return bool(size), off
        if typ == 4:
            return bytes(b[off:off + size]), off + size
        return None, off  # 12 data cache container / 13 end marker


_lock = threading.Lock()
_reader = None


def _get_reader():
    global _reader
    try:
        mtime = os.path.getmtime(GEO_FILE)
    except OSError:
        return None
    with _lock:
        if _reader is None or _reader.mtime != mtime:  # reopen after the monthly refresh
            try:
                _reader = _Reader(GEO_FILE)
            except (OSError, ValueError):
                _reader = None
        return _reader


def locate(ip):
    """-> {'city', 'region', 'country', 'cc'} or None for private/unknown addresses."""
    try:
        addr = ipaddress.ip_address(ip)
        if addr.is_private or addr.is_loopback or addr.is_reserved:
            return None
        r = _get_reader()
        rec = r.lookup(ip) if r else None
    except (ValueError, IndexError, struct.error):
        return None
    if not rec:
        return None
    en = lambda x: ((x or {}).get('names') or {}).get('en', '')  # noqa: E731
    subs = rec.get('subdivisions') or [{}]
    out = {'city': en(rec.get('city'))[:60], 'region': en(subs[0])[:60], 'country': en(rec.get('country'))[:60],
           'cc': ((rec.get('country') or {}).get('iso_code') or '')[:2]}
    return out if any(out.values()) else None
