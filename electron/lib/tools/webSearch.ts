import { registerTool } from './registry'
import { getSearchService } from '../../ipc/search'
import { PathJailError } from '../../services/pathJail'

registerTool({
  definition: {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information. Returns titles, URLs, and snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query'
          },
          num_results: {
            type: 'number',
            description: 'Number of results to return (1-10, default 5)'
          }
        },
        required: ['query']
      }
    }
  },
  execute: async (args) => {
    const query = args.query as string
    if (!query) throw new PathJailError('INVALID_INPUT', 'web_search requires a "query" argument')
    const numResults = parseInt(String(args.num_results || '5'), 10) || 5
    const search = getSearchService()
    return search.search(query, numResults)
  }
})
