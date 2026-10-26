"""Shared paths and settings for the Python server (used on cPanel hosting)."""
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA_DIR = os.environ.get('DATA_DIR') or os.path.join(ROOT, 'data')
MEDIA_DIR = os.path.join(DATA_DIR, 'media')
# where Let's Encrypt HTTP challenges are written (acme.sh webroot); served at /.well-known/acme-challenge/
ACME_WEBROOT = os.environ.get('ACME_WEBROOT') or os.path.expanduser('~/public_html')


def load_dotenv():
    """Minimal .env loader for local runs (never overrides real environment variables)."""
    path = os.path.join(ROOT, '.env')
    if not os.path.exists(path):
        return
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"\''))
