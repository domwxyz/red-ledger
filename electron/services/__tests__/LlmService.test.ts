import { describe, expect, it } from 'vitest'
import { LlmService } from '../LlmService'

function createService(): LlmService {
  return new LlmService({
    getSettings: () => ({} as never),
    getSystemPrompt: () => ''
  })
}

function invokeBuildOrgSearchToolDescription(service: LlmService, orgSite: string): string {
  const internal = service as unknown as {
    buildOrgSearchToolDescription: (value: string | undefined) => string
  }
  return internal.buildOrgSearchToolDescription(orgSite)
}

describe('LlmService org_search tool description', () => {
  it('includes the configured org site and effective site operator', () => {
    const service = createService()
    const description = invokeBuildOrgSearchToolDescription(service, 'reuters.com')

    expect(description).toContain('Current org_search site setting: "reuters.com"')
    expect(description).toContain('effective filter: site:reuters.com')
  })

  it('normalizes URL org sites to hostname for the effective site operator', () => {
    const service = createService()
    const description = invokeBuildOrgSearchToolDescription(
      service,
      'https://www.reuters.com/world/business?foo=1'
    )

    expect(description).toContain(
      'Current org_search site setting: "https://www.reuters.com/world/business?foo=1"'
    )
    expect(description).toContain('effective filter: site:www.reuters.com')
  })

  it('reports when org site is not set', () => {
    const service = createService()
    const description = invokeBuildOrgSearchToolDescription(service, '   ')

    expect(description).toContain('Current org_search site setting: not set')
  })
})
