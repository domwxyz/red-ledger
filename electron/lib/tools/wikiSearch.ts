import { registerTool } from './registry'
import { getSearchService } from '../../ipc/search'
import { numberArg, requireObjectArgs, requireStringArg } from './args'

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
    const input = requireObjectArgs(args, 'wiki_search')
    const query = requireStringArg(input, 'query', 'wiki_search')
    const numResults = numberArg(input, 'num_results', 'wiki_search', {
      defaultValue: 5,
      min: 1,
      max: 10,
      integer: true
    })
    const search = getSearchService()
    return search.searchWikipedia(query, numResults)
  }
})
