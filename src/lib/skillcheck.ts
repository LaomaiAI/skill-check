// Skill Check core library.
//
// Four deterministic checks for a Skill before you install it:
//   1. manifest compliance  - YAML frontmatter: name, description, allowed keys.
//   2. context usage        - estimated tokens of SKILL.md, chars / 4.
//   3. freshness            - referenced commands, packages and APIs against a
//                             built-in table with an as-of date. Items not in
//                             the table are reported as "not verified", never
//                             as wrong.
//   4. conflicts            - name collision and trigger-description overlap
//                             with already-installed Skills.
//
// 100% deterministic. Zero LLM calls. Same input -> same output.
// The scoring formula is also written in README.md.

export type FindingLevel = 'pass' | 'warn' | 'fail' | 'info'

export interface Finding {
  level: FindingLevel
  message: string
}

export type CheckId = 'manifest' | 'context' | 'freshness' | 'conflicts'

export interface CheckResult {
  id: CheckId
  title: string
  score: number
  findings: Finding[]
}

export interface SkillMeta {
  name: string | null
  description: string | null
  chars: number
  lines: number
  tokens: number
}

export interface SkillReport {
  total: number
  verdict: string
  checks: CheckResult[]
  meta: SkillMeta
}

export interface InstalledSkill {
  name: string
  description?: string
}

// ---------------------------------------------------------------------------
// Frontmatter parsing (small deterministic YAML subset)
// ---------------------------------------------------------------------------

export const ALLOWED_FRONTMATTER_KEYS = [
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
]

export interface FrontmatterResult {
  present: boolean
  data: Record<string, string>
  body: string
  unknownKeys: string[]
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parseFrontmatter(text: string): FrontmatterResult {
  const m = FRONTMATTER_RE.exec(text)
  if (!m) {
    return { present: false, data: {}, body: text, unknownKeys: [] }
  }
  const raw = m[1]
  const body = text.slice(m[0].length)
  const data: Record<string, string> = {}
  const unknownKeys: string[] = []
  const lines = raw.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!kv) {
      i++
      continue
    }
    const key = kv[1]
    let value = kv[2].trim()
    // Block scalar: `>` folds lines with spaces, `|` keeps newlines.
    if (value === '>' || value === '|') {
      const folded = value === '>'
      const parts: string[] = []
      i++
      while (i < lines.length && /^(\s+)\S/.test(lines[i])) {
        parts.push(lines[i].trim())
        i++
      }
      value = folded ? parts.join(' ') : parts.join('\n')
      data[key] = value
      if (!ALLOWED_FRONTMATTER_KEYS.includes(key)) unknownKeys.push(key)
      continue
    }
    // Strip matching single or double quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    data[key] = value
    if (!ALLOWED_FRONTMATTER_KEYS.includes(key)) unknownKeys.push(key)
    i++
  }
  return { present: true, data, body, unknownKeys }
}

// ---------------------------------------------------------------------------
// Check 1: manifest compliance
// ---------------------------------------------------------------------------

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const USAGE_WORDS = /(when|use|used for|用于|当|适合|帮你|用来)/i

export function manifestCheck(text: string): CheckResult {
  const findings: Finding[] = []
  let score = 0
  const fm = parseFrontmatter(text)

  if (!fm.present) {
    findings.push({
      level: 'fail',
      message: '缺少 YAML frontmatter：SKILL.md 必须以 --- 开头，后面写 name 和 description。',
    })
    return { id: 'manifest', title: '清单合规', score: 0, findings }
  }
  findings.push({ level: 'pass', message: 'frontmatter 存在。' })
  score += 25

  const name = fm.data['name']
  if (name && NAME_RE.test(name) && name.length <= 64) {
    findings.push({ level: 'pass', message: `name 为 "${name}"，格式合规（小写字母、数字、短横线）。` })
    score += 25
  } else if (name) {
    findings.push({
      level: 'fail',
      message: `name 为 "${name}"，格式不合规：只能用小写字母、数字和短横线，长度不超过 64。`,
    })
  } else {
    findings.push({ level: 'fail', message: '缺少 name 字段。' })
  }

  const description = fm.data['description']
  if (description && description.trim().length > 0) {
    findings.push({ level: 'pass', message: 'description 存在。' })
    score += 25
    if (description.trim().length >= 40 && USAGE_WORDS.test(description)) {
      findings.push({ level: 'pass', message: 'description 写清了什么时候用这个 Skill。' })
      score += 15
    } else {
      findings.push({
        level: 'warn',
        message: 'description 太短或没写清楚什么时候用：建议写 40 字以上，并说明触发场景。',
      })
      score += 5
    }
  } else {
    findings.push({ level: 'fail', message: '缺少 description 字段。' })
  }

  if (fm.unknownKeys.length === 0) {
    findings.push({ level: 'pass', message: '没有未识别的 frontmatter 字段。' })
    score += 10
  } else {
    findings.push({
      level: 'warn',
      message: `出现未识别的 frontmatter 字段：${fm.unknownKeys.join('、')}。只认 name、description、license、compatibility、metadata、allowed-tools。`,
    })
  }

  return { id: 'manifest', title: '清单合规', score, findings }
}

