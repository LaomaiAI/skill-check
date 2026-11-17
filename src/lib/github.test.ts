import { describe, expect, it } from 'vitest'
import { fetchSkillMd, parseInstalledList, parseSkillUrl } from './github'

describe('parseSkillUrl', () => {
  it('parses a repo root URL', () => {
    expect(parseSkillUrl('https://github.com/LaomaiAI/intent-brief')).toEqual({
      owner: 'LaomaiAI',
      repo: 'intent-brief',
      branch: '',
      path: '',
    })
  })

  it('parses a tree URL', () => {
    expect(parseSkillUrl('https://github.com/owner/repo/tree/main/skills/foo')).toEqual({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      path: 'skills/foo',
    })
  })

  it('parses a blob URL', () => {
    expect(parseSkillUrl('https://github.com/owner/repo/blob/main/skills/foo/SKILL.md')).toEqual({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      path: 'skills/foo/SKILL.md',
    })
  })

  it('parses a raw URL', () => {
    expect(parseSkillUrl('https://raw.githubusercontent.com/owner/repo/main/SKILL.md')).toEqual({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      path: 'SKILL.md',
    })
  })

  it('parses owner/repo shorthand', () => {
    expect(parseSkillUrl('owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo',
      branch: '',
      path: '',
    })
  })

  it('rejects garbage', () => {
    expect(() => parseSkillUrl('not a url')).toThrow()
    expect(() => parseSkillUrl('')).toThrow()
    expect(() => parseSkillUrl('https://example.com/foo')).toThrow()
  })
})

describe('parseInstalledList', () => {
  it('parses names and descriptions', () => {
    expect(parseInstalledList('pdf-tools: Extract text from PDF files\nvideo-helper - Edit videos\nplain-name\n')).toEqual([
      { name: 'pdf-tools', description: 'Extract text from PDF files' },
      { name: 'video-helper', description: 'Edit videos' },
      { name: 'plain-name' },
    ])
  })

  it('dedupes by name and skips blank lines', () => {
    expect(parseInstalledList('a\n\nA\nb\n')).toEqual([{ name: 'a' }, { name: 'b' }])
  })

  it('returns an empty list for empty input', () => {
    expect(parseInstalledList('')).toEqual([])
  })
})

describe('fetchSkillMd', () => {
  it('throws a clear error when the repo has no SKILL.md', async () => {
    // No network in this environment; a 404 and a network failure both
    // surface as Error, which is what the UI shows. This test only pins
    // that the failure is an Error with a readable message, not a crash.
    // fetchSkillMd aborts after 10s, so the test needs a longer timeout.
    await expect(fetchSkillMd('https://github.com/LaomaiAI/definitely-not-a-real-repo-xyz')).rejects.toThrow(Error)
  }, 15000)
})
