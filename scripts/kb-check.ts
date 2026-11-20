import { checkKb } from '../server/kbCheck.js'

const bad = checkKb()
for (const { path, problems } of bad) console.log(`✗ ${path}\n${problems.map((p) => `    - ${p}`).join('\n')}`)
console.log(bad.length ? `\nมี ${bad.length} note ที่ต้องแก้` : 'KB ถูกต้องทุก note')
process.exit(bad.length ? 1 : 0)