// ---------------------------------------------------------------------------
// Check 2: context usage estimate
// ---------------------------------------------------------------------------

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4)
}

export function countLines(text: string): number {
  if (text === '') return 0
  return text.split('\n').length
}

export function contextCheck(text: string): CheckResult {
  const findings: Finding[] = []
  const chars = text.length
  const lines = countLines(text)
  const tokens = estimateTokens(chars)

  let score: number
  if (tokens === 0) {
    score = 0
    findings.push({ level: 'fail', message: '文件为空，无法估算上下文占用。' })
  } else if (tokens <= 1000) {
    score = 100
    findings.push({ level: 'pass', message: `约 ${tokens} tokens（${chars} 字符 / 4），非常轻。` })
  } else if (tokens <= 4000) {
    score = 80
    findings.push({ level: 'pass', message: `约 ${tokens} tokens（${chars} 字符 / 4），较轻。` })
  } else if (tokens <= 10000) {
    score = 60
    findings.push({ level: 'warn', message: `约 ${tokens} tokens（${chars} 字符 / 4），偏重：每次调用都要读这么多上下文。` })
  } else if (tokens <= 25000) {
    score = 40
    findings.push({ level: 'warn', message: `约 ${tokens} tokens（${chars} 字符 / 4），很重：建议拆成多个小 Skill 或把长内容移到引用文件。` })
  } else {
    score = 20
    findings.push({ level: 'fail', message: `约 ${tokens} tokens（${chars} 字符 / 4），过重：装上之后每次触发都要吃掉大量上下文。` })
  }

  if (lines > 500) {
    findings.push({
      level: 'warn',
      message: `SKILL.md 共 ${lines} 行，超过 500 行：建议 500 行以内，细节移到引用文件。`,
    })
  } else if (lines > 0) {
    findings.push({ level: 'pass', message: `共 ${lines} 行，在 500 行以内。` })
  }

  return { id: 'context', title: '上下文占用', score, findings }
}

// ---------------------------------------------------------------------------
// Check 3: freshness of referenced commands, packages and APIs
// ---------------------------------------------------------------------------

export type FreshnessStatus = 'current' | 'deprecated' | 'renamed' | 'caution'

export interface FreshnessEntry {
  pattern: string
  kind: 'command' | 'package' | 'api'
  status: FreshnessStatus
  replacement?: string
  note: string
  source: string
}

// Built-in table. Checked 2026-11-17. Items not in this table are reported
// as "not verified", never as wrong. The table is versioned with the code;
// update it when a tool ships a new major version or deprecation notice.
export const FRESHNESS_TABLE_CHECKED_AT = '2026-11-17'

