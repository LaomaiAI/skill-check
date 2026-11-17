import { describe, expect, it } from 'vitest'
import {
  conflictsCheck,
  contextCheck,
  estimateTokens,
  freshnessCheck,
  manifestCheck,
  parseFrontmatter,
  runSkillCheck,
  verdictFor,
} from './skillcheck'
import { BAD_SKILL, GOOD_SKILL, MEDIOCRE_SKILL, SAMPLE_INSTALLED } from './samples'

describe('parseFrontmatter', () => {
  it('parses name and description', () => {
    const fm = parseFrontmatter(GOOD_SKILL)
    expect(fm.present).toBe(true)
    expect(fm.data['name']).toBe('pdf-tools')
    expect(fm.data['description']).toContain('when you need')
    expect(fm.body).toContain('# PDF Tools')
    expect(fm.unknownKeys).toEqual([])
  })

  it('reports missing frontmatter', () => {
    const fm = parseFrontmatter(BAD_SKILL)
    expect(fm.present).toBe(false)
    expect(fm.body).toBe(BAD_SKILL)
  })

  it('folds a > block scalar', () => {
    const fm = parseFrontmatter('---\nname: x\ndescription: >\n  hello\n  world\n---\nbody\n')
    expect(fm.present).toBe(true)
    expect(fm.data['description']).toBe('hello world')
  })

  it('flags unknown keys', () => {
    const fm = parseFrontmatter('---\nname: x\ndescription: d\nsurprise: 1\n---\nbody\n')
    expect(fm.unknownKeys).toEqual(['surprise'])
  })
})

describe('manifestCheck', () => {
  it('gives a perfect Skill 100', () => {
    expect(manifestCheck(GOOD_SKILL).score).toBe(100)
  })

  it('gives no frontmatter 0', () => {
    const r = manifestCheck(BAD_SKILL)
    expect(r.score).toBe(0)
    expect(r.findings.some((f) => f.level === 'fail')).toBe(true)
  })

  it('gives a short description 90', () => {
    expect(manifestCheck(MEDIOCRE_SKILL).score).toBe(90)
  })

  it('rejects an invalid name', () => {
    const r = manifestCheck('---\nname: Bad_Name\ndescription: Does things when you need it done quickly and reliably.\n---\nbody\n')
    expect(r.score).toBeLessThan(100)
    expect(r.findings.some((f) => f.level === 'fail' && f.message.includes('name'))).toBe(true)
  })

  it('rejects a missing description', () => {
    const r = manifestCheck('---\nname: ok-name\n---\nbody\n')
    expect(r.findings.some((f) => f.level === 'fail' && f.message.includes('description'))).toBe(true)
  })
})

describe('contextCheck', () => {
  it('estimates tokens as chars / 4', () => {
    expect(estimateTokens(0)).toBe(0)
    expect(estimateTokens(4)).toBe(1)
    expect(estimateTokens(5)).toBe(2)
    expect(estimateTokens(4000)).toBe(1000)
  })

  it('scores an empty file 0', () => {
    expect(contextCheck('').score).toBe(0)
  })

  it('scores the tiers at exact boundaries', () => {
    expect(contextCheck('x'.repeat(4000)).score).toBe(100) // 1000 tokens
    expect(contextCheck('x'.repeat(4004)).score).toBe(80) // 1001 tokens
    expect(contextCheck('x'.repeat(16000)).score).toBe(80) // 4000 tokens
    expect(contextCheck('x'.repeat(16004)).score).toBe(60) // 4001 tokens
    expect(contextCheck('x'.repeat(40000)).score).toBe(60) // 10000 tokens
    expect(contextCheck('x'.repeat(40004)).score).toBe(40) // 10001 tokens
    expect(contextCheck('x'.repeat(100000)).score).toBe(40) // 25000 tokens
    expect(contextCheck('x'.repeat(100004)).score).toBe(20) // 25001 tokens
  })

  it('warns over 500 lines', () => {
    const text = Array(501).fill('x').join('\n')
    const r = contextCheck(text)
    expect(r.score).toBe(100)
    expect(r.findings.some((f) => f.message.includes('500 行'))).toBe(true)
  })
})

