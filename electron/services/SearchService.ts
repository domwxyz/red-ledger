import axios from 'axios'
import type {
  AddressFamily as AxiosAddressFamily,
  LookupAddress as AxiosLookupAddress,
  LookupAddressEntry as AxiosLookupAddressEntry
} from 'axios'
import { lookup } from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import { isIP } from 'node:net'
import type { SearchResult, Settings } from '../../src/types'

interface ExtractedLink {
  text: string
  url: string
  isInternal: boolean
}

interface RedirectableResponse {
  data: unknown
  headers?: Record<string, unknown>
  status?: number
}

interface LookupRequestOptions {
  all?: boolean
  family?: number
}

interface SafeLookupAddress extends AxiosLookupAddressEntry {
  family: Exclude<AxiosAddressFamily, undefined>
}

const FETCH_TIMEOUT_MS = 20_000
const FETCH_MAX_BYTES = 5_000_000
const MAX_FETCH_REDIRECTS = 5

const BLOCKED_IPV4_SUBNETS: Array<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
]

const ALL_IPV6_BITS = (1n << 128n) - 1n

const BLOCKED_IPV6_SUBNETS = [
  { network: parseIpv6Literal('::'), prefix: 128 },
  { network: parseIpv6Literal('::1'), prefix: 128 },
  { network: parseIpv6Literal('fc00::'), prefix: 7 },
  { network: parseIpv6Literal('fe80::'), prefix: 10 },
  { network: parseIpv6Literal('fec0::'), prefix: 10 },
  { network: parseIpv6Literal('ff00::'), prefix: 8 },
  { network: parseIpv6Literal('2001:db8::'), prefix: 32 }
]

function normalizeHost(hostname: string): string {
  return hostname
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase()
}

function parseIpv4Octets(address: string): number[] | null {
  const parts = address.split('.')
  if (parts.length !== 4) return null

  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null
    const value = Number.parseInt(part, 10)
    if (!Number.isInteger(value) || value < 0 || value > 255) return null
    octets.push(value)
  }

  return octets
}

function ipv4ToInt(address: string): number | null {
  const octets = parseIpv4Octets(address)
  if (!octets) return null

  return (
    ((octets[0] << 24) >>> 0) |
    (octets[1] << 16) |
    (octets[2] << 8) |
    octets[3]
  ) >>> 0
}

function ipv4Mask(prefix: number): number {
  if (prefix <= 0) return 0
  if (prefix >= 32) return 0xFFFFFFFF
  return (0xFFFFFFFF << (32 - prefix)) >>> 0
}

function isInIpv4Subnet(address: string, network: string, prefix: number): boolean {
  const ip = ipv4ToInt(address)
  const subnet = ipv4ToInt(network)
  if (ip === null || subnet === null) return false

  const mask = ipv4Mask(prefix)
  return (ip & mask) === (subnet & mask)
}

