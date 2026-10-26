"""Document store: JSON file (default, safe across Passenger processes) or MySQL (cPanel database)."""
import json
import os
import threading

from .config import DATA_DIR

try:
    import fcntl  # Linux / cPanel
except ImportError:  # Windows (local development)
    fcntl = None


class FileStore:
    kind = 'file'

    def __init__(self, path):
        self.path = path
        self.lock_path = path + '.lock'
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self._tlock = threading.RLock()

    # cross-process lock (flock) + in-process lock
    class _Lock:
        def __init__(self, store, exclusive):
            self.store, self.exclusive = store, exclusive

        def __enter__(self):
            self.store._tlock.acquire()
            self.fh = open(self.store.lock_path, 'a+')
            if fcntl:
                fcntl.flock(self.fh, fcntl.LOCK_EX if self.exclusive else fcntl.LOCK_SH)
            return self

        def __exit__(self, *exc):
            if fcntl:
                fcntl.flock(self.fh, fcntl.LOCK_UN)
            self.fh.close()
            self.store._tlock.release()

    def _read(self):
        if not os.path.exists(self.path):
            return {'collections': {}, 'seq': {}}
        with open(self.path, encoding='utf-8') as f:
            db = json.load(f)
        db.setdefault('collections', {})
        db.setdefault('seq', {})
        return db

    def _write(self, db):
        tmp = self.path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(db, f, ensure_ascii=False, indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self.path)

    def init(self):
        pass

    def all(self, c):
        with self._Lock(self, False):
            return list(self._read()['collections'].get(c, {}).values())

    def get(self, c, id_):
        with self._Lock(self, False):
            return self._read()['collections'].get(c, {}).get(id_)

    def insert(self, c, doc):
        with self._Lock(self, True):
            db = self._read()
            db['collections'].setdefault(c, {})[doc['id']] = doc
            self._write(db)
        return doc

    def update(self, c, id_, fn):
        with self._Lock(self, True):
            db = self._read()
            cur = db['collections'].get(c, {}).get(id_)
            if cur is None:
                return None
            nxt = fn(json.loads(json.dumps(cur)))
            if nxt is None:
                return None
            db['collections'][c][id_] = nxt
            self._write(db)
            return nxt

    def remove(self, c, id_):
        with self._Lock(self, True):
            db = self._read()
            db['collections'].get(c, {}).pop(id_, None)
            self._write(db)

    def next_seq(self, name):
        with self._Lock(self, True):
            db = self._read()
            db['seq'][name] = db['seq'].get(name, 0) + 1
            self._write(db)
            return db['seq'][name]


class MysqlStore:
    kind = 'mysql'

    def __init__(self, **cfg):
        import pymysql  # optional dependency, only needed for MySQL
        self.pymysql = pymysql
        self.cfg = {**cfg, 'charset': 'utf8mb4', 'autocommit': False}

    def _conn(self):
        return self.pymysql.connect(**self.cfg)

    def init(self):
        with self._conn() as cn, cn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS mmx_docs (collection VARCHAR(64) NOT NULL, id VARCHAR(64) NOT NULL,
                data LONGTEXT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (collection, id)) CHARACTER SET utf8mb4""")
            cur.execute('CREATE TABLE IF NOT EXISTS mmx_seq (name VARCHAR(64) PRIMARY KEY, value BIGINT NOT NULL)')
            cn.commit()

    def all(self, c):
        with self._conn() as cn, cn.cursor() as cur:
            cur.execute('SELECT data FROM mmx_docs WHERE collection=%s', (c,))
            return [json.loads(r[0]) for r in cur.fetchall()]

    def get(self, c, id_):
        with self._conn() as cn, cn.cursor() as cur:
            cur.execute('SELECT data FROM mmx_docs WHERE collection=%s AND id=%s', (c, id_))
            r = cur.fetchone()
            return json.loads(r[0]) if r else None

    def insert(self, c, doc):
        with self._conn() as cn, cn.cursor() as cur:
            cur.execute('INSERT INTO mmx_docs(collection,id,data) VALUES(%s,%s,%s)', (c, doc['id'], json.dumps(doc, ensure_ascii=False)))
            cn.commit()
        return doc

    def update(self, c, id_, fn):
        with self._conn() as cn, cn.cursor() as cur:
            cur.execute('SELECT data FROM mmx_docs WHERE collection=%s AND id=%s FOR UPDATE', (c, id_))
            r = cur.fetchone()
            if not r:
                cn.rollback()
                return None
            nxt = fn(json.loads(r[0]))
            if nxt is None:
                cn.rollback()
                return None
            cur.execute('UPDATE mmx_docs SET data=%s WHERE collection=%s AND id=%s', (json.dumps(nxt, ensure_ascii=False), c, id_))
            cn.commit()
            return nxt

    def remove(self, c, id_):
        with self._conn() as cn, cn.cursor() as cur:
            cur.execute('DELETE FROM mmx_docs WHERE collection=%s AND id=%s', (c, id_))
            cn.commit()

    def next_seq(self, name):
        with self._conn() as cn, cn.cursor() as cur:
            cur.execute('INSERT INTO mmx_seq(name,value) VALUES(%s,LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE value=LAST_INSERT_ID(value+1)', (name,))
            cur.execute('SELECT LAST_INSERT_ID()')
            v = cur.fetchone()[0]
            cn.commit()
            return int(v)


def create_store():
    if os.environ.get('MYSQL_DATABASE'):
        return MysqlStore(host=os.environ.get('MYSQL_HOST', 'localhost'), port=int(os.environ.get('MYSQL_PORT', '3306')),
                          user=os.environ.get('MYSQL_USER'), password=os.environ.get('MYSQL_PASSWORD'), database=os.environ['MYSQL_DATABASE'])
    return FileStore(os.environ.get('DATA_FILE') or os.path.join(DATA_DIR, 'db.json'))
