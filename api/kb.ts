import { loadKb } from '../server/kb.js'
import { handle } from '../server/http.js'

// Read-only list of KB notes for the web viewer; same access code as the assessment endpoints.
export async function GET(req: Request): Promise<Response> {
  return handle(req, async () => ({ notes: loadKb() }))
}
