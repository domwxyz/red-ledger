import { registerTool } from './registry'
import { getSearchService } from '../../ipc/search'
import { numberArg, requireObjectArgs, requireStringArg } from './args'

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
    const input = requireObjectArgs(args, 'web_search')
    const query = requireStringArg(input, 'query', 'web_search')
    const numResults = numberArg(input, 'num_results', 'web_search', {
      defaultValue: 5,
      min: 1,
      max: 10,
      integer: true
    })
    const search = getSearchService()
    return search.search(query, numResults)
  }
})
