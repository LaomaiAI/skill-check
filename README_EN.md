# Skill Check (skill-check)

## 1. In one sentence

Check a Skill before you install it: manifest, context usage, reference freshness, and conflicts with installed Skills, all computed by code, no guessing.

Live demo: https://laomaiai.github.io/skill-check/

## 2. The problem it solves

The Agent Skill ecosystem is exploding, with new Skills appearing on GitHub every day. Before installing one, an independent developer can only guess: is the manifest written correctly, how much context will it eat, are the commands and APIs it references already deprecated, and will it collide with an installed Skill by name or by trigger? All of that used to mean reading each file by hand.

This tool turns those four questions into deterministic checks: paste a Skill's GitHub URL (or paste SKILL.md directly) and get four scores, a total, and a finding-by-finding verdict. NVIDIA ships SkillEvaluator as a heavyweight enterprise framework; independent developers cannot afford that. This tool is the lightweight free version.

## 3. Input sources and coverage

Three inputs, one set of checks:

1. Paste a GitHub URL: repo root, tree/blob links, raw.githubusercontent.com links, and owner/repo shorthand all work. It fetches only the SKILL.md file and needs network.
2. Paste SKILL.md directly: works offline.
3. Built-in samples: three sample Skills (good, mediocre, bad), works offline.

Freshness table: a built-in table of commands, packages, and APIs, checked 2026-11-17, with 30 entries (19 commands, 4 packages, 7 APIs). References not in the table are reported as "not verified", never as wrong.

## 4. The four checks

Total = manifest x 0.30 + context x 0.25 + freshness x 0.25 + conflicts x 0.20, rounded to the nearest integer.

### 4.1 Manifest compliance (0-100)

- Frontmatter present: 25 points.
- name present and valid (lowercase letters, digits, hyphens, at most 64 characters): 25 points.
- description present and non-empty: 25 points; 40 characters or more and states when to use the Skill: 15 more points, otherwise 5 points with a hint.
- No unrecognized frontmatter keys (only name, description, license, compatibility, metadata, allowed-tools are recognized): 10 points.

### 4.2 Context usage (0-100)

Token estimate = SKILL.md characters / 4 (rounded up), always labeled as an estimate.

- Up to 1000 tokens: 100 points; up to 4000: 80; up to 10000: 60; up to 25000: 40; above that: 20; empty file: 0.
- Over 500 lines in SKILL.md triggers a hint (keep it under 500 lines, move details to referenced files), with no extra penalty.

### 4.3 Reference freshness (0-100)

Starts at 100 and deducts:

- Each reference to a deprecated command, package, or API: minus 25.
- Each reference to a renamed one: minus 15.
- Each reference needing caution (for example moment is in maintenance mode, python should be written as python3): minus 5.
- Each installed package or API URL not in the freshness table: minus 5, capped at 20 total, reported as "not verified", not as wrong.
- Only current references: no deduction.
- No external commands, packages, or API URLs at all: 100 points, no freshness risk.

### 4.4 Conflicts with installed Skills (0-100)

The user provides the installed list (one per line, as a name or "name: description"):

- Same name as an installed Skill: minus 40.
- Description similarity of 50% or more (keyword Jaccard similarity): minus 15 each.
- A generic name (commit, review, test, deploy, docs, build, lint): a hint only, no deduction.
- No installed list provided: generic-name check only, 100 points, noted as such.
- Skill has no name: the check cannot run, 100 points, noted as such.

### 4.5 Verdict bands

- 90 and above: ready to install.
- 70-89: usable, fix the small issues first.
- 50-69: revise before installing.
- Below 50: do not install.

### 4.6 Sample scores (empty installed list)

- Good sample pdf-tools: total 100 (manifest 100, context 100, freshness 100, conflicts 100), ready to install.
- Mediocre sample video-helper: total 85 (manifest 90, context 80, freshness 70, conflicts 100), usable, fix the small issues first.
- Bad sample mega-tool: total 46 (manifest 0, context 80, freshness 25, conflicts 100), do not install.

### 4.7 Verified on real Skills (2026-11-17)

Checked 6 real Skills from Anthropic's official anthropics/skills repository (SKILL.md fetched live from raw.githubusercontent.com, empty installed list):

| Skill | Total | Verdict |
| --- | --- | --- |
| pdf | 93 | Ready to install |
| docx | 93 | Ready to install |
| xlsx | 94 | Ready to install |
| pptx | 86 | Usable, fix the small issues first (SKILL.md is about 7,043 tokens, on the heavy side) |
| webapp-testing | 95 | Ready to install |
| skill-creator | 89 | Usable, fix the small issues first (SKILL.md is about 8,247 tokens, on the heavy side) |

No false alarms: all 6 official Skills scored 86 or above, none was rated "do not install"; the warnings are genuine (for example, all of them suggest writing `python3` instead of `python`, and packages not in the freshness table are reported as "not verified", never as wrong).

## 5. How to use it

1. Open the page and pick an input: paste a GitHub URL, paste SKILL.md directly, or try a built-in sample.
2. (Optional) Fill in your installed Skills, one per line, as a name or "name: description"; or click "fill in the sample installed list" to try the conflict check.
3. Run the check. The page shows the total, the verdict band, and four cards, each finding marked pass, note, issue, or info.
4. If you change the installed list, run the check again.

## 6. Run it locally

```bash
npm install
npm test     # run the Vitest tests
npm run build
npm run dev  # local dev server
```

Node 20 or newer. Build output goes to dist/.

## 7. Updating the data

The freshness table lives in `src/lib/skillcheck.ts` as FRESHNESS_TABLE, with its check date in FRESHNESS_TABLE_CHECKED_AT. When a tool ships a new major version or a deprecation notice, add an entry, update the check date, and run the tests. References not in the table are never judged wrong, only "not verified".

## 8. Determinism

- This tool is 100% deterministic with zero LLM calls. The same SKILL.md and the same installed list always produce the same score (covered by a determinism test).
- Token counts are estimates (characters / 4); the page and the report both say so.
- Pasted SKILL.md is never uploaded anywhere; a GitHub URL only fetches the file from raw.githubusercontent.com.
- Everything is computed by code: the four scores, the total, the verdict band, reference matching, and conflict similarity. No LLM takes part in any step.

## 9. Compliance boundary

- No stocks, crypto, or money custody. This tool only inspects Skill files; it never executes, installs, or calls any Skill.
- No user data is collected, no cookies, no third-party analytics.
- Fetched URLs are only used to get SKILL.md, nothing else.

## 10. Limitations and next steps

- The freshness table has only 30 entries, covering common commands, packages, and APIs; niche tools come back as "not verified" and need a human check. The table grows with use.
- Context usage is a character-count estimate, not a real tokenizer count; long non-English text is estimated conservatively.
- The conflict check only looks at names and description similarity, not the body instructions; two Skills whose bodies clash are not caught yet.
- A GitHub URL fetches only SKILL.md, not the files it references; a Skill with many referenced files has its context usage underestimated.
- Next steps: grow the freshness table (more CLIs and APIs); support checking a whole Skill directory pasted as a bundle; add validation cases with real Skill URLs (see NOTES.md).