function parseIpv6Literal(address: string): bigint {
  const normalized = normalizeHost(address)
  const mappedPrefix = '::ffff:'

  if (normalized.startsWith(mappedPrefix) && normalized.includes('.')) {
    const mapped = normalized.slice(mappedPrefix.length)
    const octets = parseIpv4Octets(mapped)
    if (!octets) {
      throw new Error(`Invalid IPv6 literal: ${address}`)
    }

    return (0xFFFFn << 32n) |
      (BigInt(octets[0]) << 24n) |
      (BigInt(octets[1]) << 16n) |
      (BigInt(octets[2]) << 8n) |
      BigInt(octets[3])
  }

  let candidate = normalized
  if (candidate.includes('.')) {
    const lastColon = candidate.lastIndexOf(':')
    if (lastColon === -1) {
      throw new Error(`Invalid IPv6 literal: ${address}`)
    }

    const ipv4Tail = candidate.slice(lastColon + 1)
    const octets = parseIpv4Octets(ipv4Tail)
    if (!octets) {
      throw new Error(`Invalid IPv6 literal: ${address}`)
    }

    const upper = ((octets[0] << 8) | octets[1]).toString(16)
    const lower = ((octets[2] << 8) | octets[3]).toString(16)
    const prefix = candidate.slice(0, lastColon)
    candidate = prefix.endsWith(':')
      ? `${prefix}${upper}:${lower}`
      : `${prefix}:${upper}:${lower}`
  }

  const doubleColonParts = candidate.split('::')
  if (doubleColonParts.length > 2) {
    throw new Error(`Invalid IPv6 literal: ${address}`)
  }

  const left = doubleColonParts[0]
    ? doubleColonParts[0].split(':').filter(Boolean)
    : []
  const right = doubleColonParts[1]
    ? doubleColonParts[1].split(':').filter(Boolean)
    : []

  const groups = doubleColonParts.length === 2
    ? (() => {
      const missingGroups = 8 - (left.length + right.length)
      if (missingGroups < 1) {
        throw new Error(`Invalid IPv6 literal: ${address}`)
      }
      return [...left, ...Array(missingGroups).fill('0'), ...right]
    })()
    : candidate.split(':')

  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) {
    throw new Error(`Invalid IPv6 literal: ${address}`)
  }

  return groups.reduce((value, group) => (
    (value << 16n) + BigInt(Number.parseInt(group, 16))
  ), 0n)
}

function ipv6Mask(prefix: number): bigint {
  if (prefix <= 0) return 0n
  if (prefix >= 128) return ALL_IPV6_BITS
  return (ALL_IPV6_BITS << BigInt(128 - prefix)) & ALL_IPV6_BITS
}

function isInIpv6Subnet(address: string, network: bigint, prefix: number): boolean {
  let parsed: bigint
  try {
    parsed = parseIpv6Literal(address)
  } catch {
    return false
  }

  const mask = ipv6Mask(prefix)
  return (parsed & mask) === (network & mask)
}

function isBlockedIpv4(address: string): boolean {
  return BLOCKED_IPV4_SUBNETS.some(([network, prefix]) => isInIpv4Subnet(address, network, prefix))
}

function isBlockedIpv6(address: string): boolean {
  const normalized = normalizeHost(address)
  const mappedPrefix = '::ffff:'
  if (normalized.startsWith(mappedPrefix) && normalized.includes('.')) {
    return isBlockedIpv4(normalized.slice(mappedPrefix.length))
  }

  return BLOCKED_IPV6_SUBNETS.some(({ network, prefix }) => isInIpv6Subnet(normalized, network, prefix))
}

