import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { WorkspaceService } from '../WorkspaceService'
import type { Settings } from '../../../src/types'

const BASE_SETTINGS: Settings = {
  activeProvider: 'openai',
  providers: {
    openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', models: [] },
    openrouter: { apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', models: [] },
    ollama: { apiKey: '', baseUrl: 'http://localhost:11434', models: [] },
    lmstudio: { apiKey: '', baseUrl: 'http://localhost:1234', models: [], compatibility: 'openai' }
  },
  defaultModel: 'gpt-4',
  temperatureEnabled: false,
  temperature: 0.7,
  maxTokens: 4096,
  strictMode: false,
  darkMode: false,
  tavilyApiKey: '',
  serpApiKey: '',
  orgSite: '',
  lastWorkspacePath: null
}

describe('WorkspaceService.writeFile', () => {
  let workspaceRoot: string
  let service: WorkspaceService

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'red-ledger-workspace-'))
    service = new WorkspaceService(() => BASE_SETTINGS)
    service.setWorkspacePath(workspaceRoot)
  })

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true })
  })

  it('creates parent directories for nested write paths', async () => {
    await service.writeFile(null, 'reports/file.md', '# Report\n', false)

    const filePath = join(workspaceRoot, 'reports', 'file.md')
    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, 'utf-8')).toBe('# Report\n')
  })

  it('creates parent directories when appending to a nested path', async () => {
    const filePath = join(workspaceRoot, 'logs', 'daily', 'run.log')

    await service.writeFile(null, 'logs/daily/run.log', 'line1\n', true)
    await service.writeFile(null, 'logs/daily/run.log', 'line2\n', true)

    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, 'utf-8')).toBe('line1\nline2\n')
  })

  it('writes binary files and creates parent directories', async () => {
    const filePath = join(workspaceRoot, 'exports', 'report.pdf')
    const content = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])

    await service.writeBinaryFile(null, 'exports/report.pdf', content)

    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath)).toEqual(content)
  })
})
