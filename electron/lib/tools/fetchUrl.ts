import { registerTool } from './registry'
import { getSearchService } from '../../ipc/search'
import { PathJailError } from '../../services/pathJail'

registerTool({
  definition: {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch and parse a webpage from a URL, returning readable full-page text content plus a structured links array for follow-up navigation.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The target webpage URL (http or https)'
          },
          max_chars: {
            type: 'number',
            description: 'Maximum characters to return (1000-100000, default 20000)'
          }
        },
        required: ['url']
      }
    }
  },
  execute: async (args) => {
    const url = args.url as string
    if (!url) throw new PathJailError('INVALID_INPUT', 'fetch_url requires a "url" argument')
    const maxChars = parseInt(String(args.max_chars || '20000'), 10) || 20_000
    const search = getSearchService()
    return search.fetchUrl(url, maxChars)
  }
})
