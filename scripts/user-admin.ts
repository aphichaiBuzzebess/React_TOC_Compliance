import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { hashPassword } from '../server/auth.js'
import { pgDb } from '../server/db.js'

const [cmd, name] = process.argv.slice(2)
const url = process.env.DATABASE_URL
if (!url || !['reset', 'disable', 'enable', 'delete'].includes(cmd ?? '') || !name) {
  console.error('Usage: DATABASE_URL=… npm run user:reset|user:disable|user:enable|user:delete -- <username>')
  process.exit(1)
}
const pool = new pg.Pool({ connectionString: url, max: 1 })
const db = pgDb(pool)
const user = await db.userByName(name.trim().toLowerCase())
if (!user) {
  console.error(`No user "${name}"`)
  process.exit(1)
}
if (cmd === 'reset') {
  const temp = randomBytes(12).toString('base64url')
  await db.setPassword(user.id, await hashPassword(temp))
  await db.deleteUserSessions(user.id) // every sign-in of that user ends
  console.log(`Temporary password for ${user.username}: ${temp}\nTell them to change it after signing in.`)
} else if (cmd === 'disable') {
  await db.setDisabled(user.id, true)
  await db.deleteUserSessions(user.id)
  console.log(`${user.username} disabled`)
} else if (cmd === 'enable') {
  await db.setDisabled(user.id, false)
  console.log(`${user.username} enabled`)
} else {
  await db.deleteUser(user.id)
  console.log(`${user.username} deleted with their key and history`)
}
await pool.end()
