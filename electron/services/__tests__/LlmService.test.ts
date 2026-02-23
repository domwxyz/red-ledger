import { describe, expect, it } from 'vitest'
import { LlmService } from '../LlmService'
import { createHash } from 'node:crypto'
import type { Attachment } from '../../../src/types'

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

function invokeBuildTextAttachmentBlocks(service: LlmService, attachments: Attachment[]): string {
  const internal = service as unknown as {
    buildTextAttachmentBlocks: (value: Attachment[]) => string
  }
  return internal.buildTextAttachmentBlocks(attachments)
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

describe('LlmService text attachment formatting', () => {
  it('renders text attachments as strict tags with md5 and line metadata', () => {
    const service = createService()
    const content = 'Workers of the world,\nunite!'
    const md5 = createHash('md5').update(content, 'utf8').digest('hex')
    const result = invokeBuildTextAttachmentBlocks(service, [
      { kind: 'text', name: 'manifesto.txt', content }
    ])

    expect(result).toContain(`<attached_file name="manifesto.txt" md5="${md5}" lines="2">`)
    expect(result).toContain(content)
    expect(result).toContain('</attached_file>')
    expect(result).not.toContain('```')
  })

  it('escapes attachment names and ignores image attachments', () => {
    const service = createService()
    const result = invokeBuildTextAttachmentBlocks(service, [
      { kind: 'text', name: 'dialectics "v1" <draft>&.md', content: 'line one' },
      { kind: 'image', name: 'poster.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }
    ])

    expect(result).toContain('name="dialectics &quot;v1&quot; &lt;draft&gt;&amp;.md"')
    expect((result.match(/<attached_file /g) || []).length).toBe(1)
    expect(result).not.toContain('poster.png')
  })
})
