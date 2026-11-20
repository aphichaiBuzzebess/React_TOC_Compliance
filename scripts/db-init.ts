import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1) }
const pool = new pg.Pool({ connectionString: url, max: 1 })
await pool.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'))
console.log('schema ready')
await pool.end()
