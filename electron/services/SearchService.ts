import axios from 'axios'
import type { SearchResult, Settings } from '../../src/types'

interface ExtractedLink {
  text: string
  url: string
  isInternal: boolean
}

/**
 * Domain service for web search.
 * Supports Tavily (preferred) and SerpAPI (fallback), plus org-scoped and Wikipedia search.
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
      try {
        return await this.searchTavily(query, count, settings.tavilyApiKey)
      } catch {
        if (!settings.serpApiKey) {
          throw new Error('Tavily search failed and no SerpAPI key is configured.')
        }
      }
    }

    // Fall back to SerpAPI
    if (settings.serpApiKey) {
      return this.searchSerpApi(query, count, settings.serpApiKey)
    }

    throw new Error(
      'No search API key configured. Add a Tavily or SerpAPI key in Settings.'
    )
  }

  async orgSearch(query: string, numResults: number = 5): Promise<SearchResult[]> {
    const settings = this.getSettings()
    const scopedQuery = this.applySiteOperator(query, settings.orgSite)
    return this.search(scopedQuery, numResults)
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
    links: ExtractedLink[]
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
    const links = contentType.includes('text/html')
      ? this.extractLinksFromHtml(raw, parsedUrl.toString())
      : []

    const text = contentType.includes('text/html')
      ? this.extractHtmlText(raw, parsedUrl.toString())
      : raw.trim()

    const truncated = text.length > boundedMaxChars
    return {
      url: parsedUrl.toString(),
      title,
      content: truncated ? text.slice(0, boundedMaxChars) : text,
      links,
      truncated,
      contentType
    }
  }

  private extractTitle(html: string): string {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    return this.decodeHtmlEntities((m?.[1] || '').trim())
  }

  private extractHtmlText(html: string, baseUrl: string): string {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    const body = bodyMatch?.[1] || html

    const withInlineLinks = this.inlineAnchorUrls(body, baseUrl)

    const withoutBlocked = withInlineLinks
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

  private inlineAnchorUrls(html: string, baseUrl: string): string {
    const anchorRegex =
      /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))[^>]*>([\s\S]*?)<\/a>/gi

    return html.replace(anchorRegex, (_match, doubleQuoted, singleQuoted, bare, innerHtml) => {
      const href = String(doubleQuoted || singleQuoted || bare || '').trim()
      const resolved = this.resolveFetchableUrl(href, baseUrl)
      if (!resolved) return String(innerHtml || '')
      const text = String(innerHtml || '')
      return text.trim() ? `${text} (${resolved})` : resolved
    })
  }

  private extractLinksFromHtml(html: string, baseUrl: string): ExtractedLink[] {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    const body = bodyMatch?.[1] || html
    const origin = new URL(baseUrl).origin
    const seen = new Set<string>()
    const links: ExtractedLink[] = []
    const maxLinks = 200

    const anchorRegex =
      /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))[^>]*>([\s\S]*?)<\/a>/gi

    body.replace(anchorRegex, (_match, doubleQuoted, singleQuoted, bare, innerHtml) => {
      if (links.length >= maxLinks) return _match

      const href = String(doubleQuoted || singleQuoted || bare || '').trim()
      const resolved = this.resolveFetchableUrl(href, baseUrl)
      if (!resolved || seen.has(resolved)) return _match

      const text = this.extractAnchorText(String(innerHtml || ''))
      seen.add(resolved)
      links.push({
        text: text || resolved,
        url: resolved,
        isInternal: resolved.startsWith(origin + '/') || resolved === origin
      })

      return _match
    })

    return links
  }

  private resolveFetchableUrl(href: string, baseUrl: string): string | null {
    if (!href) return null

    const decodedHref = this.decodeHtmlEntities(href).trim()
    if (!decodedHref || decodedHref.startsWith('#')) return null

    try {
      const absolute = new URL(decodedHref, baseUrl)
      if (!['http:', 'https:'].includes(absolute.protocol)) return null
      absolute.hash = ''
      return absolute.toString()
    } catch {
      return null
    }
  }

  private extractAnchorText(innerHtml: string): string {
    const withoutTags = innerHtml.replace(/<[^>]+>/g, ' ')
    return this.decodeHtmlEntities(withoutTags)
      .replace(/\s+/g, ' ')
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
      .replace(/&#(\d+);/g, (match, dec) => this.decodeCodePoint(dec, 10) ?? match)
      .replace(/&#x([0-9a-f]+);/gi, (match, hex) => this.decodeCodePoint(hex, 16) ?? match)
  }

  private decodeCodePoint(value: string, radix: 10 | 16): string | null {
    const parsed = Number.parseInt(value, radix)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0x10FFFF) {
      return null
    }

    try {
      return String.fromCodePoint(parsed)
    } catch {
      return null
    }
  }

  private applySiteOperator(query: string, orgSite: string | undefined): string {
    const trimmedQuery = query.trim()
    const normalizedSite = this.normalizeOrgSite(orgSite)
    if (!normalizedSite || /\bsite:/i.test(trimmedQuery)) {
      return trimmedQuery
    }
    if (!trimmedQuery) {
      return `site:${normalizedSite}`
    }
    return `${trimmedQuery} site:${normalizedSite}`
  }

  private normalizeOrgSite(orgSite: string | undefined): string | null {
    if (!orgSite) return null
    const trimmed = orgSite.trim()
    if (!trimmed) return null

    const withoutPrefix = trimmed.replace(/^site:/i, '').trim()
    if (!withoutPrefix) return null

    const [firstToken] = withoutPrefix.split(/\s+/)
    if (!firstToken) return null

    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(firstToken)
      ? firstToken
      : `https://${firstToken}`

    try {
      const parsed = new URL(candidate)
      return parsed.hostname.trim().toLowerCase() || null
    } catch {
      const fallbackHost = firstToken.split('/')[0]?.trim().toLowerCase()
      return fallbackHost || null
    }
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
