// Fetch a SKILL.md from a GitHub URL.
//
// Supported URL forms:
//   https://github.com/owner/repo
//   https://github.com/owner/repo/tree/<branch>/<path>
//   https://github.com/owner/repo/blob/<branch>/<path>/SKILL.md
//   https://raw.githubusercontent.com/owner/repo/<branch>/<path>/SKILL.md
//   owner/repo  (shorthand, SKILL.md at the repo root)
//
// For a repo root the fetcher tries SKILL.md at the root on branch main,
// then master. Network errors surface as plain Error messages; the UI
// shows them as-is. Nothing here needs an API key.

import type { InstalledSkill } from './skillcheck'

export interface ParsedSkillUrl {
  owner: string
  repo: string
  branch: string
  path: string
}

export interface FetchedSkill {
  skillMd: string
  rawUrl: string
  owner: string
  repo: string
  branch: string
  path: string
}

export function parseSkillUrl(input: string): ParsedSkillUrl {
  const url = input.trim()
  if (!url) throw new Error('请先填一个 GitHub 链接。')

  const raw = /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(url)
  if (raw) {
    return { owner: raw[1], repo: raw[2], branch: raw[3], path: raw[4] }
  }

  const gh = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\/(?:tree|blob)\/([^/]+)\/(.+))?\/?$/.exec(url)
  if (gh) {
    return { owner: gh[1], repo: gh[2], branch: gh[3] ?? '', path: gh[4] ?? '' }
  }

  const short = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(.+))?$/.exec(url)
  if (short) {
    return { owner: short[1], repo: short[2], branch: '', path: short[3] ?? '' }
  }

  throw new Error('链接格式不对：请填 github.com/owner/repo 或 raw.githubusercontent.com 链接，或 owner/repo 简写。')
}

function candidates(parsed: ParsedSkillUrl): { rawUrl: string; branch: string; path: string }[] {
  const { owner, repo } = parsed
  const out: { rawUrl: string; branch: string; path: string }[] = []
  const path = parsed.path.replace(/\/$/, '')
  const isFile = path.toLowerCase().endsWith('.md')
  const dir = isFile ? path.slice(0, path.lastIndexOf('/')) : path
  const file = isFile ? path.slice(path.lastIndexOf('/') + 1) : 'SKILL.md'
  const branches = parsed.branch ? [parsed.branch] : ['main', 'master']
  for (const branch of branches) {
    const full = dir ? `${dir}/${file}` : file
    out.push({
      rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${full}`,
      branch,
      path: full,
    })
  }
  return out
}

export async function fetchSkillMd(input: string): Promise<FetchedSkill> {
  const parsed = parseSkillUrl(input)
  const tries = candidates(parsed)
  let lastStatus = 0
  for (const c of tries) {
    let res: Response
    try {
      res = await fetch(c.rawUrl, {
        headers: { Accept: 'text/plain' },
        signal: AbortSignal.timeout(10000),
      })
    } catch {
      throw new Error('网络不可用：连不上 raw.githubusercontent.com，请检查网络后重试。')
    }
    if (res.ok) {
      const skillMd = await res.text()
      if (!skillMd.trim()) throw new Error(`取到了空文件：${c.rawUrl}`)
      return { skillMd, rawUrl: c.rawUrl, owner: parsed.owner, repo: parsed.repo, branch: c.branch, path: c.path }
    }
    lastStatus = res.status
  }
  if (lastStatus === 404) {
    throw new Error(
      `在 ${parsed.owner}/${parsed.repo} 里没找到 SKILL.md（试了 main 和 master 分支的根目录）。请确认仓库公开、文件在根目录或把链接指向 SKILL.md 所在目录。`,
    )
  }
  throw new Error(`GitHub 返回了 HTTP ${lastStatus}，请稍后重试。`)
}

// Parse the installed-Skills textarea. One per line:
//   name
//   name: description
//   name - description
export function parseInstalledList(text: string): InstalledSkill[] {
  const out: InstalledSkill[] = []
  const seen = new Set<string>()
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    // Separator is ":" or a spaced dash (" - ", " – ", " — "). A bare "-"
    // is not a separator because Skill names contain hyphens.
    const m = /^(.+?)\s*(?::| - | – | —)\s*(.+)$/.exec(line)
    const name = (m ? m[1] : line).trim()
    const description = m ? m[2].trim() : undefined
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push(description ? { name, description } : { name })
  }
  return out
}
