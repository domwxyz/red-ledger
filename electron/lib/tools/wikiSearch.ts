import { registerTool } from './registry'
import { getSearchService } from '../../ipc/search'
import { PathJailError } from '../../services/pathJail'

registerTool({
  definition: {
    type: 'function',
    function: {
      name: 'wiki_search',
      description: 'Search Wikipedia for encyclopedic background information. Returns article titles, URLs, and summary snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The Wikipedia search query'
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
    if (!query) throw new PathJailError('INVALID_INPUT', 'wiki_search requires a "query" argument')
    const numResults = parseInt(String(args.num_results || '5'), 10) || 5
    const search = getSearchService()
    return search.searchWikipedia(query, numResults)
  }
})
