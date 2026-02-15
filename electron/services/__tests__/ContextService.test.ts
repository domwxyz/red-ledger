import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ContextService } from '../ContextService'

describe('ContextService profiles', () => {
  let tempRoot: string
  let contextDir: string
  let bundledDir: string

  const writeBundledDefaults = () => {
    writeFileSync(join(bundledDir, 'system.md'), 'Bundled system', 'utf-8')
    writeFileSync(join(bundledDir, 'user.md'), '<!-- bundled user -->', 'utf-8')
    writeFileSync(join(bundledDir, 'org.md'), '<!-- bundled org -->', 'utf-8')
  }

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'red-ledger-context-'))
    contextDir = join(tempRoot, 'contexts')
    bundledDir = join(tempRoot, 'bundled')
    mkdirSync(contextDir, { recursive: true })
    mkdirSync(bundledDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it('creates a default profile seeded from bundled defaults', () => {
    writeBundledDefaults()

    const service = new ContextService(contextDir, bundledDir)
    const state = service.listProfiles()

    expect(state.activeProfileId).toBe('default')
    expect(state.profiles).toEqual([{ id: 'default', name: 'Default' }])
    expect(service.load('system')).toBe('Bundled system')
  })

  it('migrates legacy root context files into the default profile', () => {
    writeBundledDefaults()
    writeFileSync(join(contextDir, 'system.md'), 'Legacy system', 'utf-8')
    writeFileSync(join(contextDir, 'user.md'), 'Legacy user', 'utf-8')
    writeFileSync(join(contextDir, 'org.md'), 'Legacy org', 'utf-8')

    const service = new ContextService(contextDir, bundledDir)
    const profileSystemPath = join(contextDir, 'profiles', 'default', 'system.md')

    expect(service.load('system')).toBe('Legacy system')
    expect(existsSync(profileSystemPath)).toBe(true)
    expect(readFileSync(profileSystemPath, 'utf-8')).toBe('Legacy system')
  })

  it('keeps context content isolated between profiles', () => {
    writeBundledDefaults()

    const service = new ContextService(contextDir, bundledDir)
    const created = service.createProfile('Release Planning')
    const releaseProfileId = created.profiles.find((profile) => profile.name === 'Release Planning')?.id

    expect(releaseProfileId).toBeDefined()
    expect(created.activeProfileId).toBe(releaseProfileId)
    expect(service.load('system')).toBe('')

    service.save('system', 'Release-specific system prompt')
    service.setActiveProfile('default')
    expect(service.load('system')).toBe('Bundled system')

    service.setActiveProfile(releaseProfileId as string)
    expect(service.load('system')).toBe('Release-specific system prompt')
  })

  it('deletes a non-default profile and falls back to default when needed', () => {
    writeBundledDefaults()

    const service = new ContextService(contextDir, bundledDir)
    const created = service.createProfile('Temporary Profile')
    const tempProfileId = created.profiles.find((profile) => profile.name === 'Temporary Profile')?.id

    expect(tempProfileId).toBeDefined()
    const profileDir = join(contextDir, 'profiles', tempProfileId as string)
    expect(existsSync(profileDir)).toBe(true)

    const next = service.deleteProfile(tempProfileId as string)
    expect(next.activeProfileId).toBe('default')
    expect(next.profiles.some((profile) => profile.id === tempProfileId)).toBe(false)
    expect(existsSync(profileDir)).toBe(false)
  })

  it('does not allow deleting the default profile', () => {
    writeBundledDefaults()

    const service = new ContextService(contextDir, bundledDir)
    expect(() => service.deleteProfile('default')).toThrow('cannot be deleted')
  })
})
