"""Password hashing, signed sessions and secret encryption (standard library only)."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from .config import DATA_DIR


def _load_secret():
    env = os.environ.get('SESSION_SECRET')
    if env:
        return env
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, '.secret')
    if not os.path.exists(path):
        with open(path, 'w') as f:
            f.write(secrets.token_hex(48))
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    with open(path) as f:
        return f.read().strip()


SECRET = _load_secret().encode()
SIGN_KEY = hashlib.sha256(b'mmx-sign:' + SECRET).digest()
ENC_KEY = hashlib.sha256(b'mmx-enc:' + SECRET).digest()
MAC_KEY = hashlib.sha256(b'mmx-mac:' + SECRET).digest()


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def unb64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


# scrypt parameters match Node's crypto.scryptSync defaults, so hashes are portable
def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(str(pw).encode(), salt=salt, n=16384, r=8, p=1, dklen=64, maxmem=64 * 1024 * 1024)
    return f'scrypt${salt.hex()}${h.hex()}'


def verify_password(pw: str, stored: str) -> bool:
    if not stored or not stored.startswith('scrypt$'):
        return False
    _, salt_hex, hash_hex = stored.split('$')
    h = hashlib.scrypt(str(pw).encode(), salt=bytes.fromhex(salt_hex), n=16384, r=8, p=1, dklen=64, maxmem=64 * 1024 * 1024)
    return hmac.compare_digest(h, bytes.fromhex(hash_hex))


def sign_session(payload: dict, ttl_ms: int) -> str:
    body = b64u(json.dumps({**payload, 'exp': int(time.time() * 1000) + ttl_ms}).encode())
    sig = b64u(hmac.new(SIGN_KEY, body.encode(), hashlib.sha256).digest())
    return f'{body}.{sig}'


def read_session(token):
    if not token or '.' not in token:
        return None
    body, sig = token.split('.', 1)
    expected = b64u(hmac.new(SIGN_KEY, body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        data = json.loads(unb64u(body))
    except Exception:
        return None
    return data if data.get('exp', 0) > time.time() * 1000 else None


# Encrypt-then-MAC with an HMAC-SHA256 counter-mode keystream (no third-party crypto needed)
def _keystream(iv: bytes, n: int) -> bytes:
    out = bytearray()
    counter = 0
    while len(out) < n:
        out += hmac.new(ENC_KEY, iv + counter.to_bytes(8, 'big'), hashlib.sha256).digest()
        counter += 1
    return bytes(out[:n])


def encrypt(text) -> str:
    if text in (None, ''):
        return ''
    data = str(text).encode()
    iv = secrets.token_bytes(16)
    ct = bytes(a ^ b for a, b in zip(data, _keystream(iv, len(data))))
    tag = hmac.new(MAC_KEY, iv + ct, hashlib.sha256).digest()
    return f'hctr${b64u(iv)}${b64u(tag)}${b64u(ct)}'


def decrypt(blob) -> str:
    if not blob or not str(blob).startswith('hctr$'):
        return ''
    _, iv, tag, ct = blob.split('$')
    iv, tag, ct = unb64u(iv), unb64u(tag), unb64u(ct)
    if not hmac.compare_digest(tag, hmac.new(MAC_KEY, iv + ct, hashlib.sha256).digest()):
        return ''
    return bytes(a ^ b for a, b in zip(ct, _keystream(iv, len(ct)))).decode()


def new_id() -> str:
    return b64u(secrets.token_bytes(9))
