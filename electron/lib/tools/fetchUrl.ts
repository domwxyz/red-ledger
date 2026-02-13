import { registerTool } from './registry'
import { getSearchService } from '../../ipc/search'
import { numberArg, requireObjectArgs, requireStringArg } from './args'

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
    const input = requireObjectArgs(args, 'fetch_url')
    const url = requireStringArg(input, 'url', 'fetch_url')
    const maxChars = numberArg(input, 'max_chars', 'fetch_url', {
      defaultValue: 20_000,
      min: 1_000,
      max: 100_000,
      integer: true
    })
    const search = getSearchService()
    return search.fetchUrl(url, maxChars)
  }
})
