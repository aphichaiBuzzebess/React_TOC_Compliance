import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export interface Enc { ciphertext: Buffer; iv: Buffer; tag: Buffer }

/** 32 bytes from KEY_ENCRYPTION_SECRET (base64). Missing or malformed: every key operation fails, nothing falls back to plaintext. */
function secret(): Buffer {
  const b = Buffer.from(process.env.KEY_ENCRYPTION_SECRET ?? '', 'base64')
  if (b.length !== 32) throw new Error('KEY_ENCRYPTION_SECRET ยังไม่ได้ตั้งค่า (ต้องเป็น 32 ไบต์แบบ base64)')
  return b
}

/** AES-256-GCM with a fresh IV; the user id is authenticated data, so a ciphertext copied to another user will not decrypt. */
export function encryptKey(userId: string, key: string): Enc {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', secret(), iv)
  c.setAAD(Buffer.from(userId))
  const ciphertext = Buffer.concat([c.update(key, 'utf8'), c.final()])
  return { ciphertext, iv, tag: c.getAuthTag() }
}

export function decryptKey(userId: string, e: Enc): string {
  const d = createDecipheriv('aes-256-gcm', secret(), e.iv)
  d.setAAD(Buffer.from(userId))
  d.setAuthTag(e.tag)
  return Buffer.concat([d.update(e.ciphertext), d.final()]).toString('utf8') // throws if anything was changed
}
