import axios from 'axios'
import type { SearchResult, Settings } from '../../src/types'

/**
 * Domain service for web search.
 * Supports Tavily (preferred) and SerpAPI (fallback), plus direct Wikipedia search.
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

  async searchWikipedia(query: string, numResults: number = 5): Promise<SearchResult[]> {
    const count = Math.max(1, Math.min(10, numResults))
    const timeout = 15_000

    const searchResponse = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        list: 'search',
        srsearch: query,
        srlimit: count,
        format: 'json',
        origin: '*'
      },
      headers: {
        'User-Agent': 'RedLedger/1.0'
      },
      timeout
    })

    const searchItems: Array<{ pageid: number; title: string; snippet?: string }> =
      searchResponse.data?.query?.search || []

    if (searchItems.length === 0) return []

    const pageIds = searchItems.map((item) => item.pageid).join('|')

    const extractResponse = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        prop: 'extracts',
        exintro: true,
        explaintext: true,
        pageids: pageIds,
        format: 'json',
        origin: '*'
      },
      headers: {
        'User-Agent': 'RedLedger/1.0'
      },
      timeout
    })

    const pages = (extractResponse.data?.query?.pages || {}) as Record<string, { extract?: string }>

    return searchItems.map((item) => {
      const cleanSnippet = (item.snippet || '').replace(/<[^>]*>/g, '')
      const extract = pages[String(item.pageid)]?.extract || ''
      const titleSlug = encodeURIComponent(item.title.replace(/ /g, '_'))

      return {
        title: item.title || '',
        url: `https://en.wikipedia.org/wiki/${titleSlug}`,
        snippet: (extract || cleanSnippet).slice(0, 800)
      }
    })
  }

  async fetchUrl(url: string, maxChars: number = 20_000): Promise<{
    url: string
    title: string
    content: string
    truncated: boolean
    contentType: string
  }> {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      throw new Error('Invalid URL')
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only http:// and https:// URLs are supported')
    }

    const boundedMaxChars = Math.max(1_000, Math.min(100_000, maxChars))

    const response = await axios.get<string>(parsedUrl.toString(), {
      responseType: 'text',
      timeout: 20_000,
      maxContentLength: 5_000_000,
      maxBodyLength: 5_000_000,
      headers: {
        'User-Agent': 'RedLedger/1.0'
      }
    })

    const contentTypeHeader = String(response.headers?.['content-type'] || '')
    const contentType = contentTypeHeader.split(';')[0]?.trim().toLowerCase() || 'unknown'

    if (!contentType.includes('text/html') && !contentType.startsWith('text/')) {
      throw new Error(`Unsupported content type: ${contentType || 'unknown'}`)
    }

    const raw = String(response.data || '')
    const title = this.extractTitle(raw)

    const text = contentType.includes('text/html')
      ? this.extractHtmlText(raw)
      : raw.trim()

    const truncated = text.length > boundedMaxChars
    return {
      url: parsedUrl.toString(),
      title,
      content: truncated ? text.slice(0, boundedMaxChars) : text,
      truncated,
      contentType
    }
  }

  private extractTitle(html: string): string {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    return this.decodeHtmlEntities((m?.[1] || '').trim())
  }

  private extractHtmlText(html: string): string {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    const body = bodyMatch?.[1] || html

    const withoutBlocked = body
      .replace(/<(script|style|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|tr|section|article|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')

    const decoded = this.decodeHtmlEntities(withoutBlocked)

    return decoded
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  }

  private decodeHtmlEntities(input: string): string {
    const named = input
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&apos;/gi, "'")

    return named
      .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
      .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
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