function isBlockedIpAddress(address: string): boolean {
  const normalized = normalizeHost(address)
  const family = isIP(normalized)
  if (family === 4) return isBlockedIpv4(normalized)
  if (family === 6) return isBlockedIpv6(normalized)
  return false
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
    const { response, finalUrl } = await this.fetchUrlWithRedirects(parsedUrl)

    const contentTypeHeader = String(response.headers?.['content-type'] || '')
    const contentType = contentTypeHeader.split(';')[0]?.trim().toLowerCase() || 'unknown'

    if (!contentType.includes('text/html') && !contentType.startsWith('text/')) {
      throw new Error(`Unsupported content type: ${contentType || 'unknown'}`)
    }

    const raw = String(response.data || '')
    const title = this.extractTitle(raw)
    const links = contentType.includes('text/html')
      ? this.extractLinksFromHtml(raw, finalUrl.toString())
      : []

    const text = contentType.includes('text/html')
      ? this.extractHtmlText(raw, finalUrl.toString())
      : raw.trim()

    const truncated = text.length > boundedMaxChars
    return {
      url: finalUrl.toString(),
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

  private async fetchUrlWithRedirects(initialUrl: URL): Promise<{
    response: RedirectableResponse
    finalUrl: URL
  }> {
    let currentUrl = initialUrl

    for (let redirectCount = 0; redirectCount <= MAX_FETCH_REDIRECTS; redirectCount++) {
      const safeAddresses = await this.resolveSafeFetchAddresses(currentUrl)

      const response = await axios.get<string>(currentUrl.toString(), {
        responseType: 'text',
        timeout: FETCH_TIMEOUT_MS,
        maxContentLength: FETCH_MAX_BYTES,
        maxBodyLength: FETCH_MAX_BYTES,
        maxRedirects: 0,
        validateStatus: (status) => (status >= 200 && status < 300) || this.isRedirectStatus(status),
        lookup: this.createPinnedLookup(currentUrl.hostname, safeAddresses),
        headers: {
          'User-Agent': 'RedLedger/1.0'
        }
      }) as RedirectableResponse

      const status = typeof response.status === 'number' ? response.status : 200
      if (!this.isRedirectStatus(status)) {
        return { response, finalUrl: currentUrl }
      }

      const location = this.readHeaderValue(response.headers, 'location')
      if (!location) {
        throw new Error('URL redirected without a valid location header')
      }

      currentUrl = new URL(location, currentUrl)
    }

    throw new Error(`Too many redirects (maximum ${MAX_FETCH_REDIRECTS})`)
  }

  private isRedirectStatus(status: number): boolean {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
  }

  private readHeaderValue(headers: Record<string, unknown> | undefined, name: string): string | undefined {
    if (!headers) return undefined

    const getter = (headers as { get?: (key: string) => unknown }).get
    if (typeof getter === 'function') {
      const viaGetter = getter.call(headers, name)
      if (typeof viaGetter === 'string' && viaGetter.trim()) {
        return viaGetter.trim()
      }
    }

    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== name.toLowerCase()) continue
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (Array.isArray(value)) {
        const firstString = value.find((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        if (firstString) return firstString.trim()
      }
    }

    return undefined
  }

  private createPinnedLookup(hostname: string, safeAddresses: SafeLookupAddress[]) {
    const normalizedHostname = normalizeHost(hostname)

    return (
      requestedHost: string,
      options: LookupRequestOptions,
      callback: (
        err: Error | null,
        address: AxiosLookupAddress | AxiosLookupAddress[],
        family?: AxiosAddressFamily
      ) => void
    ): void => {
      if (normalizeHost(requestedHost) !== normalizedHostname) {
        callback(new Error('Refusing to resolve an unexpected host'), '')
        return
      }

      const requestedFamily = options?.family
      const filteredAddresses = typeof requestedFamily === 'number' && (requestedFamily === 4 || requestedFamily === 6)
        ? safeAddresses.filter((entry) => entry.family === requestedFamily)
        : safeAddresses

      if (filteredAddresses.length === 0) {
        callback(new Error(`No safe IP addresses available for ${requestedHost}`), '')
        return
      }

      if (options?.all) {
        callback(null, filteredAddresses)
        return
      }

      const [first] = filteredAddresses
      callback(null, first.address, first.family)
    }
  }

  private async resolveSafeFetchAddresses(targetUrl: URL): Promise<SafeLookupAddress[]> {
    const hostname = normalizeHost(targetUrl.hostname)
    if (!hostname) {
      throw new Error('Invalid URL host')
    }

    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      throw new Error('Refusing to fetch local or private network resources')
    }

    if (isBlockedIpAddress(hostname)) {
      throw new Error('Refusing to fetch local or private network resources')
    }

    const ipFamily = isIP(hostname)
    if (ipFamily !== 0) {
      return [{
        address: hostname,
        family: ipFamily as SafeLookupAddress['family']
      }]
    }

    let records: LookupAddress[]
    try {
      records = await lookup(hostname, { all: true, verbatim: true }) as LookupAddress[]
    } catch {
      throw new Error(`Unable to resolve host: ${hostname}`)
    }

    if (records.length === 0) {
      throw new Error(`Unable to resolve host: ${hostname}`)
    }

    if (records.some((record) => isBlockedIpAddress(record.address))) {
      throw new Error('Refusing to fetch local or private network resources')
    }

    return records.map((record) => ({
      address: record.address,
      family: record.family === 6 ? 6 : 4
    }))
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
