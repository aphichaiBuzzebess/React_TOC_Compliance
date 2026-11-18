import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { loadKb, searchKb } from '../server/kb'

// Read-only view of the kb/ vault. Edit notes in Obsidian; this just serves them.
const server = new McpServer({ name: 'tor-scouter-kb', version: '0.1.0' })
const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })

server.registerTool(
  'search_kb',
  { description: 'Search product knowledge-base notes relevant to a requirement (Thai or English).', inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(10).optional() } },
  async ({ query, limit }) => {
    const hits = searchKb(loadKb(), query, limit ?? 4)
    return text(hits.length ? hits.map((n) => `## ${n.path} (${n.module}, support: ${n.support})\n${n.body}`).join('\n\n') : 'No matching note. Treat as Need Verification.')
  },
)

server.registerTool(
  'get_note',
  { description: 'Read one knowledge-base note by its path, e.g. member/registration-channels.md', inputSchema: { path: z.string() } },
  async ({ path }) => {
    const n = loadKb().find((x) => x.path === path)
    return n ? text(`# ${n.title}\nmodule: ${n.module} · support: ${n.support} · updated: ${n.updated}\n\n${n.body}`) : text(`Not found: ${path}`)
  },
)

server.registerTool('list_modules', { description: 'List modules and note paths in the knowledge base.' }, async () => {
  const by = new Map<string, string[]>()
  for (const n of loadKb()) by.set(n.module, [...(by.get(n.module) ?? []), `${n.path} (${n.support})`])
  return text([...by].map(([m, ps]) => `${m}\n${ps.map((p) => `  - ${p}`).join('\n')}`).join('\n'))
})

await server.connect(new StdioServerTransport())
