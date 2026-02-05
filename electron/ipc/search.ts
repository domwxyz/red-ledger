import { ipcMain } from 'electron'
import axios from 'axios'
import { getCurrentSettings } from './settings'
import type { SearchResult } from '../../src/types'

/**
 * Execute a web search using Tavily (preferred) or SerpAPI (fallback).
 * Exported for direct use by the tool executor.
 */
export async function executeWebSearch(
  query: string,
  numResults: number = 5
): Promise<SearchResult[]> {
  const settings = getCurrentSettings()
  const count = Math.max(1, Math.min(10, numResults))

  // Try Tavily first (preferred)
  if (settings.tavilyApiKey) {
    return searchTavily(query, count, settings.tavilyApiKey)
  }

  // Fall back to SerpAPI
  if (settings.serpApiKey) {
    return searchSerpApi(query, count, settings.serpApiKey)
  }

  throw new Error(
    'No search API key configured. Add a Tavily or SerpAPI key in Settings.'
  )
}

async function searchTavily(
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

async function searchSerpApi(
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

// ─── IPC Registration ────────────────────────────────────────────────────────

export function registerSearchHandlers(): void {
  ipcMain.handle('search:web', async (_event, query: string, numResults?: number) => {
    return executeWebSearch(query, numResults)
  })
}
