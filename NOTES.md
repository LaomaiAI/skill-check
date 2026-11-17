# NOTES — skill-check

## 已完成（2026-11-17，本地离线完成）

- 完整产品：React 19 + Vite + Tailwind + TypeScript，和 dsh-plugin-picker、expiry-manager 同一套栈。
- 核心库 `src/lib/skillcheck.ts`：四项确定性检查（清单合规、上下文占用、引用时效、已装冲突）+ 总分与结论档位，100% 确定性，零大模型调用。
- 时效表 `FRESHNESS_TABLE`：30 条（命令 19、安装包 4、API 7），核对日期 2026-11-17。不在表里的引用只报“未核实”，不算错。
- GitHub 取文件 `src/lib/github.ts`：支持仓库根目录、tree/blob、raw 链接和 owner/repo 简写；根目录自动试 main 再试 master。
- 三个内置示例 Skill（好 100 分、中 85 分、差 46 分）+ 示例已装列表（可演示重名冲突）。
- 界面 `src/App.tsx`：三种输入（链接、粘贴、示例）、已装列表输入、四项结果卡片、总分与结论档位。
- 测试：`src/lib/skillcheck.test.ts`（清单、上下文档位边界、时效扣分、冲突、结论档位、示例分数、确定性）+ `src/lib/github.test.ts`（链接解析、已装列表解析）。
- 双语 README 各 10 节一一对应（中文 README.md、英文 README_EN.md），顶部一句话痛点；演示链接待部署后填写，没有编造。
- CI workflow：test.yml（npm ci + npm test + npm run build）、deploy.yml（GitHub Pages，和 dsh 同款）。

## 设计决定

- 总分权重：清单 0.30、上下文 0.25、时效 0.25、冲突 0.20。清单权重最高，因为清单错了 Skill 根本装不上；冲突权重最低，因为它依赖用户提供的已装列表。
- token 估算用字符数 / 4（和 dsh 的上下文估算同一口径），页面和报告里都注明是估算。
- 时效检查只对安装命令里的包名和 URL 做“未核实”扣分，普通反引号命令不在表里时不扣分（避免噪音）；扣分上限 20。
- 冲突检查用描述关键词 Jaccard 相似度，阈值 0.5；只看名字和描述，不读正文。
- NVIDIA SkillEvaluator 只在 README 里作为参照（企业级重框架版，本工具是轻量免费版），没有抄它的任何代码或数据。

## 已验证通过（2026-11-17，出口断着但 npm 本地缓存可用）

- `npm install --prefer-offline`：一次成功，装了 60 个包，生成 package-lock.json（没碰注册表，全走 ~/.npm 缓存）。
- `npm test`：45/45 通过（修了 3 个真 bug：已装列表解析把名字里的短横线当分隔符、frontmatter 折叠测试输入多了个空格、fetch 没加超时导致测试超时；修完加了 10 秒 AbortSignal.timeout）。
- `npm run build`：tsc + vite 构建通过，dist 已生成。
- `npm run lint`（oxlint）：0 警告 0 错误。
- 双语 README 各 10 节，grep 核对过；禁用字符扫描干净。

## 真实 Skill 验证完成（2026-11-17 22:54-23:10 CST，出口恢复窗口）

- 来源：Anthropic 官方仓库 anthropics/skills，6 个真实 Skill 的 SKILL.md 从 raw.githubusercontent.com 现取（pdf、docx、xlsx、pptx、webapp-testing、skill-creator；pptx 取了一次 000 超时，重试成功）。
- 结果（已装列表为空）：pdf 93、docx 93、xlsx 94、pptx 86、webapp-testing 95、skill-creator 89；无误报，6 个全部 86 分以上，没有一个被判“不建议装”。提醒均属实：6 个都提示把 `python` 写成 `python3`；不在时效表里的包（pytesseract、pptxgenjs、react-icons 等）只报“未核实”不算错；pptx 与 skill-creator 因 SKILL.md 偏重（约 7043 / 8247 tokens）落到“可用，先修小问题”。
- 用例已记进 README.md / README_EN.md 第 4.7 节；验证脚本为临时测试（跑完已删），原始 SKILL.md 存 ~/workspace/goals/ai-ip/hidden_files/skillcheck-real/。
- 重新全量复验：npm test 45/45、npm run build 通过、oxlint 0 警告 0 错误。

## 还需要联网才能做的事

1. ~~真实 Skill 链接验证用例~~ 已完成（见上节）。
2. 建仓库、推送、开 Pages、演示站核实、README 回填演示链接（走主代理的老流程：浏览器建空仓、连接器一次推送、workflow 浏览器传、开 Pages、核实）。

## 已知局限

- 时效表只有 30 条，冷门工具会报“未核实”。
- 上下文占用是字符估算，不是真实 tokenizer 计数。
- GitHub 链接只取 SKILL.md 一个文件，不取引用文件；引用文件多的 Skill 上下文会被低估。
- 冲突检查不读正文指令。
