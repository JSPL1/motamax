'use strict';
/*
 * Tiny document store with two backends:
 *  - Postgres (when DATABASE_URL is set) — one table of JSONB documents, row-locked updates
 *  - JSON file (default, for local use) — data/db.json, written atomically
 *
 * Interface (all async):
 *   all(collection) -> [doc]
 *   get(collection, id) -> doc | null
 *   insert(collection, doc) -> doc            (doc.id required)
 *   update(collection, id, fn) -> doc | null  (fn(doc) mutates/returns doc; return null to abort)
 *   remove(collection, id)
 *   nextSeq(name) -> number                   (monotonic counter)
 */
const fs = require('fs');
const path = require('path');

function createFileStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let db = { collections: {}, seq: {} };
  if (fs.existsSync(file)) {
    try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('[store] could not parse', file, e.message); }
  }
  db.collections ||= {}; db.seq ||= {};
  let timer = null;
  const flush = () => {
    timer = null;
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, file);
  };
  const save = () => { if (!timer) timer = setTimeout(flush, 50); };
  const col = (c) => (db.collections[c] ||= {});
  const clone = (d) => (d ? JSON.parse(JSON.stringify(d)) : null);
  process.on('exit', () => { if (timer) { clearTimeout(timer); flush(); } });

  return {
    kind: 'file',
    async init() {},
    async all(c) { return Object.values(col(c)).map(clone); },
    async get(c, id) { return clone(col(c)[id]); },
    async insert(c, doc) { col(c)[doc.id] = clone(doc); save(); return clone(doc); },
    async update(c, id, fn) {
      const cur = col(c)[id];
      if (!cur) return null;
      const next = fn(clone(cur));
      if (!next) return null;
      col(c)[id] = next; save(); return clone(next);
    },
    async remove(c, id) { delete col(c)[id]; save(); },
    async nextSeq(name) { db.seq[name] = (db.seq[name] || 0) + 1; save(); return db.seq[name]; },
  };
}

function createPgStore(url) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    max: 5,
  });
  return {
    kind: 'postgres',
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS mmx_docs (
        collection text NOT NULL, id text NOT NULL, data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (collection, id))`);
      await pool.query(`CREATE TABLE IF NOT EXISTS mmx_seq (name text PRIMARY KEY, value bigint NOT NULL)`);
    },
    async all(c) { const r = await pool.query('SELECT data FROM mmx_docs WHERE collection=$1', [c]); return r.rows.map((x) => x.data); },
    async get(c, id) { const r = await pool.query('SELECT data FROM mmx_docs WHERE collection=$1 AND id=$2', [c, id]); return r.rows[0]?.data || null; },
    async insert(c, doc) {
      await pool.query('INSERT INTO mmx_docs(collection,id,data) VALUES($1,$2,$3)', [c, doc.id, doc]);
      return doc;
    },
    async update(c, id, fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const r = await client.query('SELECT data FROM mmx_docs WHERE collection=$1 AND id=$2 FOR UPDATE', [c, id]);
        if (!r.rows[0]) { await client.query('ROLLBACK'); return null; }
        const next = fn(r.rows[0].data);
        if (!next) { await client.query('ROLLBACK'); return null; }
        await client.query('UPDATE mmx_docs SET data=$3, updated_at=now() WHERE collection=$1 AND id=$2', [c, id, next]);
        await client.query('COMMIT');
        return next;
      } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
    },
    async remove(c, id) { await pool.query('DELETE FROM mmx_docs WHERE collection=$1 AND id=$2', [c, id]); },
    async nextSeq(name) {
      const r = await pool.query(`INSERT INTO mmx_seq(name,value) VALUES($1,1)
        ON CONFLICT(name) DO UPDATE SET value=mmx_seq.value+1 RETURNING value`, [name]);
      return Number(r.rows[0].value);
    },
  };
}

module.exports = function createStore() {
  if (process.env.DATABASE_URL) return createPgStore(process.env.DATABASE_URL);
  return createFileStore(process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json'));
};
