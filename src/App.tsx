import { useMemo, useState } from 'react'
import { fetchSkillMd, parseInstalledList } from './lib/github'
import { BAD_SKILL, GOOD_SKILL, MEDIOCRE_SKILL, SAMPLE_INSTALLED } from './lib/samples'
import {
  FRESHNESS_TABLE_CHECKED_AT,
  runSkillCheck,
  type CheckResult,
  type Finding,
  type SkillReport,
} from './lib/skillcheck'

type Mode = 'url' | 'paste' | 'samples'

const SAMPLES: { key: string; label: string; hint: string; text: string }[] = [
  { key: 'good', label: '好的示例：pdf-tools', hint: '清单满分，引用都是当前版本', text: GOOD_SKILL },
  { key: 'mediocre', label: '中等示例：video-helper', hint: '描述太短，引用了一个已停用的命令', text: MEDIOCRE_SKILL },
  { key: 'bad', label: '差的示例：mega-tool', hint: '没有 frontmatter，三个引用已停用', text: BAD_SKILL },
]

function levelStyle(level: Finding['level']): string {
  if (level === 'pass') return 'text-emerald-700'
  if (level === 'warn') return 'text-amber-700'
  if (level === 'fail') return 'text-red-700'
  return 'text-stone-500'
}

function levelMark(level: Finding['level']): string {
  if (level === 'pass') return '通过'
  if (level === 'warn') return '注意'
  if (level === 'fail') return '问题'
  return '说明'
}

