import { registerTool } from './registry'
import { getSearchService } from '../../ipc/search'
import { numberArg, requireObjectArgs, requireStringArg } from './args'

registerTool({
  definition: {
    type: 'function',
    function: {
      name: 'org_search',
      description: 'Search the web with an optional organization site filter from settings. Returns titles, URLs, and snippets.',
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
    const input = requireObjectArgs(args, 'org_search')
    const query = requireStringArg(input, 'query', 'org_search')
    const numResults = numberArg(input, 'num_results', 'org_search', {
      defaultValue: 5,
      min: 1,
      max: 10,
      integer: true
    })
    const search = getSearchService()
    return search.orgSearch(query, numResults)
  }
})
