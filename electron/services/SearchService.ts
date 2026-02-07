import axios from 'axios'
import type { SearchResult, Settings } from '../../src/types'

/**
 * Domain service for web search.
 * Supports Tavily (preferred) and SerpAPI (fallback).
 * No Electron imports.
 */
export class SearchService {
  private getSettings: () => Settings

  constructor(getSettings: () => Settings) {
    this.getSettings = getSettings
  }

  async search(query: string, numResults: number = 5): Promise<SearchResult[]> {
    const settings = this.getSettings()
    const count = Math.max(1, Math.min(10, numResults))

    // Try Tavily first (preferred)
    if (settings.tavilyApiKey) {
      return this.searchTavily(query, count, settings.tavilyApiKey)
    }

    // Fall back to SerpAPI
    if (settings.serpApiKey) {
      return this.searchSerpApi(query, count, settings.serpApiKey)
    }

    throw new Error(
      'No search API key configured. Add a Tavily or SerpAPI key in Settings.'
    )
  }

  private async searchTavily(
    query: string,
    numResults: number,
    apiKey: string
  ): Promise<SearchResult[]> {
    const response = await axios.post(
      'https://api.tavily.com/search',
      {
        api_key: apiKey,
        query,
        max_results: numResults,
        search_depth: 'basic'
      },
      { timeout: 15_000 }
    )

    const results: SearchResult[] = (response.data?.results || []).map(
      (r: { title: string; url: string; content: string }) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.content || ''
      })
    )

    return results.slice(0, numResults)
  }

  private async searchSerpApi(
    query: string,
    numResults: number,
    apiKey: string
  ): Promise<SearchResult[]> {
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        q: query,
        api_key: apiKey,
        num: numResults,
        engine: 'google'
      },
      timeout: 15_000
    })

    const organic = response.data?.organic_results || []
    const results: SearchResult[] = organic.map(
      (r: { title: string; link: string; snippet: string }) => ({
        title: r.title || '',
        url: r.link || '',
        snippet: r.snippet || ''
      })
    )

    return results.slice(0, numResults)
  }
}