function ScoreBar({ value }: { value: number }) {
  const color = value >= 90 ? 'bg-emerald-600' : value >= 70 ? 'bg-blue-600' : value >= 50 ? 'bg-amber-600' : 'bg-red-600'
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

function CheckCard({ check }: { check: CheckResult }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-stone-900">{check.title}</h3>
        <span className="text-xl font-bold text-stone-900">{check.score}</span>
      </div>
      <ScoreBar value={check.score} />
      <ul className="mt-3 space-y-1.5 text-sm leading-relaxed">
        {check.findings.map((f, i) => (
          <li key={i} className={levelStyle(f.level)}>
            <span className="mr-1.5 font-semibold">[{levelMark(f.level)}]</span>
            {f.message}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function App() {
  const [mode, setMode] = useState<Mode>('url')
  const [url, setUrl] = useState('')
  const [skillText, setSkillText] = useState('')
  const [installedText, setInstalledText] = useState('')
  const [report, setReport] = useState<SkillReport | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const installed = useMemo(() => parseInstalledList(installedText), [installedText])

  function runOnText(text: string, src: string) {
    setError(null)
    if (!text.trim()) {
      setError('内容是空的，请先粘贴 SKILL.md 或选一个示例。')
      return
    }
    setReport(runSkillCheck(text, installed))
    setSource(src)
  }

  async function runOnUrl() {
    setError(null)
    setReport(null)
    setSource(null)
    if (!url.trim()) {
      setError('请先填一个 GitHub 链接。')
      return
    }
    setLoading(true)
    try {
      const fetched = await fetchSkillMd(url)
      setSkillText(fetched.skillMd)
      setReport(runSkillCheck(fetched.skillMd, installed))
      setSource(`${fetched.owner}/${fetched.repo}（分支 ${fetched.branch}，${fetched.path}）`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取失败，请重试。')
    } finally {
      setLoading(false)
    }
  }

  function fillSampleInstalled() {
    setInstalledText(SAMPLE_INSTALLED.map((s) => `${s.name}: ${s.description ?? ''}`.trim()).join('\n'))
  }

  const verdictColor =
    report === null
      ? ''
      : report.total >= 90
        ? 'text-emerald-700'
        : report.total >= 70
          ? 'text-blue-700'
          : report.total >= 50
            ? 'text-amber-700'
            : 'text-red-700'

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">Skill 体检</h1>
        <p className="mt-2 text-base leading-relaxed text-stone-700">
          装 Skill 之前先体检：清单、上下文、引用时效、已装冲突，四项全是代码算的，不靠猜。
        </p>
        <p className="mt-1 text-sm text-stone-500">
          100% 确定性检查，零大模型调用。同一份 SKILL.md，每次跑出同一个分数。时效表核对日期：{FRESHNESS_TABLE_CHECKED_AT}。
        </p>
      </header>

      <main className="mt-6 space-y-6">
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['url', '粘贴 GitHub 链接'],
                ['paste', '直接粘贴 SKILL.md'],
                ['samples', '用示例试试'],
              ] as [Mode, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setMode(key)
                  setError(null)
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  mode === key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'url' && (
            <div className="mt-4">
              <label htmlFor="gh-url" className="text-sm font-medium text-stone-700">
                Skill 的 GitHub 链接
              </label>
              <input
                id="gh-url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="例如：https://github.com/owner/repo 或 owner/repo"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-stone-500">
                支持仓库根目录、tree/blob 链接和 raw.githubusercontent.com 链接。只取 SKILL.md 文件，需要联网。
              </p>
              <button
                type="button"
                onClick={runOnUrl}
                disabled={loading}
                className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {loading ? '正在获取…' : '获取并体检'}
              </button>
            </div>
          )}

          {mode === 'paste' && (
            <div className="mt-4">
              <label htmlFor="skill-md" className="text-sm font-medium text-stone-700">
                SKILL.md 全文
              </label>
              <textarea
                id="skill-md"
                value={skillText}
                onChange={(e) => setSkillText(e.target.value)}
                rows={12}
                placeholder="把 SKILL.md 的全文粘贴到这里…"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => runOnText(skillText, '直接粘贴的 SKILL.md')}
                className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                体检这份 SKILL.md
              </button>
            </div>
          )}

          {mode === 'samples' && (
            <div className="mt-4 space-y-2">
              {SAMPLES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => runOnText(s.text, `内置示例：${s.label}`)}
                  className="block w-full rounded-lg border border-stone-200 px-3 py-2 text-left hover:border-blue-400 hover:bg-blue-50"
                >
                  <span className="text-sm font-semibold text-stone-900">{s.label}</span>
                  <span className="block text-xs text-stone-500">{s.hint}</span>
                </button>
              ))}
            </div>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <label htmlFor="installed" className="text-sm font-medium text-stone-700">
            已装 Skill 列表（用于冲突检查，每行一个）
          </label>
          <textarea
            id="installed"
            value={installedText}
            onChange={(e) => setInstalledText(e.target.value)}
            rows={3}
            placeholder="例如：&#10;pdf-tools: Extract text from PDF files&#10;video-helper: Edit videos"
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={fillSampleInstalled}
              className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-200"
            >
              填入示例已装列表
            </button>
            <button
              type="button"
              onClick={() => setInstalledText('')}
              className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-200"
            >
              清空
            </button>
            <span className="self-center text-xs text-stone-500">已填 {installed.length} 个。改了列表后请重新点一次体检。</span>
          </div>
        </section>

        {report && (
          <section aria-live="polite">
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-4xl font-bold text-stone-900">{report.total}</span>
                <span className={`text-lg font-semibold ${verdictColor}`}>{report.verdict}</span>
              </div>
              <p className="mt-2 text-sm text-stone-600">
                来源：{source ?? '未知'}。{report.meta.name ? `Skill 名：${report.meta.name}。` : '未读到 Skill 名。'}
                全文 {report.meta.chars} 字符、{report.meta.lines} 行，约 {report.meta.tokens} tokens（字符数 / 4 估算）。
              </p>
              <p className="mt-1 text-xs text-stone-500">
                总分 = 清单合规 x 0.30 + 上下文占用 x 0.25 + 引用时效 x 0.25 + 已装冲突 x 0.20。90 分以上可以直接装，70-89 分可用但先修小问题，50-69 分建议修改后再装，50 分以下不建议装。
              </p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {report.checks.map((c) => (
                <CheckCard key={c.id} check={c} />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="mt-8 border-t border-stone-200 pt-4 text-xs leading-relaxed text-stone-500">
        <p>
          本工具 100% 本地计算：粘贴的 SKILL.md 不上传到任何服务器；GitHub 链接只向 raw.githubusercontent.com 取文件。NVIDIA 的
          SkillEvaluator 是企业级重框架版本，本工具是给独立开发者用的轻量免费版。
        </p>
        <p className="mt-1">时效表核对日期：{FRESHNESS_TABLE_CHECKED_AT}。不在表里的引用只报“未核实”，不算错。</p>
      </footer>
    </div>
  )
}
