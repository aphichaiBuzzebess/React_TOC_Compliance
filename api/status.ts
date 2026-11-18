import { handle, llmFromRequest } from '../server/http.js'
import { pingProvider } from '../server/status.js'

// POST: one small real call with the caller's own key to confirm it works. Costs a few tokens on their account.
export async function POST(req: Request): Promise<Response> {
  return handle(req, async () => pingProvider(llmFromRequest(req)))
}