export const FRESHNESS_TABLE: FreshnessEntry[] = [
  // Commands: current
  { pattern: 'docker compose', kind: 'command', status: 'current', note: 'Docker Compose V2，当前写法。', source: 'docs.docker.com/compose' },
  { pattern: 'git', kind: 'command', status: 'current', note: '当前版本。', source: 'git-scm.com' },
  { pattern: 'gh', kind: 'command', status: 'current', note: 'GitHub CLI，当前版本。', source: 'cli.github.com' },
  { pattern: 'curl', kind: 'command', status: 'current', note: '当前版本。', source: 'curl.se' },
  { pattern: 'wget', kind: 'command', status: 'current', note: '当前版本。', source: 'gnu.org/software/wget' },
  { pattern: 'npm', kind: 'command', status: 'current', note: '当前版本。', source: 'npmjs.com' },
  { pattern: 'npx', kind: 'command', status: 'current', note: '当前版本。', source: 'npmjs.com' },
  { pattern: 'pip', kind: 'command', status: 'current', note: '当前版本。', source: 'pip.pypa.io' },
  { pattern: 'brew', kind: 'command', status: 'current', note: 'Homebrew，当前版本。', source: 'brew.sh' },
  { pattern: 'claude', kind: 'command', status: 'current', note: 'Claude Code CLI，当前版本。', source: 'code.claude.com' },
  { pattern: 'codex', kind: 'command', status: 'current', note: 'OpenAI Codex CLI，当前版本。', source: 'github.com/openai/codex' },
  { pattern: 'kubectl', kind: 'command', status: 'current', note: '当前版本。', source: 'kubernetes.io' },
  { pattern: 'terraform', kind: 'command', status: 'current', note: '当前版本。', source: 'hashicorp.com' },
  { pattern: 'ffmpeg', kind: 'command', status: 'current', note: '当前版本。', source: 'ffmpeg.org' },
  { pattern: 'pdftotext', kind: 'command', status: 'current', note: 'poppler 工具，当前版本。', source: 'poppler.freedesktop.org' },
  // Commands: not current
  { pattern: 'docker-compose', kind: 'command', status: 'deprecated', replacement: 'docker compose', note: 'Compose V1 已停止维护。', source: 'docs.docker.com/compose/migrate' },
  { pattern: 'python2', kind: 'command', status: 'deprecated', replacement: 'python3', note: 'Python 2 已于 2020-01-01 停止维护。', source: 'python.org' },
  { pattern: 'python', kind: 'command', status: 'caution', replacement: 'python3', note: 'python 可能指向 Python 2 或不存在，建议明确写 python3。', source: 'python.org' },
  { pattern: 'yum', kind: 'command', status: 'deprecated', replacement: 'dnf', note: 'RHEL 8 起 yum 被 dnf 取代。', source: 'docs.redhat.com' },
  // Packages: install names
  { pattern: 'node-sass', kind: 'package', status: 'deprecated', replacement: 'sass', note: 'node-sass 已停止维护。', source: 'github.com/sass/node-sass' },
  { pattern: 'request', kind: 'package', status: 'deprecated', replacement: 'node-fetch 或 undici', note: 'request 库已停止维护。', source: 'github.com/request/request' },
  { pattern: 'moment', kind: 'package', status: 'caution', replacement: 'date-fns 或 dayjs', note: 'moment 进入维护模式，不再加新功能。', source: 'momentjs.com/docs' },
  { pattern: 'faker', kind: 'package', status: 'renamed', replacement: '@faker-js/faker', note: 'faker 已迁移到 @faker-js/faker。', source: 'github.com/faker-js/faker' },
  // APIs
  { pattern: 'https://api.github.com', kind: 'api', status: 'current', note: 'GitHub REST API，当前版本。', source: 'docs.github.com/rest' },
  { pattern: 'https://api.openai.com/v1', kind: 'api', status: 'current', note: 'OpenAI API v1，当前版本。', source: 'platform.openai.com/docs' },
  { pattern: 'https://api.anthropic.com/v1', kind: 'api', status: 'current', note: 'Anthropic API v1，当前版本。', source: 'docs.anthropic.com' },
  { pattern: 'https://api.deepseek.com', kind: 'api', status: 'current', note: 'DeepSeek API，当前版本。', source: 'platform.deepseek.com' },
  { pattern: 'https://api.twitter.com/2', kind: 'api', status: 'current', note: 'X API v2，当前版本。', source: 'docs.x.com' },
  { pattern: 'https://generativelanguage.googleapis.com', kind: 'api', status: 'current', note: 'Gemini API，当前版本（v1beta）。', source: 'ai.google.dev' },
  { pattern: 'https://api.twitter.com/1.1', kind: 'api', status: 'deprecated', replacement: 'https://api.twitter.com/2', note: 'Twitter API 1.1 已停用，请用 X API v2。', source: 'docs.x.com' },
]

const UNKNOWN_PENALTY_CAP = 20
const URL_RE = /https?:\/\/[^\s)'"`\]]+/g
const INSTALL_RE = /\b(?:npm\s+(?:install|i)|pip\s+install|yarn\s+add|pnpm\s+add|bun\s+add)\s+([A-Za-z0-9@][A-Za-z0-9._/-]*)/g

function commandRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`, 'i')
}

export function freshnessCheck(text: string): CheckResult {
  const findings: Finding[] = []
  let score = 100
  let unknownPenalty = 0
  const currentNames: string[] = []
  let matchedAnything = false

  // Commands: match against the whole text.
  for (const entry of FRESHNESS_TABLE) {
    if (entry.kind !== 'command') continue
    if (!commandRegex(entry.pattern).test(text)) continue
    matchedAnything = true
    if (entry.status === 'current') {
      currentNames.push(entry.pattern)
    } else if (entry.status === 'deprecated') {
      findings.push({
        level: 'fail',
        message: `已停用：${entry.pattern}。${entry.note}${entry.replacement ? `请改用 ${entry.replacement}。` : ''}`,
      })
      score -= 25
    } else if (entry.status === 'renamed') {
      findings.push({
        level: 'warn',
        message: `已改名：${entry.pattern}。${entry.note}${entry.replacement ? `请改用 ${entry.replacement}。` : ''}`,
      })
      score -= 15
    } else {
      findings.push({
        level: 'warn',
        message: `注意：${entry.pattern}。${entry.note}${entry.replacement ? `建议改用 ${entry.replacement}。` : ''}`,
      })
      score -= 5
    }
  }

  // Packages: only names that appear in an install command.
  const seenPackages = new Set<string>()
  for (const m of text.matchAll(INSTALL_RE)) {
    const name = m[1].replace(/@[^/]*$/, '')
    if (seenPackages.has(name)) continue
    seenPackages.add(name)
    matchedAnything = true
    const entry = FRESHNESS_TABLE.find((e) => e.kind === 'package' && e.pattern === name)
    if (!entry) {
      findings.push({ level: 'warn', message: `未核实：安装包 ${name} 不在时效表里，请自己核对它是否还在维护。` })
      unknownPenalty = Math.min(UNKNOWN_PENALTY_CAP, unknownPenalty + 5)
    } else if (entry.status === 'deprecated') {
      findings.push({
        level: 'fail',
        message: `已停用：安装包 ${entry.pattern}。${entry.note}${entry.replacement ? `请改用 ${entry.replacement}。` : ''}`,
      })
      score -= 25
    } else if (entry.status === 'renamed') {
      findings.push({
        level: 'warn',
        message: `已改名：安装包 ${entry.pattern}。${entry.note}${entry.replacement ? `请改用 ${entry.replacement}。` : ''}`,
      })
      score -= 15
    } else if (entry.status === 'caution') {
      findings.push({
        level: 'warn',
        message: `注意：安装包 ${entry.pattern}。${entry.note}${entry.replacement ? `建议改用 ${entry.replacement}。` : ''}`,
      })
      score -= 5
    } else {
      currentNames.push(entry.pattern)
    }
  }

  // APIs: every URL in the text.
  const seenUrls = new Set<string>()
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;]+$/, '')
    if (seenUrls.has(url)) continue
    seenUrls.add(url)
    matchedAnything = true
    const entry = FRESHNESS_TABLE.find((e) => e.kind === 'api' && url.startsWith(e.pattern))
    if (!entry) {
      findings.push({ level: 'warn', message: `未核实：API 地址 ${url} 不在时效表里，请自己核对它是否还在用。` })
      unknownPenalty = Math.min(UNKNOWN_PENALTY_CAP, unknownPenalty + 5)
    } else if (entry.status === 'deprecated') {
      findings.push({
        level: 'fail',
        message: `已停用：${entry.pattern}。${entry.note}${entry.replacement ? `请改用 ${entry.replacement}。` : ''}`,
      })
      score -= 25
    } else if (entry.status === 'renamed') {
      findings.push({
        level: 'warn',
        message: `已改名：${entry.pattern}。${entry.note}${entry.replacement ? `请改用 ${entry.replacement}。` : ''}`,
      })
      score -= 15
    } else if (entry.status === 'caution') {
      findings.push({
        level: 'warn',
        message: `注意：${entry.pattern}。${entry.note}`,
      })
      score -= 5
    } else {
      currentNames.push(entry.pattern)
    }
  }

  score -= unknownPenalty
  if (score < 0) score = 0

  if (currentNames.length > 0) {
    findings.unshift({
      level: 'pass',
      message: `已核实为当前版本的引用：${[...new Set(currentNames)].join('、')}。`,
    })
  }
  if (!matchedAnything) {
    findings.push({ level: 'info', message: '没有引用外部命令、安装包或 API 地址，无时效风险。' })
  }
  findings.push({ level: 'info', message: `时效表核对日期：${FRESHNESS_TABLE_CHECKED_AT}。不在表里的引用只报“未核实”，不算错。` })

  return { id: 'freshness', title: '引用时效', score, findings }
}

// ---------------------------------------------------------------------------
// Check 4: conflicts with installed Skills
// ---------------------------------------------------------------------------

const COMMON_NAMES = ['commit', 'review', 'test', 'deploy', 'docs', 'build', 'lint']

function keywords(text: string): Set<string> {
  const words = new Set<string>()
  const latin = text.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const cjk = text.match(/[\u4e00-\u9fa5]+/g) ?? []
  const stop = new Set([
    'the', 'and', 'for', 'with', 'when', 'you', 'your', 'this', 'that',
    'from', 'into', 'using', 'use', 'used', 'can', 'will', 'are', 'have',
  ])
  for (const w of latin) {
    if (w.length >= 3 && !stop.has(w)) words.add(w)
  }
  for (const w of cjk) {
    if (w.length >= 2) words.add(w)
  }
  return words
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  return shared / (a.size + b.size - shared)
}

export function conflictsCheck(
  name: string | null,
  description: string | null,
  installed: InstalledSkill[],
): CheckResult {
  const findings: Finding[] = []
  let score = 100

  if (!name) {
    findings.push({ level: 'info', message: 'Skill 缺少 name，无法做冲突检查。' })
    return { id: 'conflicts', title: '已装冲突', score: 100, findings }
  }

  if (installed.length === 0) {
    findings.push({ level: 'info', message: '未提供已装列表，只做了通用名检查。' })
  }

  const lowerName = name.toLowerCase()
  for (const other of installed) {
    if (other.name.toLowerCase() === lowerName) {
      findings.push({
        level: 'fail',
        message: `重名冲突：已装 Skill 里已经有一个叫 "${other.name}" 的，装上会覆盖或混淆。`,
      })
      score -= 40
    }
  }

  if (description) {
    const mine = keywords(description)
    for (const other of installed) {
      if (!other.description || other.name.toLowerCase() === lowerName) continue
      const sim = jaccard(mine, keywords(other.description))
      if (sim >= 0.5) {
        findings.push({
          level: 'warn',
          message: `触发描述高度重叠：与已装 Skill "${other.name}" 的描述相似度 ${Math.round(sim * 100)}%，两个 Skill 可能会抢触发，建议合并或改写描述。`,
        })
        score -= 15
      }
    }
  }

  if (COMMON_NAMES.includes(lowerName)) {
    findings.push({
      level: 'info',
      message: `"${name}" 是通用词，容易和其他 Skill 重名，建议加前缀区分。`,
    })
  }

  if (findings.length === 0) {
    findings.push({ level: 'pass', message: '没有发现重名或触发重叠。' })
  }
  if (score < 0) score = 0

  return { id: 'conflicts', title: '已装冲突', score, findings }
}

// ---------------------------------------------------------------------------
// Total score and verdict
// ---------------------------------------------------------------------------

export const WEIGHTS = { manifest: 0.3, context: 0.25, freshness: 0.25, conflicts: 0.2 }

export function verdictFor(total: number): string {
  if (total >= 90) return '可以直接装'
  if (total >= 70) return '可用，先修小问题'
  if (total >= 50) return '建议修改后再装'
  return '不建议装'
}

export function runSkillCheck(skillMd: string, installed: InstalledSkill[]): SkillReport {
  const fm = parseFrontmatter(skillMd)
  const chars = skillMd.length
  const lines = countLines(skillMd)
  const tokens = estimateTokens(chars)

  const manifest = manifestCheck(skillMd)
  const context = contextCheck(skillMd)
  const freshness = freshnessCheck(skillMd)
  const conflicts = conflictsCheck(fm.data['name'] ?? null, fm.data['description'] ?? null, installed)

  const total = Math.round(
    WEIGHTS.manifest * manifest.score +
      WEIGHTS.context * context.score +
      WEIGHTS.freshness * freshness.score +
      WEIGHTS.conflicts * conflicts.score,
  )

  return {
    total,
    verdict: verdictFor(total),
    checks: [manifest, context, freshness, conflicts],
    meta: {
      name: fm.data['name'] ?? null,
      description: fm.data['description'] ?? null,
      chars,
      lines,
      tokens,
    },
  }
}