describe('freshnessCheck', () => {
  it('penalizes a deprecated command by 25', () => {
    const r = freshnessCheck('Run `docker-compose up`.')
    expect(r.score).toBe(75)
    expect(r.findings.some((f) => f.level === 'fail' && f.message.includes('docker-compose'))).toBe(true)
  })

  it('penalizes python2 by 25', () => {
    expect(freshnessCheck('Run `python2 setup.py`.').score).toBe(75)
  })

  it('penalizes a deprecated package by 25', () => {
    expect(freshnessCheck('Run `npm install node-sass`.').score).toBe(75)
  })

  it('penalizes a deprecated API by 25', () => {
    expect(freshnessCheck('Call https://api.twitter.com/1.1/statuses/update.json.').score).toBe(75)
  })

  it('penalizes a renamed package by 15', () => {
    expect(freshnessCheck('Run `npm install faker`.').score).toBe(85)
  })

  it('penalizes a caution package by 5', () => {
    expect(freshnessCheck('Run `npm install moment`.').score).toBe(95)
  })

  it('reports unknown URLs as not verified, capped at 20', () => {
    const text = [
      'https://api.a.com/1',
      'https://api.b.com/1',
      'https://api.c.com/1',
      'https://api.d.com/1',
      'https://api.e.com/1',
    ].join(' ')
    const r = freshnessCheck(text)
    expect(r.score).toBe(80)
    expect(r.findings.some((f) => f.message.includes('未核实'))).toBe(true)
  })

  it('reports an unknown package as not verified', () => {
    const r = freshnessCheck('Run `npm install some-random-pkg-xyz`.')
    expect(r.score).toBe(95)
    expect(r.findings.some((f) => f.message.includes('未核实'))).toBe(true)
  })

  it('gives current-only references 100', () => {
    const r = freshnessCheck('Use `git` and `curl https://api.github.com/x`.')
    expect(r.score).toBe(100)
    expect(r.findings.some((f) => f.level === 'pass')).toBe(true)
  })

  it('gives a file with no references 100', () => {
    const r = freshnessCheck('Just plain instructions, no commands.')
    expect(r.score).toBe(100)
    expect(r.findings.some((f) => f.message.includes('无时效风险'))).toBe(true)
  })
})

describe('conflictsCheck', () => {
  it('penalizes a duplicate name by 40', () => {
    const r = conflictsCheck('pdf-tools', 'Extract text from PDF files.', [{ name: 'pdf-tools' }])
    expect(r.score).toBe(60)
    expect(r.findings.some((f) => f.level === 'fail' && f.message.includes('重名'))).toBe(true)
  })

  it('penalizes overlapping trigger descriptions by 15', () => {
    const r = conflictsCheck('clip-maker', 'Edit videos and cut clips with ffmpeg', [
      { name: 'video-helper', description: 'Edit videos and cut clips with ffmpeg' },
    ])
    expect(r.score).toBe(85)
    expect(r.findings.some((f) => f.message.includes('重叠'))).toBe(true)
  })

  it('gives no overlap 100', () => {
    const r = conflictsCheck('pdf-tools', 'Extract text from PDF files.', [
      { name: 'video-helper', description: 'Edit videos and cut clips with ffmpeg' },
    ])
    expect(r.score).toBe(100)
  })

  it('skips the check gracefully with no installed list', () => {
    const r = conflictsCheck('pdf-tools', 'Extract text.', [])
    expect(r.score).toBe(100)
    expect(r.findings.some((f) => f.message.includes('未提供已装列表'))).toBe(true)
  })

  it('skips the check gracefully with no name', () => {
    const r = conflictsCheck(null, null, [{ name: 'pdf-tools' }])
    expect(r.score).toBe(100)
  })

  it('notes a common name without penalty', () => {
    const r = conflictsCheck('commit', 'Write commit messages.', [])
    expect(r.score).toBe(100)
    expect(r.findings.some((f) => f.message.includes('通用词'))).toBe(true)
  })
})

describe('verdictFor', () => {
  it('maps the tiers', () => {
    expect(verdictFor(100)).toBe('可以直接装')
    expect(verdictFor(90)).toBe('可以直接装')
    expect(verdictFor(89)).toBe('可用，先修小问题')
    expect(verdictFor(70)).toBe('可用，先修小问题')
    expect(verdictFor(69)).toBe('建议修改后再装')
    expect(verdictFor(50)).toBe('建议修改后再装')
    expect(verdictFor(49)).toBe('不建议装')
  })
})

describe('runSkillCheck on samples', () => {
  it('scores the good sample 100', () => {
    const r = runSkillCheck(GOOD_SKILL, [])
    expect(r.total).toBe(100)
    expect(r.verdict).toBe('可以直接装')
    expect(r.meta.name).toBe('pdf-tools')
    expect(r.meta.tokens).toBe(128)
  })

  it('scores the mediocre sample 85', () => {
    const r = runSkillCheck(MEDIOCRE_SKILL, [])
    expect(r.total).toBe(85)
    expect(r.verdict).toBe('可用，先修小问题')
    expect(r.checks[0].score).toBe(90)
    expect(r.checks[1].score).toBe(80)
    expect(r.checks[2].score).toBe(70)
    expect(r.checks[3].score).toBe(100)
  })

  it('scores the bad sample 46', () => {
    const r = runSkillCheck(BAD_SKILL, [])
    expect(r.total).toBe(46)
    expect(r.verdict).toBe('不建议装')
    expect(r.checks[0].score).toBe(0)
    expect(r.checks[2].score).toBe(25)
  })

  it('is deterministic', () => {
    const a = runSkillCheck(MEDIOCRE_SKILL, [])
    const b = runSkillCheck(MEDIOCRE_SKILL, [])
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('catches a name collision against the demo installed set', () => {
    const r = runSkillCheck(GOOD_SKILL, SAMPLE_INSTALLED)
    expect(r.checks[3].score).toBe(60)
    expect(r.total).toBeLessThan(100)
  })
})
