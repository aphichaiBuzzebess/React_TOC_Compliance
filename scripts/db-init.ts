import { readFileSync } from 'node:fs'
import pg from 'pg'
import { pgDb } from '../server/db.js'
import { seedFromFiles } from '../server/knowledge.js'

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1) }
const pool = new pg.Pool({ connectionString: url, max: 1 })
await pool.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'))
console.log('schema ready')
// The editable knowledge starts from the kb/ files: only notes that are neither live nor ever existed are added, so a rerun changes nothing.
const { added, skipped } = await seedFromFiles(pgDb(pool), 'import')
console.log(`knowledge: ${added} note(s) imported, ${skipped} already there`)
await pool.end()
