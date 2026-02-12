import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { SearchService } from '../SearchService'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

const mockedAxios = vi.mocked(axios, true)

describe('SearchService.fetchUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('includes anchor hrefs as absolute URLs in extracted html text', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: `<!doctype html>
        <html>
          <head><title>Daily News</title></head>
          <body>
            <h2><a href="/stories/one">Frontpage One</a></h2>
            <p><a href="https://example.com/stories/two">Frontpage Two</a></p>
            <p><a href="/stories/query?a=1&amp;b=2">Frontpage Query</a></p>
            <p><a href="#top">Jump Link</a></p>
            <p><a href="mailto:tips@example.com">Send Tip</a></p>
          </body>
        </html>`,
      headers: {
        'content-type': 'text/html; charset=utf-8'
      }
    })

    const service = new SearchService(() => ({} as never))
    const result = await service.fetchUrl('https://news.example.org/', 20_000)

    expect(result.title).toBe('Daily News')
    expect(result.content).toContain('Frontpage One (https://news.example.org/stories/one)')
    expect(result.content).toContain('Frontpage Two (https://example.com/stories/two)')
    expect(result.content).toContain(
      'Frontpage Query (https://news.example.org/stories/query?a=1&b=2)'
    )
    expect(result.content).not.toContain('mailto:tips@example.com')
    expect(result.content).not.toContain('(#top)')
    expect(result.links).toEqual([
      {
        text: 'Frontpage One',
        url: 'https://news.example.org/stories/one',
        isInternal: true
      },
      {
        text: 'Frontpage Two',
        url: 'https://example.com/stories/two',
        isInternal: false
      },
      {
        text: 'Frontpage Query',
        url: 'https://news.example.org/stories/query?a=1&b=2',
        isInternal: true
      }
    ])
  })

  it('dedupes links and strips URL fragments for fetchable follow-up links', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: `<!doctype html>
        <html>
          <body>
            <a href="/story/alpha#section-1">Alpha Story</a>
            <a href="/story/alpha#section-2">Alpha Story Duplicate</a>
            <a href="//cdn.example.com/assets/doc">CDN Doc</a>
          </body>
        </html>`,
      headers: {
        'content-type': 'text/html; charset=utf-8'
      }
    })

    const service = new SearchService(() => ({} as never))
    const result = await service.fetchUrl('https://news.example.org/', 20_000)

    expect(result.links).toEqual([
      {
        text: 'Alpha Story',
        url: 'https://news.example.org/story/alpha',
        isInternal: true
      },
      {
        text: 'CDN Doc',
        url: 'https://cdn.example.com/assets/doc',
        isInternal: false
      }
    ])
  })
})
